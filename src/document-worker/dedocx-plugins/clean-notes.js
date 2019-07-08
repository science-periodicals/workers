let { remove } = require('../lib/utils');

// Remove the little <sup>num</sup> in footnotes/endnotes
module.exports = function cleanNotes({ doc, log }, cb) {
  try {
    // remove the numbering
    Array.from(
      doc.querySelectorAll('[role~="doc-footnote"], [role~="doc-endnote"]')
    ).forEach(note => {
      remove(note.querySelector('sup'));
    });

    // protect the sections
    let article = doc.querySelector('article');
    if (article) {
      let fns = doc.querySelector('section[role~="dedocx-footnotes"]'),
        ens = doc.querySelector('section[role~="doc-endnotes"]');
      if (fns) article.appendChild(fns);
      if (ens) article.appendChild(ens);
    }
  } catch (e) {
    log.error(e);
  }
  process.nextTick(cb);
};
