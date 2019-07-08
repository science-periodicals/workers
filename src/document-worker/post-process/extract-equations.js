import {
  ancestorsMatching,
  childrenMatching,
  isSupporting
} from '../lib/utils';

export default function extractEquations(ctx, callback) {
  let { doc, resource, store, worker, graphId } = ctx;
  let q = 'figure > [role="math"], figure > p > span[role="math"]:only-child';
  let elMap = new Set();

  for (let $math of doc.querySelectorAll(q)) {
    let $figure = ancestorsMatching($math, 'figure')[0];
    elMap.add($figure);
  }

  for (let $figure of elMap) {
    let els = childrenMatching($figure, ':not(figcaption)');
    let math = store.createFormula(
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
    $figure.setAttribute('resource', math.$id);

    if ($figure.hasAttribute('id')) {
      store.mapIDs($figure.getAttribute('id'), math);
    }

    let $label = $figure.querySelector(
      'figcaption span[property="schema:alternateName"]'
    );
    let label = $label && $label.textContent ? $label.textContent : '';
    let $math;

    if (els.length > 1) {
      $math = doc.createElement('div');
      $figure.insertBefore($math, $figure.firstChild);
      while (els.length) {
        $math.appendChild(els.shift());
      }
    } else {
      $math = els[0];
    }

    ctx.encodings.push({
      type: 'html',
      resource: math,
      element: $math,
      figure: $figure,
      options: { label }
    });
  }
  // NOTE: this does the HTML, we should also save the MathML
  process.nextTick(callback);
}
extractEquations.message = `Extracting equations`;
