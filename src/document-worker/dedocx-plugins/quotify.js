import { remove } from '../lib/utils';
import { HYPHENS } from '../lib/formats';

/*
 * By default, dedocx will produce a separate blockquote for each paragraph of
 * that style. This merges them. Additionally, if the last paragraph in such a
 * quote starts with some form of hyphenation, it becomes a cite.
 */
export default function dedocxQuotifyPlugin() {
  return function quotifyPlugin({ doc } = {}, callback) {
    Array.from(doc.querySelectorAll('blockquote'))
      .filter(
        bq =>
          !(
            bq.previousElementSibling &&
            bq.previousElementSibling.localName === 'blockquote'
          )
      )
      .forEach(bq => {
        let next = bq.nextElementSibling,
          kill = [];
        while (next && next.localName === 'blockquote') {
          kill.push(next);
          while (next.hasChildNodes()) bq.appendChild(next.firstChild);
          next = next.nextElementSibling;
        }
        kill.forEach(remove);
        if (bq.children.length > 1) {
          let last = bq.children[bq.children.length - 1];
          if (last && new RegExp(`^\\s*${HYPHENS}`).test(last.textContent)) {
            let cite = doc.createElement('cite');
            cite.innerHTML = last.innerHTML;
            last.textContent = '';
            last.appendChild(cite);
          }
        }
      });
    process.nextTick(callback);
  };
}
