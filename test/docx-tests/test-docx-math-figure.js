const path = require('path');
const assert = require('assert');
const { TEXT_NODE } = require('dom-node-types');
const { processDocx } = require('../../src/document-worker/lib/test-utils');

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'math-figure.ds3.docx'
);

describe('DOCX: Math Blocks', function() {
  this.timeout(20 * 1000);
  it('should only figurify the right block equations', done => {
    processDocx(docx, (err, ctx) => {
      let paras = Array.from(ctx.doc.querySelectorAll('p'));
      // NOTE: if we decide to merge block equations into their adjoining paragraphs (as we used to
      // do) then we will need to switch that 9 to 5.
      assert.equal(paras.length, 9, 'there are nine paragraphs');
      assert.equal(
        paras[0].nextElementSibling.localName,
        'figure',
        'figure after first p'
      );
      assert.equal(
        paras[1].nextElementSibling.localName,
        'figure',
        'figure after second p'
      );
      assert.equal(
        paras[3].querySelectorAll('span[role="math"][style*=" block"]').length,
        1,
        'block in 4th p'
      );
      // prevAndNextText(paras[3].querySelector('span[role="math"][style*=" block"]'), '4');
      assert.equal(
        paras[5].querySelectorAll('span[role="math"][style*=" block"]').length,
        0,
        'no block in p5'
      );
      assert.equal(
        paras[5].querySelectorAll('span[role="math"][style*="inline-block"]')
          .length,
        1,
        'inline in p5'
      );
      prevAndNextText(
        paras[5].querySelector('span[role="math"][style*="inline-block"]'),
        '5'
      );
      assert.equal(
        paras[7].querySelectorAll('span[role="math"][style*=" block"]').length,
        3,
        '3 blocks in p7'
      );
      // prevAndNextText(paras[4].querySelector('span[role="math"][style*=" block"]'), '5');
      done();
    });
  });
});

function prevAndNextText(el, label) {
  let prevs = [],
    nexts = [],
    curP = el.previousSibling,
    curN = el.nextSibling;
  while (curP) {
    prevs.push(curP.nodeType);
    curP = curP.previousSibling;
  }
  while (curN) {
    nexts.push(curN.nodeType);
    curN = curN.nextSibling;
  }
  assert(
    prevs.some(x => x === TEXT_NODE),
    `there are some preceding text nodes in ${label}`
  );
  assert(
    nexts.some(x => x === TEXT_NODE),
    `there are some following text nodes in ${label}`
  );
}
