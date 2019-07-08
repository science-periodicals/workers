import fs from 'fs';
import path from 'path';
import once from 'once';
import tmp from 'tmp';
import uuid from 'uuid';
import isPlainObject from 'lodash/isPlainObject';
import pickBy from 'lodash/pickBy';
import omit from 'lodash/omit';
import { getId, arrayify } from '@scipe/jsonld';
import { getObject, createId } from '@scipe/librarian';
import DataStore from './lib/data-store';
import { MediaObject } from './lib/types';
import docx2html from './docx2html';
import { DOCX, DS3, HTML } from './lib/utils';
import { AudioVideoWorker } from '..';
import postProcessHtml from './post-process-html';

export default class DocumentWorker extends AudioVideoWorker {
  constructor(config = {}) {
    config = Object.assign({ type: 'DocumentProcessingAction' }, config);
    if (!config.log) config.log = { name: 'document-worker' };
    super(config);
    this.CURIE_PREFIX = 'scienceai';
  }

  handleAction(action, callback) {
    callback = once(callback);
    if (!action.result) {
      return callback(new Error('Action needs to have a defined result'));
    }

    const superEvent = this.emitEvent(
      action,
      `Processing ${action.object.name}`
    );

    // Note: we use a `params` props attached to the `action` to pass additional params (such as `unroledIdToRoleIdMap`)
    const params = Object.assign(
      { emitEvent: superEvent.emitEvent },
      action.params
    );
    action = omit(action, ['params']); // We take care to remove the `params` from the action so that they are not leaked to the user when the worker re-emit the action

    this.convertDocument(action, params, (err, ctx) => {
      if (err) {
        superEvent.emitEndedEvent();
        return callback(err);
      }

      let wasEnded = false;
      try {
        ctx.store.graph((err, flattened) => {
          const handledAction = Object.assign({}, action, {
            actionStatus: 'CompletedActionStatus',
            result: Object.assign(
              {
                '@type': 'UpdateAction',
                actionStatus: 'PotentialActionStatus', // may be overwritten by action.result. In particular an actionStatus of CompletedActionStatus indicates that the worker should apply the update
                mergeStrategy: 'ReconcileMergeStrategy',
                agent: action.agent,
                object: flattened,
                startTime: new Date().toISOString(),
                targetCollection: ctx.graphId
              },
              isPlainObject(action.result)
                ? action.result
                : getId(action.result)
                ? { '@id': getId(action.result) }
                : undefined
            ),
            endTime: new Date().toISOString()
          });

          if (ctx.errors.length) {
            handledAction.error = ctx.errors;
          }
          if (ctx.warnings.length) {
            handledAction.warning = ctx.warnings;
          }

          superEvent.emitEndedEvent();
          wasEnded = true;
          callback(null, handledAction);
        });
      } catch (err) {
        if (!wasEnded) {
          superEvent.emitEndedEvent();
        }
        callback(err);
      }
    });
  }

