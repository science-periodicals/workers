const assert = require('assert');
const path = require('path');
const { arrayify } = require('../../src/document-worker/lib/utils');
const {
  processDocx,
  frame
} = require('../../src/document-worker/lib/test-utils');

const samplePath = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'bib-sample.ds3.docx'
);

describe('DOCX: Encoding tree', function() {
  this.timeout(20 * 1000);
  let resource;
  before('processing the encoding tree fixture', done => {
    processDocx(samplePath, (err, ctx) => {
      assert.ifError(err);
      frame(ctx, (err, framed) => {
        assert.ifError(err);
        resource = framed['@graph'][0];
        done();
      });
    });
  });
  it('the encoding tree is correct', () => {
    recurse(resource);
  });
});

function recurse(res, parentEncoding) {
  if (parentEncoding) {
    arrayify(res.encoding).forEach(enc => {
      assert(
        enc.isBasedOn && enc.isBasedOn.length,
        'encoding has an isBasedOn'
      );
      assert.equal(
        arrayify(enc.isBasedOn)[0]['@id'],
        parentEncoding['@id'],
        'encoding is based on parent'
      );
    });
  }
  arrayify(res.hasPart).forEach(part => {
    recurse(part, arrayify(res.encoding)[0] || parentEncoding);
  });
}
