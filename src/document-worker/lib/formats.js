import spdx from 'spdx-license-list';
import lopl from 'list-of-programming-languages';
import urlRx from 'url-regex';
import { normalizeText } from 'web-verse';
import { ELEMENT_NODE, TEXT_NODE } from 'dom-node-types';
import uniq from 'lodash/uniq';
import { arrayify } from '@scipe/jsonld';
import { remove, textOrHTML } from './utils';
import TreeScanner from './tree-scanner';
import { Organization } from './types';
import { createId, schema } from '@scipe/librarian';

// Quote characters potentially used
export const QUOTATION_MARKS = '["«»‘‛‚“”„‹›❛❜❝❞❮❯〝〞〟＂「」｢｣『』]';
// we recognise: hyphen-minus, hyphen, non-breaking hyphen, minus sign, figure dash,
// en dash, em dash
export const HYPHENS = '[-\\u2010\\u2011\\u2212\\u2012\\u2013\\u2014]';
export const ANCHOR_RX = /^#/; // /^#?SA_REF_ANCHOR_/
export const JUNK_RX = /^[-\s.,?!:;']*$/;

const MAX_TRIES = 1000;

const knownProgrammingLanguages = {};
lopl.itemListElement.forEach(li => {
  let { name } = li.item;
  knownProgrammingLanguages[name.toLowerCase()] = name;
});

// ### TREE SCANNING ###
// These are all parsing functions that accept a TreeScanner. They are meant to replace the older
// ones that operated mostly on strings.

// Scan for a simple Person.
export function scanPerson(
  tp,
  store,
  { roleProp, roleName, reUseRoleIdResourceKey } = {}
) {
  let person = {};
  let ids = [];

  const parseDisplayName = () => {
    tp.until(new RegExp(`\\s*${QUOTATION_MARKS}`), (parsed, tp) => {
      person.name = parsed;
      // normally there should only be at most one of these

      const links = tp.flushLinks(); // all links (HTML <a> `href`) seen up to now (including current), flushed
      ids = tp.flushIDs(); // same for IDs (HTML `id`)

      // if person link is https://science.ai/user/username, then set user id to user:username
      const personId = links.find(
        link =>
          link &&
          (link.startsWith('https://science.ai/user/') ||
            link.startsWith('https://sci.pe/user/'))
      );

      if (personId) {
        person['@id'] = createId(
          'user',
          personId.replace(/https:\/\/(science\.ai|sci\.pe)\/user\//, '')
        )['@id'];
      }

      // TODO: create an orcid-regex module
      // http://orcid.org/0000-0002-1731-5346

      person = store.createPerson(person);

      links.forEach(link => {
        if (personId !== link) {
          person.sameAs.push(link);
        }
      });
      store.mapIDs(ids, person);
    });
  };

  // this is the display-name-only case
  if (new RegExp(`^\\s*${QUOTATION_MARKS}`).test(tp.$el.textContent)) {
    tp.space().while(new RegExp(`^${QUOTATION_MARKS}$`));
    parseDisplayName();
  } else if (new RegExp(QUOTATION_MARKS).test(tp.$el.textContent)) {
    // familyName, givenName "name"
    tp.until(/\s*,/, parsed => (person.familyName = parsed))
      .space()
      .until(
        new RegExp(`\\s*(\\(|${QUOTATION_MARKS})`),
        (parsed, tp, match) => {
          person.givenName = parsed;
          if (match[1] === '(') {
            tp.until(/\s*\)/, parsed => (person.additionalName = parsed))
              .space()
              .while(new RegExp(`^${QUOTATION_MARKS}$`));
          }
          parseDisplayName();
        }
      );
  } else {
    // handle cross-ref to Person case
    for (const $node of Array.from(
      tp.$el.querySelectorAll('a[href^="#"], [id]')
    )) {
      const obj =
        store.objForHTML($node.id) ||
        store.objForHTML($node.getAttribute && $node.getAttribute('href'));
      if (obj && obj.$type === 'Person') {
        person = obj;
        break;
      }
    }
  }

  if (!person.$id) {
    store.log.warn({ element: tp.$el }, `Failed to parse person: ${tp.buffer}`);
    return;
  }

  if (roleProp) {
    let role = {};
    if (roleName) {
      role.roleName = roleName;
    }
    role[roleProp] = person;
    return store.createContributorRole(role, {
      curiePrefix: 'role',
      reUseRoleId: true,
      reUseRoleIdResourceKey
    });
  }

  return person;
}

/**
 * Scan for an organisation, with alternateName and location
 * IMPORTANT
 * Here the trick is that we scan atomic orgs *optionally* followed by
 * location. It is acceptable that there are no locations because the org may just be
 * a crossref (in which case we return the org from the store matching the cross-ref).
 */
export function scanOrg(
  tp,
  store,
  childOrg,
  { fromTop = false, roleProp, roleName, reUseRoleIdResourceKey } = {}
) {
  let org = { '@type': 'Organization' };
  let ids = [];

  tp.until(
    {
      rx: new RegExp(`\\s*(\\(|\\)|\\<|;|(?:${HYPHENS}(?=\\s+)))`),
      end: fromTop
    },
    (name, tp, match) => {
      org.name = normalizeText(name);
      if (match[1] === '(') {
        tp.until(/\)/, an => {
          org.alternateName = an;
          tp.until(
            {
              rx: new RegExp(`\\s*(\\)|\\<|;|(?:${HYPHENS}(?=\\s+)))`),
              end: fromTop
            },
            (_, tp, m) => (match = m)
          );
        });
      }

      if (match[1] === '<') {
        let links = tp.flushLinks();
        if (links.length) {
          addOrgLinks(org, links);
        }
        tp.space();
        let res = scanOrg(tp, store, org, { fromTop });
        if (!res) return;
      } else if (new RegExp(HYPHENS).test(match[1])) {
        tp.space();
        org.location = scanLocation(tp, store, fromTop);
      } else if (!match.atEnd) {
        tp.rebuffer(match[1]);
      }

      // only flush the ID for the top level
      if (!childOrg) {
        ids = tp.flushIDs();
      }

      let links = tp.flushLinks();

      const anchorLinks = links.filter(link => ANCHOR_RX.test(link));
      if (anchorLinks.length) {
        const orgCrossRefLink = anchorLinks.find(link => {
          const obj = store.objForHTML(link);
          return obj && schema.is(obj.$type, 'Organization');
        });

        if (orgCrossRefLink) {
          org = store.objForHTML(orgCrossRefLink).toJSON();
        }
      } else if (links.length) {
        addOrgLinks(org, links);
      }
    }
  );

  if (!org) {
    store.log.warn(
      { element: tp.$el },
      'Failed to parse organisation: ' + tp.buffer
    );
    return;
  }

  if (childOrg) {
    childOrg.parentOrganization = org;
  } else {
    org = Organization.fromJSON(store, org, {
      reUseRoleId: true
    });
    store.mapIDs(ids, org);
  }

  if (roleProp) {
    let role = {};
    if (roleName) {
      role.roleName = roleName;
    }
    role[roleProp] = org;
    return store.createContributorRole(role, {
      curiePrefix: 'role',
      reUseRoleId: true,
      reUseRoleIdResourceKey
    });
  }

  return org;
}

