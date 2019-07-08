import { isSupporting } from '../lib/utils';

export default function extractCode(ctx, callback) {
  let { doc, resource, store, worker, graphId } = ctx;

  for (let $pre of doc.querySelectorAll('figure > pre')) {
    let $figure = $pre.parentNode;
    let code = store.createSoftwareSourceCode(
      {
        dateCreated: new Date().toISOString(),
        resourceOf: graphId,
        creator: `bot:${worker.constructor.name}`,
        isPartOf: resource.$id,
        codeSampleType: 'inline',
        isSupportingResource: isSupporting($figure)
      },
      {
        curiePrefix: 'node'
      }
    );

    $figure.setAttribute('resource', code.$id);

    if ($figure.hasAttribute('id')) {
      store.mapIDs($figure.getAttribute('id'), code);
    }

    ctx.encodings.push({
      type: 'html',
      resource: code,
      element: $pre,
      figure: $figure
    });
  }

  // NOTE: this does text/html, we should also save the code itself
  process.nextTick(callback);
}
extractCode.message = `Extracting code`;
