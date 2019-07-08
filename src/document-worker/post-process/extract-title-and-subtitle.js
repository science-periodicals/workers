const { normalizeText } = require('web-verse');
const { remove } = require('../lib/utils');

function extractTitleAndSubtitle(ctx, cb) {
  let { doc } = ctx;
  try {
    const $title = doc.querySelector('h1');

    if ($title) {
      const $header = $title.parentElement;
      ctx.resource.name = normalizeText($title.textContent);
      remove($title);
      if ($header && $header.localName === 'header') {
        const $subTitle = $header.querySelector('p');
        ctx.resource.headline = normalizeText($subTitle.textContent);
        remove($header);
      }
    }
  } catch (e) {
    ctx.log.error(e);
  }
  process.nextTick(cb);
}

extractTitleAndSubtitle.message = `Extracting title and subtitle`;

module.exports = extractTitleAndSubtitle;
