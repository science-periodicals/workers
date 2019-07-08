import assert from 'assert';
import path from 'path';
import { processDocx } from '../../src/document-worker/lib/test-utils';
const docxPath = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'sample-subtitle.ds3.docx'
);

describe('DOCX subtitles', function() {
  this.timeout(20000);

  let ctx;
  before(done => {
    processDocx(docxPath, (err, _ctx) => {
      if (err) return done(err);
      ctx = _ctx;
      done();
    });
  });

  it('should extract subtitles', done => {
    assert.equal(
      ctx.resource.headline,
      'Making the most out of every wave when it’s nuking in New Jersey.'
    );
    done();
  });
});
