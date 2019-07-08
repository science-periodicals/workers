import { normalizeText } from 'web-verse';
import TreeScanner from '../lib/tree-scanner';
import { scanResourceMetadata, scanMultiFigureMetadata } from '../lib/formats';
import { remove } from '../lib/utils';

// TODO link citation referenced in body or caption in the resource.citation (if the resource is not the main entity)

/**
 * Get resource metadata from the label and caption of the resources.
 */
export default function resourceMetadata(ctx, cb) {
  let { doc, store } = ctx;

  try {
    // We loop on _all_ resources (including parts in case of multi part figures)
    for (let $r of doc.querySelectorAll('[resource]')) {
      if ($r.localName === 'article') continue;

      // this works on the assumption that we always put the 'caption' first in the table, and the
      // table first in the figure; and figcaption is the last child for the rest, or header is
      // first in the aside
      let caption;
      if ($r.localName === 'aside') {
        caption = $r.firstElementChild;
      } else {
        caption = $r.lastElementChild;
      }

      if (
        caption &&
        caption.localName !== 'figcaption' &&
        caption.localName !== 'header'
      ) {
        caption = null;
      }

      let tc =
        caption &&
        caption.querySelector('span[property="schema:alternateName"]') &&
        caption.querySelector('span[property="schema:alternateName"]')
          .textContent;

      let resourceID = $r.getAttribute('resource');
      let elID = $r.getAttribute('id');

      store.resources().forEach(res => {
        if (res.$id === resourceID) {
          if (elID) {
            res.url = `#${elID}`;
          }
          if (!caption) {
            return;
          }
          res.alternateName = normalizeText(tc);

          // if we are in the child of a multi-figure here, give up
          // on the contrary if we are in a multi-figure, special processing.
          if (
            caption.parentNode.localName === 'figure' &&
            caption.parentNode.parentNode.localName === 'figure'
          ) {
            return;
          }

          if (tc) {
            remove(
              caption.querySelector('span[property="schema:alternateName"]')
            );
          }

          remove(caption);

          let tp = new TreeScanner(caption, ctx.log).debug(0);

          // Note: `scanMultiFigureMetadata` and `scanResourceMetadata` must be
          // called after the `alternateName` was added to `res` (res.alternateName
          // is used for the `reUseRoleIdResourceKey` of the create method of the
          // store for roles)
          if (
            $r.firstElementChild &&
            $r.firstElementChild.localName === 'figure'
          ) {
            let figMap = {};
            let labels = Array.from($r.querySelectorAll('figure'))
              .map(fig => {
                let lbl = fig.querySelector(
                  'span[property="schema:alternateName"]'
                );
                if (!lbl) return null; // this shouldn't happen, but bookmarks break
                let txt = normalizeText(lbl.textContent);
                figMap[txt] = fig.getAttribute('resource');
                return txt;
              })
              .filter(x => x);

            scanMultiFigureMetadata(tp, labels, store, ctx, figMap, res);
          } else {
            scanResourceMetadata(tp, store, ctx, res);
          }
        }
      });
    }
  } catch (e) {
    ctx.log.error(e);
  }
  process.nextTick(cb);
}
resourceMetadata.message = `Processing resource metadata`;
