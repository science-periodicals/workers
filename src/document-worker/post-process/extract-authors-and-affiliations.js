import { remove } from '../lib/utils';
import {
  scanAffiliatedPerson,
  scanOrg,
  scanAuthorFootnotes,
  QUOTATION_MARKS
} from '../lib/formats';
import TreeScanner from '../lib/tree-scanner';

// Extracts the Author and Contributors (and their affiliations).
export default function extractAuthorsAndAffiliations(ctx, cb) {
  let { store } = ctx;
  ctx.affiliations = {};
  ctx.people = {};

  try {
    let affSec = ctx.sectionsByType.affiliations;
    if (affSec) {
      for (let $p of affSec.querySelectorAll('li')) {
        // we do nothing with the org, we just rely on the fact that it will load into the cache
        let tp = new TreeScanner($p, ctx.log).debug(0);

        scanOrg(tp, store, null, { fromTop: true });
      }
      remove(affSec);
    }

    let authorLikeSection = (title, roleProp, roleName) => {
      let authSec = ctx.sectionsByType[title];
      let result = [];

      if (authSec) {
        for (let $li of authSec.querySelectorAll('li')) {
          if ($li.textContent.replace(/\s+/g, '').length === 0) {
            continue;
          }

          let tp = new TreeScanner($li, ctx.log).debug(0);

          let contrib;
          // has a quotation mark, it's a Person
          if (new RegExp(`${QUOTATION_MARKS}`).test($li.textContent)) {
            contrib = scanAffiliatedPerson(tp, store, { roleProp, roleName });
          } else {
            // otherwise it's an Org
            contrib = scanOrg(tp, store, null, {
              fromTop: true,
              roleProp,
              roleName
            });
          }

          if (contrib) {
            const {
              roleActions,
              roleContactPoints,
              roleContactPointNoteIdentifier
            } = scanAuthorFootnotes($li, ctx, store);
            if (roleActions) {
              roleActions.forEach(action => {
                contrib.addRoleAction(action);
              });
            }
            if (roleContactPoints) {
              contrib.roleContactPointNoteIdentifier = roleContactPointNoteIdentifier;
              roleContactPoints.forEach(contactPoint => {
                contrib.addRoleContactPoint(contactPoint);
              });
            }

            result.push(contrib);
          }
        }
        remove(authSec);
      }
      return result;
    };

    let authors = authorLikeSection('authors', 'author', 'author');
    ctx.resource.author = authors;
    let contributors = authorLikeSection(
      'contributors',
      'contributor',
      'author' /* with use `author` for `roleName` (and not `contributor`) for the contributor section */
    );
    ctx.resource.contributor = contributors;
  } catch (e) {
    ctx.log.error(e);
  }

  process.nextTick(cb);
}

extractAuthorsAndAffiliations.message = `Extracting affiliations`;
