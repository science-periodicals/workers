import path from 'path';
import assert from 'assert';
import { fork } from 'child_process';
import once from 'once';
import zmq from 'zeromq';
import countBy from 'lodash/countBy';
import { Broker, Worker } from '../src/';

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

describe('Broker', function() {
  this.timeout(100000);

  let broker, pub, sub;
  let procs = [];
  let w = new Worker({ log: { name: 'worker', level: 'fatal' } });

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
      done();
    });
  });

  it('should bookkeep workers', done => {
    done = once(done);
    procs = [];
    let allRegistered = false;
    let allDiscarded = false;
    let allKilled = false;
    broker.on('change', data => {
      if (!allRegistered && data.nUsableWorkers === 2) {
        allRegistered = true;
        assert.equal(data.nPendingRequests, 0);
        procs.forEach(proc => {
          proc.kill();
        });
      }

      if (!allDiscarded && allRegistered && data.nUsableWorkers === 0) {
        allDiscarded = true;
        // check that worker can be added back
        procs.push(
          fork(path.join(__dirname, 'utils', 'worker.js'), [], {
            cwd: path.join(__dirname, 'utils'),
            env: ENV
          })
        );
      }

      if (allRegistered && allDiscarded && data.nUsableWorkers === 1) {
        procs.forEach(proc => {
          proc.kill();
        });
        allKilled = true;
      }

      if (
        allRegistered &&
        allDiscarded &&
        allKilled &&
        data.nUsableWorkers === 0
      ) {
        done();
      }
    });

    procs.push(
      fork(path.join(__dirname, 'utils', 'worker.js'), [], {
        cwd: path.join(__dirname, 'utils'),
        env: ENV
      })
    );
    procs.push(
      fork(path.join(__dirname, 'utils', 'worker.js'), [], {
        cwd: path.join(__dirname, 'utils'),
        env: ENV
      })
    );
  });

  it('should queue pending request while waiting for worker connection and then drain the queue', done => {
    done = once(done);
    procs = [];
    const action = {
      '@id': 'actionId',
      agent: 'agentId',
      '@type': 'Action'
    };

    const n = 10;
    for (let i = 0; i < n; i++) {
      w.dispatch(action, (err, [data, workerId]) => {
        if (err) return done(err);
        assert.equal(data, 'OK');
      });
    }

    let allPending = false;
    let allProcessed = false;
    broker.on('change', data => {
      if (!allPending && data.nPendingRequests === n) {
        allPending = true;
        assert.equal(data.nUsableWorkers, 0);

        const p = fork(path.join(__dirname, 'utils', 'worker.js'), [], {
          cwd: path.join(__dirname, 'utils'),
          env: ENV
        });

        procs.push(p);
      }

      if (allPending && !allProcessed && data.nPendingRequests === 0) {
        allProcessed = true;
        procs.forEach(proc => {
          proc.kill();
        });
      }

      if (allPending && allProcessed && data.nUsableWorkers === 0) {
        done();
      }
    });
  });

  it('should load balance', done => {
    procs = [];
    const n = 4;
    const d = 40;
    for (let i = 0; i < n; i++) {
      const p = fork(path.join(__dirname, 'utils', 'worker.js'), [], {
        cwd: path.join(__dirname, 'utils'),
        env: ENV
      });
      procs.push(p);
    }

    let ready = false;
    const ack = [];
    broker.on('change', data => {
      if (!ready && data.nUsableWorkers === n) {
        ready = true;

        const action = {
          '@id': 'actionId',
          agent: 'agentId',
          '@type': 'Action'
        };

        for (let i = 0; i < d; i++) {
          w.dispatch(action, (err, [data, workerId] = []) => {
            if (err) return done(err);
            ack.push(workerId);
            assert.equal(data, 'OK');
            if (ack.length === d) {
              procs.forEach(proc => {
                proc.kill();
              });
            }
          });
        }
      }
    });

    const res = [];
    sub.on('message', (topic, data) => {
      data = JSON.parse(data);
      if (data.actionStatus === 'CompletedActionStatus') {
        res.push(data.pid);
        if (res.length === d) {
          const cAck = countBy(ack);
          const cRes = countBy(res);
          assert(Object.keys(cAck).every(key => cAck[key] > 1));
          assert.deepEqual(
            Object.keys(cAck)
              .map(key => cAck[key])
              .sort(),
            Object.keys(cRes)
              .map(key => cRes[key])
              .sort()
          );
          done();
        }
      }
    });
  });

  afterEach(function(done) {
    procs.forEach(proc => {
      try {
        proc.kill();
      } catch (err) {
        // noop
      }
    });
    broker.close();
    pub.close();
    sub.close();

    setTimeout(function() {
      done();
    }, 100);
  });
});
