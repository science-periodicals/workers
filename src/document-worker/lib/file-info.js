let { basename, extname } = require('path'),
  { access, move } = require('fs-extra'),
  findit = require('findit'),
  map = require('async/map'),
  { fileType } = require('./utils'),
  { convert } = require('./libre-office');

module.exports = function fileInfo(path, cb) {
  access(path, notFound => {
    if (notFound) return cb(null, []);
    let files = [],
      finder = findit(path);
    finder.on('file', (f, stat) => {
      files.push({
        path: f,
        basename: basename(f),
        connegName: basename(f, extname(f)),
        stat
      });
    });
    finder.on('error', cb);
    finder.on('end', () => {
      map(files.map(f => f.path), fileType, (err, types) => {
        if (err) return cb(err);
        types.forEach((t, idx) => (files[idx].type = t));
        let emfFiles = files.filter(
          file =>
            file.type === 'application/octet-stream' &&
            extname(file.path).toLowerCase() === '.emf'
        );
        map(
          emfFiles,
          (file, callback) => {
            convert(file.path, 'png', (err, newPath) => {
              if (err) return callback(err);
              // NOTE: we move it but we keep the .emf extension. Unorthodox, but simpler and
              // should work
              move(newPath, file.path, { overwrite: true }, err => {
                if (err) return callback(err);
                file.type = 'image/png';
                callback();
              });
            });
          },
          err => {
            if (err) return cb(err);
            cb(null, files);
          }
        );
      });
    });
  });
};
