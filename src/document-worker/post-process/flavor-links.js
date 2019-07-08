import { schema } from '@scipe/librarian';
import { getId, prefix } from '@scipe/jsonld';
import { addRel } from '../lib/utils';

export default function flavorLinks(ctx, cb) {
  let { doc, store } = ctx;
  try {
    flavor(ctx, doc);
    store.getObjectsWithHtmlLinks().forEach(({ object, key }) => {
      let div = doc.createElement('div');
      div.innerHTML = object[key]['@value'];
      flavor(ctx, div);
      object[key]['@value'] = div.innerHTML;
    });
  } catch (e) {
    ctx.log.error(e);
  }
  process.nextTick(cb);
}
flavorLinks.message = `Flavoring links`;

function flavor(ctx, node) {
  const { store } = ctx;

  Array.from(node.querySelectorAll('a')).forEach($a => {
    const href = $a.getAttribute('href');
    const prop = $a.getAttribute('property');
    const content = $a.getAttribute('content'); // TODO fix upstream content is invalid RDFa for a link to a resource, should be resource instead
    const role = $a.getAttribute('role');
    const rels = ($a.getAttribute('rel') || '').split(/\s+/).filter(Boolean);

    if (!/^\s*#/.test(href)) return;
    const id = href.replace(/^\s*#/, '');
    const el = (node.ownerDocument || node).getElementById(id);

    if (el && el.localName === 'section') {
      return; // exit early for known false
    }

    let obj = store.objForHTML(id) || store.get(id);
    if (!obj && el && el.hasAttribute('resource')) {
      obj = store.get(el.getAttribute('resource'));
    }
    if (!obj && content) {
      obj = store.get(content);
    }

    // backlinks
    if (rels.some(r => r === 'prev') || role === 'doc-backlink') {
      return;
    }

    // TODO make more secure (can be several parents...)
    const parentData = store.findParent(obj);

    // citations
    if (
      role === 'doc-biblioref' ||
      rels.some(r => r === 'doc-biblioentry') ||
      rels.some(r => r === 'doc-biblioref') ||
      prop === 'schema:citation' ||
      (parentData &&
        (parentData.prop === 'citation' &&
          parentData.parent.$type !== 'TargetRole'))
    ) {
      if (obj && parentData) {
        // Don't overwrite RDFa for point citation data generated upstream
        if (!$a.hasAttribute('about')) {
          $a.setAttribute('about', parentData.parent.$id); // subject
        }
        if (!$a.hasAttribute('property')) {
          $a.setAttribute('property', prefix(parentData.prop)); // predicate
        }
        if (!$a.hasAttribute('resource')) {
          $a.setAttribute('resource', obj.$id); // object
        }
        $a.setAttribute('href', `#${obj.$id}`); // TODO improve
      }
      addRel($a, 'doc-biblioref');
      return;
    }

    // footnotes and endnotes
    if (
      role === 'doc-noteref' ||
      rels.some(r => r === 'footnote') ||
      rels.some(r => r === 'endnote') ||
      prop === 'sa:note'
    ) {
      if (obj) {
        const note = obj.toJSON(); // footnote or endnote
        const resourceId = getId(note.about); // the resource hosting the footnote or endnote (so where it points to)
        if (resourceId) {
          $a.setAttribute('about', resourceId); // subject
          $a.setAttribute('property', `sa:note`); // predicate
          $a.setAttribute('resource', getId(note)); // object
        }
      }

      return;
    }

    // resource, person or org
    if (obj) {
      const data = obj.toJSON();
      if (el) {
        el.setAttribute('id', getId(data));
      }
      $a.setAttribute('href', `#${getId(data)}`);

      if (schema.is(data, 'CreativeWork')) {
        const isPartOfId = getId(data.isPartOf) || '#';
        $a.setAttribute('about', isPartOfId); // subject
        $a.setAttribute('property', `schema:hasPart`); // predicate
        $a.setAttribute('resource', getId(data)); // object
      } else if (schema.is(data, 'Person') || schema.is(data, 'Organization')) {
        if (parentData) {
          const { parent: parentObj, prop } = parentData;
          $a.setAttribute('about', parentObj.$id); // subject
          $a.setAttribute('property', prefix(prop)); // predicate (typicaly sa:roleAffiliation or schema:author...)
          $a.setAttribute('resource', getId(data)); // object
        }
      }
    }

    // XXX this isn't right
    // console.warn('no mapping found');
  });
}
