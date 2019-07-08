import { PassThrough } from 'stream';
import once from 'once';
import uniqBy from 'lodash/uniqBy';
import isPlainObject from 'lodash/isPlainObject';
import asyncParallel from 'async/parallel';
import { getObject } from '@scipe/librarian';
import { getId, arrayify, flatten } from '@scipe/jsonld';
import probeImage from './probe-image';
import thumbnail from './thumbnail';
import convertImage from './convert-image';
import { DbWorker } from '../';

export default class ImageWorker extends DbWorker {
  constructor(config = {}) {
    config = Object.assign(
      {
        type: 'ImageProcessingAction'
      },
      config
    );
    if (!config.log) {
      config.log = { name: 'image-worker' };
    }
    super(config);
  }

  handleAction(action, callback) {
    callback = once(callback);

    const params = this.getParams(action);
    const encoding = getObject(action);

    let superEvent = this.emitEvent(action, `processing ${encoding.name}`);
    let readStream = this.blobStore.get(
      Object.assign({}, params, { encodingId: encoding['@id'] })
    );
    readStream.on('error', callback);

    let toMetadata = readStream.pipe(new PassThrough());

    let tasks = {
      metadata: cb => {
        this.probeImage(
          toMetadata,
          action,
          { emitEvent: superEvent.emitEvent },
          cb
        );
      }
    };

    if (
      !/image\/png/.test(encoding.fileFormat) &&
      !/image\/jpeg/.test(encoding.fileFormat)
    ) {
      let toConverted = readStream.pipe(new PassThrough());
      tasks.converted = cb => {
        this.convertImage(
          toConverted,
          'image/png',
          action,
          { emitEvent: superEvent.emitEvent },
          cb
        );
      };
    }

    asyncParallel(tasks, (err, res) => {
      if (err) return callback(err);

      const nextEncoding = Object.assign({}, encoding);
      Object.keys(res.metadata).forEach(p => {
        // be sure to merge the contentChecksum
        if (p === 'contentChecksum') {
          nextEncoding[p] = uniqBy(
            arrayify(nextEncoding[p]).concat(res.metadata[p]),
            checksum =>
              `${checksum.checksumAlgorithm || ''}-${checksum.checksumValue ||
                getId(checksum) ||
                ''}`
          );
        } else {
          nextEncoding[p] = res.metadata[p];
        }
      });

      const transcodedEncodings = [nextEncoding];
      if (res.converted) {
        transcodedEncodings.push(res.converted);
      }

      maybeFlatten(transcodedEncodings, params, (err, transcodedEncodings) => {
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
      });
    });
  }
}

ImageWorker.prototype.probeImage = probeImage;
ImageWorker.prototype.thumbnail = thumbnail;
ImageWorker.prototype.convertImage = convertImage;

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
