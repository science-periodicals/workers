const { normalizeText } = require('web-verse');

// TODO plug in the custom styleguide data to construct regexp based on custom section heading ?
function sectionExtractor(ctx, cb) {
  try {
    ctx.sectionsByType = {};

    const sections = Array.from(
      ctx.doc.querySelectorAll('article > section')
    ).filter(sec => {
      return (
        // we exclude footnote and endnote sections appended at the end by dedocx
        sec.getAttribute('role') !== 'dedocx-footnotes' &&
        sec.getAttribute('role') !== 'doc-footnotes' &&
        sec.getAttribute('role') !== 'dedocx-endnotes' &&
        sec.getAttribute('role') !== 'doc-endnotes' &&
        sec.textContent.trim() !== '' // filter out empty sections
      );
    });

    //console.log(require('pretty')(require('jsdom').serializeDocument(ctx.doc)));

    const atStart = [
      {
        test: /^Abstract(?:s)?$|^Short\s+Abstract(?:s)?$|^Original\s+Abstract(?:s)?$|^Structured\s+Abstract(?:s)?$|^Impact\s+Statement(?:s)?$|^Plain\s+Language\s+Summar(y|ies)?$|^Significance\s+Statement(?:s)?$/i,
        key: 'abstract'
      },
      {
        test: /^Description$/i,
        key: 'description'
      },
      {
        test: /^(Abbreviation|Acronym)s?$/i,
        key: 'abbr',
        listOnly: true
      },
      {
        test: /^Affiliation(?:s)?$/i,
        key: 'affiliations',
        listOnly: true
      },
      {
        test: /^Author(?:s)?$/i,
        key: 'authors',
        listOnly: true
      },
      {
        test: /^Contributor(?:s)?$/i,
        key: 'contributors',
        listOnly: true
      },
      {
        test: /^Copyright(?:s)?$/i,
        key: 'copyright'
      },
      {
        test: /^Keyword(?:s)?$/i,
        key: 'keywords',
        listOnly: true
      },
      {
        test: /^License(?:s)?$/i,
        key: 'license'
      }
    ];

    const atEnd = [
      {
        test: /^Funding$/i,
        key: 'funding'
      },
      {
        test: /^Disclosure(?:s)?$/i,
        key: 'disclosure'
      },
      {
        test: /^Acknowledgement(?:s)?$/i,
        key: 'acknowledgements'
      },
      {
        test: /^(Supporting\s+Information)$/i,
        key: 'supplementary'
      },
      {
        test: /^(Bibliography|References)$/i,
        key: 'bibliography'
      }
    ];

    let failedMatch = false;

    // the idea behind what follows is that if 1 section doesn't match, then
    // it's not valid DS3 so we don't extract
    sections.forEach(sec => {
      if (failedMatch) return;
      let match = getMatch(sec, atStart, ctx);

      if (!match) {
        failedMatch = true;
        return;
      }
      if (match.key) {
        if (match.key === 'abstract') {
          if (!ctx.sectionsByType[match.key]) {
            ctx.sectionsByType[match.key] = [];
          }
          ctx.sectionsByType[match.key].push(sec);
        } else {
          ctx.sectionsByType[match.key] = sec;
        }
      }
    });

    failedMatch = false;

    sections.reverse().forEach(sec => {
      if (failedMatch) return;
      let match = getMatch(sec, atEnd, ctx);
      if (!match) {
        failedMatch = true;
        return;
      }
      if (match.key) {
        ctx.sectionsByType[match.key] = sec;
      }
    });
  } catch (e) {
    ctx.log.error(e);
  }

  process.nextTick(cb);
}
sectionExtractor.message = `Processing sections`;
module.exports = sectionExtractor;

function getMatch(section, candidates, ctx) {
  let h = section.firstElementChild;

  if (h && /^h[1-6]$/.test(h.localName)) {
    let txt = normalizeText(h.textContent).toLowerCase();
    return candidates.find(cand => {
      if (typeof cand.test === 'string' || cand.test instanceof String) {
        if (cand.test.toLowerCase() === txt) {
          return checkListOnly(section, cand, ctx);
        }
      } else if (cand.test.test(txt)) {
        return checkListOnly(section, cand, ctx);
      }
      return false;
    });
  }
  return false;
}

function checkListOnly(section, candidate, ctx) {
  if (!candidate.listOnly) return candidate;
  if (
    Array.from(section.children).find(
      child => !/^(h[1-6]|ul|ol)$/.test(child.localName)
    )
  ) {
    ctx.log.warn(
      { element: section },
      `Section matching ${candidate.test} but has content other than a list.`
    );
    return false;
  }
  return candidate;
}
