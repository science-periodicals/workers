import { remove } from '../lib/utils';

/**
 * By default, `dedocx`] represents DOCX change tracking by
 * including all insertions in `ins` elements and all deletions in `del` elements. A lot of the time,
 * one does not wish to keep the full markup, but simply to either accept or reject the changes.
 *
 *  This plugin takes a simple configuration.
 *  It is instantiated using `require('dedocx-plugin-changes')({ … })`.
 *
 *   - `mode`, can be `accept` (the default) or `reject`. The `accept` mode is to accept the changes,
 *   which means keeping the insertions and removing the deletions from the document. The `reject`
 *   mode is the reverse: insertions are removed from the document, while deletions are maintained.
 *   - `keepMarkup`, boolean defaulting to `false`. If set to `true`, the `ins` and `del` that are not
 *   removed will be kept as such. Note that while in `accept` mode it is possibly sensible for `ins`
 *   to be in the content, in `reject` mode it is somewhat strange to keep the `del` around since after
 *   rejection that content is technically not deleted. If set to `false` the remaining `ins` and `del`
 *   elements will either be replaced with a `span` if they have some attributes, or directly with
 *   their content otherwise.
 *   - `killComments`, boolean defaulting to `true`. When `true`, indications of the range of comments
 *   and position of comment references are wiped, when `false` they're kept.
 */
export default function dedocxChangesPlugin(config = {}) {
  let { mode = 'accept', keepMarkup = false, killComments = true } = config;
  return function changesPlugin({ doc } = {}, callback) {
    Array.from(doc.querySelectorAll('ins')).forEach(ins => {
      if (mode === 'reject') remove(ins);
      else if (!keepMarkup) replaceWithChildren(ins);
    });
    Array.from(doc.querySelectorAll('del')).forEach(del => {
      if (mode === 'accept') remove(del);
      else if (!keepMarkup) replaceWithChildren(del);
    });
    if (killComments) {
      Array.from(
        doc.querySelectorAll(
          '.commentRangeStart, .commentRangeEnd, .commentReference'
        )
      ).forEach(remove);
    }
    process.nextTick(callback);
  };
}

function replaceWithChildren(el) {
  let replacement;
  if (el.attributes.length) {
    replacement = el.ownerDocument.createElement('span');
    for (let i = 0; i < el.attributes.length; i++) {
      let at = el.attributes[i];
      replacement.setAttribute(at.name, at.value);
    }
  } else {
    replacement = el.ownerDocument.createDocumentFragment();
  }
  while (el.hasChildNodes()) replacement.appendChild(el.firstChild);
  el.parentNode.replaceChild(replacement, el);
}
