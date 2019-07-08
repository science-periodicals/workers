import { isSupporting } from '../lib/utils';
import { prefix } from '@scipe/jsonld';

// Extract text boxes to resources.
export default function extractTextBoxes(ctx, callback) {
  let { doc, resource, store, worker, graphId } = ctx;

  for (let $aside of doc.querySelectorAll('aside')) {
    let aside = store.createTextBox(
      {
        dateCreated: new Date().toISOString(),
        resourceOf: graphId,
        creator: `bot:${worker.constructor.name}`,
        isPartOf: resource.$id,
        isSupportingResource: isSupporting($aside)
      },
      {
        curiePrefix: 'node'
      }
    );
    $aside.setAttribute('resource', aside.$id);
    $aside.setAttribute('typeof', prefix('TextBox'));
    if ($aside.hasAttribute('id')) {
      store.mapIDs($aside.getAttribute('id'), aside);
    }

    ctx.encodings.push({
      type: 'html',
      resource: aside,
      element: $aside,
      figure: $aside
    });
  }
  process.nextTick(callback);
}
extractTextBoxes.message = `Extracting text boxes`;
