import { normalizeText } from 'web-verse';
import { arrayify } from '@scipe/jsonld';
import { remove, textOrHTML } from '../lib/utils';

export default function unabstract(ctx, cb) {
  const { resource, store } = ctx;

  try {
    const abstracts = arrayify(ctx.sectionsByType.abstract);
    abstracts.forEach($abstract => {
      remove($abstract);

      const $title = $abstract.querySelector('h1, h2, h3, h4, h5, h6');
      const name = textOrHTML($title);
      remove($title);
      const text = textOrHTML($abstract);

      // try to refine the type
      let type = 'WPAbstract';
      if (
        $title &&
        /^Impact\s+Statement(?:s)?$|^Plain\s+Language\s+Summar(y|ies)?$|^Significance\s+Statement(?:s)?$/i.test(
          normalizeText($title.textContent).toLowerCase()
        )
      ) {
        type = 'WPImpactStatement';
      }

      const abstract = store.createWPAbstract({ name, text }, type, {
        curiePrefix: 'node'
      });
      resource.addDetailedDescription(abstract);
    });
  } catch (e) {
    ctx.log.error(e);
  }
  process.nextTick(cb);
}
unabstract.message = `Extracting abstract`;
