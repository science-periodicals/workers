const assert = require('assert');
const path = require('path');
const { processDocx } = require('../../src/document-worker/lib/test-utils');

const samplePath = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'abbreviations.ds3.docx'
);

describe('DOCX: Abbreviations', function() {
  this.timeout(20 * 1000);
  let doc;

  const abbr = {
    EID: [2, 'Emerging Infectious Diseases'],
    ICTV: [1, 'International Committee on the Taxonomy of Viruses'],
    PCR: [1, 'Polymerase Chain Reaction'],
    'sci.pe': [1, 'Science Periodicals']
  };

  before('processing the abbreviations fixture', done => {
    processDocx(samplePath, (err, ctx) => {
      if (err) return done(err);
      doc = ctx.doc;
      done();
    });
  });

  it('should not have an abbreviation section', () => {
    assert(
      !Array.from(doc.querySelectorAll('section h2'))
        .map(el => el.innerHTML)
        .includes('Abbreviations')
    );
  });

  it('should have abbreviations as title attributes', () => {
    let found = {};
    Array.from(doc.querySelectorAll('abbr')).forEach($abbr => {
      let txt = $abbr.textContent;
      if (!found[txt]) found[txt] = 0;
      found[txt]++;

      assert.equal($abbr.getAttribute('title'), abbr[txt][1]);
    });

    // check cross-references to abbreviations
    Object.keys(abbr).forEach(k => {
      assert.equal(found[k], abbr[k][0]);
    });
  });
});
