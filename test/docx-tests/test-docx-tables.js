import assert from 'assert';
import path from 'path';
import { JSDOM } from 'jsdom';
import { getId, arrayify, frame, contextUrl } from '@scipe/jsonld';
import { processDocx } from '../../src/document-worker/lib/test-utils';

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'tables.ds3.docx'
);

describe('DOCX: tables', function() {
  this.timeout(20 * 1000);
  let ctx, w, framed, graph;

  before('processing the tables fixture', function(done) {
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
          (err, _framed) => {
            if (err) return done(err);
            framed = _framed['@graph'][0];
            done();
          }
        );
      });
    });
  });

  it('should have tables', () => {
    // console.log(require('util').inspect(graph, { depth: null }));
    assert.equal(framed.hasPart.length, 4);
    assert(framed.hasPart.every(part => part['@type'] === 'Table'));
  });

  it('should handle table with orphan images', done => {
    const table4 = framed.hasPart.find(
      part => part.alternateName === 'Table 4'
    );

    const encoding = arrayify(table4.encoding)[0];
    const imageEncodings = graph['@graph'].filter(
      node => node['@type'] === 'ImageObject'
    );

    w.blobStore.get(
      {
        graphId: ctx.graphId,
        resourceId: getId(table4),
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

        const $table = document.querySelector('table');

        const $img = $table.querySelector('img');
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

  //TODO add tests to check that the tables structure match what is expected (see https://www.w3.org/WAI/tutorials/tables/).
});
