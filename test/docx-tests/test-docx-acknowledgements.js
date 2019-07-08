import assert from 'assert';
import path from 'path';

import { processDocx } from '../../src/document-worker/lib/test-utils';

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'acknowledgements.ds3.docx'
);

describe('DOCX: acknowledgements', function() {
  this.timeout(20 * 1000);
  let ctx;

  before('processing the acknowledgements fixture', function(done) {
    processDocx(docx, (err, _ctx) => {
      if (err) {
        return done(err);
      }
      ctx = _ctx;
      done();
    });
  });

  it('should extract an acknowledgements section', function() {
    assert.equal(
      Array.from(ctx.doc.querySelectorAll('section'))
        .find(s => s.getAttribute('typeof') === 'sa:WPAcknowledgements')
        .getAttribute('typeof')
        .slice(3),
      'WPAcknowledgements'
    );
  });

  //TODO add tests for crossreferenced author and affiliation names in acknowledgements
});
