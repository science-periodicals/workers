const assert = require('assert');
const path = require('path');
const { arrayify } = require('../../src/document-worker/lib/utils');
const {
  processDocx,
  comparableJSONLD,
  frame
} = require('../../src/document-worker/lib/test-utils');

const authorsSample = require('../fixtures/document-worker/microformats/authors.json');
const copyrightSample = require('../fixtures/document-worker/microformats/copyright.json');
const subResourceSample = require('../fixtures/document-worker/microformats/sub-resources.json');
const sponsorSample = require('../fixtures/document-worker/microformats/sponsor.json');

describe('DOCX: Microformats', function() {
  this.timeout(20 * 1000);
  let resource;
  before('processing the microformats fixture', done => {
    processDocx(
      path.join(
        path.dirname(__dirname),
        'fixtures',
        'document-worker',
        'microformats.docx'
      ),
      (err, ctx) => {
        assert.ifError(err);
        // console.log(require('pretty')(require('jsdom').serializeDocument(ctx.doc)));
        frame(ctx, (err, framed) => {
          assert.ifError(err);
          resource = framed['@graph'][0];
          done();
        });
      }
    );
  });

  it('should have affiliations, acknowledgements, and disclosures', () => {
    assert.deepEqual(
      comparableJSONLD(resource.author),
      comparableJSONLD(authorsSample),
      'Affiliations parsed as expected'
    );
  });

  it('should have copyright', () => {
    assert.equal(
      resource.copyrightYear,
      '2017',
      'Copyright year parsed as expected'
    );
    assert.deepEqual(
      comparableJSONLD(resource.copyrightHolder),
      comparableJSONLD(copyrightSample),
      'Copyright holders parsed as expected'
    );
  });

  it('should have structured metadata for sub-resources, including funding', () => {
    assert.deepEqual(
      comparableJSONLD(resource.hasPart),
      comparableJSONLD(subResourceSample),
      'Sub-resources parsed as expected'
    );
  });

  it('should have funding information', () => {
    assert.deepEqual(
      comparableJSONLD(arrayify(resource.funder)),
      comparableJSONLD(sponsorSample),
      'Top-level resource has expected funding'
    );
  });
});
