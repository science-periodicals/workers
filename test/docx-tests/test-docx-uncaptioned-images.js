import assert from 'assert';
import path from 'path';
import { arrayify, frame, contextUrl } from '@scipe/jsonld';
import { processDocx } from '../../src/document-worker/lib/test-utils';

// TODO the caption of the TextBox is wrong and some text is missing (the
// caption is being attached to one of the uncaptioned images that become
// captioned...) => fix should be in figurify plugin. Probably need to proces
//TextBox first and Image resource second

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'uncaptioned-images.ds3.docx'
);

describe('DOCX: uncaptioned images', function() {
  this.timeout(20 * 1000);
  let ctx, framed, graph;

  before(function(done) {
    processDocx(docx, (err, _ctx, _w) => {
      if (err) return done(err);
      ctx = _ctx;

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

  it('should have wrapped the uncaptioned images into spans with a sa-uncaptioned-img class', () => {
    const $imgs = ctx.doc.querySelectorAll('span.sa-uncaptioned-img img');
    assert($imgs.length);
  });

  it('should list the uncaptioned image in the image property of the relevant HTML encoding', () => {
    const articleHtmlEncoding = arrayify(framed.encoding).find(
      encoding => encoding.fileFormat === 'text/html'
    );
    assert.equal(arrayify(articleHtmlEncoding.image).length, 2);

    const textBox = arrayify(framed.hasPart).find(
      part => part['@type'] === 'TextBox'
    );
    const textBoxHtmlEncoding = arrayify(textBox.encoding).find(
      encoding => encoding.fileFormat === 'text/html'
    );
    assert.equal(arrayify(textBoxHtmlEncoding.image).length, 2);

    const table = arrayify(framed.hasPart).find(
      part => part['@type'] === 'Table'
    );
    const tableHtmlEncoding = arrayify(table.encoding).find(
      encoding => encoding.fileFormat === 'text/html'
    );
    assert.equal(arrayify(tableHtmlEncoding.image).length, 2);
  });
});