function addOrgLinks(org, links) {
  let orgIdLink;
  if (!org['@id']) {
    orgIdLink = arrayify(links).find(
      link =>
        link &&
        (link.startsWith('https://science.ai/organization/') ||
          link.startsWith('https://sci.pe/organization/'))
    );
  }

  const orgSameAsLinks = orgIdLink
    ? arrayify(links).filter(link => link !== orgIdLink)
    : links;

  if (orgIdLink) {
    org['@id'] = orgIdLink.replace(
      /https:\/\/(science\.ai|sci\.pe)\/organization\//,
      'org:'
    );
  }

  if (orgSameAsLinks) {
    org.sameAs = uniq(
      arrayify(org.sameAs)
        .concat(orgSameAsLinks)
        .filter(Boolean)
    );
  }

  return org;
}

// Returns a PostalAddress
export function scanLocation(tp, store, fromTop = false) {
  let geo = [],
    keepGoing = true,
    gone = 0;
  while (keepGoing) {
    gone++;
    if (gone > MAX_TRIES) {
      store.log.warn(
        { element: tp.$el },
        'Failed to parse location, entered endless loop: ' + tp.buffer
      );
      return;
    }
    tp.until({ rx: /\s*(,|;|\))/, end: fromTop }, (step, tp, match) => {
      geo.push(step);
      if (match.atEnd) keepGoing = false;
      else if (match[1] !== ',') {
        tp.rebuffer(match[1]);
        keepGoing = false;
      } else tp.space();
    });
  }
  if (geo.length) {
    let addr = {};
    addr.addressCountry = (geo[geo.length - 1] || '').replace(/\W+$/, '');
    if (geo.length >= 2) addr.addressLocality = geo[0];
    if (geo.length >= 3) addr.addressRegion = geo[1];
    addr = store.createPostalAddress(addr);
    return store.createPlace({ address: addr });
  }

  store.log.warn({ element: tp.$el }, 'Failed to parse location: ' + tp.buffer);
  return;
}

