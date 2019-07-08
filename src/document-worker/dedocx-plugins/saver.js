import { mkdirp, writeFile, copy } from 'fs-extra';
import { join, basename } from 'path';
import series from 'async/series';
import each from 'async/each';

/**
 * At the end of a [`dedocx`](https://github.com/scienceai/dedocx) run (or, in
 * fact, at any point), it can be useful to save the document, media, and other
 * ancillary content to disk. That's what this plugin is for.
 *
 * The options are:
 * - `dir`, string (required). The directory to which to save.
 * - `imgDir`, string (defaults to `img`). A directory to which to save images,
 * always interpreted as relative to `dir`.
 */
export default function dedocxSaverPlugin({ dir, imgDir = 'img' } = {}) {
  return function saverPlugin(
    { doc, bibliography, schemaBibliography } = {},
    callback
  ) {
    if (!dir)
      return callback(
        new Error('Saver requires specifying an output directory with `dir`')
      );
    let copyList = [],
      seenRemaps = {},
      seenFrom = {};
    // NOTE: we should serialise the HTML better, but for that we need to stabilise on a usable
    // version of jsdom
    series(
      [
        cb => mkdirp(dir, cb),
        cb =>
          bibliography
            ? writeFile(
                join(dir, 'bibliography.json'),
                JSON.stringify(bibliography, null, 2),
                cb
              )
            : cb(),
        cb =>
          schemaBibliography
            ? writeFile(
                join(dir, 'biblio.json'),
                JSON.stringify(schemaBibliography, null, 2),
                cb
              )
            : cb(),
        cb => {
          Array.from(doc.querySelectorAll('img[src]')).forEach(img => {
            let src = img.getAttribute('src'),
              fn = basename(src),
              remap = join(imgDir, fn);
            if (seenFrom[src]) {
              let target = copyList.find(item => item.from === src);
              img.setAttribute('src', target.remap);
              return;
            }
            if (seenRemaps[remap]) {
              let parts = fn.split('.'),
                basePart = parts.shift(),
                count = 1;
              while (seenRemaps[remap]) {
                remap = join(
                  imgDir,
                  `${basePart}-${count}${
                    parts.length ? `.${parts.join('.')}` : ''
                  }`
                );
                count++;
              }
            }
            seenRemaps[remap] = true;
            seenFrom[src] = true;
            copyList.push({ from: src, to: join(dir, remap), remap });
            img.setAttribute('src', remap);
          });
          cb();
        },
        cb =>
          writeFile(
            join(dir, 'index.html'),
            `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`,
            cb
          ),
        cb => mkdirp(join(dir, imgDir), cb),
        cb => {
          each(copyList, ({ from, to }, done) => copy(from, to, done), cb);
        }
      ],
      callback
    );
  };
}
