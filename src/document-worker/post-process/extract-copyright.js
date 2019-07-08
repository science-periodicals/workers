import { remove } from '../lib/utils';
import { scanCopyright } from '../lib/formats';
import TreeScanner from '../lib/tree-scanner';

/**
 * Extracts the copyright; Remove the prefix; Extract the year.
 * For what remains, get the information from all the cross-reference links, and remove them.
 * If there is anything left, split on detected separator, then parse as either person or
 * organisation.
 */
export default function extractCopyright(ctx, cb) {
  const { resource, store, log, sectionsByType } = ctx;
  const $sec = sectionsByType.copyright;

  try {
    if ($sec) {
      // we only look at the first paragraph
      let $p = $sec.querySelector('p');
      if (!$p) {
        log.warn(
          { element: $sec },
          `Copyright section seems to contain no paragraph: ${$sec.textContent}`
        );
        return;
      }

      let tp = new TreeScanner($p, ctx.log).debug(0);

      scanCopyright(tp, store, resource, { allowUnsafeHolderSeparator: true });
      remove($sec);
    }
  } catch (e) {
    ctx.log.error(e);
  }
  process.nextTick(cb);
}

extractCopyright.message = `Extracting copyright`;
