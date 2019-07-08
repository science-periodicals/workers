import { childrenMatching, childMatching } from '../lib/utils';

/**
 *   By default, `dedocx` will leave all the content of
 *   `mc:AlternateContent` processed as is in the document. Since this element is used to provide
 *   alternate (wait for it) content for several variants of the same thing, this naturally leads to
 *   duplication.
 *
 *   This plugin picks one. By default, it is the fallback but you can also provide an arbitrary set of
 *   values to match the `Requires` attribute with (a typical example is `wps`). It will replace
 *   `mc:AlternateContent` with the content of a matching `mc:Choice` or `mc:Fallback` (or nothing if
 *     none can be found). If `mc:AlternateContent` is the only content in its `p`, that will get replaced
 *   too.
 *
 *   This plugin optionally takes `requires` values to match. It is instantiated using
 *   `require('dedocx-plugin-alternate-content')({ requires: ['list', 'of', 'strings', 'to', 'match']})`.
 */
export default function dedocxAlternateContentPlugin(config = {}) {
  let requires = config.requires || [];
  return function alternateContentPlugin({ doc } = {}, callback) {
    Array.from(doc.querySelectorAll('.mc_AlternateContent')).forEach(alt => {
      let df = doc.createDocumentFragment(),
        choice = childrenMatching(alt, '.mc_Choice').find(ch => {
          let req = ch.getAttribute('data-requires');
          if (!req) return false;
          return ~requires.indexOf(r => r === req);
        });
      if (!choice) choice = childMatching(alt, '.mc_Fallback');
      if (choice) {
        while (choice.hasChildNodes()) df.appendChild(choice.firstChild);
      }
      let target = alt;
      ['span', 'p'].forEach(parentName => {
        if (
          target.parentNode &&
          target.parentNode.localName === parentName &&
          target.children.length === 1 &&
          target.parentNode.parentNode
        )
          target = target.parentNode;
      });
      target.parentNode.replaceChild(df, target);
    });
    process.nextTick(callback);
  };
}