// NOTE: this is *with* the parentheses that might contain it.
// Returns a list of organisations
export function scanOrgList(tp, store, fromTop = false) {
  let orgs = [],
    MAX_LOOP = tp.dbgLevel ? 10 : MAX_TRIES,
    loop = 0,
    done = false;
  tp.space();

  if (!fromTop) {
    tp.until(/\(/);
    // we clear any HTML `id` or links related to the author part (before the `(`)
    tp.flushIDs();
    tp.flushLinks();
  }

  while (true) {
    loop++;
    if (loop >= MAX_LOOP) {
      store.log.warn(
        { element: tp.$el },
        'Failed to parse organisation list: endless loop in scanOrgList(): ' +
          tp.buffer
      );
      return orgs;
    }
    let org = scanOrg(tp, store, null, { fromTop });

    tp.space();
    if (org && org.name) {
      orgs.push(org);
    } else {
      return orgs; // bail early on failure
    }

    tp.until({ rx: /(;|\))/, end: fromTop }, (_, tp, match) => {
      if ((fromTop && match.atEnd) || match[1] === ')') {
        done = true;
      } else {
        tp.space();
      }
    });

    if (done) {
      return orgs;
    }
  }
}

// This scans the full affiliated person format.
// If a `roleProp` is given, this will create a ContributorRole with the person as the
// provided roleProp (author, contributor). If there is none, it will return a Person
// carrying their own affiliations.
export function scanAffiliatedPerson(
  tp,
  store,
  { roleProp, roleName, reUseRoleIdResourceKey } = {}
) {
  let person = scanPerson(tp, store);
  let orgs = scanOrgList(tp, store);
  let target;

  if (roleProp) {
    let role = {};
    if (roleName) {
      role.roleName = roleName;
    }
    role[roleProp] = person;
    target = store.createContributorRole(role, {
      curiePrefix: 'role',
      reUseRoleId: true,
      reUseRoleIdResourceKey
    });
  } else {
    target = person;
  }

  // this works for both ContributorRole and Person (will add org to Person.affiliation or Role.roleAffiliation)
  orgs.forEach(org => target.addAffiliation(org));
  return target;
}

/**
 * NOTE: we assume all text nodes are normalised
 * Returns nothing, just applies the copyright to the given `resource`
 */
export function scanCopyright(
  tp,
  store,
  resource,
  {
    allowUnsafeHolderSeparator = false // in copyright section we can use `;` as separator of copyright holder (mostly legacy see Note below)
  } = {}
) {
  const holderSeparatorRx = allowUnsafeHolderSeparator
    ? /\s+and\s+|&|\\u0026|\s*;\s*/
    : /\s+and\s+|&|\\u0026/;

  // Note: we cannot use `,` or `;` for the list delimiter for the copyright
  // notice format as it needs to be composable with the resource metadata format:
  // ```Data from: <Source1> © 2012 <Holder1> & <Holder2>; <Source2>```
  // Hence our use of `holderSeparatorRx` as separator instead of `;` (`,` is not possible
  // given the organization format)

  let dfs = tp.splitToDocumentFragments(holderSeparatorRx);
  let first = dfs[0] && dfs[0].fragment.firstChild;
  let copyRx = /^\s*(?:©|Copyright|Copr\.?)\s*(\d{4})\s*/;

  // TODO
  // the scanning fails if there are embedded footnotes. how do we handle that? should it be at a
  // higher level? Maybe just remove them from the tp clone?
  if (first && first.nodeType === TEXT_NODE && copyRx.test(first.data)) {
    resource.copyrightYear = RegExp.$1;
    first.data = first.data.replace(copyRx, '');
  } else {
    store.log.warn(
      { element: tp.$el },
      `Failed to parse copyright: ${dfs[0].textContent}`
    );

    return;
  }

  // process each df in turn
  // if only a crossref (surrounded by space/punct) then use that
  // else detect if person or org and parse accordingly
  dfs.forEach(({ fragment }) => {
    let seenElement = false,
      xref = Array.from(fragment.childNodes).every(n => {
        if (n.nodeType === ELEMENT_NODE) {
          if (seenElement) {
            return false;
          }
          seenElement = true;
          if (
            n.localName === 'a' &&
            n.hasAttribute('href') &&
            n.getAttribute('href').match(ANCHOR_RX)
          ) {
            return true;
          }
          return false;
        } else if (n.nodeType === TEXT_NODE) {
          return JUNK_RX.test(n.data);
        }
        return true; // other node types are OK
      });

    // clean up trailing .
    if (fragment.lastChild && fragment.lastChild.nodeType === TEXT_NODE) {
      fragment.lastChild.data = fragment.lastChild.data.replace(/\.\s*$/, '');
    }

    if (xref) {
      let $a = Array.from(fragment.childNodes).find(
        el => el.nodeType === ELEMENT_NODE
      );
      let id = $a.getAttribute('href');
      let holder = resolveHTML(id, store);
      if (holder) {
        resource.addCopyrightHolder(holder);
      }
    } else if (new RegExp(QUOTATION_MARKS).test(fragment.textContent)) {
      let ts = tp.newFromSettings(fragment);
      let person = scanPerson(ts, store);
      if (person) {
        resource.addCopyrightHolder(person);
      }
    } else {
      let ts = tp.newFromSettings(fragment);
      let org = scanOrg(ts, store, null, { fromTop: true });

      if (org) {
        resource.addCopyrightHolder(org);
      }
    }
  });
}

