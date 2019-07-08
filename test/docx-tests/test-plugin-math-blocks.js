import assert from 'assert';
import { join, dirname } from 'path';
import dedocx from '@scipe/dedocx';
import mathBlocks from '../../src/document-worker/dedocx-plugins/math-blocks';

const sourcePath = join(
  dirname(__dirname),
  'fixtures/document-worker/plugins/grouping-equations.docx'
);

describe('Grouping Equations', () => {
  it('should group subsequent equations together', done => {
    dedocx({ sourcePath, plugins: [mathBlocks()] }, (err, { doc } = {}) => {
      assert.ifError(err);
      let p = doc.querySelector('p[data-dedocx-caption-group]');
      // data-dedocx-caption-target-type="math"
      assert(p, 'p is there');
      assert.equal(
        p.getAttribute('data-dedocx-caption-target-type'),
        'math',
        'it is maths'
      );
      assert(
        !doc.querySelector('p:not([data-dedocx-caption-group]) > math'),
        'no free maths'
      );
      assert.equal(p.querySelectorAll('math').length, 3, '3 equations in p');
      done();
    });
  });
});
