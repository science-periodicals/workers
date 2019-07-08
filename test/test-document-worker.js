const assert = require('assert');
const fs = require('fs');
const path = require('path');
import { createId } from '@scipe/librarian';
const { DocumentWorker } = require('../src');
const { HTML, DS3 } = require('../src/document-worker/lib/utils');

const docxPath = path.join(
  __dirname,
  'fixtures',
  'document-worker',
  'minimal.ds3.docx'
);

describe('DocumentWorker', function() {
  this.timeout(10000);

  let w, graphId, encoding;
  before(done => {
    w = new DocumentWorker({
      log: { level: 'error', name: 'document-worker' }
    });
    graphId = w.uuid({ curiePrefix: 'graph' });
    const resourceId = w.uuid({ curiePrefix: 'node' });

    w.blobStore.put(
      {
        name: path.basename(docxPath),
        graphId,
        type: 'DocumentObject',
        body: fs.createReadStream(docxPath),
        resourceId,
        isNodeOfId: graphId,
        encodesCreativeWork: resourceId,
        encodingId: w.uuid({ curiePrefix: 'node' }),
        fileFormat: DS3
      },
      (err, _encoding) => {
        if (err) return done(err);
        encoding = _encoding;
        done();
      }
    );
  });

  // TODO test convertDocument

  it('should handleAction', done => {
    const action = Object.assign(createId('action', null, graphId), {
      '@type': 'DocumentProcessingAction',
      actionStatus: 'PotentialActionStatus',
      object: encoding,
      result: w.uuid({ curiePrefix: 'action' })
    });

    w.handleAction(action, (err, action) => {
      if (err) return done(err);
      const updateAction = action.result;
      const nodes = updateAction.object['@graph'];
      const originalEncoding = nodes.find(node => node.fileFormat === DS3);
      const htmlEncoding = nodes.find(node => node.fileFormat === HTML);

      // console.log(require('util').inspect(action, { depth: null }));

      assert(nodes.length);
      assert.equal(originalEncoding.contentChecksum.length, 1);
      assert.equal(htmlEncoding.contentChecksum.length, 1);

      assert(action);
      done();
    });
  });

  it('should error if handle action cannot get blob', done => {
    const action = Object.assign(createId('action', null, graphId), {
      agent: 'user:userId',
      object: Object.assign({}, encoding, { '@id': 'missing' }),
      result: w.uuid({ curiePrefix: 'action' })
    });

    w.handleAction(action, err => {
      assert(err);
      done();
    });
  });
});
