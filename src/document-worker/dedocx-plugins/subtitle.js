import { remove } from '../lib/utils';

/**
 *  By default, `dedocx` will turn a `Subtitle` style into a
 *  `<header class="dedocx-subtitle"><p>Subtitle</p></header>`.
 *  This plugin will merge a preceding `h1` into the `header`.
 */
export default function dedocxSubtitlePlugin() {
  return function subtitlePlugin({ doc, log } = {}, callback) {
    Array.from(doc.querySelectorAll('header.dedocx-subtitle')).forEach(sub => {
      if (sub.hasAttribute('style') && sub.firstChild) {
        sub.firstChild.setAttribute('style', sub.getAttribute('style'));
        sub.removeAttribute('style');
      }
      sub.removeAttribute('class');
      let prev = sub.previousElementSibling;
      if (!prev) return log.warn('No predecessor title for subtitle');
      if (prev.localName === 'h1') {
        sub.insertBefore(prev, sub.firstChild);
      } else if (prev.localName === 'header') {
        while (sub.hasChildNodes()) prev.appendChild(sub.firstChild);
        remove(sub);
      } else
        log.warn('Could not find preceding title or subtitle for subtitle');
    });
    process.nextTick(callback);
  };
}
