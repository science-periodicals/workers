import assert from 'assert';
import { join, dirname } from 'path';
import dedocx from '@scipe/dedocx';
import quotify from '../../src/document-worker/dedocx-plugins/quotify';

const sourcePath = join(
  dirname(__dirname),
  'fixtures/document-worker/plugins/quotes.docx'
);

describe('Quotes', () => {
  it('should find cites', done => {
    dedocx({ sourcePath, plugins: [quotify()] }, (err, { doc } = {}) => {
      assert.ifError(err);
      let bqs = doc.querySelectorAll('blockquote'),
        cites = Array.from(doc.querySelectorAll('cite')),
        authors = [
          '–Walter Lippmap, ‘The Good Society’',
          '—W.H. Auden, “But I Can’t”'
        ];
      assert.equal(bqs.length, cites.length, 'cites for all BQs');
      assert.equal(cites.length, authors.length, 'expected number of cites');
      cites.forEach((c, idx) => {
        assert.equal(
          c.textContent,
          authors[idx],
          `we get "${authors[idx]}" in the cite: "${c.textContent}"`
        );
      });
      done();
    });
  });
});
