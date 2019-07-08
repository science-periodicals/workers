const path = require('path');
const assert = require('assert');
const { processDocx } = require('../../src/document-worker/lib/test-utils');

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'description.docx'
);

describe('DOCX: description', function() {
  this.timeout(20 * 1000);
  it('should remove description into the model', done => {
    processDocx(docx, (err, ctx) => {
      assert.ifError(err);
      let {
        doc,
        resource: { description }
      } = ctx;
      assert(!doc.querySelector('h2'), 'No h2');
      assert(description);
      assert(
        /<em>emphasis<\/em>/.test(description['@value']),
        'value has the <em>'
      );
      done();
    });
  });
});
