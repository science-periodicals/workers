import path from 'path';
import assert from 'assert';
import { getId } from '@scipe/jsonld';
import { processDocx, frame } from '../../src/document-worker/lib/test-utils';

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'sample-si-text.ds3.docx'
);

describe('DOCX: Supporting Information', function() {
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
    // console.log(require('pretty')(require('jsdom').serializeDocument(ctx.doc)));

    const $si = doc.querySelector(
      'section[typeof="sa:WPSupportingInformation"]'
    );
    assert($si);

    const expected = [
      {
        alternateName: 'Supporting Dataset 1',
        '@type': 'Dataset'
      },
      {
        alternateName: 'Supporting Dataset 2',
        '@type': 'Dataset'
      },
      {
        alternateName: 'Supporting Video 1',
        '@type': 'Video'
      },
      {
        alternateName: 'Supporting Audio 1',
        '@type': 'Audio'
      },
      {
        alternateName: 'Supporting Code 1',
        '@type': 'SoftwareSourceCode'
      },
      {
        alternateName: 'Supporting Figure 1',
        '@type': 'Image'
      },
      {
        alternateName: 'Supporting Figure 2',
        '@type': 'Image'
      },
      {
        alternateName: 'Supporting Table 1',
        '@type': 'Table'
      },
      {
        alternateName: 'Supporting Code 2',
        '@type': 'SoftwareSourceCode'
      },
      {
        alternateName: 'Supporting Text Box 1',
        '@type': 'TextBox'
      },
      {
        alternateName: 'Supporting Equation 1',
        '@type': 'Formula'
      }
    ];

    const resources = framedResource.hasPart;
    expected.forEach(data => {
      const resource = resources.find(
        resource => resource.alternateName === data.alternateName
      );

      assert(resource);
      assert(getId(resource).startsWith('node:'));
      assert(resource.isSupportingResource);
      assert.equal(resource['@type'], data['@type']);
    });

    done();
  });
});
