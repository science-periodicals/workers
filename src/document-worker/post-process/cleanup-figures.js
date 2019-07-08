/**
 * Empty all figures / asides corresponding to resources and save their order
 * in the document (in `ctx.resourcesOrder`)
 */
export default function cleanupFigures(ctx, cb) {
  let { doc } = ctx;

  try {
    // save order of parts
    ctx.resourcesOrder = {};
    Array.from(
      doc.querySelectorAll('figure[resource], aside[resource]')
    ).forEach((el, idx) => {
      let resId = el.getAttribute('resource');

      if (ctx.resourcesOrder[resId]) {
        return;
      }
      ctx.resourcesOrder[resId] = idx + 1;
    });

    Array.from(
      doc.querySelectorAll('figure[resource], aside[resource]')
    ).forEach(fig => {
      // TODO delete that: it's dangerous and not needed (silly optimization)
      // for testing purposes, we keep the figure bodies around
      if ('it' in global) {
        if (!ctx.testOnlyFigureBodyCache) ctx.testOnlyFigureBodyCache = {};
        ctx.testOnlyFigureBodyCache[fig.getAttribute('resource')] =
          fig.innerHTML;
      }

      fig.innerHTML = '';
    });
  } catch (e) {
    ctx.log.error(e);
  }
  process.nextTick(cb);
}
cleanupFigures.message = `Cleaning up figures`;
