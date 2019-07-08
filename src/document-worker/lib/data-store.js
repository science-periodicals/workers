import isString from 'lodash/isString';
import { schema } from '@scipe/librarian';
import { getId, flatten, arrayify, textify } from '@scipe/jsonld';
import * as classes from './types';
const { Thing, Resource, ContributorRole } = classes;

export default class DataStore {
  constructor(idGenerator, ctx = {}) {
    this.ctx = ctx;
    this.data = {};
    this.cache = {};
    this.generateId = idGenerator;
    this.log = ctx.log;
    this.html2id = {};
  }

  graph(callback) {
    let nodes = [];
    Object.keys(this.data).forEach(k => {
      let val = this.data[k];
      let node = val.toJSON();
      Object.keys(node).forEach(key => {
        if (node[key] && Array.isArray(node[key]) && node[key].length === 0) {
          delete node[key];
        }
      });
      nodes.push(node);
    });

    flatten(
      { '@graph': nodes },
      { preserveUuidBlankNodes: true },
      (err, flattened) => {
        if (err) {
          this.log.error(err, 'Failed to flatten (likely fatal)');
        }
        delete flattened['@context'];

        arrayify(flattened['@graph']).forEach(node => {
          // remove empty lists TODO do that upstream
          Object.keys(node).forEach(key => {
            if (Array.isArray(node[key]) && node[key].length === 0) {
              delete node[key];
            }
          });
        });

        callback(null, flattened);
      }
    );
  }

  objects() {
    return Object.keys(this.data).map(k => this.data[k]);
  }

