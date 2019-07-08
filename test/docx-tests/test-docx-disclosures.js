import assert from 'assert';
import path from 'path';

import { processDocx, frame } from '../../src/document-worker/lib/test-utils';

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'disclosure.ds3.docx'
);

describe('DOCX: disclosures', function() {
  this.timeout(20 * 1000);
  let ctx, framed;

  before('processing the disclosure fixture', function(done) {
    processDocx(docx, (err, _ctx) => {
      if (err) return done(err);
      ctx = _ctx;

      frame(ctx, (err, _framed) => {
        if (err) return done(err);
        framed = _framed['@graph'][0];

        done();
      });
    });
  });

  it('should extract a disclosure section', function() {
    assert.equal(
      Array.from(ctx.doc.querySelectorAll('section'))
        .find(s => s.getAttribute('typeof') === 'sa:WPDisclosure')
        .getAttribute('typeof')
        .slice(3),
      'WPDisclosure'
    );
  });

  //TODO add tests for crossreferenced author name in disclosures
});
