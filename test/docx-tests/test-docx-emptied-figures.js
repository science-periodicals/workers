const assert = require('assert');
const path = require('path');
const { processDocx } = require('../../src/document-worker/lib/test-utils');

const samplePath = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'emptied-figure.ds3.docx'
);

describe('DOCX: Figures are emptied', function() {
  this.timeout(20 * 1000);
  let doc;
  before('processing the fixture', done => {
    processDocx(samplePath, (err, ctx) => {
      assert.ifError(err);
      doc = ctx.doc;
      done();
    });
  });

  it('should have no figure content whatsoever', () => {
    Array.from(
      doc.querySelectorAll('figure[resource], aside[resource]')
    ).forEach(fig => {
      assert.equal(fig.childNodes.length, 0, `figure is empty`);
    });
  });
});
