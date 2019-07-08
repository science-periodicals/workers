import assert from 'assert';
import path from 'path';

import {
  processDocx,
  frame,
  comparableJSONLD
} from '../../src/document-worker/lib/test-utils';

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'copyright.ds3.docx'
);

describe('DOCX: copyright', function() {
  this.timeout(20 * 1000);
  let ctx;
  let framed;
  before('processing the copyright fixture', done => {
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

  it('should have copyright year and holder', function() {
    let actualHolder = [
      {
        '@type': 'Person',
        familyName: 'Smith',
        givenName: 'John',
        name: 'John Smith'
      },
      {
        '@type': 'Person',
        familyName: 'Doe',
        givenName: 'Jane',
        name: 'Jane Doe'
      }
    ];
    assert.deepEqual(
      comparableJSONLD(actualHolder, true),
      comparableJSONLD(framed.copyrightHolder, true)
    );

    let actualYear = 2018;
    assert.equal(actualYear, framed.copyrightYear);
  });
});
