import fs from 'fs';
import { AudioVideoWorker } from '../';

const configPath = process.argv[2];
const level = process.argv[3] || 'warn';
const blobStorageBackend = process.argv[4];
const fsBlobStoreRoot = process.argv[5];
const s3BlobStoreRoot = process.argv[6];

let config;
if (configPath) {
  try {
    config = JSON.parse(fs.readFileSync(configPath));
  } catch (err) {
    throw err;
  }
}

const w = new AudioVideoWorker(
  Object.assign(
    {
      nWorkers: 1,
      log: {
        name: 'audio-video-worker',
        level
      },
      blobStorageBackend: blobStorageBackend || undefined,
      fsBlobStoreRoot: fsBlobStoreRoot || undefined,
      s3BlobStoreRoot: s3BlobStoreRoot || undefined
    },
    config
  )
);
w.listen();
