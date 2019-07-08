const assert = require('assert');
const path = require('path');
const { processDocx } = require('../../src/document-worker/lib/test-utils');

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'errors-magical-sections.docx'
);

describe('DOCX: Errors/Warnings Reporting', function() {
  this.timeout(20 * 1000);
  let ctx;
  before(done => {
    processDocx(docx, (err, _ctx) => {
      if (err) {
        return done(err);
      }
      ctx = _ctx;
      done();
    });
  });

  it('should have warnings', () => {
    // console.log(require('util').inspect(ctx.warnings, { depth: null }));
    assert.equal(ctx.warnings.length, 3);
  });
});
