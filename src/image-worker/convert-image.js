import { PassThrough } from 'stream';
import path from 'path';
import gm from 'gm';
import asyncParallel from 'async/parallel';
import mime from 'mime-types';
import uniqBy from 'lodash/uniqBy';
import { getObjectId } from '@scipe/librarian';
import { getId, arrayify } from '@scipe/jsonld';

export default function convertImage(
  s,
  targetFileFormat,
  action,
  params,
  callback
) {
  if (!callback) {
    callback = params;
    params = {};
  }

  let target;
  switch (targetFileFormat) {
    case 'image/png':
    case 'image/jpeg':
      target = mime.extension(targetFileFormat);
      break;

    default:
      return callback(new Error('unsuported content target'));
  }

  const emitEvent = params.emitEvent || this.emitEvent.bind(this);
  const convertedEncodingId = this.uuid({ curiePrefix: 'node' });
  const encodingName = path.basename(params.name || action.object.name);
  const superEvent = emitEvent(
    action,
    `converting ${encodingName} to ${targetFileFormat}`
  );

  const convertedEncodingName =
    path.basename(encodingName, path.extname(encodingName)) +
    '.' +
    mime.extension(targetFileFormat);

  let convertedStream = gm(s, encodingName).stream(target);

  let toEncoding = convertedStream.pipe(new PassThrough());
  let toMetadata = convertedStream.pipe(new PassThrough());

  params = this.getParams(action, params);

  asyncParallel(
    {
      encoding: cb => {
        this.blobStore.put(
          Object.assign({}, params, {
            type: 'ImageObject',
            body: toEncoding,
            encodingId: convertedEncodingId,
            name: convertedEncodingName,
            fileFormat: targetFileFormat
          }),
          (err, encoding, _) => {
            cb(err, encoding);
          }
        );
      },
      metadata: cb => {
        this.probeImage(
          toMetadata,
          action,
          Object.assign({}, params, {
            encodingId: convertedEncodingId,
            name: convertedEncodingName,
            emitEvent: emitEvent
          }),
          cb
        );
      }
    },
    (err, res) => {
      if (err) {
        superEvent.emitEndedEvent();
        return callback(err);
      }

      let convertedEncoding = res.encoding;
      convertedEncoding.isBasedOn = params.encodingId || getObjectId(action);

      Object.keys(res.metadata).forEach(p => {
        if (p === 'contentChecksum') {
          convertedEncoding[p] = uniqBy(
            arrayify(convertedEncoding[p]).concat(res.metadata[p]),
            checksum =>
              `${checksum.checksumAlgorithm || ''}-${checksum.checksumValue ||
                getId(checksum) ||
                ''}`
          );
        } else {
          convertedEncoding[p] = res.metadata[p];
        }
      });

      superEvent.emitEndedEvent();
      callback(null, convertedEncoding);
    }
  );
}
