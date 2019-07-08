import assert from 'assert';
import path from 'path';
import { processDocx, frame } from '../../src/document-worker/lib/test-utils';

const samplePath = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'misc-author-footnote-bug.ds3.docx'
);

describe('DOCX: misc. author footnote bug (author contribution footnote from resource has same content as the one from the article)', function() {
  this.timeout(20 * 1000);
  let framed, graph;

  before(done => {
    processDocx(samplePath, (err, ctx) => {
      // console.log(ctx.doc.body.outerHTML);
      if (err) return done(err);
      frame(ctx, (err, _framed) => {
        if (err) {
          return done(err);
        }
        framed = _framed['@graph'][0];
        ctx.store.graph((err, _graph) => {
          if (err) return done(err);
          graph = _graph;
          done();
        });
      });
    });
  });

  it('should have extacted the ContributeActions', () => {
    const contributeActions = graph['@graph'].filter(
      node => node['@type'] === 'ContributeAction'
    );
    // console.log(require('util').inspect(framed, { depth: null }));
    assert.equal(contributeActions.length, 2);
  });
});
