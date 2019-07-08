let { access, constants } = require('fs'),
  { join } = require('path'),
  which = require('which'),
  { execFile } = require('child_process'),
  tmp = require('tmp'),
  libreExecutable,
  osxBasePath = '/Applications/LibreOffice.app/Contents/MacOS/';

function findExecutable(cb) {
  if (libreExecutable) return cb(null, libreExecutable);
  which('libreoffice', (err, sPath) => {
    if (sPath) return cb(null, sPath);
    which('soffice', (err, lPath) => {
      if (lPath) return cb(null, lPath);
      let soffPath = join(osxBasePath, 'soffice');
      access(soffPath, constants.X_OK, err => {
        if (!err) return cb(null, soffPath);
        let librePath = join(osxBasePath, 'libreoffice');
        access(librePath, constants.X_OK, err => {
          if (!err) return cb(null, librePath);
          cb(new Error('Libre Office executable not found'));
        });
      });
    });
  });
}

// NOTE: if an instance that isn't headless is running (normally as `soffice.bin`) then this won't
// work.
let libre = (module.exports = function libre(args = [], cb) {
  findExecutable((err, execPath) => {
    if (err) return cb(err);
    if (!args.find(arg => arg === '--headless')) args.unshift('--headless');
    execFile(execPath, args, cb);
  });
});

libre.convert = function convert(path, format, cb) {
  tmp.dir({ unsafeCleanup: true }, (err, root) => {
    if (err) return cb(err);
    libre(
      ['--convert-to', format.replace(/\W/g, ''), '--outdir', root, path],
      (err, stdout) => {
        if (err) return cb(err);
        let match = (stdout || '').match(/->\s+(.*)\s+using\s+/);
        if (!match || !match[1])
          return cb(new Error(`Could not find output file in "${stdout}"`));
        cb(null, match[1]);
      }
    );
  });
};
