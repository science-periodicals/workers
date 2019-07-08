import { EventEmitter } from 'events';
import zmq from 'zeromq';
import bunyan from 'bunyan';
import createError from '@scipe/create-error';

const re = /^(\w+)-(\w+)-/;

// Design notes:

// PUB / SUB part:
// We started with a XPUB / XSUB broker PUB -> [XSUB -> XPUB]  (see
// https://gist.github.com/jedi4ever/6591925) but it leads to issue for cancelation
// when we just need to publish 1 cancel action.
// See https://stackoverflow.com/questions/43129714/zeromq-xpub-xsub-serious-flaw
// for a detailed discussion and the solution adopted: PUSH -> [PULL -> PUB] -> SUB

// ROUTER / ROUTER part:
// See http://zguide.zeromq.org/page:all#A-Load-Balancing-Message-Broker
// Note that we use a DEALER socket from the worker to connect to the broker
// instead of a REQ one as the DEALER one is asynchronous
// (http://zguide.zeromq.org/page:all#ROUTER-Broker-and-DEALER-Workers)
// Clients dispatch work using REQ sockets

export default class Broker extends EventEmitter {
  constructor(config) {
    super();

    this.log = config.logger
      ? this.config.logger
      : bunyan.createLogger(
          Object.assign(
            { serializers: { err: bunyan.stdSerializers.err } },
            config.log || { name: 'broker' }
          )
        );

    this.backend = zmq.socket('router');
    this.backend.identity = 'backend' + process.pid;
    this.backendAddr =
      config.brokerBackendBindEndpoint ||
      process.env.BROKER_BACKEND_BIND_ENDPOINT ||
      'tcp://*:3004';

    this.frontend = zmq.socket('router');
    this.frontend.identity = 'frontend' + process.pid;
    this.frontendAddr =
      config.brokerFrontendBindEndpoint ||
      process.env.BROKER_FRONTEND_BIND_ENDPOINT ||
      'tcp://*:3003';

    this.xsub = zmq.socket('pull' /*'xsub'*/);
    this.xsub.identity = 'xsub' + process.pid;
    this.xsubAddr =
      config.brokerPullBindEndpoint ||
      process.env.BROKER_PULL_BIND_ENDPOINT ||
      config.brokerXsubBindEndpoint ||
      process.env.BROKER_XSUB_BIND_ENDPOINT ||
      'tcp://*:3002';

    this.xpub = zmq.socket('pub' /*'xpub'*/);
    this.xpub.identity = 'xpub' + process.pid;
    this.xpubAddr =
      config.brokerXpubBindEndpoint ||
      process.env.BROKER_XPUB_BIND_ENDPOINT ||
      'tcp://*:3001';

    this.heartbeatIntervalId = null;

    this.readyEvent = config.readyEvent || 'READY';
    this.heartbeatEvent = config.heartbeatEvent || 'HEARTBEAT';
    this.heartbeatInterval = config.heartbeatInterval || 1000;
    this.workerTimeout = config.workerTimeout || 1000;
    this.workerLiveness = config.workerLiveness || 5;

    this.workerStore = new Map(); // key: type, value: list of available worker id's
    this.workerTimeouts = new Map();
    this.pendingRequests = [];
  }

  getNumberOfUsableWorkers() {
    return Array.from(this.workerStore.keys()).reduce((n, key) => {
      return n + this.workerStore.get(key).length;
    }, 0);
  }

  /**
   * Add a worker to the pool of available workers
   */
  addWorker(workerType, workerId) {
    if (this.workerStore.has(workerType)) {
      let workers = this.workerStore.get(workerType);
      if (!workers.some(w => w === workerId)) {
        workers.push(workerId);
        this.workerStore.set(workerType, workers);
      }
    } else {
      this.workerStore.set(workerType, [workerId]);
    }

    this.emit('change', {
      op: 'ADD_WORKER',
      workerType,
      workerId,
      nPendingRequests: this.pendingRequests.length,
      nUsableWorkers: this.getNumberOfUsableWorkers()
    });
  }

