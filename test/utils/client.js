require('@babel/register');

var Worker = require('../../dist/').Worker;

var w = new Worker();
w.dispatch({ hello: 'world' }, (err, data) => {
  console.log(data);
});
