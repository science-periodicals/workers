import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { comparableJSONLD } from '../../src/document-worker/lib/test-utils';
const {
  processDocx,
  frame
} = require('../../src/document-worker/lib/test-utils');

const samplePath = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'citations-list.ds3.docx'
);

describe('DOCX: citations', function() {
  this.timeout(20 * 1000);
  let doc;
  let ctx;
  let framed;

  before('processing the citations list fixture', done => {
    processDocx(samplePath, (err, _ctx) => {
      if (err) return done(err);
      ctx = _ctx;
      doc = ctx.doc;
      frame(ctx, (err, _framed) => {
        if (err) return done(err);
        framed = _framed['@graph'][0];

        // create reference file (only do once)
        // fs.writeFile(
        //   path.join(
        //     __dirname,
        //     '../fixtures/document-worker/citations-list-complete.json'
        //   ),
        //   JSON.stringify(framed.citation, null, 2),
        //   err => {
        //     if (err) {
        //       return done(err);
        //     }
        //     done();
        //   }
        // );

        //comment this done() out if creating a reference file
        done();
      });
    });
  });

  it('should have a references section', () => {
    // console.log(doc.documentElement.outerHTML);
    assert.equal(doc.querySelector('section h2').textContent, 'Bibliography');
  });

  it('should have citations with correct links', () => {
    //get all in text citation ids
    let inTextCitationIDs = Array.from(
      doc.querySelectorAll('a[role="doc-biblioref"]')
    ).map(el => el.getAttribute('href').replace('#', ''));

    //get ids of each reference
    let referenceIDs = framed.citation.map(cit => cit['@id']);

    assert(inTextCitationIDs.every(id => referenceIDs.indexOf(id) > -1));
  });

  it('should extract all citations fields', () => {
    const expectedCitationData = JSON.parse(
      fs.readFileSync(
        path.join(
          __dirname,
          '../fixtures/document-worker/citations-list-complete.json'
        )
      )
    );

    // console.log(
    //   require('util').inspect(comparableJSONLD(framed.citation), {
    //     depth: null
    //   })
    // );

    assert.equal(
      comparableJSONLD(expectedCitationData).length,
      comparableJSONLD(framed.citation).length
    );

    assert.deepEqual(
      comparableJSONLD(framed.citation),
      comparableJSONLD(expectedCitationData)
    );
  });
});
