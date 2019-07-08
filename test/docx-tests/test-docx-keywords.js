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
  'keywords.ds3.docx'
);

describe('DOCX: keywords', function() {
  this.timeout(20 * 1000);
  let ctx;
  let framed;
  before('processing the keyword fixture', done => {
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

  it('should have keywords and linked subjects', function() {
    let expectedKeywords = [
      'Emerging Infectious Diseases',
      'wildlife disease',
      'Zoonoses'
    ];
    let expectedSubjects = [
      {
        '@id': 'subjects:zoology',
        name: 'Zoology'
      },
      {
        '@id': 'subjects:infectious-diseases',
        name: 'infectious diseases'
      },
      {
        name: 'Nipah virus',
        url: 'https://www.cdc.gov/vhf/nipah/index.html'
      }
    ];

    assert.deepEqual(comparableJSONLD(framed.keywords), expectedKeywords);
    assert.deepEqual(comparableJSONLD(framed.about), expectedSubjects);
  });
});
