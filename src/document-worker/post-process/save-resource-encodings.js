import os from 'os';
import asyncEachLimit from 'async/eachLimit';
import { arrayify, getId } from '@scipe/jsonld';
import { ancestorsMatching } from '../lib/utils';
import {
  htmlEncodingExtractor,
  encodeHTML,
  encodeImage,
  encodeAudio,
  encodeVideo
} from '../lib/encoder';

/**
 * ctx.encodings contains object of shape: `{ type, resource, element, figure, options }`
 * where type is one of `uncaptionedImage` `html` `resource`
 */
export default function saveResourceEncodings(ctx, callback) {
  const { resource: rootResource, store, log, emitEvent, action } = ctx;

  // !! we need to process encodings in order as table for instance can contain uncaptionedImage and the encodeImage function will take care of fixing the <img /> `src` attribute

  const uncaptionedImageEncodings = arrayify(ctx.encodings).filter(
    data => data.type === 'uncaptionedImage'
  );
  const mediaEncodings = arrayify(ctx.encodings).filter(
    data => data.type === 'resource'
  );
  const htmlEncodings = arrayify(ctx.encodings).filter(
    data => data.type === 'html'
  );

  // first we process all the uncaptioned images
  asyncEachLimit(
    uncaptionedImageEncodings,
    Math.max(os.cpus().length - 1, 1),
    (data, cb) => {
      const { element } = data;

      encodeImage(
        ctx,
        element,
        null,
        rootResource,
        action,
        emitEvent,
        {},
        err => {
          if (err) {
            log.error(err);
          }
          cb(null);
        }
      );
    },
    err => {
      if (err) log.error(err);

      // then all the media encodings
      asyncEachLimit(
        mediaEncodings,
        Math.max(os.cpus().length - 1, 1),
        (data, cb) => {
          const { resource, parentResource, element } = data;

          switch (resource.$type) {
            case 'Image':
              encodeImage(
                ctx,
                element,
                resource,
                parentResource,
                action,
                emitEvent,
                {},
                err => {
                  if (err) log.error(err);
                  cb(null);
                }
              );
              break;

            case 'Audio':
              encodeAudio(
                ctx,
                element,
                resource,
                parentResource,
                action,
                emitEvent,
                {},
                err => {
                  if (err) log.error(err);
                  cb(null);
                }
              );
              break;

            case 'Video':
              encodeVideo(
                ctx,
                element,
                resource,
                parentResource,
                action,
                emitEvent,
                {},
                err => {
                  if (err) log.error(err);
                  cb(null);
                }
              );
              break;

            default:
              // TODO  ?
              cb(null);
              break;
          }
        },
        err => {
          if (err) {
            log.error(err);
          }

          // Finally we process the html encodings as they may reference the previously processed encodings
          asyncEachLimit(
            htmlEncodings,
            Math.max(os.cpus().length - 1, 1),
            (data, cb) => {
              const { resource, element, figure, options } = data;

              const parentEncoding = rootResource.encoding[0];
              const parentEncodingId =
                parentEncoding && (parentEncoding.$id || getId(parentEncoding));

              const html = htmlEncodingExtractor(
                store,
                resource,
                element,
                figure,
                options
              );

              encodeHTML(ctx, resource, html, parentEncodingId, err => {
                if (err) log.error(err);
                rootResource.addPart(resource); // TODO do that upstream
                cb(null);
              });
            },
            err => {
              if (err) {
                log.error(err);
              }

              // Add the parent resource to the encoding data (will be needed
              // later so that we can list the uncaptionedImageEncodings in the
              // `image` prop of the container encodings).
              // Note that we can't do that now as we don't have the Rdfa encoding
              // of the rootResource yet.
              // We do need to store the parentResourceId now as we will remove
              // the figure content further downstream
              uncaptionedImageEncodings.forEach(item => {
                const $img = item.element;
                const encoding = store.findEncodingByImg($img);
                if (encoding) {
                  item.encoding = encoding;

                  // find the resource
                  const $resource = ancestorsMatching(
                    $img,
                    'figure[resource], aside[resource]'
                  )[0];

                  if ($resource) {
                    const resourceId = $resource.getAttribute('resource');
                    item.parentResourceId = resourceId;
                  } else {
                    // if there are no parent figure or aside => we have an
                    // uncaptioned image for the root ScholarlyArticle
                    item.parentResourceId = rootResource.$id;
                  }
                }
              });

              callback();
            }
          );
        }
      );
    }
  );
}
saveResourceEncodings.message = `Saving resource encodings`;
