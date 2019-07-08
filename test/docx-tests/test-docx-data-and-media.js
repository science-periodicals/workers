import assert from 'assert';
import path from 'path';

import { processDocx, frame } from '../../src/document-worker/lib/test-utils';

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'data-and-media.ds3.docx'
);

describe('DOCX: data and media', function() {
  this.timeout(20 * 1000);
  let ctx, framed;

  before('processing the data and media fixture', function(done) {
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

  it('should extract links to data and media files as parts', function() {
    assert(framed.hasPart.length, 12);
  });

  //TODO add tests for local data and media files and URLs
});
