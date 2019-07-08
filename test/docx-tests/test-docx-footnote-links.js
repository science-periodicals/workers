const path = require('path');
const assert = require('assert');
const { processDocx } = require('../../src/document-worker/lib/test-utils');

const fnDoc = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'footnote-links.docx'
);

describe('DOCX: Footnotes', function() {
  this.timeout(20 * 1000);
  let resource, store, doc;
  before('processing the footnotes fixture', done => {
    processDocx(fnDoc, (err, ctx, w) => {
      assert.ifError(err);
      resource = ctx.resource;
      store = ctx.store;
      doc = ctx.doc;
      done();
    });
  });

  it('should have correct links in footnotes and endones', () => {
    let [link, link2] = resource.note.map(store.mapper()).map(cmt => {
      let div = doc.createElement('div');
      div.innerHTML = cmt.text['@value'];
      return div.querySelector('a:not([href^="#"])');
    });

    assert(link, 'there is a link');
    assert.equal(link.getAttribute('href'), 'http://berjon.com/');

    assert(link2, 'there is an endnote link');
    assert.equal(link2.getAttribute('href'), 'http://2017.im/');
  });
});
