import assert from 'assert';
import path from 'path';
import { processDocx } from '../../src/document-worker/lib/test-utils';

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'link-sample.ds3.docx'
);

describe('DOCX: links', function() {
  this.timeout(20 * 1000);
  let ctx;
  before('processing the link fixture', done => {
    processDocx(docx, (err, _ctx) => {
      assert.ifError(err);
      ctx = _ctx;
      done();
    });
  });

  it('should have flavored the link', () => {
    const { doc } = ctx;
    const citationLinks = doc.querySelectorAll('a[property="schema:citation"]');
    const commentLinks = doc.querySelectorAll('a[property="sa:note"]');
    const organizationLinks = doc.querySelectorAll(
      'a[property="sa:roleAffiliation"]'
    );
    const authorLinks = doc.querySelectorAll('a[property="schema:author"]');
    assert.equal(citationLinks.length, 1);
    assert.equal(commentLinks.length, 15);
    assert.equal(organizationLinks.length, 1);
    assert.equal(authorLinks.length, 1);
  });
});
