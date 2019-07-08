import fs from 'fs';
import path from 'path';
import once from 'once';
import asyncParallel from 'async/parallel';
import ffmpeg from 'fluent-ffmpeg';
import mime from 'mime-types';
import { getObjectId } from '@scipe/librarian';

export default function(
  root,
  mediaPath,
  targetFileFormat,
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

  const transcodedEncodingName =
    path.basename(mediaPath, path.extname(mediaPath)) +
    '.' +
    mime.extension(targetFileFormat);
  const transcodedEncodingId = this.uuid({ curiePrefix: 'node' });

  const superEvent = emitEvent(
    action,
    `transcoding ${path.basename(mediaPath)} into ${transcodedEncodingName}`
  );

  let c = ffmpeg(mediaPath);
  if (targetFileFormat === 'video/webm') {
    c = c
      .audioCodec('libvorbis')
      .videoCodec('libvpx')
      .addOption('-pix_fmt yuv420p')
      .format('webm');
  } else if (targetFileFormat === 'video/mp4') {
    c = c
      .audioCodec('aac')
      .videoCodec('libx264')
      .addOption('-pix_fmt yuv420p')
      .format('mp4');
  } else if (targetFileFormat === 'video/ogg') {
    c = c
      .audioCodec('libvorbis')
      .videoCodec('libtheora')
      .addOption('-pix_fmt yuv420p')
      .format('ogg');
  } else if (targetFileFormat === 'audio/mpeg') {
    c = c
      .audioCodec('libmp3lame')
      .audioQuality(0)
      .addOption('-map 0:a:0')
      .format('mp3');
  } else if (targetFileFormat === 'audio/ogg') {
    c = c
      .audioCodec('libvorbis')
      .audioQuality(10)
      .addOption('-map 0:a:0')
      .format('ogg');
  } else {
    return callback(new Error('unsuported content target'));
  }

  const transcodedPath = path.join(root, transcodedEncodingName);
  c
    .on('start', commandLine => {
      superEvent.emitEvent(action, {
        progress: {
          '@type': 'QuantitativeValue',
          value: 0
        }
      });
    })
    .on('progress', progress => {
      // Note for some reasons, percent is not always defined
      // see https://github.com/fluent-ffmpeg/node-fluent-ffmpeg/issues/621
      if (progress && progress.percent != null) {
        superEvent.emitEvent(action, {
          progress: {
            '@type': 'QuantitativeValue',
            value: progress.percent
          }
        });
      }
    })
    .on('error', err => {
      callback(err);
    })
    .on('end', () => {
      superEvent.emitEvent(action, {
        progress: {
          '@type': 'QuantitativeValue',
          value: 100
        }
      });
      asyncParallel(
        {
          encoding: cb => {
            this.blobStore.put(
              Object.assign({}, params, {
                type: targetFileFormat.startsWith('audio')
                  ? 'AudioObject'
                  : 'VideoObject',
                body: fs.createReadStream(transcodedPath),
                encodingId: transcodedEncodingId,
                name: transcodedEncodingName,
                fileFormat: targetFileFormat
              }),
              (err, encoding, _) => {
                cb(err, encoding);
              }
            );
          },
          metadata: cb => {
            this.probeAudioVideo(
              root,
              transcodedPath,
              action,
              {
                encodingId: transcodedEncodingId,
                emitEvent: superEvent.emitEvent
              },
              cb
            );
          }
        },
        (err, res) => {
          if (err) return callback(err);

          const transcodedEncoding = res.encoding;
          transcodedEncoding.isBasedOn =
            params.encodingId || getObjectId(action);

          Object.keys(res.metadata).forEach(p => {
            if (!(p in transcodedEncoding)) {
              transcodedEncoding[p] = res.metadata[p];
            }
          });

          superEvent.emitEndedEvent();

          callback(null, transcodedEncoding);
        }
      );
    })
    .output(transcodedPath)
    .run();
}
