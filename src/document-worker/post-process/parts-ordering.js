/**
 * Note: this must be run after `cleanupFigures` was run as it creates
 *`ctx.resourcesOrder`
 */
export default function partsOrdering(ctx, cb) {
  let { store, resource, resourcesOrder = {} } = ctx;
  try {
    [resource].concat(store.resources()).forEach(res => {
      if (!res.hasPart || !res.hasPart.length) return;
      res.hasPart = res.hasPart.sort((a, b) => {
        const aID = a['@id'];
        const bID = b['@id'];

        if (resourcesOrder[aID] == null && resourcesOrder[bID] == null) {
          return 0;
        }
        if (resourcesOrder[bID] == null) return -1;
        if (resourcesOrder[aID] == null) return 1;

        return resourcesOrder[aID] - resourcesOrder[bID];
      });
    });
  } catch (e) {
    ctx.log.error(e);
  }
  process.nextTick(cb);
}
partsOrdering.message = `Ordering the parts`;
