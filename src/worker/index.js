import { EventEmitter } from 'events';
import os from 'os';
import bunyan from 'bunyan';
import cluster from 'cluster';
import zmq from 'zeromq';
import once from 'once';
import { arrayify, getId } from '@scipe/jsonld';
import { getObjectId } from '@scipe/librarian';

// methods
import emitAction from './emit-action';
import emitEvent from './emit-event';
import dispatch from './dispatch';
import uuid from './uuid';

const ENV = {
  NODE_ENV: process.env['NODE_ENV']
};

class Worker extends EventEmitter {
  constructor(config) {
    super();

    config = config || {};

    if (config.logger) {
      this.log = config.logger;
    } else {
      this.log = bunyan.createLogger(
        Object.assign(
          {
            serializers: { err: bunyan.stdSerializers.err },
            name: 'worker'
          },
          config.log
        )
      );
    }

    this.type = config.type || 'Action';

    // !! empty set => dipatch any types
    this.dispatchTypes = new Set(arrayify(config.dispatchTypes));

    this.BROKER_FRONTEND =
      config.brokerFrontendConnectEndpoint ||
      process.env.BROKER_FRONTEND_CONNECT_ENDPOINT ||
      'tcp://127.0.0.1:3003';
    this.BROKER_BACKEND =
      config.brokerBackendConnectEndpoint ||
      process.env.BROKER_BACKEND_CONNECT_ENDPOINT ||
      'tcp://127.0.0.1:3004';

    this.XPUB_ENDPOINT =
      config.brokerXpubConnectEndpoint ||
      process.env.BROKER_XPUB_CONNECT_ENDPOINT ||
      'tcp://127.0.0.1:3001';
    this.XSUB_ENDPOINT =
      config.brokerPullConnectEndpoint ||
      process.env.BROKER_PULL_CONNECT_ENDPOINT ||
      // backward compatibility (see notes in broker)
      config.brokerXsubConnectEndpoint ||
      process.env.BROKER_XSUB_CONNECT_ENDPOINT ||
      'tcp://127.0.0.1:3002';
    // alias
    this.XPULL_ENDPOINT = this.XSUB_ENDPOINT;

    this.N_WORKERS =
      config.nWorkers || process.env['N_WORKERS'] || os.cpus().length;
    if (typeof this.N_WORKERS == 'string' || this.N_WORKERS instanceof String) {
      this.N_WORKERS = parseInt(this.N_WORKERS, 10);
    }
    this.N_WORKERS = this.N_WORKERS >= 0 ? this.N_WORKERS : 1;

    // '' (or null etc.) is a valid value for curiePrefix
    this.CURIE_PREFIX =
      'curiePrefix' in config
        ? config.curiePrefix
        : 'CURIE_PREFIX' in process.env
        ? process.env.CURIE_PREFIX
        : '_';

    this.HEALTH_CHECK_DELAY =
      config.healthCheckDelay || process.env.HEALTH_CHECK_DELAY || 5000; //in ms for setInterval
    this.PUB_EVENT = config.pubEvent || 'WORKER_DATA';
    this.READY_EVENT = config.readyEvent || 'READY';

    this.HEARTBEAT_EVENT = config.heartbeatEvent || 'HEARTBEAT';
    this.BROKER_LIVENESS = config.brokerLiveness || 3;
    this.brokerLiveness = this.BROKER_LIVENESS;
    this.BROKER_TIMEOUT_INIT = config.brokerTimeoutInit || 1000;
    this.BROKER_TIMEOUT_MAX = config.brokerTimeoutMax || 32000;
    this.brokerTimeout = this.BROKER_TIMEOUT_INIT;

    this.HEARTBEAT_INTERVAL = config.hearbeatInterval || 1000;

    this._status = 'ready';

    this._handleExit = once(this._handleExit.bind(this));
    process.setMaxListeners(process.getMaxListeners() + 2);
    process.on('uncaughtException', this._handleExit);
    process.on('exit', this._handleExit);
  }

