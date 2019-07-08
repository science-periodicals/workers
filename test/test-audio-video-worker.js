import os from 'os';
import fs from 'fs';
import mime from 'mime-types';
import path from 'path';
import assert from 'assert';
import { AudioVideoWorker } from '../src';
import uuid from 'uuid';
import rimraf from 'rimraf';
import { getId } from '@scipe/jsonld';
import { createId } from '@scipe/librarian';

describe('AudioVideoWorker', function() {
  this.timeout(1000000);

  describe('video (.mp4)', function() {
    let w, sourceEncoding;
    const sourcePath = path.join(
      __dirname,
      'fixtures',
      'audio-video-worker',
      'video.mp4'
    );
    const root = path.join(os.tmpdir(), uuid.v4());

    before(function(done) {
      w = new AudioVideoWorker({
        blobStorageBackend: 'fs',
        log: { name: 'audio-video-worker', level: 'fatal' }
      });

      w.blobStore.put(
        {
          type: 'VideoObject',
          path: sourcePath,
          graphId: 'graph:graphId',
          resourceId: 'node:resourceId',
          encodingId: 'node:encodingId',
          isNodeOfId: 'graph:graphId',
          encodesCreativeWork: 'node:resourceId',
          name: path.basename(sourcePath),
          fileFormat: mime.lookup(sourcePath)
        },
        function(err, encoding) {
          if (err) return done(err);
          fs.mkdir(root, function(err) {
            if (err) return done(err);
            sourceEncoding = encoding;
            done();
          });
        }
      );
    });

    it('should probe video', function(done) {
      w.probeAudioVideo(
        root,
        sourcePath,
        {
          agentId: 'user:agentId',
          graphId: 'graph:graphId',
          resourceId: 'node:resourceId',
          encodingId: 'node:encodingId',
          object: sourceEncoding
        },
        function(err, metadata) {
          if (err) return done(err);
          assert(metadata.thumbnail);
          assert.equal(metadata.height, 226);
          assert.equal(metadata.width, 228);
          assert.equal(metadata.duration, 28.334);
          done();
        }
      );
    });

    it('should transcode video to webm', function(done) {
      w.transcodeAudioVideo(
        root,
        sourcePath,
        'video/webm',
        {
          agent: 'user:agentId',
          object: sourceEncoding
        },
        {
          graphId: 'graph:graphId'
        },
        function(err, encoding) {
          if (err) return done(err);
          assert.equal(encoding.fileFormat, 'video/webm');
          done();
        }
      );
    });

    it('should transcode video to mp4', function(done) {
      w.transcodeAudioVideo(
        root,
        sourcePath,
        'video/mp4',
        {
          agent: 'user:agentId',
          object: sourceEncoding
        },
        {
          graphId: 'graph:graphId'
        },
        function(err, encoding) {
          if (err) return done(err);
          assert.equal(encoding.fileFormat, 'video/mp4');
          done();
        }
      );
    });

    it('should handle action', function(done) {
      const action = Object.assign(createId('action', null, 'graph:graphId'), {
        agent: 'user:agentId',
        object: sourceEncoding,
        result: 'action:updateActionId',
        params: {
          flattenUpdateActionResult: true
        }
      });

      // testing emitted events
      //w.on(w.PUB_EVENT, (agentId, action) => {
      //  console.log(action);
      //});

      w.handleAction(action, function(err, handledAction) {
        if (err) return done(err);

        // console.log(require('util').inspect(handledAction, { depth: null }));
        assert(handledAction.result.object['@graph']);
        assert.equal(
          getId(handledAction.result.targetCollection),
          'graph:graphId'
        );
        done();
      });
    });

    after(function(done) {
      rimraf(root, function(err) {
        if (err) console.error(err);
        done();
      });
    });
  });

  describe('video (.mov)', function() {
    let w, sourceEncoding;
    const sourcePath = path.join(
      __dirname,
      'fixtures',
      'audio-video-worker',
      'video.mov'
    );
    const root = path.join(os.tmpdir(), uuid.v4());

    before(function(done) {
      w = new AudioVideoWorker({
        blobStorageBackend: 'fs',
        log: { name: 'audio-video-worker', level: 'fatal' }
      });

      w.blobStore.put(
        {
          type: 'VideoObject',
          path: sourcePath,
          graphId: 'graph:graphId',
          resourceId: 'node:resourceId',
          encodingId: 'node:encodingId',
          encodesCreativeWork: 'node:resourceId',
          isNodeOfId: 'graph:graphId',
          name: path.basename(sourcePath),
          fileFormat: mime.lookup(sourcePath)
        },
        function(err, encoding) {
          if (err) return done(err);
          fs.mkdir(root, function(err) {
            if (err) return done(err);
            sourceEncoding = encoding;
            done();
          });
        }
      );
    });

    it('should handle action', function(done) {
      const action = Object.assign(createId('action', null, 'graph:graphId'), {
        agent: 'user:userId',
        object: sourceEncoding,
        result: 'action:updateActionId',
        params: {
          flattenUpdateActionResult: true
        }
      });

      // testing emitted events
      //w.on(w.PUB_EVENT, (agentId, action) => {
      //  console.log(action);
      //});

      w.handleAction(action, function(err, handledAction) {
        if (err) return done(err);

        // console.log(require('util').inspect(handledAction, { depth: null }));
        assert(handledAction.result.object['@graph']);
        assert.equal(
          getId(handledAction.result.targetCollection),
          'graph:graphId'
        );
        done();
      });
    });

    after(function(done) {
      rimraf(root, function(err) {
        if (err) console.error(err);
        done();
      });
    });
  });

  describe('audio', function() {
    let w, sourceEncoding;
    const sourcePath = path.join(
      __dirname,
      'fixtures',
      'audio-video-worker',
      'audio.ogg'
    );
    const root = path.join(os.tmpdir(), uuid.v4());

    before(function(done) {
      w = new AudioVideoWorker({
        couchDbName: 'test-workers',
        log: { name: 'audio-video-worker', level: 'fatal' }
      });

      w.blobStore.put(
        {
          type: 'AudioObject',
          body: fs.createReadStream(sourcePath),
          graphId: 'graph:graphId',
          resourceId: 'node:resourceId',
          encodingId: 'node:encodingId',
          isNodeOfId: 'graph:graphId',
          encodesCreativeWork: 'node:resourceId',
          name: path.basename(sourcePath),
          fileFormat: mime.lookup(sourcePath),
          '@type': 'AudioObject'
        },
        function(err, encoding) {
          if (err) return done(err);
          fs.mkdir(root, function(err) {
            if (err) return done(err);
            sourceEncoding = encoding;
            done();
          });
        }
      );
    });

    it('should transcode audio to ogg', function(done) {
      w.transcodeAudioVideo(
        root,
        sourcePath,
        'audio/ogg',
        {
          agent: 'user:agentId',
          object: sourceEncoding
        },
        {
          graphId: 'graph:graphId'
        },
        function(err, encoding) {
          if (err) return done(err);
          assert.equal(encoding.fileFormat, 'audio/ogg');
          done();
        }
      );
    });

    it('should transcode audio to mp3', function(done) {
      w.transcodeAudioVideo(
        root,
        sourcePath,
        'audio/mpeg',
        {
          agent: 'agentId',
          object: sourceEncoding
        },
        {
          graphId: 'graph:graphId'
        },
        function(err, encoding) {
          if (err) return done(err);
          assert.equal(encoding.fileFormat, 'audio/mpeg');
          done();
        }
      );
    });

    it('should handle action', function(done) {
      const action = Object.assign(createId('action', null, 'graph:graphId'), {
        agent: 'user:userId',
        object: sourceEncoding,
        result: 'updateActionId',
        params: {
          flattenUpdateActionResult: true
        }
      });

      w.handleAction(action, function(err, handledAction) {
        if (err) return done(err);
        // console.log(require('util').inspect(handledAction, { depth: null }));
        assert(handledAction.result.object['@graph']);
        assert.equal(
          getId(handledAction.result.targetCollection),
          'graph:graphId'
        );
        done();
      });
    });
  });
});
