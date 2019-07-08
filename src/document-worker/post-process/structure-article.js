import { prefix } from '@scipe/jsonld';
import { remove } from '../lib/utils';

export default function structureArticle(ctx, cb) {
  const { doc, log, sectionsByType } = ctx;

  const backMatterSections = new Set(
    [
      'funding',
      'disclosure',
      'acknowledgements',
      'supplementary',
      'bibliography'
    ]
      .map(key => sectionsByType[key])
      .filter(Boolean)
  );

  // console.log(Object.keys(sectionsByType));

  try {
    const $article = doc.querySelector('article');
    if ($article) {
      // TODO generate sa:articleFrontMatter and see https://github.com/scienceai/dedocx/issues/25 to separate front matter from article body

      const $articleBody = doc.createElement('section');
      $articleBody.setAttribute('property', 'schema:articleBody');
      $articleBody.setAttribute('datatype', 'rdf:HTML');

      const $articleBackMatter = doc.createElement('section');
      $articleBackMatter.setAttribute('property', 'sa:articleBackMatter');
      $articleBackMatter.setAttribute('datatype', 'rdf:HTML');

      let isBackMatter;
      Array.from($article.childNodes).forEach(node => {
        if (backMatterSections.has(node)) {
          isBackMatter = true;

          // type it
          const key = Object.keys(sectionsByType).find(
            key => sectionsByType[key] === node
          );
          if (key) {
            let type;
            switch (key) {
              case 'funding':
                type = prefix('WPFunding');
                break;
              case 'disclosure':
                type = prefix('WPDisclosure');
                break;
              case 'acknowledgements':
                type = prefix('WPAcknowledgements');
                break;
              case 'supplementary':
                type = prefix('WPSupportingInformation');
                break;
              case 'bibliography':
                type = prefix('WPReferenceList');
                break;
              default:
                break;
            }
            if (type) {
              node.setAttribute('typeof', type);
            }
          }
        }

        if (isBackMatter) {
          $articleBackMatter.appendChild(node);
        } else {
          $articleBody.appendChild(node);
        }
      });
      $article.appendChild($articleBody);
      if (isBackMatter) {
        $article.appendChild($articleBackMatter);
      }
    }

    // Remove footnotes and endnotes sections (marked with [role='doc-endnotes'], [role='dedocx-footnotes'])
    Array.from(
      doc.querySelectorAll('[role="doc-endnotes"], [role="dedocx-footnotes"]')
    ).forEach(de => {
      remove(de);
    });
  } catch (e) {
    log.error(e);
  }
  process.nextTick(cb);
}
structureArticle.message = `Structuring article`;
