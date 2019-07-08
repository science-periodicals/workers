import assert from 'assert';
import path from 'path';

import { processDocx, frame } from '../../src/document-worker/lib/test-utils';

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'code.ds3.docx'
);

describe('DOCX: inline and block code', function() {
  this.timeout(20 * 1000);
  let ctx, framed;

  before('processing the code fixture', done => {
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

  it('should have a code block', function() {
    assert.equal(framed.hasPart.length, 1);

    const code = framed.hasPart[0];

    assert.equal(code['@type'], 'SoftwareSourceCode');
    assert.equal(code['alternateName'], 'Code 1');
  });

  it('should have inline code', function() {
    assert.equal(ctx.doc.querySelectorAll('code').length, 1);

    assert.equal(
      ctx.doc.querySelector('code').parentNode.childNodes[0].nodeValue,
      'Test inline code '
    );
  });
});
