import path from 'path';
import assert from 'assert';
import { fork } from 'child_process';
import zmq from 'zeromq';
import { Worker, Broker } from '../src/';

var ENV = {
  BROKER_FRONTEND_CONNECT_ENDPOINT:
    process.env.BROKER_FRONTEND_CONNECT_ENDPOINT || 'tcp://127.0.0.1:3003',
  BROKER_BACKEND_CONNECT_ENDPOINT:
    process.env.BROKER_BACKEND_CONNECT_ENDPOINT || 'tcp://127.0.0.1:3004',
  BROKER_XPUB_CONNECT_ENDPOINT:
    process.env.BROKER_XPUB_CONNECT_ENDPOINT || 'tcp://127.0.0.1:3001',
  BROKER_XSUB_CONNECT_ENDPOINT:
    process.env.BROKER_XSUB_CONNECT_ENDPOINT || 'tcp://127.0.0.1:3002',
  HEALTH_CHECK_DELAY: 500,
  N_WORKERS: 1
};

describe('Worker', function() {
  this.timeout(100000);

  describe('Worker#uuid()', function() {
    it('should return a uuid with the CURIE_PREFIX passed as config', function() {
      let w = new Worker({ curiePrefix: 'sa' });
      let id = w.uuid();
      assert(/^sa:/.test(id));
    });
  });

  describe('Worker#emitEvent', function() {
    var w;
    beforeEach(function() {
      w = new Worker();
    });

    it('should return an object that serializes to a ProgressEvent', function() {
      let event = JSON.parse(
        JSON.stringify(
          w.emitEvent(
            { '@id': 'action:actionId', agent: 'user:agentId' },
            'my event'
          )
        )
      );
      assert.equal(event['@type'], 'ProgressEvent');
      assert.equal(event.about, 'action:actionId');
      assert.equal(event.description, 'my event');
    });

    it('should return an object with an emitEndEvent method returning the original event  but with an added endDate property', function() {
      let { emitEndedEvent } = w.emitEvent(
        { '@id': 'actionId', agent: 'agentId' },
        'my event'
      );
      let event = emitEndedEvent();
      assert(event.endDate);
      assert(
        new Date(event.endDate).getTime() >= new Date(event.startDate).getTime()
      );
    });

    it('should return an object with an emitSubEvent method returning the orginal action but with an added superEvent property pointing to the parent event for the event', function() {
      const action = { '@id': 'actionId', agent: 'agentId' };

      let superEvent = w.emitEvent(action, 'event');
      let subEvent1 = superEvent.emitEvent(action, 'subEvent 1');
      let subEvent2 = superEvent.emitEvent(action, 'subEvent 2');
      let subSubEvent = subEvent2.emitEvent(action, 'sub sub Event');

      assert.equal(superEvent.toJSON().description, 'event');
      assert.equal(subEvent1.toJSON().superEvent, superEvent.toJSON()['@id']);

      assert.equal(subEvent2.toJSON().description, 'subEvent 2');
      assert.equal(subEvent2.toJSON().superEvent, superEvent.toJSON()['@id']);

      assert.equal(subSubEvent.toJSON().description, 'sub sub Event');
      assert.equal(subSubEvent.toJSON().superEvent, subEvent2.toJSON()['@id']);
    });
  });

  describe('zmq (messaging)', function() {
    var proc, broker, pub, sub;
    var w = new Worker({ log: { name: 'worker', level: 'fatal' } });

    beforeEach(function(done) {
      pub = zmq.socket('push' /* formerly 'pub' (see notes in broker code) */);
      pub.connect(ENV['BROKER_XSUB_CONNECT_ENDPOINT']);
      sub = zmq.socket('sub');
      sub.connect(ENV['BROKER_XPUB_CONNECT_ENDPOINT']);
      sub.subscribe('');

      broker = new Broker({ log: { name: 'broker', level: 'fatal' } });
      broker.listen(err => {
        if (err) {
          return done(err);
        }

        proc = fork(path.join(__dirname, 'utils', 'worker.js'), [], {
          cwd: path.join(__dirname, 'utils'),
          env: ENV
        });

        done();
      });
    });

    it('should handle publish worker events to zmq sub socket', function(done) {
      var action = {
        '@id': 'actionId',
        agent: 'agentId',
        '@type': 'Action',
        object: { '@id': 'a' },
        result: [{ '@id': 'b' }]
      };

      let ncb = 0;
      w.dispatch(action, (err, [data] = []) => {
        assert.equal(data, 'OK');
        if (++ncb === 2) {
          done();
        }
      });

      let hasFiredActiveActionStatus = false;
      sub.on('message', (topic, data) => {
        data = JSON.parse(data);
        if (data.actionStatus === 'ActiveActionStatus') {
          hasFiredActiveActionStatus = true;
        }
        if (data.actionStatus === 'CompletedActionStatus') {
          assert.equal(topic, 'agentId');
          assert(hasFiredActiveActionStatus);
          if (++ncb === 2) {
            done();
          }
        }
      });
    });

    it('should kill worker process and restart it when a schema:CancelAction action is published (cancelation)', function(done) {
      var action = {
        '@id': 'actionId',
        '@type': 'Action',
        agent: 'agentId',
        infinite: true,
        object: { '@id': 'a' },
        result: [{ '@id': 'b' }]
      };

      let ncb = 0;
      w.dispatch(action, (err, [data] = []) => {
        assert.equal(data, 'OK');
        if (++ncb === 3) {
          done();
        }
      });

      let n = 0;
      sub.on('message', function(topic, data) {
        data = JSON.parse(data);
        n++;
        if (data.actionStatus === 'ActiveActionStatus' && n === 2) {
          // kill worker process (only way to end infinite task => free the single worker that can
          // then process the next message
          pub.send([
            'worker',
            JSON.stringify({
              '@type': 'CancelAction',
              object: action['@id']
            })
          ]);
          w.dispatch(
            {
              '@type': 'Action',
              object: { '@id': 'c' },
              result: [{ '@id': 'd' }]
            },
            (err, [data] = []) => {
              assert.equal(data, 'OK');
              if (++ncb === 3) {
                done();
              }
            }
          );
        }
        if (
          data.actionStatus === 'CompletedActionStatus' &&
          data.result[0]['@id'] === 'd'
        ) {
          if (++ncb === 3) {
            done();
          }
        }
      });
    });

    it('should kill the worker and restart it when an error with negative code is returned by handle action', function(done) {
      // idea of the test:
      // dispatch give back the worker socket identity, we only have one worker so if we make 2 calls the identity is the same
      // for the second call, we kill the worker
      // fourth call will see a different identity => suicide worked

      var action = {
        '@id': 'actionId',
        '@type': 'Action',
        agent: 'agentId',
        object: { '@id': 'a' },
        result: [{ '@id': 'b' }]
      };

      var error = new Error('error');
      error.code = -1;
      var errorAction = {
        '@id': 'actionId',
        '@type': 'Action',
        agent: 'agentId',
        error: error,
        object: { '@id': 'a' },
        result: [{ '@id': 'b' }]
      };

      let ncb = 0;

      let nCompletedAction = 0;
      let nFailedAction = 0;
      let originalWorkerId;

      w.dispatch(action, (err, [data, workerId] = []) => {
        assert.equal(data, 'OK');
        assert(workerId);
        originalWorkerId = workerId;

        w.dispatch(errorAction, (err, [data, workerId] = []) => {
          assert.equal(data, 'OK');
          assert.equal(workerId, originalWorkerId);

          w.dispatch(action, (err, [data, workerId] = []) => {
            assert.equal(data, 'OK');
            assert(workerId);
            assert(workerId !== originalWorkerId);

            if (++ncb === 2) {
              done();
            }
          });
        });
      });

      sub.on('message', function(topic, data) {
        data = JSON.parse(data);
        if (data.actionStatus === 'FailedActionStatus') {
          nFailedAction++;
        } else if (data.actionStatus === 'CompletedActionStatus') {
          nCompletedAction++;
        }
        if (nFailedAction === 1 && nCompletedAction === 2 && ++ncb === 2) {
          done();
        }
      });
    });

    it('should dispatch potential action', function(done) {
      var action = {
        '@id': 'actionId',
        '@type': 'Action',
        agent: 'agentId',
        object: { '@id': 'a' },
        result: {
          '@id': 'b',
          potentialAction: {
            '@type': 'Action',
            result: { '@id': 'c' }
          }
        }
      };

      sub.on('message', (topic, data) => {
        data = JSON.parse(data);
        if (
          data.actionStatus === 'CompletedActionStatus' &&
          data.result &&
          data.result.potentialAction
        ) {
          assert.equal(data.result.potentialAction.result['@id'], 'c');
        }

        if (
          data.actionStatus === 'CompletedActionStatus' &&
          data.result &&
          !data.result.potentialAction
        ) {
          done();
        }
      });

      w.dispatch(action, (err, [data, workerId]) => {
        assert(data, 'OK');
      });
    });

    afterEach(function(done) {
      broker.close();
      pub.close();
      sub.close();
      proc.kill();
      setTimeout(function() {
        done();
      }, 100);
    });
  });
});
