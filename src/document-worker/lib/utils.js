import fs from 'fs';
import url from 'url';
import xmldom from 'xmldom';
import mmm from 'mmmagic';
import { normalizeText } from 'web-verse';
import ds3Mime from '@scipe/ds3-mime';

// media types
export const HTML = 'text/html';
export const DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const DS3 = ds3Mime;
export const JATS = 'application/vnd.scienceai.jats+tgz';
export const PDF = 'application/pdf';
export const XPDF = 'application/x-pdf'; // really old
export const GZIP = 'application/x-gzip';

const magic = new mmm.Magic(mmm.MAGIC_MIME_TYPE);

export function splitMax2(str, re) {
  let match = (typeof re === 'string' ? new RegExp(re) : re).exec(str);
  if (!match) return [str];
  let idx = str.indexOf(match[0]);
  return [str.substring(0, idx), str.substring(idx + match[0].length)];
}

export function childMatching($el, selector) {
  return Array.from($el.children).find(
    $child => $child.nodeType === 1 && $child.matches(selector)
  );
}

export function childrenMatching($el, selector) {
  if (!$el || !$el.children) return [];
  return Array.from($el.children).filter(
    $child => $child.nodeType === 1 && $child.matches(selector)
  );
}

// the problem is that :not() does not take a list, so we have to do our own filtering
export function childrenNotMatching($el, selectors) {
  if (!$el || !$el.children) return [];
  return Array.from($el.children).filter(
    $child =>
      $child.nodeType === 1 && !selectors.find(sel => $child.matches(sel))
  );
}