  convertDocument(action, params = {}, callback) {
    callback = once(callback);
    const emitEvent = params.emitEvent || this.emitEvent.bind(this);
    params = Object.assign(this.getParams(action, params), { emitEvent });

    const { graphId, isNodeOfId } = params;
    if (!graphId) {
      return callback(new Error(`${action['@type']} could not infer graphId`));
    }

    const errors = [];
    const warnings = [];

    const makeLog = (self, type) => (data, msg) => {
      // this follow the bunyan API (data can be an instance of Error or an object, msg is optional and if present a string)
      let err =
        data instanceof Error
          ? data
          : data.err && data.err instanceof Error
          ? data.err
          : undefined;

      if (err) {
        if (err.alreadyLogged) {
          return;
        }
        err.alreadyLogged = true;
      }

      // if there is an element (HTML element) we set an id so we can turn the error / warn into an annotaiton
      let htmlId;
      if (data.element) {
        if (!data.element.hasAttribute('id')) {
          data.element.setAttribute('id', uuid.v4());
        }
        htmlId = data.element.getAttribute('id');
        data.element = htmlId;
      }

      // Persist errors and warnings
      // Note the htmlId will be turned into a proper annotation further downstream once we know the @id of the RDFa encoding
      if (type == 'warn') {
        warnings.push(
          pickBy({
            '@id': createId('blank')['@id'],
            '@type': 'Warning',
            name: data.name,
            description: msg,
            htmlId
          })
        );
      } else if (type === 'error') {
        errors.push(
          pickBy({
            '@id': createId('blank')['@id'],
            '@type': 'Error',
            statusCode: err && err.code,
            name: data.name || (err && err.name),
            description: msg || (err && err.message),
            htmlId
          })
        );
      }

      if (self.log && self.log[type]) {
        self.log[type](data, msg);
      }
    };

    const log = {
      trace: makeLog(this, 'trace'),
      debug: makeLog(this, 'debug'),
      info: makeLog(this, 'info'),
      error: makeLog(this, 'error'),
      warn: makeLog(this, 'warn'),
      fatal: makeLog(this, 'fatal')
    };

    const ctx = {
      graphId,
      isNodeOfId: isNodeOfId || graphId,
      log,
      action,
      unroledIdToRoleIdMap: params.unroledIdToRoleIdMap || {}, // this is used to avoid to re-create new roles for authors and contributors on each document transformation
      encodings: [],
      botName: `bot:${this.constructor.name}`,
      curiePrefix: '_',
      blobStore: this.blobStore,
      uuid: this.uuid.bind(this),
      worker: this,
      emitEvent: emitEvent,
      errors,
      warnings
    };

    const store = new DataStore(ctx.uuid, ctx);

    const resource = store.createScholarlyArticle(
      {
        '@id': params.resourceId,
        creator: `bot:${this.constructor.name}`,
        resourceOf: graphId
      },
      { curiePrefix: 'node' }
    );

    const encoding = MediaObject.fromJSON(store, getObject(action));
    resource.addEncoding(encoding);

    ctx.resource = resource;
    ctx.store = store;

    let contentType = encoding.fileFormat.split(';')[0].trim();

    tmp.dir({ unsafeCleanup: true }, (err, root) => {
      if (err) return callback(err);
      const encName = encoding.name
        .replace(/\.+/g, '.')
        .replace(/[^\w\.]/g, '_');

      const sourcePath = path.join(root, encName);

      ctx.sourcePath = sourcePath;
      ctx.root = root;

      let s = this.blobStore.get(params);
      s.on('error', callback);
      s = s.pipe(fs.createWriteStream(sourcePath));
      s.on('finish', () => {
        convert(ctx, contentType, (err, ctx) => {
          if (err) return callback(err);
          callback(null, ctx);
        });
      });
    });
  }
}

function convert(ctx, contentType, callback) {
  const next = (err, ctx) => {
    if (err) return callback(err);

    postProcessHtml(ctx, (err, ctx) => {
      if (err) return callback(err);
      const {
        store,
        log,
        doc,
        action,
        blobStore,
        graphId,
        isNodeOfId,
        resource,
        uuid
      } = ctx;
      const object = getObject(action);
      const body = `<!DOCTYPE html>\n${
        doc
          ? doc.documentElement.outerHTML
          : '<html><head></head><body></body></html>'
      }`;
      const name = `${path.basename(
        object.name || 'document',
        contentType === DS3 ? '.ds3.docx' : path.extname(object.name)
      )}.html`;

      blobStore.put(
        {
          '@type': 'DocumentObject',
          body,
          graphId,
          isNodeOfId,
          resourceId: resource.$id,
          encodesCreativeWork: resource.$id,
          encodingId: uuid({ curiePrefix: 'node' }),
          fileFormat: HTML,
          name
        },
        (err, rdfaEncoding) => {
          if (err) {
            log.error(
              err,
              `Failure storing encoding '${name}' of type ${HTML}`
            );
          }
          rdfaEncoding.isBasedOn = getId(object);
          rdfaEncoding = MediaObject.fromJSON(store, rdfaEncoding);

          resource.addEncoding(rdfaEncoding);

          const uncaptionedImageEncodings = arrayify(ctx.encodings).filter(
            data => data.type === 'uncaptionedImage'
          );

          // List the uncaptionedImageEncodings in the `image` prop of the container encodings
          // Note we need to do that at the verry end so that the rdfa encoding is defined
          uncaptionedImageEncodings.forEach(
            ({ encoding, parentResourceId }) => {
              const parentResource = store.get(parentResourceId);

              if (encoding && parentResource) {
                // find the HTML encoding within resource and list the encoding in the `image` prop
                const htmlEncoding = parentResource.encoding
                  .map(store.mapper())
                  .find(encoding => encoding.fileFormat === 'text/html');

                if (htmlEncoding) {
                  htmlEncoding.addImage(encoding);
                }
              }
            }
          );

          // post process error and warnings now that we know the rdfEncoding @id
          ctx.errors.concat(ctx.warnings).forEach(data => {
            if (data.htmlId) {
              data.about = {
                '@type': 'TargetRole',
                about: getId(rdfaEncoding),
                hasSelector: {
                  '@type': 'HtmlSelector',
                  htmlId: data.htmlId
                }
              };
              delete data.htmlId;
            }
          });

          callback(null, ctx);
        }
      );
    });
  };

  switch (contentType) {
    case DS3:
      ctx.mode = 'ds3';
      docx2html(ctx, next);
      break;

    case DOCX:
      ctx.mode = 'docx';
      docx2html(ctx, next);
      break;

    default:
      callback(new Error('unsupported format'));
      break;
  }
}
