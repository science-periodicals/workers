require('@babel/register');

var util = require('util');
var Worker = require('../../dist/').Worker;

function TestWorker(config) {
  Worker.call(this, config);
}

util.inherits(TestWorker, Worker);

TestWorker.prototype.onCanceledActionStatus = function(action, callback) {
  callback(
    null,
    Object.assign({}, action, { actionStatus: 'CanceledActionStatus' })
  );
};

TestWorker.prototype.handleAction = function(action, callback) {
  if (action.error) {
    callback(action.error);
  } else if (action.infinite) {
    setInterval(
      function() {
        this.log.debug('infinite work');
      }.bind(this),
      100
    );
  } else {
    var nextAction;
    if (action.result && action.result.potentialAction) {
      var object = Object.keys(action.result).reduce(function(object, p) {
        if (p !== 'potentialAction') {
          object[p] = action.result[p];
        }
        return object;
      }, {});
      nextAction = Object.assign({}, action.result.potentialAction, {
        object: object
      });
    }
    callback(
      null,
      Object.assign({}, action, {
        actionStatus: 'CompletedActionStatus',
        pid: process.pid
      }),
      nextAction
    );
  }
};

var w = new TestWorker({
  log: { name: 'test-worker', level: 'fatal' }
});
w.listen();
