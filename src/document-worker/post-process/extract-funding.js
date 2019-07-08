import { normalizeText } from 'web-verse';
import { scanOrg, scanAward } from '../lib/formats';
import { textOrHTML } from '../lib/utils';
import TreeScanner from '../lib/tree-scanner';

/**
 * Extract funding metadata from DS3 funding table
 *
 * This must be called _after_:
 * - author and affiliation metadata have been extracted
 * - `resourceMetadata` have been extracted
 * - `flavorLinks` as it relies on the RDFa markup to work
 */
export default function extractFunding(ctx, cb) {
  const { resource, store, log, sectionsByType } = ctx;

  try {
    const $sec = sectionsByType.funding;
    if ($sec) {
      const $table = $sec.querySelector('table');
      if ($table) {
        const $tbody = $table.querySelector('tbody');
        if ($tbody) {
          const $trs = $tbody.querySelectorAll('tr');
          // Note we have 1 funder per row, and 1 funder can have several grants / awards
          // (we use split cells for that)
          // e.g:
          // ----------------------------------------------------------
          // | Source| Grants  | Target                    | Comment  |
          // ----------------------------------------------------------
          // |funder | award 1 | work1; work2; person; org |          |
          // |       | ------- |--------------------------------------|
          // |       | award 2 |                           |          |
          // ----------------------------------------------------------

          let _funder; // this is used to handle the `rowspan` on the funder column (1 funder can have several grant)
          Array.from($trs).forEach($tr => {
            const $tds = $tr.querySelectorAll('th,td');

            let [$notes, $targets, $award, $funder] = Array.from(
              $tds
            ).reverse();
            if ($funder) {
              _funder = $funder;
            } else {
              $funder = _funder;
            }

            let funder, award, notes, targets;
            if ($funder) {
              const tp = new TreeScanner($funder, log).debug(0);

              funder = scanOrg(tp, store, null, { fromTop: true });
            }

            if ($award) {
              award = scanAward($award, store);
            }

            if ($targets) {
              // handle the case where there is an extra (useless) element wrapper
              // e.g: <td><p>CONTENT</p></td>
              if (
                $targets.children.length === 1 &&
                !$targets.attributes.length
              ) {
                $targets = $targets.children[0];
              }

              const tp = new TreeScanner($targets, log).debug(0);
              const dfs = tp.splitToDocumentFragments(/\s*;\s*/);
              targets = [];
              dfs.forEach(({ fragment }) => {
                const tc = normalizeText(fragment.textContent);
                // Handle "magic" tokens
                if (/\bauthors?\s+and\s+contributors?\b/i.test(tc)) {
                  ['author', 'contributor'].forEach(p => {
                    resource[p].forEach(roleId => {
                      const role = store.get(roleId);
                      const unroled = store.get(role[p]);
                      if (unroled) {
                        targets.push(unroled);
                      }
                    });
                  });
                } else if (/\bauthors?\b/i.test(tc)) {
                  resource.author.forEach(roleId => {
                    const role = store.get(roleId);
                    const unroled = store.get(role.author);
                    if (unroled) {
                      targets.push(unroled);
                    }
                  });
                } else if (/\bcontributors?\b/i.test(tc)) {
                  resource.contributor.forEach(roleId => {
                    const role = store.get(roleId);
                    const unroled = store.get(role.contributor);
                    if (unroled) {
                      targets.push(unroled);
                    }
                  });
                } else if (/\bwork\b/i.test(tc)) {
                  targets.push(resource);
                } else {
                  // resource, person or org must be cross-referenced
                  const $a = fragment.querySelector('a[resource]');
                  if ($a) {
                    const obj = store.get($a.getAttribute('resource'));
                    if (obj) {
                      targets.push(obj);
                    }
                  }
                  // TODO if target is defined but is not a cross ref maybe issue a warning (otherwise that lead to the inclusion of the source to resource)
                }
              });

              if (!targets.length) {
                // if no targets are specified, we consider that it means "The work"
                targets.push(resource);
              }
            }

            if ($notes) {
              // handle the case where there is an extra (useless) element wrapper
              // e.g: <td><p>CONTENT</p></td>
              if ($notes.children.length === 1 && !$notes.attributes.length) {
                $notes = $notes.children[0];
              }
              notes = textOrHTML($notes);
            }

            //console.log(
            //  [
            //    $targets && $targets.textContent,
            //    targets && targets.map(r => r.toJSON())
            //  ],
            //  [$notes && $notes.textContent, notes],
            //  [$award && $award.textContent, award && award.toJSON()],
            //  [$funder && $funder.textContent, funder && funder.toJSON()]
            //);

            if (targets && targets.length) {
              targets.forEach(target => {
                if (award || funder) {
                  const role = store.createFunderRole({
                    description: notes || undefined, // guard against empty string
                    funder
                  });
                  if (award) {
                    role.roleOffer = award;
                  }

                  target.addFunder(role);
                }
              });
            }
          });
        }
      } else {
        log.warn({ element: $sec }, `No table found for funding`);
      }
    }
  } catch (e) {
    log.error(e);
  }

  process.nextTick(cb);
}
extractFunding.message = `Extracting funding`;
