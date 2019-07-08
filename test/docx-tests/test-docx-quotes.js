import assert from 'assert';
import path from 'path';

import { processDocx } from '../../src/document-worker/lib/test-utils';

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'quote-test.ds3.docx'
);

describe('DOCX: quotes', function() {
  this.timeout(20 * 1000);
  let ctx;

  before('processing the quotes fixture', done => {
    processDocx(docx, (err, _ctx) => {
      if (err) return done(err);
      ctx = _ctx;
      done();
    });
  });

  it('should have two block quotes', function() {
    // console.log(require('util').inspect(framed, { depth: null }));

    assert.equal(ctx.doc.querySelectorAll('blockquote').length, 2);
  });

  it('should one block quote with attribution', function() {
    assert.equal(ctx.doc.querySelectorAll('blockquote cite').length, 1);
  });
});