export function scanContact(tp, store) {
  // !! we split by `. key:` so the `key` will be in `match`
  // => we look at the nextMatch when processing
  let dfs = tp.splitToDocumentFragments(/\s*\.(?:\s+(\S+):\s*|$)/);
  let last = dfs[dfs.length - 1] && dfs[dfs.length - 1].fragment;
  let methods = [];
  let nextMatch;

  // if the last df is just junk drop it
  if (last && (!last.hasChildNodes() || JUNK_RX.test(last.textContent))) {
    dfs.pop();
  }

  dfs.forEach(({ fragment, match }) => {
    let ts = tp.newFromSettings(fragment);
    let cur = { method: null, values: [] };

    if (nextMatch) {
      cur.method = nextMatch;
    } else {
      ts.until(/:/, parsed => (cur.method = parsed)).space();
    }

    nextMatch = match[1];

    if (!cur.method) {
      // this is not an error, some of these footnotes are not meant to be
      // parseable (e.g author contribution notes)
      return methods;
    }

    let keepGoing = true,
      gone = 0,
      typemap = {
        mailto: 'email',
        fax: 'fax',
        tel: 'tel',
        sms: 'tel'
      };

    while (keepGoing) {
      keepGoing = false;
      ts.until({ rx: /\s*(\(|;)/, end: true }, (disp, ts, match) => {
        let val = { display: disp.trim(), type: 'string' };
        let links = ts.flushLinks();

        if (links.length) {
          val.url = links[0];

          if (/https?:\/\/twitter\.com\//.test(val.url)) {
            val.type = 'twitter';
          } else if (typemap[val.url.replace(/:.*/, '')]) {
            val.type = typemap[val.url.replace(/:.*/, '')];
          } else {
            val.type = 'url';
          }
        }
        cur.values.push(val);

        if (match.atEnd) {
          return;
        }

        if (match[1] === '(') {
          // parse and set new match
          ts.until(/\s*\)/, parsed => {
            val.context = parsed;
            ts.until(/\s*(;)/, (skip, _, m) => (match = m));
          });
        }
        if (match[1] === ';') {
          keepGoing = true;
        }
      });
      gone++;

      if (gone > MAX_TRIES) {
        store.log.warn(
          { element: tp.$el },
          'Failed to parse contact, entered endless loop: ' +
            fragment.textContent
        );
        return methods;
      }
    }
    methods.push(cur);
  });
  return methods;
}

// Scan a subject/predicate/object line
// This handles the SPO format for funding, acks, and disclosure.
// Returns { subject: [array of subjects], predicate: 'foo', objects: [array of objects] or
// { orgs/award}}
// The content of the objects field depends entirely on what the objectScanner returns.
// The returned data structure is intermediate, but everything it contains is resolved.
export function scanSPO(tp, ctx, store, resource, objectScanner, objectProp) {
  let ret = {
    subjects: [],
    predicate: null,
    objects: null
  };
  let [left, right] = tp
    .splitToDocumentFragments(/\s*:\s*/, 2)
    .map(df => df.fragment);
  if (!left || !right) {
    store.log.warn(
      { element: tp.$el },
      'Failed to parse SPO: ' + tp.$el.textContent
    );
    return;
  }
  // scan just the cp part
  let tLeft = tp.newFromSettings(left),
    dfs = tLeft.splitToDocumentFragments(/\s*;\s*/);
  dfs.forEach(({ fragment }, idx) => {
    let els = Array.from(fragment.childNodes).filter(
        kid => kid.nodeType === ELEMENT_NODE
      ),
      el = els[0];
    if (el) {
      let subj;
      if (el.localName === 'a' && ANCHOR_RX.test(el.getAttribute('href'))) {
        subj = resolveHTML(el.getAttribute('href'), store);
        if (subj) {
          ret.subjects.push(subj);
        }
      } else {
        store.log.warn(
          { element: tp.$el },
          'Failed to find subject in triple: ' + fragment.textContent
        );
      }
      els.forEach(remove);
    } else {
      // TODO: we probably need to trim /\s+and\s+/ from the beginning of all subjects to avoid
      // Oxford comma list problems
      let txt = normalizeText(fragment.textContent);
      ['author', 'contributor', 'work'].forEach(type => {
        let optionalThe = type === 'work' ? '' : '?',
          match = txt.match(
            new RegExp(
              `(\\s*(?:and\\s+)?(?:the\\s+)${optionalThe}${type}s?\\s*)`,
              'i'
            )
          );
        if (match) {
          if (type === 'author') {
            resource.author
              .map(store.mapper())
              .forEach(au => ret.subjects.push(au));
          } else if (type === 'contributor') {
            resource.contributor
              .map(store.mapper())
              .forEach(co => ret.subjects.push(co));
          } else if (type === 'work') {
            ret.subjects.push(resource);
          }
          txt = txt.replace(match[1], '');
        }
      });

      while (fragment.hasChildNodes()) remove(fragment.firstChild);
      fragment.appendChild(fragment.ownerDocument.createTextNode(txt));
    }
    if (idx === dfs.length - 1) {
      let txt = normalizeText(fragment.textContent);
      if (txt.length) {
        ret.predicate = txt;
      } else {
        store.log.warn(
          { element: tLeft.$el },
          'Failed to find predicate in triple: ' + tLeft.$el.textContent
        );
      }
    }
  });

  if (objectScanner) {
    ret.objects = objectScanner(tp.newFromSettings(right), store, objectProp);
  }

  return ret;
}