  _handleExit(errOrCode) {
    process.setMaxListeners(
      Math.max(process.getMaxListeners() - 2, EventEmitter.defaultMaxListeners)
    );
    if (this.handleExit) {
      this.handleExit(errOrCode);
    }

    if (errOrCode instanceof Error) {
      if (errOrCode.stack) console.error(errOrCode.stack);
      else console.trace();
      process.exit(1);
    }
  }

  createDealer(onMessage) {
    const dealer = zmq.socket('dealer');
    dealer.identity = `${this.type}-worker-${this.uuid({
      curiePrefix: ''
    })}`;
    dealer.connect(this.BROKER_BACKEND);
    if (onMessage) {
      dealer.on('message', onMessage);
    }
    clearInterval(this._heartbeatIntervalId);
    this._heartbeatIntervalId = setInterval(() => {
      dealer.send(this.HEARTBEAT_EVENT);
    }, this.HEARTBEAT_INTERVAL);
    return dealer;
  }

  setBrokerTimeout(onMessage) {
    this._brokerTimeoutId = setTimeout(() => {
      this.log.trace(
        {
          identity: this.dealer.identity,
          brokerLiveness: this.brokerLiveness,
          brokerTimeout: this.brokerTimeout
        },
        'checking if broker is still alive'
      );
      this.brokerLiveness -= 1;
      if (this.brokerLiveness === 0) {
        this.dealer.close();
        this.dealer = this.createDealer(onMessage);
        this.dealer.send(this.READY_EVENT);
        this.brokerLiveness = this.BROKER_LIVENESS;
        this.brokerTimeout =
          this.brokerTimeout >= this.BROKER_TIMEOUT_MAX
            ? this.BROKER_TIMEOUT_MAX
            : this.brokerTimeout * 2;
        this.log.trace(
          {
            identity: this.dealer.identity,
            data: this.READY_EVENT,
            brokerTimeout: this.brokerTimeout
          },
          'broker appeared to be dead, reconnecting by resending READY'
        );
      }
      this.setBrokerTimeout(onMessage);
    }, this.brokerTimeout);
  }

  resetBrokerTimeout(onMessage) {
    clearTimeout(this._brokerTimeoutId);
    this.brokerLiveness = this.BROKER_LIVENESS;
    this.borkerTimeout = this.BROKER_TIMEOUT_INIT;
    this.log.trace(
      {
        identity: this.dealer.identity,
        brokerLiveness: this.brokerLiveness,
        brokerTimeout: this.brokerTimeout
      },
      'reset broker timeout'
    );
    this.setBrokerTimeout(onMessage);
  }

