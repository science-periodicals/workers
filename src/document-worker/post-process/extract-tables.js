import { isSupporting } from '../lib/utils';

export default function extractTables(ctx, callback) {
  let { doc, resource, store, worker, graphId } = ctx;

  for (let $table of doc.querySelectorAll('figure > table')) {
    let $figure = $table.parentNode;

    let table = store.createTable(
      {
        dateCreated: new Date().toISOString(),
        resourceOf: graphId,
        creator: `bot:${worker.constructor.name}`,
        isPartOf: resource.$id,
        isSupportingResource: isSupporting($figure)
      },
      {
        curiePrefix: 'node'
      }
    );
    $figure.setAttribute('resource', table.$id);

    if ($figure.hasAttribute('id')) {
      store.mapIDs($figure.getAttribute('id'), table);
    }

    ctx.encodings.push({
      type: 'html',
      resource: table,
      element: $table,
      figure: $figure
    });
  }
  process.nextTick(callback);
}
extractTables.message = `Extracting tables`;
