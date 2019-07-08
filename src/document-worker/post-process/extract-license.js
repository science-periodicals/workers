let { remove } = require('../lib/utils'),
  { parseLicenses } = require('../lib/formats');

// Extracts the licenses.
// We detect the separator: if ';' occurs it's that, otherwise ','.
// Licenses can be two things: an SPDX token or an arbitrary URL.
let extractLicense = (module.exports = function extractLicense(ctx, cb) {
  try {
    let sec = ctx.sectionsByType.license;
    if (sec) {
      remove(sec.querySelector('h2'));
      parseLicenses(ctx.resource, sec, ctx);
      remove(sec);
    }
  } catch (e) {
    ctx.log.error(e);
  }
  process.nextTick(cb);
});
extractLicense.message = `Extracting license`;
