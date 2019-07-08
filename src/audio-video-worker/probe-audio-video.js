import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import once from 'once';
import asyncMap from 'async/map';
import { getObjectId } from '@scipe/librarian';

export default function probeAudioVideo(
  root,
  mediaPath,
  action,
  params,
  callback
) {
  if (!callback) {
    callback = params;
    params = {};
  }

  callback = once(callback);

  params = this.getParams(action, params);

  const emitEvent = params.emitEvent || this.emitEvent.bind(this);
  const encodingId = params.encodingId || getObjectId(action);
  const encodingName = path.basename(mediaPath);

  const superEvent = emitEvent(
    action,
    `extracting metadata for ${encodingName}`
  );

  const isVideo = /video/.test(params.fileFormat || action.object.fileFormat);

  ffmpeg(mediaPath).ffprobe((err, data) => {
    if (err) return callback(err);
    let metadata = {};

    if (data.streams) {
      data.streams.forEach(s => {
        if (isVideo) {
          ['height', 'width'].forEach(p => {
            if (p in s) {
              metadata[p] = s[p];
            }
          });
        }
      });
    }

    if (data.format) {
      if (data.format.duration && data.format.duration !== 'N/A') {
        metadata.duration = parseFloat(data.format.duration, 10);
      }
    }

    // for audio, we are done
    if (!isVideo) {
      superEvent.emitEndedEvent();
      return callback(null, metadata);
    }

    // for video, we create thumbnail
    let height, width;
    if (
      metadata.height != null &&
      metadata.width != null &&
      !isNaN(metadata.height) &&
      !isNaN(metadata.height) &&
      typeof metadata.height === 'number' &&
      typeof metadata.width === 'number'
    ) {
      const maxHeight = params.maxHeight || 640;
      const maxWidth = params.maxWidth || 640;

      if (metadata.height <= maxHeight && metadata.width <= maxWidth) {
        width = metadata.width;
        height = '?';
      } else {
        let ar = metadata.height / metadata.width;
        if (ar < 1) {
          width = Math.min(metadata.width, maxWidth);
          height = '?';
        } else {
          height = Math.min(metadata.height, maxHeight);
          width = '?';
        }
      }
    } else if (params.maxWidth != null) {
      width = params.maxWidth;
      height = '?';
    } else if (params.maxHeight != null) {
      height = params.maxHeight;
      width = '?';
    } else {
      width = 640;
      height = '?';
    }

    let thumbAbsPaths;

    const subEvent = superEvent.emitEvent(
      action,
      `extracting thumbnails for ${encodingName}`
    );

    ffmpeg(mediaPath)
      .on('filenames', filenames => {
        thumbAbsPaths = filenames.map(filename => path.join(root, filename));
      })
      .on('error', err => {
        // if error that's OK we simply won't have the thumbnail, we
        // just log the error and keep going
        this.log.error(
          { err },
          `error extracting thumbnail for ${encodingName}`
        );
        subEvent.emitEndedEvent();
        superEvent.emitEndedEvent();
        callback(null, metadata);
      })
      .on('end', () => {
        asyncMap(
          thumbAbsPaths.sort(),
          (thumbAbsPath, cb) => {
            this.blobStore.put(
              Object.assign({}, params, {
                type: 'ImageObject',
                body: fs.createReadStream(thumbAbsPath),
                encodingId: this.uuid({ curiePrefix: 'node' }),
                name: path.basename(thumbAbsPath),
                fileFormat: 'image/png'
              }),
              (err, encoding) => {
                if (err) {
                  this.log.error(
                    { err },
                    `error saving thumbnail for ${thumbAbsPath}`
                  );
                  return cb(null, null);
                }
                if (height !== '?') {
                  encoding.height = height;
                }
                if (width !== '?') {
                  encoding.width = width;
                }
                encoding.isBasedOn = encodingId;
                cb(null, encoding);
              }
            );
          },
          (err, thumbnails) => {
            if (err) return callback(err);
            thumbnails = thumbnails
              .filter(thumbnails => thumbnails)
              .map((thumbnail, i) => Object.assign(thumbnail, { position: i }));
            if (thumbnails.length) {
              metadata.thumbnail = thumbnails;
            }
            subEvent.emitEndedEvent();
            superEvent.emitEndedEvent();
            callback(null, metadata);
          }
        );
      })
      .screenshots({
        timestamps: ['1%', '25%', '50%', '75%', '99%'],
        filename: `${path.basename(mediaPath, path.extname(mediaPath))}-%i.png`,
        folder: root,
        size: `${width}x${height}`
      });
  });
}
