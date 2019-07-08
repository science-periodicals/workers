import { isUncaptionedImage } from '../lib/utils';

// TODO rename extractUncaptionedImages
// TODO fix: there can be uncaptioned images within table or text boxes

/**
 * We take all the images that don't have a figure / aside / table ancestor
 */
export default function extractSoloImages(ctx, callback) {
  let { doc } = ctx;
  Array.from(doc.querySelectorAll('img')).forEach($img => {
    if ($img.src && isUncaptionedImage($img)) {
      // we wrap img into a span
      const $span = doc.createElement('span');
      const $parent = $img.parentElement;
      $parent.replaceChild($span, $img);
      $span.appendChild($img);

      // set an sa- class to the span
      $span.setAttribute('class', 'sa-uncaptioned-img');

      //  move the data-display attr to the wrapping span
      if ($img.hasAttribute('data-display')) {
        $span.setAttribute('data-display', $img.getAttribute('data-display'));
        $img.removeAttribute('data-display');
      }

      ctx.encodings.push({
        type: 'uncaptionedImage',
        element: $img
      });
    }
  });

  process.nextTick(callback);
}
extractSoloImages.message = `Extracting inline images`;
