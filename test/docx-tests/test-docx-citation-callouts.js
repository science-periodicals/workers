import assert from 'assert';
import path from 'path';
import { getId } from '@scipe/jsonld';
import { processDocx, frame } from '../../src/document-worker/lib/test-utils';

const samplePath = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'citations-list.ds3.docx'
);

describe('DOCX: point citations and citation callouts', function() {
  this.timeout(20 * 1000);
  let ctx, framed;
  before('processing the citations list fixture', done => {
    processDocx(samplePath, (err, _ctx) => {
      if (err) return done(err);
      ctx = _ctx;
      frame(ctx, (err, _framed) => {
        if (err) return done(err);
        framed = _framed['@graph'][0];
        done();
      });
    });
  });

  it('should have citations callouts with point citation', () => {
    const { doc } = ctx;
    //console.log(
    //  require('util').inspect(
    //    framed.citation.filter(c => c['@type'] === 'TargetRole'),
    //    { depth: null }
    //  )
    //);
    const citationRole = framed.citation.find(c => c['@type'] === 'TargetRole');
    assert(getId(citationRole).startsWith('node:'));

    const $a = doc.querySelector(`[resource="${getId(citationRole)}"]`);
    assert($a);
    assert.equal($a.textContent, 'Ceballos, Ehrlich, and Dirzo 2017, E6091');
  });
});
