import { basename } from 'path';
import { createReadStream } from 'fs';
import assert from 'assert';
import asyncEachSeries from 'async/eachSeries';
import { createId } from '@scipe/librarian';
import {
  getId,
  contextUrl,
  frame as _frame,
  textify as _textify
} from '@scipe/jsonld';

import DocumentWorker from '../';
import { DOCX } from './utils';

export function makeTestLog(rxList = []) {
  let logger = (err, message) => {
    if (rxList.some(rx => rx.test(message))) return;
    console.error(`Unexpected error: '${message}'`);
    process.nextTick(() => assert.ifError(err));
  };
  return {
    error: logger,
    warn: logger
  };
}

export function processDocx(options, callback) {
  if (typeof options === 'string') options = { docx: options };
  let { docx, unroledIdToRoleIdMap } = options;

  let w =
    options.worker ||
    new DocumentWorker({
      log: { level: 'error', name: 'document-worker' },
      nWorkers: 1
    });
  let graphId = `${w.uuid({ curiePrefix: 'graph' })}`;

  if (options.log) w.log = options.log;

  const resourceId = w.uuid({ curiePrefix: 'node' });

  w.blobStore.put(
    {
      name: basename(docx),
      graphId,
      type: 'DocumentObject',
      body: createReadStream(docx),
      resourceId,
      isNodeOfId: graphId,
      encodesCreativeWork: resourceId,
      encodingId: w.uuid({ curiePrefix: 'node' }),
      fileFormat: DOCX
    },
    (err, encoding) => {
      if (err) {
        return callback(err);
      }
      let action = Object.assign(
        { '@type': 'DocumentProcessingAction' },
        options.action || { agent: 'user:agentId' },
        createId('action', null, graphId),
        { object: encoding }
      );

      w.convertDocument(action, { unroledIdToRoleIdMap }, (err, ctx) => {
        if (err) {
          return callback(err);
        }
        callback(null, ctx, w);
      });
    }
  );
}

export function comparableJSONLD(obj, textify = false) {
  const skipKeys = [
    'contentUrl',
    'dateCreated',
    'contentSize',
    'contentChecksum',
    'id',
    'isNodeOf'
  ];

  return JSON.parse(
    JSON.stringify(obj, (k, v) => {
      if (~skipKeys.indexOf(k) || v === '') return;

      if (textify === true && v['@type'] === 'rdf:HTML' && v['@value']) {
        return _textify(v);
      }

      if (
        (k === '@id' || k === 'resourceOf') &&
        /^\.?(?:scipe:|scienceai:|graph:|role:|node:|tmp:|anon:|_:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i.test(
          v
        )
      ) {
        return;
      }

      if (
        k === 'isPartOf' &&
        /^(?:scipe:|scienceai:|graph:|node:|tmp:|anon:|_:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i.test(
          v
        )
      ) {
        return;
      }

      if (k === 'about' && /^node:/.test(v)) {
        return;
      }

      if (
        (k === 'author' || k === 'contributor') &&
        /^(?:role:|_:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i.test(v)
      ) {
        return;
      }

      if (k === '@id' && /^_:b\d+/i.test(v)) {
        return;
      }

      if (
        k === 'tag' &&
        /^_?(?:scipe_|scienceai_|node_|tmp_|anon_|__)?[0-9a-f]{8}_(?:[0-9a-f]{4}_){3}[0-9a-f]{12}/i.test(
          v
        )
      ) {
        return;
      }

      if (k === 'isBasedOn' && v.every(val => typeof val === 'string')) return;

      if (k === 'encodesCreativeWork' && typeof v === 'string') return;

      // if (k === 'url' && /^#SA_REF_ANCHOR_/) return;

      if (k === 'funder' && v && !Array.isArray(v)) return [v];

      if (k === 'sameAs') {
        if (Array.isArray(v)) {
          let filtered = v.filter(val => !/^_:/.test(val));
          if (!filtered.length) return;
          return filtered;
        }
        if (/^_:/.test(v)) return;
      }

      return v;
    })
  );
}

// TODO delete + delete testOnlyFigureBodyCache in the source code
// that thing can lead to misleading tests as it doesn't take into account potential race condition in the way the encoding are saved to blob store
// => delete it and get the blob from the blob store in tests instead (see test-docx-table.js for example) or using reImportHtmlResources
export function reImportFigures(ctx) {
  Array.from(
    ctx.doc.querySelectorAll('figure[resource], aside[resource]')
  ).forEach(fig => {
    let rid = fig.getAttribute('resource');
    if (ctx.testOnlyFigureBodyCache[rid])
      fig.innerHTML = ctx.testOnlyFigureBodyCache[rid];
  });
}

export function reImportHtmlResources(ctx, w, callback) {
  asyncEachSeries(
    Array.from(ctx.doc.querySelectorAll('figure[resource], aside[resource]')),
    (fig, cb) => {
      const resourceId = fig.getAttribute('resource');

      const resource = ctx.store.get(resourceId);
      const encodingId = resource.encoding
        .concat(resource.distribution)
        .find(encodingId => {
          const encoding = ctx.store.get(encodingId);
          return (
            encoding &&
            encoding.fileFormat &&
            encoding.fileFormat.includes('text/html')
          );
        });

      w.blobStore.get(
        {
          graphId: ctx.graphId,
          resourceId: getId(resourceId),
          encodingId: getId(encodingId),
          decompress: true
        },
        (err, blob) => {
          if (err) {
            return cb(err);
          }
          fig.innerHTML = blob.toString();
          cb(null);
        }
      );
    },
    callback
  );
}

export function frame(ctx, cb) {
  ctx.store.graph((err, graph) => {
    if (err) return cb(err);
    graph['@context'] = contextUrl;
    _frame(
      graph,
      { '@id': ctx.resource.$id, '@context': contextUrl, '@embed': '@always' },
      { preserveUuidBlankNodes: true },
      cb
    );
  });
}

export function getResource(el, store) {
  let resID;
  if (el.localName === 'figure' || el.localName === 'aside') {
    resID = el.getAttribute('resource');
  } else {
    resID = el.parentNode.getAttribute('resource');
  }
  return store.get(resID);
}
