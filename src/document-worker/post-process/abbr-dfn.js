import { ELEMENT_NODE, TEXT_NODE } from 'dom-node-types';
import { normalizeText } from 'web-verse';
import escapeRegex from 'escape-string-regexp';
import { remove } from '../lib/utils';

/**
 * Handle the "Abbreviations" section
 * Note: we allow abbreviation items to be bookmarked or not
 */
export default function abbrDfn(ctx, cb) {
  let { doc } = ctx,
    $sec = ctx.sectionsByType.abbr,
    abbrMap = {};

  try {
    if ($sec) {
      const $lis = Array.from($sec.querySelectorAll('li'));
      if (!$lis.length) {
        remove($sec);
      } else {
        $lis.forEach($li => {
          const tc = normalizeText($li.textContent);
          const [key, value] = tc.split(':').map(v => normalizeText(v));
          abbrMap[key] = value.replace(/^.*?:\s*/, '');

          const $bookmark = $li.querySelector('span[id]');
          if ($bookmark) {
            // replace all the cross-ref to the bookmark by text so that we then
            // only rely on text based processing
            Array.from(
              doc.querySelectorAll(`a[href="#${$bookmark.id}"]`)
            ).forEach(a => {
              let df = doc.createDocumentFragment();
              while (a.hasChildNodes()) {
                df.appendChild(a.firstChild);
              }
              a.parentNode.replaceChild(df, a);
            });
          }
        });

        remove($sec);

        // Text based processing
        let aKeys = Object.keys(abbrMap)
          .map(escapeRegex)
          .sort((a, b) => {
            // Sort longest -> shortest
            if (b.length < a.length) return -1;
            if (a.length < b.length) return 1;
            return 0;
          });

        // create a regexp ORing all the aKeys:
        // /((?:\b(?<![/.-\\])key\b(?![/.-\\])))/;
        // Note we exclude / . -  in order to not turn part of URL or slugs into <abbr />

        const negLookBehind = '(?<![/.-])';
        const negLookAhead = '(?![/.-])';

        let abbrRx =
          aKeys.length &&
          new RegExp(
            `((?:\\b${negLookBehind}` +
              aKeys.join(`\\b${negLookAhead})|(?:\\b${negLookBehind}`) +
              `\\b${negLookAhead}))`
          );

        let excl = ['pre'];

        let makeAbbr = (abbr, title) => {
          let $abbr = doc.createElement('abbr');
          $abbr.setAttribute('title', title);
          $abbr.textContent = abbr;
          return $abbr;
        };

        let walkText = node => {
          if (!node) return;
          if (node.nodeType === ELEMENT_NODE && excl.includes(node.localName)) {
            return;
          }

          if (node.nodeType === TEXT_NODE) {
            let spltTxt = node.data.split(abbrRx);
            // Note: the regexp has capturing parentheses
            // => the results of the capturing parentheses are spliced into the output array
            // e.g. 'hello k1 and k2'.split(/((?:\bk1\b)|(?:\bk2\b))/)  -> [ 'hello ', 'k1', ' and ', 'k2', '' ]

            if (spltTxt.length === 1) {
              if (abbrMap[spltTxt[0]]) {
                node.parentNode.replaceChild(
                  makeAbbr(spltTxt[0], abbrMap[spltTxt[0]]),
                  node
                );
              }
              return;
            }

            let df = doc.createDocumentFragment();
            while (spltTxt.length) {
              let t = spltTxt.shift();
              let matched;

              if (spltTxt.length) {
                matched = spltTxt.shift();
              }

              if (t && t.length) {
                df.appendChild(doc.createTextNode(t));
              }

              if (matched) {
                // ABBR
                if (abbrMap[matched]) {
                  df.appendChild(makeAbbr(matched, abbrMap[matched]));
                } else {
                  // somehow it matched but didn't work -- this shouldn't happen unless you have
                  // listed an abbreviation with no definition
                  // => we do nothing
                  df.appendChild(doc.createTextNode(matched));
                }
              }
            }
            node.parentNode.replaceChild(df, node);
          } else {
            for (let i = 0; i < node.childNodes.length; i++) {
              walkText(node.childNodes[i]);
            }
          }
        };

        if (aKeys.length) {
          walkText(doc.querySelector('article'));
        }
      }
    }
  } catch (e) {
    ctx.log.error(e);
  }
  process.nextTick(cb);
}
abbrDfn.message = `Processing abbreviations`;
