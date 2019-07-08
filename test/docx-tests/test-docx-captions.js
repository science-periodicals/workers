const path = require('path');
const assert = require('assert');
const {
  hasAncestor,
  ancestors
} = require('../../src/document-worker/lib/utils');
const {
  getResource,
  processDocx,
  reImportFigures
} = require('../../src/document-worker/lib/test-utils');

let store;

const captionsDoc = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'captions.docx'
);

// let dbg = (el) => new xmldom.XMLSerializer().serializeToString(el);

// test functions
function inFigure(el) {
  assert.equal(el.parentNode.localName, 'figure', 'in figure');
}
function captionContains(el, re) {
  let res = getResource(el, store);
  assert(res, 'captioned element has a matching resource');
  if (re == null) assert(!res.caption, 'caption is not there');
  else
    assert(
      res.caption && re.test(res.caption['@value'] || res.caption),
      'caption has right text'
    );
}
function labelIs(el, txt) {
  let res = getResource(el, store);
  assert(res, 'captioned element has a matching resource');
  assert.equal(res.alternateName, txt, `caption label is '${txt}'`);
}
function elContains(el, re) {
  assert(re.test(el.textContent), 'element has right text');
}
function isType(el, type) {
  assert(
    el.parentNode.getAttribute('typeof'),
    type,
    `in a figure of type ${type}`
  );
}

describe('DOCX: Captions', function() {
  this.timeout(20 * 1000);
  let doc,
    tables = [],
    images = [],
    codes = [],
    maths = [],
    asides = [],
    links = [];

  before('processing the captions fixture', done => {
    processDocx(captionsDoc, (err, ctx, w) => {
      assert.ifError(err);
      reImportFigures(ctx);
      doc = ctx.doc;
      store = ctx.store;
      // console.log(doc.documentElement.outerHTML);
      for (let t of doc.querySelectorAll('table')) tables.push(t);
      for (let i of doc.querySelectorAll('img')) images.push(i);
      for (let p of doc.querySelectorAll('pre')) codes.push(p);
      for (let m of doc.querySelectorAll('[role="math"]')) maths.push(m);
      for (let a of doc.querySelectorAll('aside')) asides.push(a);

      for (let a of doc.querySelectorAll('figure[resource] > p > a')) {
        links.push(a);
      }
      done();
    });
  });

  it('should support table captioned above', () => {
    let table = tables[0];
    inFigure(table);
    captionContains(table, /table-above/);
    labelIs(table, 'Table A');
    elContains(table, /table-above/);
    isType(table, 'schema:Table');
  });

  it('should support table captioned below', () => {
    let table = tables[1];
    inFigure(table);
    captionContains(table, /table-below/);
    labelIs(table, 'Table B');
    elContains(table, /table-below/i);
    isType(table, 'schema:Table');
  });

  it('should support code captioned above', () => {
    let code = codes[0],
      fig = code.parentNode;
    inFigure(code);
    captionContains(fig, /code-above/);
    labelIs(fig, 'Code 1');
    isType(code, 'schema:SoftwareSourceCode');
  });

  it('should support code captioned below', () => {
    let code = codes[1],
      fig = code.parentNode;
    inFigure(code);
    captionContains(fig, /code-below/);
    labelIs(fig, 'Code 2');
    isType(code, 'schema:SoftwareSourceCode');
  });

  it('should support textboxes captioned above', () => {
    let box = asides[0];
    captionContains(box, /text-box-above/);
    labelIs(box, 'Text Box 1');
    elContains(box, /text-box 1/);
  });

  it('should support textboxes captioned below', () => {
    let box = asides[1];
    captionContains(box, /text-box-below/);
    labelIs(box, 'Text Box 2');
    elContains(box, /text-box 2/);
  });

  it('should support img captioned above', () => {
    let img = images[0],
      fig = img.parentNode;
    inFigure(img);
    captionContains(fig, /figure-above/);
    labelIs(fig, 'Figure 1');
    isType(img, 'sa:Image');
  });

  it('should support img captioned below', () => {
    let img = images[1],
      fig = img.parentNode;
    inFigure(img);
    captionContains(fig, /figure-below/);
    labelIs(fig, 'Figure 2');
    isType(img, 'sa:Image');
  });

  it('should support equation captioned above', () => {
    let math = maths[0],
      fig = ancestors(math).filter(anc => anc.localName === 'figure')[0];
    hasAncestor(math, 'figure');
    captionContains(fig, /math-above/);
    labelIs(fig, 'Equation 1');
    assert(
      fig.getAttribute('typeof'),
      'sa:Formula',
      `in a figure of type 'sa:Formula'`
    );
  });

  // I don't believe we need this to be true
  // it('should keep some newlines in captions', () => {
  //   let table = tables[2];
  //   captionContains(table, /\n/);
  // });
  it('should support table captioned above (style only)', () => {
    let table = tables[3];
    inFigure(table);
    captionContains(table, /style-only-above/);
    elContains(table, /style-only-above/);
    isType(table, 'schema:Table');
  });

  it('should support table captioned below (style only)', () => {
    let table = tables[4];
    inFigure(table);
    captionContains(table, /style-only-below/);
    elContains(table, /style-only-below/);
    isType(table, 'schema:Table');
  });

  it('should support table captioned above (with a pile of caption)', () => {
    let table = tables[5];
    inFigure(table);
    captionContains(table, /table-pile-1/);
    // captionContains(table, /table-pile-2/);
    labelIs(table, 'Table D'); // there is also a second label — not sure if we keep it
    elContains(table, /table-pile/i);
    isType(table, 'schema:Table');
  });

  it('should support table captioned below (with a pile of caption)', () => {
    let table = tables[6];
    inFigure(table);
    captionContains(table, /table-pile-below-top/);
    // captionContains(table, /table-pile-below-bot/);
    labelIs(table, 'Table F'); // there is also a second label — not sure if we keep it
    elContains(table, /table-pile-below/i);
    isType(table, 'schema:Table');
  });

  it('should survive broken captions with captions inside (sorta)', () => {
    let table = tables[7];
    inFigure(table);
    captionContains(table, /caption-caption/);
    labelIs(table, 'This is a basic caption.Table H');
    elContains(table, /Caption-caption/);
    isType(table, 'schema:Table');
  });

  it('should handle empty captions', () => {
    let table = tables[10];
    inFigure(table);
    captionContains(table, null);
    labelIs(table, 'Table K');
    elContains(table, /empty-caption/);
    isType(table, 'schema:Table');
  });

  // TODO fix
  it('should handle links above', () => {
    let hyper = links[0];
    let fig = hyper.parentNode.parentNode;

    inFigure(hyper.parentNode);
    captionContains(fig, /hyper-above/);
    labelIs(fig, 'Code 3');
    elContains(hyper, /berjon\.com/);
    isType(hyper.parentNode, 'schema:Dataset');
  });

  it('should handle links below', () => {
    let hyper = links[1],
      fig = hyper.parentNode.parentNode;
    inFigure(hyper.parentNode);
    captionContains(fig, /hyper-below/);
    labelIs(fig, 'Figure 3');
    elContains(hyper, /Web 2024/);
    isType(hyper.parentNode, 'schema:Dataset');
  });

  it('should eliminate dead captions', () => {
    // this is the total count of captions of all sorts
    assert.equal(
      doc.querySelectorAll('figcaption, header').length,
      0,
      'no captions should remain'
    );
  });
});