  listen() {
    if (!this.handleAction) {
      throw new Error(
        'an handleAction(action, callback) method needs to be implemented'
      );
    }

    if (cluster.isMaster) {
      if (this._status === 'running') {
        this.log.fatal(
          'listen can only be called once, this call and any further calls will have no effects'
        );
        return;
      } else if (this._status === 'stopped') {
        this.log.fatal(
          'the worker has been stopped, this call and any further calls will have no effects'
        );
        return;
      }
      this._status = 'running';

      // Fork workers
      let nForked = 0;
      for (let i = 0; i < this.N_WORKERS; i++) {
        let w = cluster.fork(ENV);
        nForked++;
        this.log.info(
          {
            WORKER_BROKER_FRONTEND: this.BROKER_FRONTEND,
            WORKER_BROKER_BACKEND: this.BROKER_BACKEND,
            PUB_ENDPOINT: this.PUB_ENDPOINT,
            SUB_ENDPOINT: this.SUB_ENDPOINT
          },
          `forked worker ${w.id}`
        );
      }

      const sub = zmq.socket('sub');
      sub.connect(this.XPUB_ENDPOINT);
      sub.subscribe('worker');
      sub.on('message', (topic, data) => {
        for (let id in cluster.workers) {
          if (cluster.workers[id].isConnected()) {
            cluster.workers[id].send(JSON.parse(data));
          }
        }
      });

      cluster.on('exit', (worker, code, signal) => {
        this.log.warn(`worker ${worker.process.pid} exited`);
        nForked--;

        if (
          this._status !== 'stopping' &&
          worker.exitedAfterDisconnect === true
        ) {
          this.log.warn('worker restarting');
          cluster.fork(ENV);
          nForked++;
        }

        if (nForked === 0) {
          sub.close();
        }
      });
    } else {
      if (this._status === 'running') {
        return;
      } else if (this._status === 'stopping') {
        return this._close();
      }

      this._status = 'running';

      this.log.info(`worker ${cluster.worker.id} ready`);

      let receivedAction;

      process.on('message', action => {
        if (action._status) {
          this._status = action._status;
          return;
        }
        if (!action.object) return;

        if (
          receivedAction &&
          action['@type'] === 'CancelAction' &&
          getObjectId(action) === getId(receivedAction)
        ) {
          this.onCanceledActionStatus(receivedAction, (err, canceledAction) => {
            if (err) {
              this.log.error({ err: err }, 'error onCanceledActionStatus');
            } else {
              if (
                receivedAction &&
                action['@type'] === 'CancelAction' &&
                getObjectId(action) === getId(receivedAction)
              ) {
                this.log.info(
                  {
                    action: this.emitAction(
                      canceledAction ||
                        Object.assign({}, receivedAction, {
                          actionStatus: 'CanceledActionStatus'
                        })
                    )
                  },
                  'CancelAction'
                );
                cluster.worker.kill(); // voluntary (worker.exitedAfterDisconnect will be set to true) => will restart
              }
            }
          });
        }
      });

      const pub = zmq.socket(
        'push' /* formerly pub see design notes in broker */
      );
      pub.connect(this.XSUB_ENDPOINT);

      // topic is typically the agent['@id']
      this.on(this.PUB_EVENT, (topic, data) => {
        pub.send([topic, JSON.stringify(data)]);
      });

      const next = err => {
        if (err && err.code < 0) {
          this.log.error(
            { err, _status: this._status },
            'Worker (next): error with err code <0 => we will restart it'
          );

          cluster.worker.kill(); // voluntary (worker.exitedAfterDisconnect will be set to true) => will restart
        } else {
          if (this._status === 'running') {
            this.dealer.send(this.READY_EVENT);
            this.log[err ? 'error' : 'info'](
              {
                err,
                identity: this.dealer.identity,
                data: this.READY_EVENT,
                _status: this._status
              },
              'Worker (next): READY again'
            );
          } else {
            this.log[err ? 'error' : 'info'](
              { err, _status: this._status },
              'Worker (next): closing'
            );
            clearTimeout(this._brokerTimeoutId);
            clearInterval(this._heartbeatIntervalId);
            pub.close();
            this.dealer.close();
            this._close();
          }
        }
      };

      let log = this.log; //we will replace `this.log` by a child logger so we keep a ref to our original logger

      const onMessage = (data, clientId) => {
        this.resetBrokerTimeout(onMessage);
        if (data == this.HEARTBEAT_EVENT) {
          return;
        }
        // send acknowledgement reply
        this.dealer.send([clientId, 'OK']);

        const action = JSON.parse(data);
        receivedAction = action;

        log.info(
          {
            identity: this.dealer.identity,
            clienId: clientId.toString(),
            receivedAction: getId(receivedAction)
          },
          'worker received action and sent acknowledgement reply'
        );

        this.onActiveActionStatus(action, err => {
          if (err) {
            this.log.error({ err: err }, 'error onActiveActionStatus');
            // early termination, no side effects should have happened
            return next(err);
          }

          this.log = log.child({ actionId: action['@id'] });
          log.debug(
            {
              action: this.emitAction(action, {
                actionStatus: 'ActiveActionStatus'
              })
            },
            'starting to handle action'
          );

          const intervalId = setInterval(() => {
            this.emitAction(action, { actionStatus: 'ActiveActionStatus' });
          }, this.HEALTH_CHECK_DELAY);

          this.handleAction(action, (err, handledAction, nextAction) => {
            if (err) {
              this.onFailedActionStatus(err, action, _err => {
                if (_err)
                  this.log.error({ err: _err }, 'error onFailedActionStatus');
                clearInterval(intervalId);
                this._onError(err, action, 'error handleAction');
                next(err);
              });
            } else {
              this.onCompletedActionStatus(
                handledAction,
                (err, postHandledAction) => {
                  if (err) {
                    this.log.error(
                      { err: err },
                      'error onCompletedActionStatus'
                    );
                    this.onFailedActionStatus(err, handledAction, _err => {
                      if (_err)
                        this.log.error(
                          { err: _err },
                          'error onFailedActionStatus'
                        );

                      clearInterval(intervalId);
                      this._onError(
                        err,
                        handledAction,
                        'error onCompletedActionStatus'
                      );
                      return next(err);
                    });
                  }

                  // notify that we are done
                  this.log.debug(
                    {
                      action: this.emitAction(
                        postHandledAction || handledAction
                      ) // emit the completed action
                    },
                    'done'
                  );

                  if (nextAction) {
                    this.log.info({ nextAction }, 'dispatch next action');
                  }
                  // we neglect that case when a dispatch can error for now, as currently dispatch cannot error
                  // aslo we send the READY_EVENT _before_ dispatching otherwise in case where only 1 worker is working, the worker will never be READY to process the dispatched action
                  clearInterval(intervalId);
                  next();
                  this.dispatch(nextAction, err => {
                    if (err) {
                      this.log.fatal(err);
                    }
                  });
                }
              );
            }
          });
        });
      };

      this.dealer = this.createDealer(onMessage);
      this.dealer.send(this.READY_EVENT);
      this.log.trace(
        { identity: this.dealer.identity, data: this.READY_EVENT },
        'worker READY'
      );

      this.setBrokerTimeout(onMessage);
    }
  }

