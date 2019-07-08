const path = require('path');
const assert = require('assert');
const { processDocx } = require('../../src/document-worker/lib/test-utils');

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'equation-number.ds3.docx'
);

describe('DOCX: Equation Numbering', function() {
  this.timeout((process.env.CI ? 60 : 30) * 1000);
  it('should number equations', done => {
    processDocx(docx, (err, ctx) => {
      if (err) {
        return done(err);
      }

      let { doc, store, resource } = ctx;
      // let's make sure we didn't lose any equations in that document (outside figures)
      assert.equal(doc.querySelectorAll('math').length, 227);

      assert.equal(
        doc.querySelectorAll('figure[data-equation-number]').length,
        13
      );

      // 1 + 2 ... + 13 = 91
      let total = resource.hasPart
        .map(store.mapper())
        .filter(r => r.$type === 'Formula')
        .map(r => r.position)
        .reduce((a, b) => a + b, 0);
      assert.equal(total, 91);

      done();
    });
  });
});
