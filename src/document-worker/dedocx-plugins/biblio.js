import omit from 'lodash/omit';
import { arrayify, prefix } from '@scipe/jsonld';
import {
  createSchemaCitationFromDocx,
  createCitationCalloutTextContent
} from '../lib/citation-to-data';
import { remove, renameElement } from '../lib/utils';

export default function biblio({
  removeBibliographySection = false,
  store,
  resource,
  log
} = {}) {
  return function biblioPlugin({ doc, bibliography }, callback) {
    let root = doc.querySelector('article') || doc.body;

    // Rename or remove the Bibliography section
    Array.from(
      doc.querySelectorAll('section[role="doc-bibliography"]')
    ).forEach(bib => {
      if (removeBibliographySection) {
        remove(bib);
        return;
      }

      if (bib.firstElementChild && bib.firstElementChild.localName !== 'h2') {
        // 36 is 3 times the length of "bibliography"
        if (
          !bib.firstElementChild.id &&
          bib.firstElementChild.textContent.length <= 36
        ) {
          renameElement(bib.firstElementChild, 'h2');
        } else {
          const h2 = doc.createElement('h2');
          h2.textContent = 'Bibliography';
          bib.insertBefore(h2, bib.firstChild);
        }
      }
      root.appendChild(bib);
    });

    // Reformatting of the citation callouts and create citation or citation role based if the citation is a point citation (citation to a page, chapter etc.) or not.
    Array.from(doc.querySelectorAll('a[role="doc-biblioref"]')).forEach(cit => {
      const options = cit.hasAttribute('data-dedocx-citation-options')
        ? JSON.parse(cit.getAttribute('data-dedocx-citation-options'))
        : {};

      // if `options.tags` is set, we have a group citation
      const tags = [cit.getAttribute('href').replace('#', '')].concat(
        arrayify(options.tags)
      );

      const df = doc.createDocumentFragment();
      df.appendChild(doc.createTextNode('('));
      // split group citation (one link per tag) and reformat callout
      // In case of a group citation, the page option (point citation) only applies to the first one
      tags.forEach((tag, i) => {
        if (i) {
          df.appendChild(doc.createTextNode('; '));
        }

        const a = doc.createElement('a');
        // set back data-dedocx-citation-options without the tags if needed by downstream plugins
        a.setAttribute(
          'data-dedocx-citation-options',
          JSON.stringify(omit(options, ['tags'].concat(i > 0 ? ['page'] : []))) // In case of a group citation, the page option (point citation) only applies to the first one
        );
        a.setAttribute('href', `#${tag}`);
        a.setAttribute('role', 'doc-biblioref');

        const calloutTextContent = createCitationCalloutTextContent(
          bibliography[tag]
        );

        if (bibliography[tag]) {
          const citation = createSchemaCitationFromDocx(
            store,
            bibliography[tag]
          );
          if (i === 0 && 'page' in options) {
            // point citation: create a citation role
            // {
            //   '@type': 'TargetRole',
            //   name: 'Bogich 2014, 10-20',
            //   citation: {
            //     '@type': 'Book',
            //     name: 'Book title'
            //   },
            //   hasSelector: {
            //     '@type': 'Selector',
            //     name: '10-20',
            //     pageStart: 10,
            //     pageEnd: 20
            //   }
            // };

            const selector = store.createSelector({
              '@type': 'Selector',
              name: options.page,
              pagination: options.page
            });
            const role = store.createTargetRole(
              {
                '@type': 'TargetRole',
                name: `${calloutTextContent}, ${options.page}`,
                hasSelector: selector,
                citation: citation
              },
              { curiePrefix: 'node' } // set curiePrefix to `node` as there are cross references between HTML and JSON-LD so we want stabe identifiers
            );
            store.mapIDs(role.$id, role);
            resource.addCitation(role);

            // TODO simplify RDFa? see archive documentation with a simpler example
            // not involving <link> but requiring a wrapper <span>
            // RDFa (we only do RDFa of the point citation, the RDFa for the
            // simple citation a is done further downstream with `flavorLinks`
            // <article resource="ex:articleId">
            //   <a
            //     about="ex:articleId"
            //     property="schema:citation"
            //     href="http://ex.com"
            //     resource="ex:roleId"
            //   >
            //     <span about="ex:roleId" typeof="sa:TargetRole" property="schema:name">
            //       Bogich 2013,
            //       <span>
            //         <link
            //           about="ex:roleId"
            //           property="schema:citation"
            //           resource="ex:citationId"
            //         />
            //         <link
            //           about="ex:roleId"
            //           property="schema:hasSelector"
            //           resource="ex:selectorId"
            //         />
            //         <span resource="ex:selectorId" typeof="sa:Selector">
            //           <span property="schema:name">page 12</span>
            //         </span>
            //       </span>
            //     </span>
            //   </a>
            // </article>

            a.setAttribute('href', `#${role.$id}`); // rewrite the href so it points to the newly created Role
            a.setAttribute('about', resource.$id);
            a.setAttribute('property', prefix('citation'));
            a.setAttribute('resource', role.$id);

            const containerSpan = doc.createElement('span');
            containerSpan.setAttribute('about', role.$id);
            containerSpan.setAttribute('typeof', prefix(role.$type));
            containerSpan.setAttribute('property', prefix('name'));
            containerSpan.appendChild(
              doc.createTextNode(`${calloutTextContent}, `)
            );
            a.appendChild(containerSpan);

            const linkSpan = doc.createElement('span');

            const linkCitation = doc.createElement('link');
            linkCitation.setAttribute('about', role.$id);
            linkCitation.setAttribute('property', prefix('citation'));
            linkCitation.setAttribute('resource', citation.$id);
            linkSpan.appendChild(linkCitation);

            const linkSelector = doc.createElement('link');
            linkSelector.setAttribute('about', role.$id);
            linkSelector.setAttribute('property', prefix('hasSelector'));
            linkSelector.setAttribute('resource', selector.$id);
            linkSpan.appendChild(linkSelector);

            const selectorSpan = doc.createElement('span');
            selectorSpan.setAttribute('resource', selector.$id);
            selectorSpan.setAttribute('typeof', prefix(selector.$type));

            const nameSpan = doc.createElement('span');
            nameSpan.setAttribute('property', prefix('name'));
            nameSpan.textContent = (options.page || '').toString().trim();

            selectorSpan.appendChild(nameSpan);
            linkSpan.appendChild(selectorSpan);
            containerSpan.appendChild(linkSpan);
            a.appendChild(containerSpan);
          } else {
            resource.addCitation(citation);
            a.textContent = calloutTextContent;
          }
        } else {
          a.textContent = calloutTextContent;
        }

        df.appendChild(a);
      });

      df.appendChild(doc.createTextNode(')'));
      cit.parentNode.replaceChild(df, cit);
    });

    // add citation to the store as in some case citations were not referenced in the text
    if (Object.keys(bibliography).length) {
      try {
        Object.keys(bibliography).forEach(k => {
          // Note: addCitation will do the right thing if the citation was already added
          resource.addCitation(
            createSchemaCitationFromDocx(store, bibliography[k])
          );
        });
      } catch (err) {
        log.error(err, 'Error processing bibliography');
      }
    }

    process.nextTick(callback);
  };
}
biblio.message = `Extracting citations`;
