import assert from 'assert';
import { join, dirname } from 'path';
import dedocx from '@scipe/dedocx';
import { ancestorsMatching, remove } from '../../src/document-worker/lib/utils';
import codePlugin from '../../src/document-worker/dedocx-plugins/code';
import altConPlugin from '../../src/document-worker/dedocx-plugins/alternate-content';
import figurify from '../../src/document-worker/dedocx-plugins/figurify';

const sourcePath = join(
  dirname(__dirname),
  'fixtures/document-worker/plugins/captions.docx'
);

describe('Captions', () => {
  let document,
    tables = [],
    images = [],
    codes = [],
    maths = [],
    asides = [],
    links = [];
  before(done => {
    dedocx(
      { sourcePath, plugins: [codePlugin(), altConPlugin(), figurify()] },
      (err, { doc }) => {
        assert.ifError(err);
        document = doc;
        tables = Array.from(doc.querySelectorAll('table'));
        images = Array.from(doc.querySelectorAll('img'));
        codes = Array.from(doc.querySelectorAll('pre'));
        maths = Array.from(doc.querySelectorAll('math'));
        asides = Array.from(doc.querySelectorAll('aside'));
        links = Array.from(doc.querySelectorAll('a[data-sans_rel]'));
        done();
      }
    );
  });
  it('should support table captioned above', () => {
    let table = tables[0];
    inFigure(table);
    captionContains(table, /table-above/);
    labelIs(table, 'Table A');
    elContains(table, /table-above/);
  });
  it('should support table captioned below', () => {
    let table = tables[1];
    inFigure(table);
    captionContains(table, /table-below/);
    labelIs(table, 'Table B');
    elContains(table, /table-below/i);
  });
  it('should support code captioned above', () => {
    let code = codes[0],
      fig = code.parentNode;
    inFigure(code);
    captionContains(fig, /code-above/);
    labelIs(fig, 'Code 1');
  });
  it('should support code captioned below', () => {
    let code = codes[1],
      fig = code.parentNode;
    inFigure(code);
    captionContains(fig, /code-below/);
    labelIs(fig, 'Code 2');
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
  });
  it('should support img captioned below', () => {
    let img = images[1],
      fig = img.parentNode;
    inFigure(img);
    captionContains(fig, /figure-below/);
    labelIs(fig, 'Figure 2');
  });
  it('should support equation captioned above', () => {
    let math = maths[0],
      fig = ancestorsMatching(math, 'figure')[0];
    // console.log(fig.outerHTML);
    // console.log(math.parentNode.outerHTML);
    assert(ancestorsMatching(math, 'figure').length, 'has a figure ancestor');
    captionContains(fig, /math-above/);
    labelIs(fig, 'Equation 1');
  });
  it('should support table captioned above (style only)', () => {
    let table = tables[3];
    inFigure(table);
    captionContains(table, /style-only-above/);
    elContains(table, /style-only-above/);
  });
  it('should support table captioned below (style only)', () => {
    let table = tables[4];
    inFigure(table);
    captionContains(table, /style-only-below/);
    elContains(table, /style-only-below/);
  });
  it('should support table captioned above (with a pile of caption)', () => {
    let table = tables[5];
    inFigure(table);
    captionContains(table, /table-pile-1/);
    // captionContains(table, /table-pile-2/);
    labelIs(table, 'Table D'); // there is also a second label — not sure if we keep it
    elContains(table, /table-pile/i);
  });
  it('should support table captioned below (with a pile of caption)', () => {
    let table = tables[6];
    inFigure(table);
    captionContains(table, /table-pile-below-top/);
    // captionContains(table, /table-pile-below-bot/);
    labelIs(table, 'Table F'); // there is also a second label — not sure if we keep it
    elContains(table, /table-pile-below/i);
  });
  it('should survive broken captions with captions inside (sorta)', () => {
    let table = tables[7];
    inFigure(table);
    captionContains(table, /caption-caption/);
    labelIs(table, 'This is a basic caption.Table H');
    elContains(table, /Caption-caption/);
  });
  it('should handle empty captions', () => {
    let table = tables[10];
    inFigure(table);
    captionContains(table, null);
    labelIs(table, 'Table K');
    elContains(table, /empty-caption/);
  });
  it('should handle links above', () => {
    let hyper = links[0],
      fig = hyper.parentNode.parentNode;
    inFigure(hyper.parentNode);
    captionContains(fig, /hyper-above/);
    labelIs(fig, 'Code 3');
    elContains(hyper, /berjon\.com/);
  });
  it('should handle links below', () => {
    let hyper = links[1],
      fig = hyper.parentNode.parentNode;
    inFigure(hyper.parentNode);
    captionContains(fig, /hyper-below/);
    labelIs(fig, 'Figure 3');
    elContains(hyper, /Web 2024/);
  });
  it('should eliminate dead captions', () => {
    // this is the total count of captions of all sorts
    let free = Array.from(document.querySelectorAll('figcaption'))
      .filter(cap => !ancestorsMatching(cap, 'figure').length)
      .concat(
        Array.from(document.querySelectorAll('header')).filter(
          cap => !ancestorsMatching(cap, 'aside').length
        )
      );
    assert.equal(free.length, 0, 'no captions should remain free');
  });
});

// test functions
function getCaption(el) {
  if (!el) return;
  if (el.localName === 'figure') return el.lastElementChild;
  else if (el.localName === 'aside') return el.firstElementChild;
  return getCaption(el.parentNode);
}
function inFigure(el) {
  assert.equal(el.parentNode.localName, 'figure', 'in figure');
}
function captionContains(el, re) {
  let cap = getCaption(el);
  assert(cap, 'there is a caption');
  cap = cap.cloneNode(true);
  remove(cap.querySelector('.dedocx-label'));
  if (re == null)
    assert(!cap.textContent.replace(/\s+/g, ''), 'caption is not there');
  else assert(re.test(cap.textContent), 'caption has right text');
}
function labelIs(el, txt) {
  let cap = getCaption(el);
  assert(cap, 'there is a caption');
  let label = cap.querySelector('.dedocx-label');
  assert(label, 'there is a label');
  assert.equal(label.textContent, txt, `caption label is '${txt}'`);
}
function elContains(el, re) {
  assert(re.test(el.textContent), 'element has right text');
}
