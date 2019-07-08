const assert = require('assert');
const path = require('path');
const {
  processDocx,
  frame
} = require('../../src/document-worker/lib/test-utils');

const samplePath = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'multi-figure.ds3.docx'
);

describe('DOCX: Multi-figures', function() {
  this.timeout(20 * 1000);
  let image;
  before('processing the multi-figures fixture', done => {
    processDocx(samplePath, (err, ctx) => {
      assert.ifError(err);

      frame(ctx, (err, framed) => {
        if (err) return done(err);
        image = framed['@graph'][0].hasPart.find(
          part => part['@type'] === 'Image'
        );
        done();
      });
    });
  });

  it('should produce multi-figures', () => {
    assert.equal(image.hasPart.length, 3, '3 sub-figures');
    assert.equal(image.hasPart[0].alternateName, 'A');
    assert.equal(image.hasPart[1].alternateName, 'B');
    assert.equal(image.hasPart[2].alternateName, 'C');
  });
});