  _onError(err, action, logMessage) {
    this.log.error({ err: err }, logMessage);
    this.emitAction(action, {
      actionStatus: 'FailedActionStatus',
      endTime: new Date().toISOString(),
      error: {
        '@id': this.uuid({ curiePrefix: 'error' }),
        '@type': 'Error',
        name: err.code,
        description: err.message
      }
    });
  }

  // life cycle methods (will be overwritten by implementers)
  onActiveActionStatus(action, callback) {
    callback();
  }

  onCompletedActionStatus(action, callback) {
    callback();
  }

  onFailedActionStatus(err, action, callback) {
    callback();
  }

  onCanceledActionStatus(action, callback) {
    callback();
  }

  _close() {
    if (this.handleExit) {
      this.handleExit();
    }
    this._status = 'stopped';
    if (cluster.isWorker) {
      cluster.worker.disconnect();
    }
  }

  stop(callback = function() {}) {
    if (this._status === 'stopped') {
      callback();
    } else {
      this._status = 'stopping';
      if (cluster.isMaster) {
        let nWorker = Object.keys(cluster.workers).length;
        if (nWorker === 0) {
          callback();
        }
        let status = [];
        cluster.on('exit', function(worker, code, signal) {
          nWorker--;
          status.push({ id: worker.id, code, signal });
          if (nWorker === 0) {
            callback(status);
          }
        });
        for (let id in cluster.workers) {
          cluster.workers[id].send({ _status: 'stopping' });
        }
      } else {
        cluster.worker.on('exit', function(code, signal) {
          callback(code, signal);
        });
      }
    }
  }
}

Worker.prototype.emitAction = emitAction;
Worker.prototype.emitEvent = emitEvent;
Worker.prototype.dispatch = dispatch;
Worker.prototype.uuid = uuid;

export default Worker;
