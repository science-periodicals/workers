import gm from 'gm';
import mime from 'mime-types';
import asyncMap from 'async/map';
import path from 'path';
import { getId } from '@scipe/jsonld';

export default function thumbnail(s, action, params, callback) {
  if (!callback) {
    callback = params;
    params = {};
  }

  const encodingName = params.name || action.object.name;
  const emitEvent = params.emitEvent || this.emitEvent.bind(this);
  const superEvent = emitEvent(
    action,
    `creating thumbnail for ${encodingName}`
  );

  const that = this; //!! as gm will need access to this, we cannot use arrow functions
  gm(s, encodingName).size({ bufferStream: true }, function(err, size) {
    if (err) return callback(err);

    // convert to web friendly format if needed
    const fileFormat = params.fileFormat || action.object.fileFormat;
    let targetFileFormat;
    if (!/image\/png/.test(fileFormat) && !/image\/jpeg/.test(fileFormat)) {
      targetFileFormat = 'image/png';
    } else {
      targetFileFormat = fileFormat;
    }

    const target = mime.extension(targetFileFormat);

    this.toBuffer(target.toUpperCase(), function(err, buffer) {
      if (err) return callback(err);

      const mergedParams = that.getParams(action, params);
      const conversionType =
        mergedParams.resourceId === 'logo' ? 'logo' : 'screen';

      const targetSizes = [];
      if (conversionType === 'logo') {
        // For logo we just make sure that it fits in a 138x24 box
        if (size.height >= 24 * 4) {
          targetSizes.push(
            { w: 138 * 4, h: 24 * 4 }, // note this will preserve the aspect ratio but force to not overshoot size.height
            { w: 138 * 2, h: 24 * 2 },
            { w: 138, h: 24 }
          );
        } else if (size.height >= 24 * 2) {
          targetSizes.push({ w: 138 * 2, h: 24 * 2 }, { w: 138, h: 24 });
        } else if (size.height >= 24) {
          targetSizes.push({ w: 138, h: 24 });
        } else {
          // for convenience, we _always generate a thubmnail even if it
          // is the same as the original encoding (not that in that case
          // it might still have been converted)
          targetSizes.push({ w: size.width, h: size.height });
        }
      } else {
        // For screen we assess how many thumbnail we need. We want thumbnails with max-width of 940px, 640px and 320px.
        if (size.width >= 940) {
          targetSizes.push(
            { w: 940, h: size.height }, // note this will preserve the aspect ratio but force to not overshoot size.height
            { w: 640, h: size.height },
            { w: 320, h: size.height }
          );
        } else if (size.width >= 640) {
          targetSizes.push(
            { w: 640, h: size.height },
            { w: 320, h: size.height }
          );
        } else if (size.width >= 320) {
          targetSizes.push({ w: 320, h: size.height });
        } else {
          // for convenience, we _always generate a thubmnail even if it
          // is the same as the original encoding (not that in that case
          // it might still have been converted)
          targetSizes.push({ w: size.width, h: size.height });
        }
      }

      asyncMap(
        targetSizes,
        function(targetSize, cb) {
          const encodingId = that.uuid({ curiePrefix: 'node' });
          const thumbnailName = `${path.basename(
            encodingName,
            path.extname(encodingName)
          )}-${targetSize.w}w.${target}`;

          let p = gm(buffer);
          if (conversionType === 'screen') {
            // trim white space around image
            p = p
              .borderColor('white')
              .border(1, 1)
              .trim();
          }
          p.resize(targetSize.w, targetSize.h).toBuffer(
            target.toUpperCase(),
            function(err, buffer) {
              if (err) return cb(err);
              gm(buffer).size(function(err, size) {
                if (err) return cb(err);
                // the caller may want to overide the graphId, resourceId... of `action` using `params` hence the Object.assign on param
                that.blobStore.put(
                  Object.assign(mergedParams, {
                    type: 'ImageObject',
                    body: buffer,
                    encodingId: encodingId,
                    name: thumbnailName,
                    fileFormat: targetFileFormat
                  }),
                  (err, encoding) => {
                    if (err) return callback(err);
                    encoding.width = size.width;
                    encoding.height = size.height;
                    encoding.isBasedOn =
                      params.encodingId || getId(action.object);
                    cb(null, encoding);
                  }
                );
              });
            }
          );
        },
        function(err, thumbnails) {
          if (err) return callback(err);
          superEvent.emitEndedEvent();
          callback(null, thumbnails);
        }
      );
    });
  });
}
