import assert from 'assert';
import path from 'path';
import { processDocx, frame } from '../../src/document-worker/lib/test-utils';

const samplePath = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'misc-resource-author-bug.ds3.docx'
);

describe('DOCX: misc resource author bug (cross-ref is wrapped in a (hidden) bookmark: <div><span id="_Ref437969898"> <a href="#jordan" role="doc-anchorlink">Ms. Jordan Levinson, MSc</a></span>.</div> so naive childNodes iteration is not enough)', function() {
  this.timeout(20 * 1000);
  let framed;

  before(done => {
    processDocx(samplePath, (err, ctx) => {
      // console.log(ctx.doc.body.outerHTML);
      if (err) return done(err);
      frame(ctx, (err, _framed) => {
        if (err) {
          return done(err);
        }
        framed = _framed['@graph'][0];
        done();
      });
    });
  });

  it('should have extacted the resource author', () => {
    const image = framed.hasPart[0];
    // console.log(require('util').inspect(image, { depth: null }));
    assert(image.author);
  });
});
