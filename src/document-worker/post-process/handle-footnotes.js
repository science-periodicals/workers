import { textOrHTML, ancestorsMatching, addRel } from '../lib/utils';
import { normalizeText } from 'web-verse';

/**
 * Finds all footnotes and endnotes, add them to the store (with proper
 * serialization) and update the footnote and endnote references.
 * Note: the footnotes and endnote sections are removed further downstream (See
 * `structure-article.js`)
 *
 * - this needs to happen:
 *   . after all structural processing has happened (images, maths, etc.)
 *   . after resource-metadata
 *   . before figures have been emptied
 */
export default function handleFootnotes(ctx, cb) {
  let { doc, store, resource } = ctx;

  try {
    // NOTE:
    // - The endnotes section is `role=doc-endnotes`, the footnotes one `role=dedocx-footnotes` (DPUB has nothing)
    // - Within their section, endnotes are marked with `doc-endnote`, footnotes with `doc-footnote`.
    // - References to either are marked with `role=doc-noteref` and `rel=footnote` or `rel=endnote`.

    ['Footnote', 'Endnote'].forEach(type => {
      Array.from(
        doc.querySelectorAll(`[role~="doc-${type.toLowerCase()}"]`)
      ).forEach($note => {
        const id = $note.getAttribute('id');
        if (!id) return;

        const resourceIdsWithNote = new Set();
        const note = store[
          type === 'Footnote' ? 'createFootnote' : 'createEndnote'
        ](
          { text: textOrHTML($note) },
          { curiePrefix: 'node' } // set curiePrefix to `node` as there are cross references between HTML and JSON-LD so we want stabe identifiers
        );

        let noteIdentifier;
        let counter = 0;

        // handle the note refs from the article (HTML)
        Array.from(doc.querySelectorAll(`a[href="#${id}"]`)).forEach(
          ($ref, i) => {
            addRel($ref, type.toLowerCase());
            $ref.setAttribute('href', `#${note.$id}`);
            noteIdentifier = parseInt(normalizeText($ref.textContent), 10);

            // Give an `id` to the <a> so that we can have easy backlinks
            // Note: this `id` is public (exposed by app-suite) so we make it "pretty"
            if (!$ref.hasAttribute('id')) {
              $ref.setAttribute(
                'id',
                `${type === 'Footnote' ? 'fn' : 'en'}${noteIdentifier ||
                  note.$id}.${counter++}`
              );
            }

            let fig = ancestorsMatching(
              $ref,
              'figure[resource], aside[resource], article[resource]'
            )[0];

            if (fig) {
              let resId = fig.getAttribute('resource') || resource.$id;
              if (resId === '#') {
                resId = resource.$id;
              }
              resourceIdsWithNote.add(resId);
            }
          }
        );

        // handle the note refs from the Graph
        store.getObjectsWithHtmlLinks().forEach(({ object, key }) => {
          let div = doc.createElement('div');
          div.innerHTML = object[key]['@value'];

          Array.from(div.querySelectorAll(`a[href="#${id}"]`)).forEach(
            ($ref, i) => {
              addRel($ref, type.toLowerCase());

              $ref.setAttribute('href', `#${note.$id}`);
              noteIdentifier = parseInt(normalizeText($ref.textContent), 10);

              // give an `id` to the <a> so that we can have easy backlinks
              if (!$ref.hasAttribute('id')) {
                $ref.setAttribute(
                  'id',
                  `${type === 'Footnote' ? 'fn' : 'en'}${noteIdentifier ||
                    note.$id}.${counter++}`
                );
              }

              resourceIdsWithNote.add(object.$id);
            }
          );

          object[key]['@value'] = div.innerHTML;
        });

        if (noteIdentifier != null) {
          note.noteIdentifier = noteIdentifier;
        }

        // relabel `id` so that downstream processing still works
        // and map old and new id to the note
        store.mapIDs($note.id, note); // we need that as we will get back the footnotes from the refs later
        $note.id = note.$id;
        store.mapIDs($note.id, note);

        Array.from(resourceIdsWithNote).forEach(resId => {
          let res = store.get(resId);
          if (!res) return;

          note.addAbout(res);
          res.addNote(note);
        });
      });
    });
  } catch (e) {
    ctx.log.error(e);
  }

  process.nextTick(cb);
}

handleFootnotes.message = `Processing footnotes and endnotes`;
