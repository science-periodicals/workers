import { remove } from '../lib/utils';

// NOTE:
//  These are the known data-dedocx-* attributes:
//    tfoot
//    props
//    caption-group
//    caption-target-type
//    rel-target
//    rel-package-path
//    author
//    citation-options
//    switches
//    endprops
//  These are the known dedocx-* CSS classes
//    subtitle
//    picture-grid
//    picture-grid-item
//    picture-grid-label
//    caption
//    label
//  Also, we have all the auto-wrapped elements that have pfx_ln as their class and data-pfx_ln for
//  each of their attributes.
export default function dedocxCleanupPlugin({ strictData = false } = {}) {
  return function cleanupPlugin({ doc } = {}, callback) {
    const dataAttributeWhiteList = new Set(['data-display']);

    Array.from(doc.querySelectorAll('*')).forEach(el => {
      Array.from(el.attributes).forEach(({ name }) => {
        if (!dataAttributeWhiteList.has(name)) {
          if (strictData && /^data-/.test(name)) {
            el.removeAttribute(name);
          } else if (!strictData && /^data-(dedocx-|\w+_)\w+/.test(name)) {
            el.removeAttribute(name);
          }
        }
      });

      Array.from(el.classList).forEach(cl => {
        if (/^(dedocx-|\w+_)\w+/.test(cl)) el.classList.remove(cl);
      });
      if (!el.classList.length) el.removeAttribute('class');
      if (
        /^(h[1-6]|p)$/.test(el.localName) &&
        /^\s*$/.test(el.textContent) &&
        !el.querySelector('*')
      ) {
        remove(el);
      }
    });

    // _GoBack is use by MS Word to save the cursor position; so
    // we'll just remove this element if it's empty (and always
    // strip out the id attribute from it regardless).
    let gb = doc.querySelector('#_GoBack');
    if (gb) {
      gb.removeAttribute('id');
      if (!gb.childNodes.length && !gb.attributes.length) remove(gb);
    }

    // Find any `a[role=doc-noteref]` that contains nothing but a single `sup`
    // element, and then invert them.  That is, transform:
    //
    //   <a role="doc-noteref"><sup>...</sup></a>
    //
    // to:
    //
    //   <sup><a role="doc-noteref">...</a></sub>
    Array.from(doc.querySelectorAll('a[role="doc-noteref"]')).forEach(a => {
      if (
        a.childNodes.length === 1 &&
        a.firstElementChild &&
        a.firstElementChild.localName === 'sup'
      ) {
        let sup = a.firstElementChild;
        remove(sup);
        a.parentNode.replaceChild(sup, a);
        while (sup.hasChildNodes()) a.appendChild(sup.firstChild);
        sup.appendChild(a);
      }
    });

    //There can be crossreferences to undefined footnotes and endnotes (e.g., the user has crossreferenced a note that was later deleted, even if they add a new footnote with the same number the crossreference points to a footnote that no longer exists). We remove the undefined note
    Array.from(doc.querySelectorAll('a[role="doc-noteref"]')).forEach(a => {
      //any noteref that does not point to a known footnote should be removed
      if (
        !(
          a.getAttribute('href') &&
          (a.getAttribute('href').includes('dedocx-footnote') ||
            a.getAttribute('href').includes('dedocx-endnote'))
        )
      ) {
        //if there is a `sup` as the parent element of the undefined footnote reference (e.g., <sup><a role="doc-noteref">...</a></sub>), remove it along with the undefined reference
        if (a.parentNode && a.parentNode.localName === 'sup') {
          remove(a.parentNode);
        } else {
          remove(a);
        }
      }
    });

    // Replace `span` that serve no purpose with their content.
    Array.from(doc.querySelectorAll('span'))
      .filter(s => !s.attributes.length)
      .forEach(span => {
        let df = doc.createDocumentFragment();
        while (span.hasChildNodes()) df.appendChild(span.firstChild);
        span.parentNode.replaceChild(df, span);
      });

    process.nextTick(callback);
  };
}
