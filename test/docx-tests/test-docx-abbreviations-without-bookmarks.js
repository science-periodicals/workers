const assert = require('assert');
const path = require('path');
const {
  processDocx,
  frame
} = require('../../src/document-worker/lib/test-utils');

const samplePath = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'abbreviations-without-bookmarks.ds3.docx'
);

describe('DOCX: Citation errors with unbookmarked abbreviations', function() {
  this.timeout(20 * 1000);
  let doc;
  let framed;

  before('processing the abbreviations fixture', done => {
    processDocx(samplePath, (err, ctx) => {
      if (err) return done(err);
      doc = ctx.doc;
      frame(ctx, (err, _framed) => {
        if (err) {
          return done(err);
        }
        framed = _framed['@graph'][0];
        done();
      });
    });
  });

  it('should not have an abbreviation section', () => {
    assert(
      !Array.from(doc.querySelectorAll('section h2')).some(el =>
        /abbreviations/i.test(el.textContent)
      )
    );
  });

  it('should have correct citations when there are no bookmarked abbreviations', () => {
    // check the json for the correct citation (and year)
    // we test that as abbreviation section without at least one bookmarked
    // abbreviation used to cause citation error (missing 0 in the citation year)
    assert.equal(
      framed.citation[0].datePublished['@value'].match(/^[0-9]{4}/),
      '2011'
    );

    //check the html for the correct citation (and year)
    const expectedReference =
      'Auffhammer, M., and A. Aroonruengsawat. 2011. "Simulating the impacts of climate change, prices and population on California’s residential electricity consumption." Climatic change 109 (Supplement 1): 191-210.';

    const expectedCitation = 'Auffhammer and Aroonruengsawat 2011';

    assert.equal(
      doc.querySelector('section[typeof="sa:WPReferenceList"] p').textContent,
      expectedReference
    );

    assert.equal(
      doc.querySelector('a[property="schema:citation"]').textContent,
      expectedCitation
    );
  });
});
