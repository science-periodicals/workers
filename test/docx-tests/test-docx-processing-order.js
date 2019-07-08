import path from 'path';
import assert from 'assert';
import { JSDOM } from 'jsdom';
import { getId, arrayify } from '@scipe/jsonld';
import {
  processDocx,
  frame,
  comparableJSONLD
} from '../../src/document-worker/lib/test-utils';

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'processing-order.ds3.docx'
);

const json = require(path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'processing-order.json'
));

describe('DOCX: processing order', function() {
  this.timeout(20 * 1000);

  let ctx, resource, table, textBox, image, $textBox, $table;
  before(done => {
    processDocx(docx, (err, _ctx, w) => {
      if (err) return done(err);

      ctx = _ctx;
      frame(ctx, (err, framed) => {
        if (err) return done(err);
        resource = framed['@graph'][0];

        // console.log(require('util').inspect(resource, { depth: null }));

        table = resource.hasPart.find(r => r['@type'] === 'Table');
        textBox = resource.hasPart.find(r => r['@type'] === 'TextBox');
        image = resource.hasPart.find(r => r['@type'] === 'Image');

        w.blobStore.get(
          {
            graphId: ctx.graphId,
            resourceId: getId(table),
            encodingId: getId(
              table.encoding.find(e => e.fileFormat === 'text/html')
            ),
            decompress: true
          },
          (err, buffer) => {
            if (err) return done(err);

            const html = buffer.toString();
            const { document } = new JSDOM(html).window;
            $table = document.getElementsByTagName('table')[0];

            w.blobStore.get(
              {
                graphId: ctx.graphId,
                resourceId: getId(textBox),
                encodingId: getId(
                  textBox.encoding.find(e => e.fileFormat === 'text/html')
                ),
                decompress: true
              },
              (err, buffer) => {
                if (err) return done(err);

                const html = buffer.toString();
                const { document } = new JSDOM(html).window;
                $textBox = document.body;

                done();
              }
            );
          }
        );
      });
    });
  });

  it('should do things in the right order for the JSON-LD resources', () => {
    const $contributionNote = new JSDOM(
      arrayify(arrayify(resource.author)[0].roleAction)[0].description['@value']
    ).window.document.body;
    assert($contributionNote.querySelector('abbr'));

    const $abstract = new JSDOM(
      arrayify(resource.detailedDescription)[0].text['@value']
    ).window.document.body;
    assert($abstract.querySelector('abbr'));
    assert($abstract.querySelector('a[property="schema:citation"]'));
    assert($abstract.querySelector('a[rel="footnote"]'));
    assert($abstract.querySelector('a[rel="endnote"]'));

    const $caption = new JSDOM(table.caption['@value']).window.document.body;
    assert($caption.querySelector('abbr'));
    assert($caption.querySelector('a[property="schema:citation"]'));
    assert($caption.querySelector('a[rel="footnote"]'));
    assert($caption.querySelector('a[rel="endnote"]'));

    [
      'abbr',
      'a[property="schema:citation"]',
      'a[rel="footnote"]',
      'a[rel="endnote"]'
    ].every(selector => {
      assert(
        arrayify(resource.note).some(note => {
          if (!note.text['@value']) return false;
          const $note = new JSDOM(note.text['@value']).window.document.body;
          return $note.querySelector(selector);
        })
      );
    });

    assert.deepEqual(
      comparableJSONLD(resource, true),
      comparableJSONLD(json, true)
    );
  });

  it('should have extracted the resource order properly', () => {
    const { resourcesOrder } = ctx;

    assert.deepEqual(
      {
        [textBox['@id']]: 1,
        [table['@id']]: 2,
        [image['@id']]: 3,
        [image.hasPart[0]['@id']]: 4,
        [image.hasPart[1]['@id']]: 5
      },
      resourcesOrder
    );
  });

  it('should have processed the table body', () => {
    assert($table.querySelector('abbr'));
    assert($table.querySelector('a[property="schema:citation"]'));
    assert($table.querySelector('a[rel="footnote"]'));
    assert($table.querySelector('a[rel="endnote"]'));
  });

  it('should have processed the text box body', () => {
    // Note: MS word doesn't allow footnote or endnote withing text box
    assert($textBox.querySelector('abbr'));
    assert($textBox.querySelector('a[property="schema:citation"]'));
  });
});