  getObjectsWithHtmlLinks() {
    let objects = [];
    this.objects().forEach(obj => {
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

  get(id) {
    if (!id) return;
    if (id['@id'] || id.$id) {
      id = id['@id'] || id.$id;
    }
    return this.data[id];
  }

  objForHTML(
    id // can be a href
  ) {
    // return  object mapped to the HTML `id`
    if (!id) return;
    id = id.replace(/^\s*#/, '');
    let objID = this.html2id[id] || id; //fallback if flavorLink was run
    if (!objID) return;
    return this.data[objID];
  }

  // give this a Person or Organization and it will find the ContributorRole
  findContributorRole(obj) {
    if (!obj) return;
    if (obj.$type === 'ContributorRole') return obj;
    for (let k in this.data) {
      if ({}.hasOwnProperty.call(this.data, k)) {
        let role = this.data[k];
        if (role.$type !== 'ContributorRole') continue;
        let roleValue = role.author || role.contributor;
        if (!roleValue) continue;
        let rid = roleValue.$id || roleValue['@id'];
        if (rid === obj.$id) return role;
      }
    }
  }

  // This is useful for Rdfa generation when we need to find the parent obj of a role for instance
  findParent(obj) {
    if (!obj) return;
    const id = obj.$id || obj['@id'];
    if (id) {
      for (const k in this.data) {
        if ({}.hasOwnProperty.call(this.data, k)) {
          const data = this.data[k]._;
          for (const p in data) {
            if (
              data.hasOwnProperty(p) &&
              p !== '@id' &&
              arrayify(data[p]).some(value => {
                return getId(value) === id;
              })
            ) {
              return { parent: this.data[k], prop: p };
            }
          }
        }
      }
    }
  }

  findEncodingByImg($img) {
    if (!$img) {
      return;
    }

    for (const k in this.data) {
      if (Object.prototype.hasOwnProperty.call(this.data, k)) {
        const object = this.data[k];
        if (object.$type === 'ImageObject' && object.contentUrl === $img.src) {
          return object;
        }
      }
    }
  }

  mapIDs(ids, obj) {
    let objID;
    if (isString(obj)) {
      objID = obj;
    } else if (obj instanceof Thing) {
      objID = obj.$id;
    } else {
      return;
    }

    ids = arrayify(ids);
    if (!ids.length) {
      return;
    }
    // for any HTML ID, get the object
    ids.forEach(id => (this.html2id[id] = objID));
  }

  // note that this does not include Article and its descendants
  // => the root article won't be present here
  resources() {
    return Object.keys(this.data)
      .map(k => this.data[k])
      .filter(obj => obj instanceof Resource);
  }

  // returns a function you can use to deref
  mapper() {
    return reference => {
      if (reference instanceof Thing) {
        return reference;
      }
      if (!reference || typeof reference !== 'object') {
        return reference;
      }

      let id = reference['@id'];
      if (!id) {
        return reference;
      }
      return this.data[id] || reference;
    };
  }

  createCacheKey(obj, { curiePrefix } = {}) {
    if (!obj.$type) return;
    if (/^http/i.test(obj.$id)) return obj.$id;

    curiePrefix = curiePrefix ? `-${curiePrefix}` : '';

    switch (obj.$type) {
      case 'Action':
      case 'ContributeAction':
        if (
          !obj.description ||
          obj.noteIdentifier == null ||
          Object.keys(obj).length > 4
        ) {
          return;
        }

        return `${obj.$type}-${
          obj.noteIdentifier != null ? obj.noteIdentifier : ''
        }-${arrayify(obj.description)
          .filter(Boolean)
          .map(d => d['@value'] || d)
          .join('-')}`;

      case 'Place':
        if (!obj.address || !obj.address['@id']) return;
        return `Place-${obj.address['@id']}${curiePrefix}`;

      case 'Courthouse':
        if (!obj.name) return;
        return `Courthouse-${obj.name}${curiePrefix}`;

      case 'RadioStation':
        if (!obj.name) return;
        return `RadioStation-${obj.name}${curiePrefix}`;

      case 'PerformingArtsTheater':
        if (!obj.name) return;
        return `PerformingArtsTheater-${obj.name}${curiePrefix}`;

      case 'PostalAddress':
        if (!(obj.addressLocality || obj.addressRegion || obj.addressCountry))
          return;
        return `PostalAddress-${[
          obj.url,
          obj.email,
          obj.faxNumber,
          obj.telephone,
          obj.streetAddress,
          obj.postalCode,
          obj.addressLocality,
          obj.addressRegion,
          obj.addressCountry
        ].join('.')}${curiePrefix}`;

      case 'Organization': {
        const parentOrg =
          obj.parentOrganization && obj.parentOrganization['@id'];
        const loc = obj.location && obj.location['@id'];
        if (!obj.name) return;
        return `Organization-${obj.name}-${parentOrg || '#'}-${loc ||
          '#'}${curiePrefix}`;
      }

      case 'ContactPoint':
        if (obj.url) {
          return `ContactPoint-${obj.url}${curiePrefix}`;
        }
        return;

      case 'Checksum': {
        const val = arrayify(obj.checksumValue).join('');
        if (!val) return;
        return `Checksum-${obj.checksumAlgorithm}-${val}`;
      }

      case 'FundingSource':
        if (!obj.serialNumber) return;
        return `FundingSource-${obj.serialNumber}${curiePrefix}`;

      case 'Person':
        if (
          !(obj.givenName || obj.familyName || obj.additionalName || obj.name)
        ) {
          return;
        }
        return `Person-${[
          obj.givenName,
          obj.familyName,
          obj.additionalName,
          obj.name
        ].join('.')}${curiePrefix}`;

      case 'TargetRole':
        // cache role citation @id
        if (obj.citation && obj.name) {
          const citationId = getId(arrayify(obj.citation)[0]);
          if (citationId) {
            return `TargetRole-${obj.name}-${citationId}${curiePrefix}`;
          }
        }
        return;

      default:
        // citations
        if (
          obj.identifier &&
          obj.$type !== 'Footnote' &&
          obj.$type !== 'Endnote' &&
          (schema.is(obj.$type, 'CreativeWork') || //includes patent, legislation, and interview
            // bib extension http://bib.schema.org/ TODO move that to schema.org lib
            obj.$type === 'Chapter' ||
            obj.$type === 'Atlas' ||
            obj.$type === 'Audiobook' ||
            obj.$type === 'Collection' ||
            obj.$type === 'Newspaper' ||
            obj.$type === 'Thesis' ||
            schema.is(obj.$type, 'Event'))
        ) {
          return `Citation-${obj.identifier}${curiePrefix}`;
        }
        return;
    }
  }

  create(
    cls,
    type,
    data = {},
    {
      curiePrefix = '_',
      reUseRoleId = false,
      reUseRoleIdResourceKey = '__mainEntity__' // see @scipe/librarian#getUnroledIdToRoleIdMap
    } = {}
  ) {
    reUseRoleIdResourceKey = textify(reUseRoleIdResourceKey);

    if (data instanceof Thing) {
      return data;
    }
    let id = data['@id'];

    // if the `id` is already known, just return that
    if (id && this.data[id]) {
      let obj = this.data[id];
      // if it has a different type, we take the more specific and try to merge
      if (obj.$type !== type) {
        if (schema.is(obj.$type, type)) {
          // the existing type is a subtype of the new one, do nothing as it's okay
        } else if (schema.is(type, obj.$type)) {
          // the given type is a subtype of the existing one, upgrade object
          let upgrade = new cls(this, type, id);
          for (let k in obj.toJSON()) {
            if (/^@/.test(k)) {
              continue;
            }
            upgrade[k] = obj[k];
          }
          this.data[id] = upgrade;
          obj = upgrade;
        } else {
          throw new Error(
            `Object ID=${id}, type=${type}, already in store as ${obj.$type}`
          );
        }
      }
      Object.assign(obj, data);
      return obj;
    }

    // new object

    // handle `reUserRoleId` option. This is to unsure that document worker
    // re-use existing role @id for authors and contributors (as there is
    // a 1 to 1 relationship with the user or org id in this case instead
    // of creating new ones
    if (reUseRoleId && !id && cls === ContributorRole) {
      const { unroledIdToRoleIdMap } = this.ctx;
      let unroled = data.author || data.contributor;
      if (unroled) {
        const unroledId = unroled.$id || unroled['@id'] || unroledId;
        if (
          typeof unroledId === 'string' &&
          unroledId in unroledIdToRoleIdMap &&
          reUseRoleIdResourceKey in unroledIdToRoleIdMap[unroledId]
        ) {
          id = unroledIdToRoleIdMap[unroledId][reUseRoleIdResourceKey];
          curiePrefix = 'role';
        }
      }
    }

    const idOptions = {
      curiePrefix
    };

    let obj = new cls(
      this,
      type || data['@type'] || undefined,
      id || this.generateId(idOptions),
      !id && curiePrefix === 'node' ? this.ctx.isNodeOfId : undefined
    );

    Object.keys(data).forEach(k => {
      obj[k] = data[k];
    });

    const key = this.createCacheKey(obj, idOptions);
    if (key) {
      if (this.cache[key]) {
        return this.cache[key];
      }
      this.cache[key] = obj;
    }
    this.data[obj.$id] = obj;

    return obj;
  }
}

// Define all the `create<Thing>` methods (createAction, createPerson etc...)
Object.keys(classes).forEach(className => {
  DataStore.prototype[`create${className}`] = function(data, type, options) {
    if (typeof type === 'object') {
      options = type;
      type = undefined;
    }

    type = type || (data && data['@type']) || className;

    if (type === 'Resource') {
      type = 'CreativeWork';
    }

    return this.create(classes[className], type, data, options); // eslint-disable-line
  };
});
