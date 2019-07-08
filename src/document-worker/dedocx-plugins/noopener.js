/**
 * By default, [`dedocx`](https://github.com/scienceai/dedocx) will just
 * generate links. If you are in full control of the content you are converting
 * here, if it is trustworthy, or if it is not going on the Web then you don't need
 * this module.
 *
 * If this is more or less user-generated content and it will be hosted online,
 * you will want this very simple module for both
 * [security](https://mathiasbynens.github.io/rel-noopener/) and
 * [performance](https://jakearchibald.com/2016/performance-benefits-of-rel-noopener/)
 * reasons.
 */

export default function dedocxNoOpenerPlugin() {
  return function noOpenerPlugin({ doc } = {}, callback) {
    Array.from(doc.querySelectorAll('a[href]'))
      .filter(a => !/^#/.test(a.getAttribute('href')))
      .forEach(link => addRel(link, 'noopener'));
    process.nextTick(callback);
  };
}

function addRel(link, value) {
  let rels = (link.getAttribute('rel') || '').split(/\s+/).filter(x => x);
  if (!rels.find(r => r === value)) rels.push(value);
  link.setAttribute('rel', rels.join(' '));
}