  /**
   * Remove a worker from the pool of available workers
   * (typically because this worker timed out)
   */
  discardWorker(workerType, workerId) {
    const workers = this.workerStore.get(workerType);
    if (workers && workers.length) {
      this.workerStore.set(workerType, workers.filter(w => w !== workerId));
    }
    this.emit('change', {
      op: 'DISCARD_WORKER',
      workerType,
      workerId,
      nPendingRequests: this.pendingRequests.length,
      nUsableWorkers: this.getNumberOfUsableWorkers()
    });
  }

  /**
   * Remove a worker from the pool of available workers
   * (typically because work was sent to this worker)
   */
  useWorker(workerType) {
    let workers = this.workerStore.get(workerType);
    if (workers && workers.length > 0) {
      const worker = workers.shift();
      const workerId = worker.toString();
      this.emit('change', {
        op: 'USE_WORKER',
        workerType,
        workerId,
        nPendingRequests: this.pendingRequests.length,
        nUsableWorkers: this.getNumberOfUsableWorkers()
      });
      return workerId;
    }
  }

  addPendingRequest(workerType, clientId) {
    this.pendingRequests.push(`${workerType}-${clientId}`);
    this.emit('change', {
      op: 'ADD_PENDING_REQUEST',
      workerType,
      clientId,
      nPendingRequests: this.pendingRequests.length,
      nUsableWorkers: this.getNumberOfUsableWorkers()
    });
  }

  removePendingRequest(workerType, clientId, workerId) {
    this.pendingRequests = this.pendingRequests.filter(
      id => id !== `${workerType}-${clientId}`
    );
    this.emit('change', {
      op: 'REMOVE_PENDING_REQUEST',
      workerType,
      workerId,
      clientId,
      nPendingRequests: this.pendingRequests.length,
      nUsableWorkers: this.getNumberOfUsableWorkers()
    });
  }

