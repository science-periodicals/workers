#!/usr/bin/env node

import fs from 'fs';
import yargs from 'yargs';
import path from 'path';
import { fork } from 'child_process';
import colors from 'colors'; // eslint-disable-line
import { Broker } from '../';

/* eslint-disable no-console */

const argv = yargs
  .usage('Usage: run-workers [path/to/config.json] [options]')
  .help('h')
  .describe('l', 'log level')
  .default('l', 'info')
  .describe('b', 'borker log level')
  .default('b', 'info')
  .describe('blob-storage-backend', 'blob store engine')
  .choices('blob-storage-backend', ['S3', 'fs'])
  .describe('fs-blob-store-root', 'root directory for the fs blob store engine')
  .describe('s3-blob-store-root', 'bucket for S3 blob store engine')
  .alias('h', 'help')
  .alias('v', 'version').argv;

if (argv.v) {
  console.log(require('../../package.json').version);
  process.exit(0);
}

const inputConfigPath = argv._[0];
let config, configPath;
if (inputConfigPath) {
  configPath = path.resolve(process.cwd(), inputConfigPath);
  try {
    config = JSON.parse(fs.readFileSync(configPath));
  } catch (err) {
    console.error(argv._[0].grey + ' ERR! '.red + err.message);
    process.exit(1);
  }
}

const broker = new Broker(
  Object.assign(
    {
      log: {
        name: 'broker',
        level: argv.b
      },
      blobStorageBackend: argv['blob-storage-backend'],
      fsBlobStoreRoot: argv['fs-blob-store-root'],
      s3BlobStoreRoot: argv['s3-blob-store-root']
    },
    config
  )
);

const subProcesses = [];
broker.listen(function(err) {
  if (err) {
    console.error(argv._[0].grey + ' ERR! '.red + err.message);
    process.exit(1);
  }

  ['image-worker.js', 'audio-video-worker.js', 'document-worker.js'].forEach(
    function(modulePath) {
      const p = fork(
        path.join(__dirname, modulePath),
        [configPath && config ? configPath: '', argv.l, argv['blob-storage-backend'] || '', argv['fs-blob-store-root'] || '', argv['s3-blob-store-root'] || ''],
        {
          cwd: __dirname,
          env: Object.assign({}, process.env)
        }
      );
      subProcesses.push(p);
    }
  );
});

process.on('SIGTERM', function() {
  subProcesses.forEach(p => {
    p.kill();
  });
  broker.close();
});
