const path = require('path');
const assert = require('assert');
const { processDocx } = require('../../src/document-worker/lib/test-utils');

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'sample-si-text.ds3.docx'
);

describe('DOCX: Supporting Information', function() {
  this.timeout(20 * 1000);
  let ctx;

  before(done => {
    processDocx(docx, (err, _ctx) => {
      assert.ifError(err);
      ctx = _ctx;
      done();
    });
  });

  it('should have processed the supporting information', done => {
    const { doc, store } = ctx;
    // console.log(require('pretty')(require('jsdom').serializeDocument(ctx.doc)));

    const $si = doc.querySelector(
      'section[typeof="sa:WPSupportingInformation"]'
    );
    assert($si);

    let resources = store.resources();
    [
      'Image',
      'Audio',
      'Video',
      'Table',
      'SoftwareSourceCode',
      'TextBox',
      'Dataset'
    ].forEach(type =>
      assert(
        resources.some(res => res.$type === type && res.isSupportingResource),
        `Got type ${type}`
      )
    );

    done();
  });
});
