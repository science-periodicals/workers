import zmq from 'zeromq';
import request from 'request';
import asyncMap from 'async/map';
import createError from '@scipe/create-error';
import { getSocketIdentity, renderUrlTemplate } from '@scipe/librarian';

export default function dispatch(action, callback) {
  if (!action || (Array.isArray(action) && !action.length)) {
    return callback(null);
  }

  const actions = Array.isArray(action) ? action : [action];

  asyncMap(
    actions,
    (action, cb) => {
      if (
        action['@type'] &&
        (!this.dispatchTypes.size || this.dispatchTypes.has(action['@type']))
      ) {
        let sock = zmq.socket('req');
        // keep in sync with @scipe/librarian
        sock.identity = getSocketIdentity(action);
        this.log.debug(
          {
            WORKER_BROKER_FRONTEND: this.BROKER_FRONTEND,
            action: action
          },
          'dispatching action to broker'
        );
        sock.connect(this.BROKER_FRONTEND);
        sock.send(JSON.stringify(action));
        sock.on('message', (data, workerId) => {
          this.log.trace(
            {
              WORKER_BROKER_FRONTEND: this.BROKER_FRONTEND,
              data: data.toString(),
              workerId: workerId.toString()
            },
            'received broker confirmation'
          );
          sock.close();
          cb(null, [data.toString(), workerId.toString()]);
        });
      } else if (action.target) {
        const targets = Array.isArray(action.target)
          ? action.target
          : [action.target];
        asyncMap(
          targets,
          (target, cb) => {
            if (!target || !target.urlTemplate || !target.httpMethod) {
              return cb(null, []);
            }
            const uri = renderUrlTemplate(action, null, target);
            request(
              {
                method: target.httpMethod,
                url: uri,
                json: action
              },
              (err, resp, body) => {
                if (err) return cb(err);
                if (resp.statusCode >= 400) {
                  return cb(createError(resp.statusCode, body));
                }
                cb(null, ['OK', uri]);
              }
            );
          },
          cb
        );
      } else {
        cb(null, []);
      }
    },
    (err, res) => {
      if (err) return callback(err);
      if (!Array.isArray(action)) {
        callback(null, res[0]);
      } else {
        callback(null, res);
      }
    }
  );
}
