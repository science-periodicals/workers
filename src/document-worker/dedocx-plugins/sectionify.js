import { remove } from '../lib/utils';
import { ELEMENT_NODE } from 'dom-node-types';

/**
 * By default, dedocx will maintain the DOCX structure (or lack thereof) in which
 * everything is essentially flat, with sections loosely identified by the
 * intervening heading elements.
 *
 * This plugin will turn that into a nice tree of article (for h1) and section
 * elements. If the tree does not make sense (eg. if things jump from h1 to h4) it
 * will generate the missing sections along with empty heading (h2 and h3 in the
 * example) to match.
 *
 * This plugin should operate correctly whether or not dedocx-plugin-subtitle has
 * run before it.
 */

export default function dedocxSectionifyPlugin() {
  return function sectionifyPlugin({ doc } = {}, callback) {
    // NOTE: this is a reverse stack, unshift() to add, shift() to pop. It makes accessing the
    // current item easier, since JS doesn't do negative indices.
    let stack = [doc.body],
      contents = Array.from(doc.body.childNodes).map(remove);
    while (contents.length) {
      let next = contents.shift(),
        lvl = level(next),
        cur = stack.length - 1;
      if (!lvl) {
        stack[0].appendChild(next);
        continue;
      }
      if (lvl <= cur) {
        while (lvl <= stack.length - 1) stack.shift();
        let section = doc.createElement(lvl === 1 ? 'article' : 'section');
        stack[0].appendChild(section);
        section.appendChild(next);
        stack.unshift(section);
        continue;
      }
      while (lvl > stack.length - 1) {
        let section = doc.createElement(lvl === 1 ? 'article' : 'section');
        stack[0].appendChild(section);
        stack.unshift(section);
        if (lvl > stack.length - 1) {
          let curLvl = stack.length - 1,
            h = doc.createElement(`h${curLvl > 6 ? '6' : curLvl}`);
          if (curLvl > 6) h.setAttribute('aria-level', curLvl);
          section.appendChild(h);
        }
      }
      stack[0].appendChild(next);
    }
    process.nextTick(callback);
  };
}

function level(el) {
  if (!el || el.nodeType !== ELEMENT_NODE) return 0;
  let ln = el.localName;
  if (ln === 'header') return el.querySelector('h1') ? 1 : 0;
  if (/^h[1-6]$/.test(ln)) {
    if (el.hasAttribute('aria-level'))
      return parseInt(el.getAttribute('aria-level'), 10);
    return parseInt(ln.replace('h', ''), 10);
  }
  return 0;
}
