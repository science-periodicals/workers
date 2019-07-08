import { normalizeText } from 'web-verse';
import { remove } from '../lib/utils';

// Extracts the keywords and subjects. Note, both are contained in the 'Keywords' section and need to be parsed into keywords (without links) and subjects (with links to science.ai subjects or other urls)
export default function extractKeywords(ctx, cb) {
  const kwSec = ctx.sectionsByType.keywords;
  const keywords = [];
  const subjects = [];
  try {
    if (kwSec && kwSec.querySelector('li')) {
      for (let $p of kwSec.querySelectorAll('li')) {
        const $a = $p.querySelector('a');
        const href = $a && $a.getAttribute('href');
        const txt = normalizeText($p.textContent).replace(/\.\s*$/, '');
        if (txt.length === 0) {
          continue;
        }
        $a && href
          ? href.startsWith('https://science.ai/subjects/') ||
            href.startsWith('https://sci.pe/subjects/')
            ? subjects.push({
                '@id': `subjects:${href.replace(
                  /https:\/\/(science\.ai|sci\.pe)\/subjects\//,
                  ''
                )}`,
                name: txt
              })
            : subjects.push({
                name: txt,
                url: href
              })
          : keywords.push(txt);
      }
      if (keywords.length) {
        ctx.resource.keywords = keywords;
      }
      if (subjects.length) {
        ctx.resource.about = subjects;
      }
      remove(kwSec);
    }
  } catch (e) {
    ctx.log.error(e);
  }
  process.nextTick(cb);
}

extractKeywords.message = `Extracting keywords`;
