import { isUncaptionedImage, isSupporting } from '../lib/utils';

export default function extractImages(ctx, callback) {
  let { doc, resource, store, worker, graphId } = ctx;
  let images = [];
  let contents = {};
  let parents = {};

  // get all images that are proper resources (excluding the UncaptionedImage)
  Array.from(doc.querySelectorAll('img'))
    .filter($img => $img.src && !isUncaptionedImage($img))
    .forEach($img => {
      let $figure = $img.parentNode;
      let $figParent = $figure.parentNode;
      let parentFigure;

      if ($figParent.localName === 'figure') {
        if (!$figParent.hasAttribute('resource')) {
          parentFigure = store.createImage(
            {
              dateCreated: new Date().toISOString(),
              resourceOf: graphId,
              hasPart: [],
              creator: `bot:${worker.constructor.name}`,
              isPartOf: resource.$id,
              isSupportingResource: isSupporting($figure)
            },
            {
              curiePrefix: 'node'
            }
          );
          $figParent.setAttribute('resource', parentFigure.$id);
          ctx.resource.addPart(parentFigure);
        } else {
          parentFigure = store.get($figParent.getAttribute('resource'));
        }

        if ($figParent.hasAttribute('id')) {
          store.mapIDs($figParent.getAttribute('id'), parentFigure);
        }
      }

      let ipo = resource.$id;
      let image = store.createImage(
        {
          dateCreated: new Date().toISOString(),
          resourceOf: graphId,
          creator: `bot:${worker.constructor.name}`,
          isPartOf: parentFigure ? parentFigure.$id : ipo,
          isSupportingResource: isSupporting($figure)
        },
        {
          curiePrefix: 'node'
        }
      );

      if (parentFigure) {
        parentFigure.addPart(image);
      } else {
        resource.addPart(image);
      }
      $figure.setAttribute('resource', image.$id);
      if ($figure.hasAttribute('id')) {
        store.mapIDs($figure.getAttribute('id'), image);
      }
      images.push(image);
      parents[image.$id] = parentFigure || resource;
      contents[image.$id] = $img;
    });

  images.forEach(image => {
    ctx.encodings.push({
      type: 'resource',
      resource: image,
      element: contents[image.$id],
      parentResource: parents[image.$id]
    });
  });
  process.nextTick(callback);
}
extractImages.message = `Extracting images from figures`;
