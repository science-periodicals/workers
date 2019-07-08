import assert from 'assert';
import path from 'path';
import { JSDOM } from 'jsdom';
import { getId } from '@scipe/jsonld';
import {
  processDocx,
  reImportHtmlResources,
  frame
} from '../../src/document-worker/lib/test-utils';

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'footnotes-and-endnotes-multiple-repeated.ds3.docx'
);

describe('DOCX: footnotes and endnotes', function() {
  this.timeout(40 * 1000);
  let ctx, doc, framed, w;

  before('processing the footnotes and endnotes fixture', done => {
    processDocx(docx, (err, _ctx, _w) => {
      if (err) return done(err);
      ctx = _ctx;
      doc = ctx.doc;
      w = _w;

      reImportHtmlResources(ctx, w, err => {
        if (err) return done(err);

        frame(ctx, (err, _framed) => {
          if (err) return done(err);
          framed = _framed['@graph'][0];
          done();
        });
        // console.log(doc.documentElement.outerHTML);
      });
    });
  });

  it('should contain all expected footnote, endnotes, and table footnote numbers (HTML)', function() {
    const expectedFootnoteNumbers = [1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 3, 3, 4, 3];
    const actualFootnoteNumbers = Array.from(
      doc.querySelectorAll('a[rel="footnote"], a[rel="endnote"]')
    ).map(el => parseInt(el.innerHTML, 0));
    assert.deepEqual(expectedFootnoteNumbers, actualFootnoteNumbers);
  });

  it('should contain four footnotes and endnotes from the text as notes (JSON-LD)', function() {
    assert.equal(framed.note.length, 4);
    // check that footnote and endnote identifier were set
    assert(framed.note.every(note => note.noteIdentifier != null));
  });

  it('should contain two footnotes from the table as notes (JSON-LD)', function() {
    assert.equal(
      framed.hasPart
        .find(part => part['@type'] === 'Table')
        .note.map(cmt => cmt['@id']).length,
      2
    );
  });

  it('should contain in-text footnote and endnote references each with a unique id and with hrefs matching the actual footnote and endnote ids', function() {
    // the unique list of all notes is in the following order in the docx:
    // [footnote 1, footnote 2, endnote 1, endnote 2, table footnote 1, table
    // footnote 2]
    const uniqueNoteIDs = framed.note
      .map(cmt => cmt['@id'])
      .concat(
        framed.hasPart
          .find(part => part['@type'] === 'Table')
          .note.map(cmt => cmt['@id'])
      );

    const $noteRefs = doc.querySelectorAll(
      'a[rel="footnote"], a[rel="endnote"]'
    );

    // test that each ref has a unique id (needed to have easy backlinks in
    // app-suite)
    const refIds = new Set(
      Array.from($noteRefs)
        .map($ref => $ref.id)
        .filter(Boolean)
    );
    assert.equal(refIds.size, $noteRefs.length);
    // console.log(Array.from(refIds));

    const actualInTextReferenceIds = Array.from($noteRefs).map(el =>
      el.getAttribute('href').replace('#', '')
    );

    const resourceIds = Array.from($noteRefs).map(el =>
      el.getAttribute('resource')
    );

    assert(uniqueNoteIDs.every(id => resourceIds.some(rId => id === rId)));
    assert(resourceIds.every(rId => uniqueNoteIDs.some(id => id === rId)));

    // expected numbers are mapped following the pattern in the test docx: [ f1,
    // f1, f2, f1, f1, e1, e1, e2, e1, e1, tf1, tf1, tf2, tf1]
    const expectedInTextNumbers = [1, 1, 2, 1, 1, 3, 3, 4, 3, 3, 5, 5, 6, 5];
    const expectedInTextReferenceIDs = expectedInTextNumbers.map(
      number => uniqueNoteIDs[number - 1]
    );
    assert.deepEqual(actualInTextReferenceIds, expectedInTextReferenceIDs);
  });

  it('store graph getter and encoding serialization should preserve the @id', done => {
    ctx.store.graph((err, flattened) => {
      if (err) return done(err);

      const ids = flattened['@graph']
        .filter(
          node => node['@type'] === 'Footnote' || node['@type'] === 'Endnote'
        )
        .map(getId);

      const $notes = doc.querySelectorAll(
        'a[rel="footnote"], a[rel="endnote"]'
      );
      const resourceIds = Array.from($notes).map(el =>
        el.getAttribute('resource')
      );
      assert(
        resourceIds.every(
          rId => rId.startsWith('node:') && ids.some(id => id === rId)
        )
      );

      w.blobStore.get(
        {
          graphId: ctx.graphId,
          resourceId: getId(framed),
          encodingId: getId(
            framed.encoding.find(e => e.fileFormat === 'text/html')
          ),
          decompress: true
        },
        (err, buffer) => {
          if (err) return done(err);

          const html = buffer.toString();
          const { document } = new JSDOM(html).window;

          const $notes = document.querySelectorAll(
            'a[rel="footnote"], a[rel="endnote"]'
          );
          const resourceIds = Array.from($notes).map(el =>
            el.getAttribute('resource')
          );

          assert(resourceIds.every(rId => ids.some(id => id === rId)));

          done();
        }
      );
    });
  });
});
