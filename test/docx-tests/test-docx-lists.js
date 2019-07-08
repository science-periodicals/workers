import assert from 'assert';
import path from 'path';

import { processDocx } from '../../src/document-worker/lib/test-utils';

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'list-test.ds3.docx'
);

describe('DOCX: lists', function() {
  this.timeout(20 * 1000);
  let ctx;

  before('processing the list fixture', done => {
    processDocx(docx, (err, _ctx) => {
      if (err) return done(err);
      ctx = _ctx;
      done();
    });
    // console.log(require('pretty')(require('jsdom').serializeDocument(ctx.doc)));
  });

  it('should extract single-level ordered lists', function() {
    const expected =
      '<ol><li>First item</li><li>Second item</li><li>Third item</li></ol>';

    // console.log(ctx.doc.body.outerHTML);
    assert.equal(
      ctx.doc.querySelectorAll('section h3')[0].nextElementSibling.outerHTML,
      expected
    );
  });

  it('should extract single-level unordered lists', function() {
    const expected = '<ul><li>Item a</li><li>Item b</li><li>Item c</li></ul>';
    assert.equal(
      ctx.doc.querySelectorAll('section h3')[1].nextElementSibling.outerHTML,
      expected
    );
  });

  it('should extract multi-level, ordered lists', function() {
    const expected =
      '<ol><li>First question</li><li>Second question<ol><li>Question 2a</li><li>Question 2b</li></ol></li><li>Third question<ol><li>Question 3a</li><li>Question3b<ol><li>Question 3b.i</li><li>Question 3b.ii<ol><li>Question 3b.ii.1</li><li>Question 3b.ii.2</li></ol></li></ol></li></ol></li></ol>';
    assert.equal(
      ctx.doc.querySelectorAll('section h3')[2].nextElementSibling.outerHTML,
      expected
    );
  });

  it('should extract multi-level, unordered lists', function() {
    const expected =
      '<ul><li>apples</li><li>vegetables<ul><li>carrots</li><li>broccoli</li></ul></li><li>dairy<ul><li>milk</li><li>cheese<ul><li>hard cheese</li><li>soft cheese<ul><li>brie</li><li>blue cheese</li></ul></li></ul></li></ul></li></ul>';
    assert.equal(
      ctx.doc.querySelectorAll('section h3')[3].nextElementSibling.outerHTML,
      expected
    );
  });

  it('should extract multi-level, unordered with ordered lists', function() {
    const expected =
      '<ul><li>apples</li><li>favorite vegetables<ol><li>first</li><li>second</li></ol></li></ul>';
    assert.equal(
      ctx.doc.querySelectorAll('section h3')[4].nextElementSibling.outerHTML,
      expected
    );
  });

  it('should extract multi-level, ordered with unordered lists', function() {
    const expected =
      '<ol><li>First survey<ul><li>Circle your favorite fruits<ol><li>Dragonfruit</li><li>Apples</li><li>Kiwi</li><li>Mango</li></ol></li><li>List your favorite vegetables. </li></ul></li><li>second survey<ul><li>Name<ol><li>Given</li><li>First</li><li>Middle</li></ol></li><li>Address<ol><li>City</li><li>State</li><li>Country</li></ol></li></ul></li></ol>';
    assert.equal(
      ctx.doc.querySelectorAll('section h3')[5].nextElementSibling.outerHTML,
      expected
    );
  });
});
