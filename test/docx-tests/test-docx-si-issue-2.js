import path from 'path';
import assert from 'assert';
import { arrayify } from '@scipe/jsonld';
import { processDocx, frame } from '../../src/document-worker/lib/test-utils';

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'si-audio.ds3.docx'
);

// Waiting for dedocx fix
describe.skip('DOCX: side case with audio supporting information (issue #2)', function() {
  this.timeout(20 * 1000);
  let ctx, framedResource;

  before(done => {
    processDocx(docx, (err, _ctx) => {
      if (err) return done(err);
      ctx = _ctx;
      frame(ctx, (err, graph) => {
        if (err) return done(err);
        framedResource = graph['@graph'][0];
        done();
      });
    });
  });

  it('should have processed the supporting information', done => {
    const { doc } = ctx;

    const $si = doc.querySelector(
      'section[typeof="sa:WPSupportingInformation"]'
    );
    assert($si);

    const expected = [
      {
        alternateName: 'Supporting Audio 1',
        '@type': 'Audio'
      }
    ];

    const resources = arrayify(framedResource.hasPart);
    assert(resources.length);

    expected.forEach(data => {
      const resource = resources.find(
        resource => resource.alternateName === data.alternateName
      );
      assert(resource);
      assert(resource.isSupportingResource);
      assert.equal(resource['@type'], data['@type']);
    });

    done();
  });
});
