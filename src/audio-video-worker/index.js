import os from 'os';
import uuid from 'uuid';
import rimraf from 'rimraf';
import fs from 'fs';
import path from 'path';
import once from 'once';
import isPlainObject from 'lodash/isPlainObject';
import omit from 'lodash/omit';
import asyncParallel from 'async/parallel';
import asyncMap from 'async/map';
import uniqBy from 'lodash/uniqBy';
import { getId, arrayify, flatten } from '@scipe/jsonld';
import { ImageWorker } from '../';
import probeAudioVideo from './probe-audio-video';
import transcodeAudioVideo from './transcode-audio-video';

export default class AudioVideoWorker extends ImageWorker {
  constructor(config = {}) {
    config = Object.assign(
      {
        type: 'AudioVideoProcessingAction'
      },
      config
    );
    if (!config.log) {
      config.log = { name: 'audio-video-worker' };
    }

    super(config);
  }

  handleAction(action, callback) {
    callback = once(callback);

    const root = path.join(os.tmpdir(), uuid.v4());

    fs.mkdir(root, err => {
      if (err) return callback(err);

      const params = this.getParams(action);
      action = omit(action, ['params']); // We take care to remove the `params` from the action so that they are not leaked to the user when the worker re-emit the action

      const encoding = action.object;
      const mediaPath = path.join(root, encoding.name);

      const superEvent = this.emitEvent(action, `processing ${encoding.name}`);

      const readStream = this.blobStore
        .get(Object.assign({}, params, { encodingId: encoding['@id'] }))
        .on('error', callback);

      const writeStream = readStream
        .pipe(fs.createWriteStream(mediaPath))
        .on('error', callback);

      writeStream.on('finish', () => {
        asyncParallel(
          {
            metadata: cb => {
              this.probeAudioVideo(root, mediaPath, action, superEvent, cb);
            },
            transcodedEncodings: cb => {
              const contentType = encoding.fileFormat.split(';')[0].trim();
              const type = contentType.split('/')[0];

              let targetContentTypes = [];
              if (type === 'video') {
                ['video/webm', 'video/mp4', 'video/ogg'].forEach(
                  targetContentType => {
                    if (contentType !== targetContentType) {
                      targetContentTypes.push(targetContentType);
                    }
                  }
                );
              } else if (type === 'audio') {
                ['audio/mpeg', 'audio/ogg'].forEach(targetContentType => {
                  if (contentType !== targetContentType) {
                    targetContentTypes.push(targetContentType);
                  }
                });
              }

              asyncMap(
                targetContentTypes,
                (targetContentType, cb) => {
                  this.transcodeAudioVideo(
                    root,
                    mediaPath,
                    targetContentType,
                    action,
                    superEvent,
                    cb
                  );
                },
                cb
              );
            }
          },
          (err, res) => {
            // Note: `err` is handled after rimraf
            rimraf(root, errRimraf => {
              if (errRimraf) this.log.debug(errRimraf);
              if (err) return callback(err);

              const nextEncoding = Object.assign({}, encoding);
              Object.keys(res.metadata).forEach(p => {
                // be sure to merge the contentChecksum
                if (p === 'contentChecksum') {
                  nextEncoding[p] = uniqBy(
                    arrayify(nextEncoding[p]).concat(res.metadata[p]),
                    checksum =>
                      `${checksum.checksumAlgorithm ||
                        ''}-${checksum.checksumValue || getId(checksum) || ''}`
                  );
                } else {
                  nextEncoding[p] = res.metadata[p];
                }
              });

              const transcodedEncodings = [nextEncoding].concat(
                res.transcodedEncodings
              );

              maybeFlatten(
                transcodedEncodings,
                params,
                (err, transcodedEncodings) => {
                  if (err) return callback(err);

                  const handledAction = Object.assign({}, action, {
                    actionStatus: 'CompletedActionStatus',
                    result: Object.assign(
                      {
                        '@type': 'UpdateAction',
                        actionStatus: 'PotentialActionStatus', // may be overwritten by action.result. In particular an actionStatus of CompletedActionStatus indicates that the worker should apply the update
                        mergeStrategy: 'OverwriteMergeStrategy',
                        agent: action.agent,
                        object: transcodedEncodings,
                        startTime: new Date().toISOString(),
                        targetCollection: getId(encoding.isNodeOf)
                      },
                      isPlainObject(action.result)
                        ? action.result
                        : getId(action.result)
                        ? { '@id': getId(action.result) }
                        : undefined
                    ),
                    endTime: new Date().toISOString()
                  });

                  superEvent.emitEndedEvent();
                  callback(null, handledAction);
                }
              );
            });
          }
        );
      });
    });
  }
}

AudioVideoWorker.prototype.probeAudioVideo = probeAudioVideo;
AudioVideoWorker.prototype.transcodeAudioVideo = transcodeAudioVideo;

function maybeFlatten(transcodedEncodings, params, callback) {
  if (!params.flattenUpdateActionResult) {
    return callback(null, {
      encoding:
        transcodedEncodings.length > 1
          ? transcodedEncodings
          : transcodedEncodings[0]
    });
  }

  const updatePayload = {
    '@id': params.resourceId,
    encoding: transcodedEncodings
  };

  flatten(updatePayload, { preserveUuidBlankNodes: true }, (err, flattened) => {
    if (err) {
      return callback(err);
    }

    callback(null, { '@graph': flattened['@graph'] });
  });
}
