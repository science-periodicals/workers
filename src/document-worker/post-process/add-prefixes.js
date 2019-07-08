import saPrefixes from '@scipe/ontology/prefixes';

export default function addPrefixes(ctx, cb) {
  let { doc } = ctx;
  // fix the prefix attribute to make sure we have something sensible
  let prefixes;
  try {
    prefixes = Object.assign(
      {},
      saPrefixes,
      prefix2map(doc.documentElement.getAttribute('prefix') || ''),
      prefix2map(doc.body.getAttribute('prefix') || '')
    );
    // we actually don't want them on the root HTML, but rather on the body
    if (doc.documentElement.hasAttribute('prefix')) {
      doc.documentElement.removeAttribute('prefix');
    }
    doc.body.setAttribute('prefix', map2prefix(prefixes));
  } catch (e) {
    ctx.log.error(e);
  }
  process.nextTick(cb);
}
addPrefixes.message = `Add RDFa prefixes`;

function map2prefix(ns) {
  if (ns && Object.keys(ns)) {
    let arr = [],
      keys = Object.keys(ns);
    for (let i = 0; i < keys.length; i++) {
      let k = keys[i];
      arr.push(k + ':');
      arr.push(ns[k]);
    }
    return arr.join(' ');
  }
  return '';
}

function prefix2map(str) {
  let map = {};
  if (/^\s*$/.test(str)) return map;
  let items = str.trim().split(/\s+/);
  while (items.length) {
    let pfx = items.shift();
    if (!/^\w+:$/.test(pfx)) {
      // TODO: add proper error reporting
      console.error('Wrong prefix syntax in RDFa prefix declaration: ' + pfx);
      return map; // we give up with what we have
    }
    map[pfx.replace(/:$/, '')] = items.shift();
  }
  return map;
}
