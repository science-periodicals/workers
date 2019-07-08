import assert from 'assert';
import path from 'path';
import { JSDOM } from 'jsdom';
import { getId, arrayify, frame, contextUrl } from '@scipe/jsonld';
const { processDocx } = require('../../src/document-worker/lib/test-utils');

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'textbox.ds3.docx'
);

describe('DOCX: textboxes', function() {
  this.timeout(40 * 1000);
  let w, ctx, resource, graph;

  before('processing the textbox sample doc', done => {
    processDocx(docx, (err, _ctx, _w) => {
      if (err) return done(err);
      ctx = _ctx;
      w = _w;

      ctx.store.graph((err, _graph) => {
        if (err) return done(err);
        _graph['@context'] = contextUrl;
        graph = _graph;

        frame(
          graph,
          {
            '@id': ctx.resource.$id,
            '@context': contextUrl,
            '@embed': '@always'
          },
          { preserveUuidBlankNodes: true },
          (err, framed) => {
            if (err) return done(err);
            resource = framed['@graph'][0];
            done();
          }
        );
      });
    });
  });

  after(done => {
    w.stop(done);
  });

  it('should have a part with alternateName "Text Box 1" in the JSON', () => {
    // console.log(require('util').inspect(resource.hasPart, { depth: null }));
    const textBox = resource.hasPart.find(part => part['@type'] === 'TextBox');

    assert(textBox); //check that there is a part with type 'TextBox'
    assert.equal(textBox.alternateName, 'Text Box 1'); //check the name matches
  });

  it('should have properly handled text box content includuing the inline image', done => {
    const textBox = resource.hasPart.find(part => part['@type'] === 'TextBox');
    const encoding = arrayify(textBox.encoding)[0];
    const imageEncodings = graph['@graph'].filter(
      node => node['@type'] === 'ImageObject'
    );

    // console.log(ctx.doc.body.outerHTML);
    assert.equal(ctx.doc.querySelectorAll('aside').length, 1);

    // get the text box content
    w.blobStore.get(
      {
        graphId: ctx.graphId,
        resourceId: getId(textBox),
        encodingId: getId(encoding),
        decompress: true
      },
      (err, blob) => {
        if (err) {
          return done(err);
        }
        const html = blob.toString();
        const {
          window: { document }
        } = new JSDOM(html);

        assert.equal(document.querySelectorAll('h2, h3').length, 2);

        const $img = document.querySelector('img');
        // console.log($img.outerHTML);
        assert($img);

        // we check that the img has the correct contentUrl
        assert(
          imageEncodings.some(encoding => encoding.contentUrl === $img.src)
        );
        done();
      }
    );
  });
});
