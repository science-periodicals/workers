import { childrenMatching } from '../lib/utils';
import { TEXT_NODE } from 'dom-node-types';

/**
 * By default, `dedocx` just keeps the lang information around as properties (ditto
 * for other parts in which DOCX's obscure I18N model is covered). This plugin
 * tries to convert a poorly thought-out I18N model in which the language of
 * content is tagged simultaneously with three languages (one normal — which is to
 * say usually Western — language in `val`, one east Asian language in `eastAsia`,
 * and one "complex script" captured in `bidi`; I will extend the kindness of not
 * commenting on the political correctness of Microsoft's vision of language in the
 * world). This is without mentioning cases in which there are only two language
 * types, comprising complex and non-complex (normal and east Asian); this is used
 * for instance to know if complex scripts should be bolded (because there are
 * separate bold properties for them). Or the cases in which there are four because
 * the "normal" scripts are split into `ascii` and `hAnsi`.
 *
 * I am basing my analysis on [a change document from
 * 2009](https://onedrive.live.com/view.aspx/Public%20Documents/2009/DR-09-0040.docx?cid=c8ba0861dc5e4adc&sc=documents)
 * which is the closest thing I've managed to obtain that documents this.
 *
 * The strategy is this:
 *
 * - First, we ignore anything not directly related to `w:lang`. We might add
 *   support for picking the script-dependent styling properties later.
 * - Second, for every element that has a lang in its props, we look at the
 *   entirety of its text content and try to decide which language applies. Note
 *   that if the source has different languages in a single element this may prove
 *   incorrect, and it will not get automatically corrected if there is no
 *   sub-element to override. But it is the closest we can achieve.
 * - Third, we bin every character in that text into a category being `val`,
 *   `eastAsia`, `bidi` and count them.
 * - Then we take the value of `lang` that matches the most common character bin
 *   (if defined).
 *
 * The binning is as follows (based on the table on p.48 in the above link):
 *
 * **`ignore` (does not count)**
 *
 * - spaces
 * - U+00A7-U+00A8
 * - U+00B0-U+00B1
 * - U+00D7
 * - U+00F7
 * - U+E000-U+F0FF
 * - U+2000–U+2BFF
 * - U+1D400–U+1D7FF
 *
 * **`latin` ("normal")**
 *
 * - U+0000–U+058F
 * - U+10A0–U+10FF
 * - U+1200–U+177F
 * - U+1D00–U+200B
 * - U+FB00–U+FB17
 * - U+FE50–U+FE6F
 *
 * **`cs` ("complex")**
 *
 * - U+0590–U+074F
 * - U+0780–U+07BF
 * - U+0900–U+109F
 * - U+1780–U+18AF
 * - U+FB1D–U+FB4F
 *
 * **`ea` ("east Asian")**
 *
 * - U+3099–U+309A
 * - Everything else
 */
export default function dedocxLangPlugin() {
  return function langPlugin({ doc } = {}, callback) {
    let stack = [null]; // inverse stack
    walkLang(doc.body, stack);
    // It happens that paragraphs will revert to the default language but have all of their runs
    // in another language (which is the real one). To avoid such inelegant case, we optimise this
    // away.
    // NOTE: we are quite conservative below in only considering `p` and `body` for this; it could
    // likely be expanded to others. Likewise, we require all the children to have the language set
    // when in fact some could probably be skipped.
    // The code below does a modicum of working from the leaves up, but it could be stronger. Tables
    // are a more complex process, but possibly a big win.
    moveLangUp(Array.from(doc.querySelectorAll('p')));
    moveLangUp([doc.body]);
    process.nextTick(callback);
  };
}

function walkLang(el, stack) {
  try {
    let curLang = stack[0],
      props;
    if (el.hasAttribute('data-dedocx-props'))
      props = JSON.parse(el.getAttribute('data-dedocx-props'));
    if (props && (props.lang || props.rPr.lang)) {
      let lang = props.lang || props.rPr.lang,
        { val, eastAsia, bidi } = lang,
        definedCount = [val, eastAsia, bidi].filter(Boolean).length;
      // if there's only one, that's the lang
      if (definedCount === 1) {
        let newLang = [val, eastAsia, bidi].find(Boolean);
        if (newLang !== curLang) {
          el.setAttribute('lang', newLang);
          curLang = newLang;
        }
      } else if (definedCount > 1) {
        let txt = el.textContent;
        if (txt && txt.length) {
          let binned = binText(txt),
            newLang = binned.find(candidate => lang[candidate]);
          if (newLang !== curLang) {
            el.setAttribute('lang', newLang);
            curLang = newLang;
          }
        }
      }
    }
    stack.unshift(curLang);
    Array.from(el.children).forEach(kid => walkLang(kid, stack));
    stack.shift();
  } catch (err) {
    return;
  }
}

function binText(txt) {
  let bins = {
    val: 0, // latin
    eastAsia: 0, // ea
    bidi: 0 // cs
  };
  (txt || '')
    // ignore these
    .replace(
      /[\s\u00A7-\u00A8\u00B0-\u00B1\u00D7\u00F7\uE000-\uF0FF\u2000–\u2BFF\u{1D400}–\u{1D7FF}]/g,
      ''
    )
    // latin
    .replace(
      /[\u0000–\u058F\u10A0–\u10FF\u1200–\u177F\u1D00–\u200B\uFB00–\uFB17\uFE50–\uFE6F]/g,
      () => {
        bins.val++;
        return '';
      }
    )
    // cs
    .replace(
      /[\u0590–\u074F\u0780–\u07BF\u0900–\u109F\u1780–\u18AF\uFB1D–\uFB4F]/g,
      () => {
        bins.bidi++;
        return '';
      }
    )
    // ea
    .replace(/./g, () => {
      bins.eastAsia++;
      return '';
    });
  return Object.keys(bins).sort((a, b) => {
    if (bins[a] > bins[b]) return -1;
    if (bins[a] < bins[b]) return 1;
    return 0;
  });
}

function moveLangUp(els) {
  els
    .filter(
      p =>
        p.children.length &&
        !Array.from(p.childNodes).find(
          k => k.nodeType === TEXT_NODE && /\s/.test(k.value)
        ) &&
        p.children.length === childrenMatching(p, '[lang]').length
    )
    .forEach(p => {
      let lang = p.firstElementChild.getAttribute('lang');
      if (
        Array.from(p.children)
          .map(sub => sub.getAttribute('lang'))
          .find(other => other !== lang)
      ) {
        return;
      }
      p.setAttribute('lang', lang);
      Array.from(p.children).forEach(sub => sub.removeAttribute('lang'));
    });
}
