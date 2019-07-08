const { remove, textOrHTML } = require('../lib/utils');

function extractDescription(ctx, cb) {
  const { resource } = ctx;

  try {
    let { description: $description } = ctx.sectionsByType;
    if ($description) {
      remove($description);

      const $title = $description.querySelector('h1, h2, h3, h4, h5, h6');
      remove($title);
      resource.description = textOrHTML($description);
    }
  } catch (e) {
    ctx.log.error(e);
  }
  process.nextTick(cb);
}
extractDescription.message = `Extracting description`;

module.exports = extractDescription;
