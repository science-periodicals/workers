import { remove, ancestorsMatching } from '../lib/utils';
import { ELEMENT_NODE, TEXT_NODE } from 'dom-node-types';

/**
 * By default, `dedocx` will generate one `pre > code` per line
 * of code in a DOCX. This merges them together, cleans up the tabs and the occasional styling issues
 * from pasting, and maintains the captioning information for future use.
 */
export default function dedocxCodePlugin() {
  return function codePlugin({ doc } = {}, callback) {
    Array.from(doc.querySelectorAll('pre'))
      .filter(pre => !isPreCode(pre.previousElementSibling))
      .forEach(pre => {
        let following = [],
          next = pre.nextElementSibling,
          containerCode = pre.querySelector('code');
        while (isPreCode(next)) {
          following.push(next);
          next = next.nextElementSibling;
        }
        following.forEach(fol => {
          containerCode.appendChild(doc.createTextNode('\n'));
          let folCode = fol.querySelector('code');
          while (folCode && folCode.hasChildNodes())
            containerCode.appendChild(folCode.firstChild);
          if (fol.hasAttribute('data-dedocx-caption-group')) {
            pre.setAttribute(
              'data-dedocx-caption-group',
              fol.getAttribute('data-dedocx-caption-group')
            );
          }
          remove(fol);
        });
        // Sometimes pasting code into Word uses an HTMLCode inline style which we don't want
        Array.from(doc.querySelectorAll('span[data-dedocx-props]'))
          .filter(span => {
            try {
              let props = JSON.parse(span.getAttribute('data-dedocx-props'));
              return props.rStyle === 'HTMLCode';
            } catch (e) {
              return false;
            }
          })
          .forEach(span => {
            let df = span.ownerDocument.createDocumentFragment();
            while (span.hasChildNodes()) df.appendChild(span.firstChild);
            span.parentNode.replaceChild(df, span);
          });
        // We walk all the text nodes to replace tabs with spaces
        let tw = pre.ownerDocument.createTreeWalker(pre, 4);
        while (tw.nextNode()) {
          if (tw.currentNode.data && /\t/.test(tw.currentNode.data)) {
            // NOTE: we could make the spaces configurable
            tw.currentNode.data = tw.currentNode.data.replace(/\t/g, '  ');
          }
        }
      });

    // <code> elements not in <pre> need to have their \n turned into <br>,
    // and conversely
    Array.from(doc.querySelectorAll('code')).forEach(code => {
      if (ancestorsMatching(code, 'pre').length) {
        Array.from(code.querySelectorAll('br')).forEach(br => {
          let tn = doc.createTextNode('\n');
          br.parentNode.replaceChild(tn, br);
        });
      } else {
        Array.from(code.childNodes)
          .filter(n => n.nodeType === TEXT_NODE)
          .forEach(n => {
            let parts = (n.data || '').split(/\n/);
            if (parts.length > 1) {
              let df = doc.createDocumentFragment();
              parts.forEach((part, idx) => {
                if (idx) {
                  let br = doc.createElement('br');
                  df.appendChild(br);
                }
                df.appendChild(doc.createTextNode(part));
              });
              n.parentNode.replaceChild(df, n);
            }
          });
      }
    });

    process.nextTick(callback);
  };
}

function isPreCode(el) {
  if (
    !el ||
    el.nodeType !== ELEMENT_NODE ||
    el.localName !== 'pre' ||
    el.childNodes.length !== 1 ||
    el.firstChild.nodeType !== ELEMENT_NODE ||
    el.firstChild.localName !== 'code'
  )
    return false;
  return true;
}
