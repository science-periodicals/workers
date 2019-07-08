// For now we don't do anything
export default function extractDisclosure(ctx, cb) {
  try {
    const { store, sectionsByType } = ctx;

    let $sec = sectionsByType.disclosure;
    if ($sec) {
      $sec = $sec.cloneNode(true);
    }
  } catch (e) {
    ctx.log.error(e);
  }

  process.nextTick(cb);
}
extractDisclosure.message = `Extracting disclosures`;
