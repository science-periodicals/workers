import { remove } from '../lib/utils';
import { ELEMENT_NODE } from 'dom-node-types';

/**
 * By default, dedocx will generate one p > math per equation for consecutive
 * block equations in a document. These can be placed in the same paragraph. This
 * is particularly useful before figures kick in.
 */
export default function dedocxMathBlocksPlugin() {
  return function mathBlocksPlugin({ doc } = {}, callback) {
    Array.from(doc.querySelectorAll('p > math[display="block"]:only-child'))
      .map(math => math.parentNode)
      .filter(p => !isMathBlock(p.previousElementSibling))
      .forEach(p => {
        let following = [],
          next = p.nextElementSibling;
        while (isMathBlock(next)) {
          following.push(next);
          next = next.nextElementSibling;
        }
        following.forEach(fol => {
          let folMath = fol.querySelector('math');
          if (!folMath) return;
          p.appendChild(folMath);
          if (fol.hasAttribute('data-dedocx-caption-group')) {
            p.setAttribute(
              'data-dedocx-caption-group',
              fol.getAttribute('data-dedocx-caption-group')
            );
          }
          remove(fol);
        });
      });
    process.nextTick(callback);
  };
}

function isMathBlock(el) {
  if (
    !el ||
    el.nodeType !== ELEMENT_NODE ||
    el.localName !== 'p' ||
    el.childNodes.length !== 1 ||
    el.firstChild.nodeType !== ELEMENT_NODE ||
    el.firstChild.localName !== 'math'
  )
    return false;
  return true;
}
