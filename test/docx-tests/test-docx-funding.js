import assert from 'assert';
import path from 'path';
import {
  comparableJSONLD,
  processDocx,
  frame
} from '../../src/document-worker/lib/test-utils';

describe('DOCX: funding table', function() {
  this.timeout(20 * 1000);

  describe('funding-example fixture', () => {
    let ctx, framed;

    const docx = path.join(
      path.dirname(__dirname),
      'fixtures',
      'document-worker',
      'funding-example.ds3.docx'
    );

    const expectedJSON = require(path.join(
      path.dirname(__dirname),
      'fixtures',
      'document-worker',
      'funding-example.json'
    ));

    before(done => {
      processDocx(docx, (err, _ctx) => {
        if (err) return done(err);
        ctx = _ctx;

        frame(ctx, (err, _framed) => {
          if (err) return done(err);
          framed = _framed['@graph'][0];
          // console.log(require('util').inspect(framed, { depth: null }));
          done();
        });
      });
    });

    it('should extract a funding section', () => {
      assert.equal(
        Array.from(ctx.doc.querySelectorAll('section'))
          .find(s => s.getAttribute('typeof') === 'sa:WPFunding')
          .getAttribute('typeof')
          .slice(3),
        'WPFunding'
      );
    });

    it('should parse funding table', () => {
      assert.deepEqual(
        comparableJSONLD(expectedJSON, true),
        comparableJSONLD(framed, true)
      );
    });
  });

  describe('funding invalid bookmark fixture', function() {
    let ctx, framed;

    // the target in the bookmark is broken
    const docx = path.join(
      path.dirname(__dirname),
      'fixtures',
      'document-worker',
      'funding-invalid-bookmark.ds3.docx'
    );

    before(done => {
      processDocx(docx, (err, _ctx) => {
        if (err) return done(err);
        ctx = _ctx;

        frame(ctx, (err, _framed) => {
          if (err) return done(err);
          framed = _framed['@graph'][0];
          //console.log(require('util').inspect(framed, { depth: null }));
          done();
        });
      });
    });

    it('should have attached the funding info to the main resource as the bookmark is broken', () => {
      // TODO that should break when we issue proper warning instead
      const resource = framed;
      assert(resource.funder);
    });

    it('should extract a funding section without error', () => {
      const $section = ctx.doc.querySelector('section[typeof="sa:WPFunding"]');
      assert($section);
    });
  });
});