  listen(callback) {
    if (this._isListening) {
      return callback(createError(400, 'broker is already listening'));
    }

    this._isListening = true;
    let bound = 0; // keep track of the zmq bind (async) we callback after all sockets are bound

    const setWorkerTimeout = (workerId, workerType) => {
      clearTimeout(this.workerTimeouts.get(workerId));
      this.workerTimeouts.set(
        workerId,
        setTimeout(() => {
          this.discardWorker(workerType, workerId);
          this.workerTimeouts.delete(workerId);
          this.log.trace(
            {
              workerId: workerId,
              workers: this.workerStore.get(workerType),
              workerTimeouts: Array.from(this.workerTimeouts.keys())
            },
            'worker timed out'
          );
        }, this.workerTimeout * this.workerLiveness)
      );
    };

    const resetWorkerTimeout = (workerId, workerType) => {
      this.log.trace(
        {
          workerId: workerId
        },
        'reset worker timeout'
      );
      clearTimeout(this.workerTimeouts.get(workerId));
      if (this.workerTimeouts.delete(workerId)) {
        setWorkerTimeout(workerId, workerType);
      }
    };

    this.backend.bind(this.backendAddr, err => {
      if (err) return callback(err);
      this.log.info(
        {
          BROKER_BACKEND: this.backendAddr
        },
        'broker backend bounded'
      );

      if (++bound === 4) {
        callback(null);
      }

      this.heartbeatIntervalId = setInterval(() => {
        for (let [, workers] of this.workerStore) {
          for (let workerId of workers) {
            this.backend.send([
              Buffer.from(workerId),
              Buffer.from(this.heartbeatEvent)
            ]);
          }
        }
      }, this.heartbeatInterval);

      this.backend.on('message', (...args) => {
        this.log.trace(
          {
            args: args.map(x => x.toString())
          },
          '<- load balancer backend'
        );

        const workerId = args[0].toString();
        const match = workerId.match(re);
        if (!match) {
          this.log.fatal(
            {
              workerId,
              args: args.map(x => x.toString())
            },
            'invalid peer (worker or client) identity'
          );
          throw new Error(
            `invalid peer (worker or client) identity, identity must be <actionType>-<worker|client>-<uuid> (got ${workerId})`
          );
        }
        const workerType = match[1];
        const peerType = match[2];

        // the workers communicate with the broker through a DEALER socket.
        // Every message from the worker => worker is alive => we reset timeout
        // reset expiration date of worker
        if (peerType === 'worker') {
          resetWorkerTimeout(workerId, workerType);
        }

        if (args[1] == this.heartbeatEvent) {
          return;
        }

        if (args[1] == this.readyEvent) {
          this.addWorker(workerType, args[0].toString());
          setWorkerTimeout(workerId, workerType);
          this.log.debug(
            {
              workerType: workerType,
              workers: this.workerStore.get(workerType)
            },
            'backend received worker READY'
          );
        } else {
          // the client contacted us on the frontend, we respond with the worker
          // acknowledgment (sent to the backend by the worker through a DEALER
          // socket connected to the broker backend ROUTER socket)
          this.frontend.send([
            args[1], // clientId (as buffer)
            '', // we add an empty delimiter to keep compatibility with REQ socket that called the broker
            args[2], // the worker acknowledgment data (typically `OK`)
            args[0] // workerId (useful to send it back for testing)
          ]);

          this.log.debug(
            {
              clientId: args[1].toString(),
              workerId: workerId
            },
            'backend responded to original client request with the worker acknowledgemt'
          );
        }
      });
    });

    this.frontend.bind(this.frontendAddr, err => {
      if (err) {
        return callback(err);
      }

      this.log.info(
        {
          BROKER_FRONTEND: this.frontendAddr
        },
        'broker frontend bounded'
      );

      if (++bound === 4) {
        callback(null);
      }

      this.frontend.on('message', (...args) => {
        this.log.trace(
          {
            BROKER_FRONTEND: this.frontendAddr,
            args: args.map(x => x.toString())
          },
          '-> load balancer frontend'
        );

        const clientId = args[0].toString();
        const match = clientId.match(re);
        if (!match) {
          this.log.fatal(
            {
              clientId,
              args: args.map(x => x.toString())
            },
            'invalid peer (worker or client) identity'
          );
          throw new Error(
            `invalid peer (worker or client) identity, identity must be <actionType>-<worker|client>-<uuid> (got ${clientId})`
          );
        }
        const workerType = match[1];
        this.addPendingRequest(workerType, clientId);

        // What if no workers are available? Delay till one is ready.
        const intervalId = setInterval(() => {
          const workerId = this.useWorker(workerType); // `workerId` is undefined if no worker are available
          if (workerId) {
            clearTimeout(this.workerTimeouts.get(workerId));
            this.workerTimeouts.delete(workerId);

            this.backend.send([
              Buffer.from(workerId), // workerId as a buffer
              args[2], // args[2] as args[1] is an empty delimiter added by the REQ socket
              args[0] // clientId as a buffer, we pass it so that the worker can send an acknowledgment response to the client (by talking to the backend of the broker)
            ]);
            this.removePendingRequest(workerType, clientId, workerId);
            this.log.debug(
              {
                clientId: clientId,
                workerId: workerId,
                workerType: workerType,
                workers: this.workerStore.get(workerType)
              },
              'frontend dispatched work to worker and removed it from the broker worker queue'
            );
            clearInterval(intervalId);
          }
        }, 100);
      });
    });

    this.xsub.bind(this.xsubAddr, err => {
      if (err) return callback(err);
      bound += 1;

      this.xpub.bind(this.xpubAddr, err => {
        if (err) return callback(err);
        if (++bound === 4) {
          callback(null);
        }

        // NOTE: relying on `...rest` here is intentional. When using multipart ZMQ messages, `send()`
        // expects an array but `on('message')` provides multiple arguments. Changing that will cause
        // weird data loss bugs
        // (xpub is now pub)
        this.xpub.on('message', (...args) => {
          this.xsub.send(args.length > 1 ? args : args[0]);
          // console.log(`XPUB: ${args.map(data => data && data.toString())}`);
        });
        // (xsub is now pull)
        this.xsub.on('message', (...args) => {
          this.xpub.send(args.length > 1 ? args : args[0]);
          // console.log(`XSUB: ${args.map(data => data && data.toString())}`);
        });
      });
    });
  }

  close() {
    try {
      clearInterval(this.heartbeatIntervalId);
      this.frontend.close();
      this.backend.close();
      this.xpub.close();
      this.xsub.close();
    } catch (err) {
      this.log.error(err, 'error closing broker');
    }
    this.workerStore.clear();
    this.workerTimeouts.clear();
    this.pendingRequests = [];
    this._isListening = false;
  }
}
