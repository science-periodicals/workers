// For now we don't do anything
export default function extractAcknowledgments(ctx, cb) {
  try {
    const { sectionsByType } = ctx;

    let $sec = sectionsByType.acknowledgements;

    if ($sec) {
      $sec = $sec.cloneNode(true);
    }
  } catch (e) {
    ctx.log.error(e);
  }

  process.nextTick(cb);
}
extractAcknowledgments.message = `Extracting acknowledgements`;