/**
 * Used to parse individual author or contributor _and_ the values from DS3
 * "Resource sources and permissions format"
 */
export function scanEntity(
  tp,
  fragment,
  store,
  { roleProp, roleName, reUseRoleIdResourceKey } = {}
) {
  let txt = normalizeText(fragment.textContent);

  // if fragment contains only junk text and local references, then use those local references
  // This is to prevent false parsing on the text content if the cross-ref text
  // content contains a full caption for instance
  // NOTE we exclude cross-ref to person and organization here as those require special
  // processing to handle the roles
  if (
    Array.from(fragment.childNodes).every(
      n =>
        (n.nodeType === TEXT_NODE && JUNK_RX.test(n.textContent)) ||
        (n.nodeType === ELEMENT_NODE &&
          n.localName === 'a' &&
          /^#/.test(n.getAttribute('href')))
    )
  ) {
    const objs = Array.from(
      fragment.querySelectorAll('a[href^="#"]:not([id^="fnref"])')
    )
      .map($a => resolveHTML($a.getAttribute('href'), store))
      .filter(obj => {
        return (
          obj && obj.$type !== 'Person' && !schema.is(obj.$type, 'Organization')
        );
      });
    if (objs.length) {
      return objs;
    }
  }

  // affiliatedPerson (quotes then parens) or Person cross-ref followed with parens
  if (
    new RegExp(`${QUOTATION_MARKS} \\(`).test(txt) ||
    (txt.includes('(') &&
      Array.from(fragment.querySelectorAll('a[href^="#"], [id]')).some(
        $node => {
          const obj =
            store.objForHTML($node.id) ||
            store.objForHTML($node.getAttribute && $node.getAttribute('href'));
          return obj && obj.$type === 'Person';
        }
      ))
  ) {
    let person = scanAffiliatedPerson(tp.newFromSettings(fragment), store, {
      roleProp,
      roleName,
      reUseRoleIdResourceKey
    });

    return person ? [person] : [];
  }

  // person (quotes) or person cross-ref
  if (
    new RegExp(`${QUOTATION_MARKS}`).test(txt) ||
    Array.from(fragment.querySelectorAll('a[href^="#"], [id]')).some($node => {
      const obj =
        store.objForHTML($node.id) ||
        store.objForHTML($node.getAttribute && $node.getAttribute('href'));
      return obj && obj.$type === 'Person';
    })
  ) {
    let person = scanPerson(tp.newFromSettings(fragment), store, {
      roleProp,
      roleName,
      reUseRoleIdResourceKey
    });
    if (person) return [person];
    return [];
  }

  // org (hyphens or <, surrounded by space) or org cross-ref
  if (
    new RegExp(`\\s+(?:${HYPHENS}|<)\\s+`).test(txt) ||
    Array.from(fragment.querySelectorAll('a[href^="#"], [id]')).some($node => {
      const obj =
        store.objForHTML($node.id) ||
        store.objForHTML($node.getAttribute && $node.getAttribute('href'));
      return obj && schema.is(obj.$type, 'Organization');
    })
  ) {
    let org = scanOrg(tp.newFromSettings(fragment), store, null, {
      fromTop: true,
      roleProp,
      roleName,
      reUseRoleIdResourceKey
    });
    if (org) return [org];
    return [];
  }

  // other (cross-ref to citations or resources used in DS3 Resource sources and permissions format)
  return Array.from(fragment.childNodes)
    .map(kid => {
      if (kid.nodeType === ELEMENT_NODE && kid.localName === 'a') {
        let href = kid.getAttribute('href');
        if (/^http/i.test()) {
          return store.createThing({
            name: kid.textContent,
            url: href,
            sameAs: [href]
          });
        }
        let obj = store.objForHTML(href);
        if (obj) {
          return obj;
        }
        return store.createThing({ url: href, sameAs: [href] });
      }
      return null;
    })
    .filter(Boolean);
}

export function scanAward($award, store, fromTriple) {
  // if it's from a tripple we remove the dot at the end.
  const txt = normalizeText(
    fromTriple ? $award.textContent.replace(/\.\s*$/, '') : $award.textContent
  );
  const nameAtStart = new RegExp(`^${QUOTATION_MARKS}`).test(txt);

  const rx =
    (nameAtStart ? '()' : `(${QUOTATION_MARKS.replace('[', '[^')}+?)`) +
    `(?:\\s*${QUOTATION_MARKS}([^\\(]+?)(?:\\s*\\((.*?)\\))?\\s*${QUOTATION_MARKS})` +
    (nameAtStart ? '' : '?') +
    `(?:\\s*,\\s*(.*))?$`;

  const match = txt.match(new RegExp(rx));

  if (match) {
    const $a = $award.querySelector('a[href^="http"]');
    let url;
    if ($a) {
      url = $a.getAttribute('href');
    }

    return store.createFundingSource({
      url,
      serialNumber: match[1] || undefined, // protect for ''
      name: match[2] || undefined,
      alternateName: match[3] || undefined,
      description: match[4] || undefined
    });
  } else if (fromTriple) {
    store.log.warn({ element: $award }, 'Failed to parse award: ' + txt);
  }
}

// Parses resource metadata, and applies it to that resource
export function scanResourceMetadata(tp, store, ctx, resource) {
  // description, all the fields
  let rx = /((?:Authors?|Contributors?|License|Copyright|Keywords?|(?:(?:(?:Data|Table|Code|Figure|Photograph|Painting|Artwork|Audio|Video)\s+)?(?:Reproduced\s+from|From|Courtesy\s+of|Programming Language)))\s*:\s*)/i;
  let dfs = tp.splitToDocumentFragments(rx);
  let nextMatch;

  dfs.forEach(({ fragment, match }, idx) => {
    if (!idx) {
      let desc = normalizeText(fragment.textContent);
      if (desc && !JUNK_RX.test(desc)) {
        fragment.innerHTML = normalizeText(
          fragment.innerHTML.replace(/^[\s.]+/, '')
        );
        resource.caption = textOrHTML(fragment);
      }
      nextMatch = match;
      return;
    }
    let key = normalizeText(nextMatch[1].toLowerCase()).replace(/:$/, '');
    nextMatch = match;

    if (/(author|contributor)s?/.test(key)) {
      let contribs = tp
        .newFromSettings(fragment)
        .splitToDocumentFragments(/\s*;\s*/, 0, {
          ignoreIfWithinParenthesis: true // Needed as multiple affiliation are separated with `;` as well (but are within ()`
        });

      let roles = [];
      let roleProp = key.replace(/s$/, '');

      contribs.forEach(({ fragment }) => {
        // first we extract the footnotes: that cleans things up, then we call scanEntity()
        const {
          roleActions,
          roleContactPoints,
          roleContactPointNoteIdentifier
        } = scanAuthorFootnotes(fragment, ctx, store, {
          reUseRoleIdResourceKey: resource.alternateName
        });

        let ents = scanEntity(tp, fragment, store, {
          roleProp,
          roleName: 'author',
          reUseRoleIdResourceKey: resource.alternateName
        });
        const role = ents[0];

        if (role) {
          if (roleActions) {
            roleActions.forEach(action => {
              role.addRoleAction(action);
            });
          }
          if (roleContactPoints) {
            role.roleContactPointNoteIdentifier = roleContactPointNoteIdentifier;
            roleContactPoints.forEach(contactPoint => {
              role.addRoleContactPoint(contactPoint);
            });
          }
          roles.push(role);
        }
      });

      if (roles.length) {
        resource[roleProp] = roles;
      }
    } else if (/keywords?/.test(key)) {
      scanKeywords(tp.newFromSettings(fragment), store, resource);
    } else if (key === 'license') {
      parseLicenses(resource, fragment, ctx);
    } else if (key === 'programming language') {
      parseProgrammingLanguage(resource, fragment, ctx);
    } else if (key === 'copyright') {
      scanCopyright(tp.newFromSettings(fragment), store, resource, {
        allowUnsafeHolderSeparator: true
      });
    } else {
      // Resource sources and permissions
      // e.g ```Data from: <Source1> © 2012 <Holder1> & <Holder2>; <Source2>```
      let attrDFs = tp
        .newFromSettings(fragment)
        .splitToDocumentFragments(/\s*;\s*/); // Note: that breaks if copyright has a list of holder separated by `;` => `scanCopyright` must be called with `allowUnsafeHolderSeparator` set to `false` to prevent that (DS3 doesn't allow `;` as copyright holder separater in this context)

      let attachKey = 'isBasedOn';

      if (/courtesy/.test(key)) {
        attachKey = 'provider';
      } else if (/reproduced/.test(key)) {
        attachKey = 'exampleOfWork';
      }

      attrDFs.forEach(({ fragment }) => {
        let permission = false;
        fragment.innerHTML = fragment.innerHTML.replace(
          /\s*,\s*with\s+permission\s*\.?\s*/,
          () => {
            permission = true;
            return '';
          }
        );

        let [source, copy] = tp
          .newFromSettings(fragment)
          .splitToDocumentFragments(/\s*\u00a9\s*/, 2); //Note: \u00a9 is the COPYRIGHT SIGN (©)

        if (source && source.fragment.hasChildNodes()) {
          let sources = scanEntity(tp, source.fragment, store);
          // if it's courtesy, just dump the resolved sources (Person or Org in this case) in `provider`
          if (attachKey === 'provider') {
            sources.forEach(src => resource.addProvider(src));
          } else {
            sources.forEach(src => {
              // `src` can be Work, Person or Org
              // !! in case of work, it can be wrapped in a TargetRole.
              // This happens for point citations e.g `data from: Smith 2014, fig. 2`
              // When we have a role, we need to unrole it to be able to attach
              // the copyright
              if (copy && copy.fragment.hasChildNodes()) {
                let fr = copy.fragment.cloneNode(true);
                // make it parseable by adding a (c) at the start
                fr.innerHTML = 'Copyright ' + fr.innerHTML;

                let unroled;
                if (src.$type === 'TargetRole' && src.citation) {
                  unroled = store.get(src.citation);
                }

                scanCopyright(tp.newFromSettings(fr), store, unroled || src, {
                  allowUnsafeHolderSeparator: false
                });
              }

              if (permission) {
                src.potentialAction = store.createAuthorizeSourceUsageAction({
                  actionStatus: 'CompletedActionStatus'
                });
              }

              if (attachKey === 'isBasedOn') {
                resource.addIsBasedOn(src);
              } else if (attachKey === 'exampleOfWork') {
                resource.addExampleOfWork(src);
              }
            });
          }
        }
      });
    }
  });
}

export function scanMultiFigureMetadata(
  tp,
  labels,
  store,
  ctx,
  figMap,
  resource
) {
  // we split on /\.\s*(label)/ and make sure we have as many entries as there are sub-figures,
  // otherwise given up and just use that as a description.
  let labRx = labels
      .map(str => (str || '').replace(/([.?*+^$[\]\\(){}|-])/g, '\\$1'))
      .join('|'),
    dfs = tp.splitToDocumentFragments(new RegExp(`\\.\\s*\\((${labRx})\\)`));
  // TODO: also, we could support syntaxes like (A,E,G) and (A-F), even (A-F,G,Y-Z)
  if (dfs.length > 1) {
    let fst = dfs.shift(); // the basic details
    scanResourceMetadata(
      tp.newFromSettings(fst.fragment),
      store,
      ctx,
      resource
    );
    let label = fst.match[1];
    dfs.forEach(({ fragment, match }) => {
      // individual parts get parsed by scanResourceMetadata()
      let part = store.get(figMap[label]);
      // make Tiff's OCD more manageable
      if (
        fragment.lastChild &&
        fragment.lastChild.nodeType === 3 &&
        /\.\s*$/.test(fragment.lastChild.data)
      ) {
        fragment.lastChild.data = fragment.lastChild.data.replace(/\.\s*$/, '');
      }
      if (part) {
        scanResourceMetadata(tp.newFromSettings(fragment), store, ctx, part);
      }
      label = match[1];
    });
  } else {
    // if it doesn't match, we scan the whole thing as a single result
    scanResourceMetadata(tp, store, ctx, resource);
  }
}

export function scanAuthorFootnotes(
  p,
  ctx,
  store,
  { reUseRoleIdResourceKey } = {}
) {
  const extracted = {};

  // grab footnotes, set as `roleAction` (for contribution notes) or
  // `roleContactPoint` (contact info)
  Array.from(p.querySelectorAll('a[role~="doc-noteref"]')).forEach(fnref => {
    let id = fnref.getAttribute('href').replace(/^#/, '');
    let fn = ctx.doc.getElementById(id);

    // remove the fnref and the <sup> wrapping it (if any and if it has no other children)
    if (
      fnref.parentElement &&
      fnref.parentElement.localName === 'sup' &&
      !fnref.parentElement.attributes.length &&
      fnref.parentElement.children.length === 1
    ) {
      remove(fnref.parentElement);
    } else {
      remove(fnref);
    }

    if (!fn) {
      return;
    }

    let tp = new TreeScanner(fn.querySelector('p'), ctx.log).debug(0);

    let contactInfo = scanContact(tp, store);

    if (!contactInfo || !contactInfo.length || contactInfo.some(ci => !ci)) {
      // contribution note case
      let action = store.createContributeAction({
        noteIdentifier: parseInt(normalizeText(fnref.textContent), 10),
        description: textOrHTML(fn)
      });

      if (!extracted.roleActions) {
        extracted.roleActions = [];
      }
      extracted.roleActions.push(action);
    } else {
      // contactPoint case
      extracted.roleContactPointNoteIdentifier = parseInt(
        normalizeText(fnref.textContent),
        10
      );

      contactInfo.forEach(ci => {
        let label = ci.method;

        ci.values.forEach(val => {
          let cpt = store.createContactPoint({
            url: val.url,
            contactType: val.context,
            name: normalizeText(label)
          });

          if (/^\s*address\s*$/i.test(label)) {
            cpt.address = val.display;
          } else {
            cpt.description = val.display;
          }

          if (val.type === 'email') {
            cpt.email = val.url;
          } else if (val.type === 'fax') {
            cpt.faxNumber = val.url;
          } else if (val.type === 'tel') {
            cpt.telephone = val.url;
          }

          if (!extracted.roleContactPoints) {
            extracted.roleContactPoints = [];
          }
          extracted.roleContactPoints.push(cpt);
        });
      });
    }
  });

  return extracted;
}

export function resolveHTML(id, store) {
  let obj = store.objForHTML(id);
  if (obj) {
    return obj;
  }

  store.log.warn(`Failed to find ID ${id}`);
}

export function parseLicenses(resource, $el, ctx) {
  let txt = normalizeText($el.textContent);
  let sep = /;/.test(txt) ? /\s*;\s*/ : /\s*,\s*/;

  txt
    .replace(/\s*\.$/, '')
    .split(sep)
    .filter(Boolean)
    .forEach(lic => {
      if (spdx[lic]) {
        resource.license = `spdx:${lic}`;
      } else if (lic === 'CC-BY') {
        resource.license = `spdx:CC-BY-4.0`;
      } else if (lic === 'CC-BY-ND') {
        resource.license = `spdx:CC-BY-ND-4.0`;
      } else if (lic === 'CC-BY-NC') {
        resource.license = `spdx:CC-BY-NC-4.0`;
      } else if (lic === 'CC-BY-NC-ND') {
        resource.license = `spdx:CC-BY-NC-ND-4.0`;
      } else if (lic === 'CC-BY-NC-SA') {
        resource.license = `spdx:CC-BY-NC-SA-4.0`;
      } else if (lic === 'CC-BY-SA') {
        resource.license = `spdx:CC-BY-SA-4.0`;
      } else if (lic === 'CC0') {
        resource.license = `spdx:CC0-1.0`;
      } else if (urlRx({ exact: true }).test(lic)) {
        resource.license = lic;
      } else {
        ctx.log.warn(
          { element: $el },
          `License text is neither SPDX nor URL: '${lic}'`
        );
      }
    });
}

export function parseProgrammingLanguage(resource, $el, ctx) {
  let txt = normalizeText($el.textContent);
  let sep = /;/.test(txt) ? /\s*;\s*/ : /\s*,\s*/;

  txt
    .replace(/\s*\.$/, '')
    .split(sep)
    .filter(Boolean)
    .forEach(pl => {
      pl = pl.toLowerCase();
      if (knownProgrammingLanguages[pl])
        resource.programmingLanguage = knownProgrammingLanguages[pl];
      else {
        ctx.log.warn({ element: $el }, `Unknown programming language: '${pl}'`);
      }
    });
}

export function scanKeywords(tp, store, resource) {
  let keywords = [];
  let subjects = [];
  let dfs = tp.splitToDocumentFragments(/\s*;\s*/);

  dfs.forEach(({ fragment }) => {
    const $a = fragment.querySelector('a');
    const href = $a && $a.getAttribute('href');
    const txt = normalizeText(fragment.textContent).replace(/\.\s*$/, '');

    $a && href
      ? href.startsWith('https://science.ai/subjects/') ||
        href.startsWith('https://sci.pe/subjects/')
        ? subjects.push({
            '@id': `subjects:${href.replace(
              /https:\/\/(science\.ai|sci\.pe)\/subjects\//,
              ''
            )}`,
            name: txt
          })
        : subjects.push({
            name: txt,
            url: href
          })
      : keywords.push(txt);
  });

  if (keywords.length > 0) {
    resource.keywords = keywords;
  }
  if (subjects.length > 0) {
    resource.about = subjects;
  }

  return;
}
