const path = require('path');
const assert = require('assert');
const { processDocx } = require('../../src/document-worker/lib/test-utils');

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'fake-test-docx.ds3.docx'
);

describe('DOCX: Fake docx', function() {
  this.timeout(20 * 1000);

  it('should error on fake docx but not crash', done => {
    processDocx(docx, (err, ctx) => {
      assert(err);
      done();
    });
  });
});
