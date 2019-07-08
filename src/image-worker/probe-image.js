import { PassThrough } from 'stream';
import asyncParallel from 'async/parallel';
import path from 'path';
import pHash from 'phash-imagemagick';

export default function probeImage(s, action, params, callback) {
  if (!callback) {
    callback = params;
    params = {};
  }

  const emitEvent = params.emitEvent || this.emitEvent.bind(this);
  const encodingName = path.basename(params.name || action.object.name);

  let toThumbNail = s.pipe(new PassThrough());
  let toMetadata = s.pipe(new PassThrough());

  asyncParallel(
    {
      thumbnail: cb => {
        // `this.thumbnail` will do the logging
        this.thumbnail(toThumbNail, action, params, cb);
      },
      metadata: cb => {
        const superEvent = emitEvent(
          action,
          `extracting metadata for ${encodingName}`
        );

        pHash.get(toMetadata, (err, metadata) => {
          superEvent.emitEndedEvent();
          if (err) return cb(err);

          let encodingMetadata = {};

          // schemaOrgify the metadata
          if (metadata.pHash) {
            encodingMetadata.contentChecksum = {
              '@type': 'PerceptualHash',
              checksumAlgorithm: 'pHash',
              checksumValue: metadata.pHash
            };
          }

          ['width', 'height'].forEach(p => {
            if (metadata[p]) {
              encodingMetadata[p] = metadata[p];
            }
          });

          // exifData
          let exifData = [];

          if (metadata.ppi) {
            if (metadata.ppi.width && metadata.ppi.height) {
              exifData.push({
                '@type': 'PropertyValue',
                propertyID: 'resolution',
                value: `${metadata.ppi.width}x${metadata.ppi.height}`,
                unitText: 'ppi'
              });
            }
          }

          // TODO add more property (see phash-imagemagick)
          ['colorType'].forEach(p => {
            if (metadata[p]) {
              exifData.push({
                '@type': 'PropertyValue',
                propertyID: p,
                value: metadata[p]
              });
            }
          });

          if (exifData.length) {
            encodingMetadata.exifData = exifData;
          }

          cb(null, encodingMetadata);
        });
      }
    },
    (err, res) => {
      if (err) return callback(err);

      if (res.thumbnail) {
        res.metadata.thumbnail = res.thumbnail;
      }
      return callback(err, res.metadata);
    }
  );
}
