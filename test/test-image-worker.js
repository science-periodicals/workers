import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { createId } from '@scipe/librarian';
import { ImageWorker } from '../src';

describe.only('ImageWorker', function() {
  this.timeout(100000);

  var w, sourceEncoding;
  var sourcePath = path.join(
    __dirname,
    'fixtures',
    'image-worker',
    'fig1.tiff'
  );

  before(function(done) {
    w = new ImageWorker({
      blobStorageBackend: 'fs',
      log: { name: 'image-worker', level: 'error' }
    });

    w.blobStore.put(
      {
        type: 'ImageObject',
        path: sourcePath,
        graphId: 'graph:graphId',
        resourceId: 'node:resourceId',
        encodingId: 'node:encodingId',
        encodesCreativeWork: 'node:resourceId',
        isNodeOfId: 'graph:graphId',
        name: path.basename(sourcePath)
      },
      function(err, encoding) {
        if (err) return done(err);
        sourceEncoding = encoding;
        done();
      }
    );
  });

  it('should create a thumbnail encoding', function(done) {
    w.thumbnail(
      fs.createReadStream(sourcePath),
      { object: sourceEncoding },
      {
        graphId: 'graph:graphId',
        resourceId: 'node:resourceId',
        encodingId: 'node:encodingId',
        name: path.basename(sourcePath)
      },
      function(err, thumbnails) {
        if (err) return done(err);
        // console.log(require('util').inspect(thumbnails, { depth: null }));
        assert.equal(thumbnails.length, 3);
        done();
      }
    );
  });

  it('should get the source encoding metadata (including thumbnail)', function(done) {
    w.probeImage(
      fs.createReadStream(sourcePath),
      { object: sourceEncoding },
      {
        graphId: 'graph:graphId',
        resourceId: 'node:resourceId',
        encodingId: 'node:encodingId',
        name: path.basename(sourcePath)
      },
      function(err, metadata) {
        if (err) return done(err);
        assert.equal(metadata.width, 4251);
        done();
      }
    );
  });

  it('should convert to PNG', function(done) {
    w.convertImage(
      fs.createReadStream(sourcePath),
      'image/png',
      { object: sourceEncoding },
      {
        graphId: 'graph:graphId',
        resourceId: 'node:resourceId',
        encodingId: 'node:encodingId',
        isNodeOfId: 'graph:graphId',
        name: path.basename(sourcePath)
      },
      function(err, encoding) {
        if (err) return done(err);
        // Note: encoding.contentSize may be slightly different on different platforms due to variations in library versions
        // For example, on Mac OS X, Homebrew installs libtiff4 with imagemagick,
        // whereas libtiff5 comes on the latest stable version of debian linux, jessie.
        assert(Math.abs(encoding.contentSize - 366811) < 20);
        done();
      }
    );
  });

  it('should handle action', function(done) {
    const action = Object.assign(createId('action', null, 'graph:graphId'), {
      agent: { '@id': 'admin' },
      object: sourceEncoding,
      result: 'action:updateActionId',
      params: {
        flattenUpdateActionResult: true
      }
    });

    w.handleAction(action, function(err, handledAction) {
      if (err) return done(err);
      // console.log(require('util').inspect(handledAction, { depth: null }));

      assert(handledAction.result.object['@graph']);
      done();
    });
  });

  it('should error if handle action cannot get blob', function(done) {
    const action = Object.assign(createId('action', null, 'graph:graphId'), {
      agent: { '@id': 'admin' },
      object: Object.assign({}, sourceEncoding, { '@id': 'missing' })
    });

    w.handleAction(action, function(err, handledAction) {
      assert(err);
      done();
    });
  });
});
