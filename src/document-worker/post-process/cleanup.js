import { cleanUpHtml } from '../lib/utils';

export default function cleanup(ctx, cb) {
  let { doc } = ctx;
  try {
    // set a resource attribute
    let $article = doc.querySelector('article');
    if ($article && !$article.hasAttribute('resource')) {
      $article.setAttribute('resource', '#');
    }

    cleanUpHtml(doc);
  } catch (e) {
    ctx.log.error(e);
  }
  process.nextTick(cb);
}
cleanup.message = `Cleaning up generated HTML`;
