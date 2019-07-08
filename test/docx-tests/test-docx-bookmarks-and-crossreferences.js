import assert from 'assert';
import path from 'path';
import { JSDOM } from 'jsdom';
import { arrayify, getId } from '@scipe/jsonld';
import { processDocx, frame } from '../../src/document-worker/lib/test-utils';

// import { unrole } from '@scipe/jsonld';
// const author = roles.map(role => unrole(role, 'author')).find(author => /*...*/)

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'bookmarks-and-crossrefs.ds3.docx'
);

describe('DOCX: bookmarks and crossreferences', function() {
  this.timeout(20 * 1000);
  let ctx, doc, framed, w;

  before('processing the bookmark and crossref fixture', function(done) {
    processDocx(docx, (err, _ctx, _w) => {
      if (err) return done(err);
      ctx = _ctx;
      doc = ctx.doc;
      w = _w;

      frame(ctx, (err, _framed) => {
        if (err) return done(err);
        framed = _framed['@graph'][0];
        done();
      });
      // console.log(doc.documentElement.outerHTML);
    });
  });

  it('should have a crossreference to a heading bookmark', function() {
    const expected = Array.from(doc.querySelectorAll('h2'))
      .find(e => e.innerHTML === 'Introduction')
      .getAttribute('id');

    const result = Array.from(doc.querySelectorAll('a'))
      .find(e => e.innerHTML === 'Introduction')
      .getAttribute('href')
      .slice(1);

    assert.equal(result, expected);
  });

  it('should have a crossreference to a bookmarked word', function() {
    const expected = Array.from(doc.querySelectorAll('span'))
      .find(e => e.innerHTML === 'testing')
      .getAttribute('id');

    const result = Array.from(doc.querySelectorAll('a'))
      .find(e => e.innerHTML === 'testing')
      .getAttribute('href')
      .slice(1);

    assert.equal(result, expected);
  });

  it('should have an abbreviation', function() {
    assert.equal(
      Array.from(doc.querySelectorAll('abbr'))
        .find(e => e.innerHTML === 'sci.pe')
        .getAttribute('title'),
      'science periodicals'
    );
  });

  it('should have a crossreference to a figure label', function() {
    const expected = doc.querySelector('figure').getAttribute('id');

    const result = Array.from(doc.querySelectorAll('a'))
      .find(e => e.innerHTML === 'Figure 1')
      .getAttribute('href')
      .slice(1);

    assert.equal(result, expected);
  });

  it('should have a crossreference in a textbox', done => {
    const textBox = framed.hasPart.find(part => part['@type'] === 'TextBox');
    const encoding = arrayify(textBox.encoding)[0];
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

        const expected = Array.from(doc.querySelectorAll('span'))
          .find(e => e.innerHTML === 'testing')
          .getAttribute('id');

        const result = Array.from(document.querySelectorAll('a'))
          .find(e => e.innerHTML === 'testing')
          .getAttribute('href')
          .slice(1);

        assert.equal(result, expected);

        done();
      }
    );
  });

  it('should have a crossreference to a footnote', function() {
    assert(
      Array.from(doc.querySelectorAll('a[rel="footnote"]')).every(
        a => a.getAttribute('href').replace('#', '') === framed.note[0]['@id']
      )
    );
  });

  it('should have a crossreference in a footnote', function() {
    assert(framed.note[0].text['@value'].includes('href="#test"'));
  });

  it('should have a crossreference to a bookmarked author', function() {
    assert.equal(
      Array.from(doc.querySelectorAll('a'))
        .find(e => e.innerHTML === 'John Smith, PhD')
        .getAttribute('about'),
      framed.author[0]['@id']
    );
  });
});
