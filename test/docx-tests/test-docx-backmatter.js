import assert from 'assert';
import path from 'path';

import { processDocx } from '../../src/document-worker/lib/test-utils';

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'backmatter.ds3.docx'
);

describe('DOCX: backmatter sections', function() {
  this.timeout(50 * 1000);
  let doc;

  before('processing the backmatter fixture', function(done) {
    processDocx(docx, (err, _ctx) => {
      if (err) {
        return done(err);
      }
      doc = _ctx.doc;

      done();
    });
  });

  it('should extract an Acknowledgements section', function() {
    assert.equal(
      Array.from(doc.querySelectorAll('section'))
        .find(s => s.getAttribute('typeof') === 'sa:WPAcknowledgements')
        .getAttribute('typeof')
        .slice(3),
      'WPAcknowledgements'
    );
  });
  it('should extract a Funding section', function() {
    assert.equal(
      Array.from(doc.querySelectorAll('section'))
        .find(s => s.getAttribute('typeof') === 'sa:WPFunding')
        .getAttribute('typeof')
        .slice(3),
      'WPFunding'
    );
  });

  it('should extract a Disclosures section', function() {
    assert.equal(
      Array.from(doc.querySelectorAll('section'))
        .find(s => s.getAttribute('typeof') === 'sa:WPDisclosure')
        .getAttribute('typeof')
        .slice(3),
      'WPDisclosure'
    );
  });

  it('should extract a References section', function() {
    assert.equal(
      Array.from(doc.querySelectorAll('section'))
        .find(s => s.getAttribute('typeof') === 'sa:WPReferenceList')
        .getAttribute('typeof')
        .slice(3),
      'WPReferenceList'
    );
  });
});