export function escHTML(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

//TODO generalize remove function to also remove empty parents as well if they do not have an rdfa or id attributes
export function remove($el) {
  if (!$el || !$el.parentNode) {
    return;
  }
  $el.parentNode.removeChild($el);
  return $el;
}

export function copyAttr(from, to, all = false) {
  for (let i = 0; i < from.attributes.length; i++) {
    let n = from.attributes[i].name;
    if (!all && (n === 'class' || /^data-/.test(n))) continue;
    to.setAttribute(n, from.getAttribute(n));
  }
}

export function renameElement($el, name) {
  if (!$el) return;
  if ($el.localName === name) return $el;
  let $new = $el.ownerDocument.createElement(name);
  for (let i = 0; i < $el.attributes.length; i++) {
    let at = $el.attributes[i];
    $new.setAttribute(at.name, at.value);
  }
  while ($el.hasChildNodes()) $new.appendChild($el.firstChild);
  $el.parentNode.replaceChild($new, $el);
  return $new;
}

export function nodeOffset(n) {
  let offset = 0,
    ps = n.previousSibling;
  while (ps) {
    offset++;
    ps = ps.previousSibling;
  }
  return offset;
}

export function nodePosition(n) {
  let position = [],
    curNode = n;
  while (curNode) {
    position.unshift(nodeOffset(curNode));
    curNode = curNode.parentNode;
  }
  return position;
}

export function compareNodePositions(a, b) {
  let posA = nodePosition(a),
    posB = nodePosition(b),
    iterator = posA.length >= posB.length ? posA : posB;
  for (let i = 0; i < iterator.length; i++) {
    if ((posA[i] || -1) < (posB[i] || -1)) return 'before';
    if ((posA[i] || -1) > (posB[i] || -1)) return 'after';
  }
  return 'identical';
}

export function textOrHTML(el) {
  if (el.querySelector('*')) {
    const clean = cleanUpHtml(el.cloneNode(true));

    // remove <p> wrappers if the content has no extra markup
    if (clean.children.length === 1 && clean.children[0].localName === 'p') {
      const $p = clean.children[0];
      if (!$p.querySelector('*') && !$p.attributes.length) {
        return normalizeText($p.textContent);
      }
    }

    return { '@type': 'rdf:HTML', '@value': clean.innerHTML };
  }
  return normalizeText(el.textContent);
}

export function sup($el, num) {
  let s = $el.ownerDocument.createElement('sup');
  s.textContent = `${num}`;
  $el.appendChild(s);
}

export function loadXML(file, cb) {
  fs.readFile(file, { encoding: 'utf8' }, (err, xml) => {
    if (err) return cb(err);
    let doc,
      errors = [];
    try {
      doc = new xmldom.DOMParser({
        errorHandler: {
          fatalError: f => errors.push(f)
        }
      }).parseFromString(xml);
      if (errors.length) {
        let msg = errors.map(str => str.replace(/\n@#.*?]/, '')).join('\n  - ');
        throw new Error(`Fatal XML parsing error:\n  - ${msg}`);
      }
    } catch (err) {
      return cb(`Failed to parse XML file '${file}': ${err}`);
    }
    if (doc) cb(null, doc);
    else cb(`Parsing ${file} as XML failed to produce a document`);
  });
}

export function arrayify(obj) {
  if (obj == null) return [];
  return Array.isArray(obj) ? obj : [obj];
}

export function ancestors(el) {
  if (!el) return [];
  let parents = [],
    pn = el.parentNode;
  while (pn && pn.nodeType === 1) {
    parents.push(pn);
    pn = pn.parentNode;
  }
  return parents;
}

export function hasAncestor(el, localName) {
  return !!ancestors(el).find(e => e.localName === localName);
}

export function isUncaptionedImage($img) {
  const ancestorLocalNames = new Set(ancestors($img).map(el => el.localName));

  return (
    ancestorLocalNames.has('table') ||
    ancestorLocalNames.has('aside') ||
    (!ancestorLocalNames.has('table') &&
      !ancestorLocalNames.has('aside') &&
      !ancestorLocalNames.has('figure'))
  );
}

export function ancestorsMatching($el, selector) {
  return ancestors($el).filter(
    $anc => $anc && $anc.nodeType === 1 && $anc.matches(selector)
  );
}

export function hasAncestorMatching($el, selector) {
  return !!ancestorsMatching($el, selector).length;
}

let fileTypeCache = {};
export function fileType(absPath, cb) {
  if (typeof absPath !== 'string') absPath = absPath.path;
  if (fileTypeCache[absPath]) return cb(null, fileTypeCache[absPath]);
  magic.detectFile(absPath, (err, type) => {
    if (err) return cb(err);
    fileTypeCache[absPath] = type;
    cb(null, type);
  });
}

export function checkAbsolute(src) {
  if (!src || typeof src !== 'string') return false;
  let { protocol } = url.parse(src);
  return !!protocol;
}

export function linksInGraph(store) {
  let objects = [];
  store.objects().forEach(obj => {
    let json = obj.toJSON();
    Object.keys(json).forEach(k => {
      if (
        json[k] &&
        json[k]['@type'] &&
        json[k]['@type'] === 'rdf:HTML' &&
        json[k]['@value'] &&
        /<a/i.test(json[k]['@value']) // just an optimisation
      )
        objects.push({ object: obj, key: k });
    });
  });
  return objects;
}

export function isSupporting($el) {
  return ancestorsMatching($el, 'section').some($sec => {
    let $h = $sec.firstElementChild;
    // Note: keep regexps in sync with `sectionExtractor` untill we migrate to style guide support
    return (
      $h &&
      /^h[1-6]$/i.test($h.localName) &&
      /^(Supporting\s+Information)$/i.test(normalizeText($h.textContent))
    );
  });
}

export function setSectionId($section) {
  if (!$section) return '';
  const document = $section.ownerDocument;

  if ($section.getAttribute('id')) {
    return $section.getAttribute('id');
  }

  let $h;
  if ($section.localName === 'figure') {
    let $fc = $section.lastElementChild;
    if ($fc) {
      $h = $fc.querySelector(
        '[property="schema:alternateName"], [property="schema:caption"]'
      );
    }
  } else {
    $h = $section.firstElementChild;
  }

  if (!$h || !/^h[1-6]$/.test($h.localName)) {
    $h = null;
  }

  if ($h && $h.getAttribute('id')) {
    $section.setAttribute('id', $h.getAttribute('id'));
    $h.removeAttribute('id');
    return $section.getAttribute('id');
  }

  const text = $h && $h.textContent ? $h.textContent : 'generated-id';

  const id = text
    .replace(/\W+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-/, '')
    .replace(/-$/, '')
    .toLowerCase();

  if (!document.getElementById(id)) {
    $section.setAttribute('id', id);
    return id;
  }

  let counter = 1;
  while (document.getElementById(`${id}-${counter}`)) counter++;

  const uniqueId = `${id}-${counter}`;
  $section.setAttribute('id', uniqueId);
  return uniqueId;
}

export function cleanUpHtml($node) {
  // remove non sa- classes
  Array.from($node.querySelectorAll('*[class]')).forEach($el => {
    for (let i = 0; i < $el.classList.length; i++) {
      if (!$el.classList.item(i).startsWith('sa-')) {
        $el.classList.remove($el.classList.item(i));
      }
    }
    if (!$el.classList.length) {
      $el.removeAttribute('class');
    }
  });

  // remove style
  Array.from($node.querySelectorAll('*[style]')).forEach($el => {
    $el.removeAttribute('style');
  });

  // re-instate style when we actually meant it
  Array.from($node.querySelectorAll('[data-style]')).forEach($el => {
    let style = [$el.getAttribute('style'), $el.getAttribute('data-style')]
      .filter(Boolean)
      .join('; ');
    $el.setAttribute('style', style);
    // Note: we do NOT remove the `data-style` attribute as `cleanUpHtml` can be
    // called several times on the same element, removing the `data-style`
    // attribute would result in losing the `style` one on the second call
  });

  return $node;
}

export function addRel($a, value) {
  let rels = ($a.getAttribute('rel') || '').split(/\s+/).filter(Boolean);
  if (!rels.some(r => r === value)) {
    rels.push(value);
  }
  $a.setAttribute('rel', rels.join(' '));
}
