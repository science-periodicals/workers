import assert from 'assert';
import path from 'path';

import { processDocx, frame } from '../../src/document-worker/lib/test-utils';

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'license.ds3.docx'
);

describe('DOCX: license', function() {
  this.timeout(20 * 1000);
  let ctx;
  let framed;

  before('processing license fixture', function(done) {
    processDocx(docx, (err, _ctx) => {
      if (err) return done(err);
      ctx = _ctx;
      frame(ctx, function(err, _framed) {
        if (err) return done(err);
        framed = _framed['@graph'][0];
        done();
      });
    });
  });

  it('should have license information', function() {
    const actual = 'spdx:CC0-1.0';
    assert.deepEqual(framed.license, actual);
  });
});
