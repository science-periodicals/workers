require('@babel/register');

var broker = require('../../dist/broker');

broker(function(err) {
  if (err) {
    throw err;
  }
});
