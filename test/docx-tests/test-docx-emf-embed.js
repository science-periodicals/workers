const path = require('path');
const assert = require('assert');
const { processDocx } = require('../../src/document-worker/lib/test-utils');

const pdfDoc = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'pdf-image.docx'
);

describe('DOCX: EMF/PDF Embed', function() {
  this.timeout(200 * 1000);
  it('should end up with a PNG', done => {
    processDocx(pdfDoc, (err, ctx) => {
      assert.ifError(err);
      let { store } = ctx;
      let img = store.resources().find(res => res.$type === 'Image');
      let enc = store.get(img.encoding[0]);

      assert.equal(enc.name, 'figure-1.png');
      assert.equal(enc.fileFormat, 'image/png', 'right media type');
      assert(enc.thumbnail.length > 1, 'was converted');
      done();
    });
  });
});
