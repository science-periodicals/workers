import { arrayify, getId } from '@scipe/jsonld';

// --- Thing ---
export class Thing {
  constructor(store, type, id, isNodeOfId) {
    this._ = {
      '@id': id,
      '@type': type
    };
    if (getId(isNodeOfId)) {
      this._.isNodeOf = getId(isNodeOfId);
    }
    this._store = store;
  }

  clone() {
    let curiePrefix = this.$id && this.$id.replace(/:.*/, '');
    let obj = this.toJSON();

    delete obj['@id'];
    return this._store.create(this.constructor, this.constructor.name, obj, {
      curiePrefix
    });
  }

  // make accessing JSON-LD less JS-hostile
  get $id() {
    return this._['@id'];
  }

  get $type() {
    return this._['@type'];
  }

  // get a reference to the object
  ref() {
    return { '@id': this.$id };
  }

  toJSON() {
    let data = {};
    for (let k in this._) {
      if ({}.hasOwnProperty.call(this._, k)) {
        let val = this._[k];
        if (
          (Array.isArray(val) &&
            (!val.length || val.every(v => typeof v === 'undefined'))) ||
          typeof val === 'undefined'
        ) {
          continue;
        }
        data[k] = val;
      }
    }
    return data;
  }

  addOnce(prop, obj) {
    const cacheKey = this._store.createCacheKey(obj);
    if (
      !this[prop].some(_obj => {
        return (
          (getId(_obj) || _obj.$id) === (getId(obj) || obj.$id) || // we use getId as obj can be a string
          (cacheKey &&
            this._store.createCacheKey(this._store.get(_obj)) === cacheKey)
        );
      })
    ) {
      this[prop].push(ref(obj));
    }
  }

  addSameAs(uri) {
    this.addOnce('sameAs', uri);
  }

  addPotentialAction(action) {
    this.potentialAction.push(ref(action));
  }

  // XXX these do not really belong here, move them later
  addSponsor(sp) {
    this.sponsor.push(ref(sp));
  }

  addFunder(sp) {
    this.funder.push(ref(sp));
  }
}

simpleField(
  [
    'name',
    'alternateName',
    'description',
    'url',
    'identifier',
    'subjectOf',
    'isNodeOf'
  ],
  Thing.prototype
);
// TODO sponsor, funder are not at this level on schema.org but we do that to avoid to define them on Person, Organization, CreativeWork, ContributorRole. TODO do it...
arrayField(['potentialAction', 'sameAs', 'sponsor', 'funder'], Thing.prototype);

export class Intangible extends Thing {}
export class StructuredValue extends Intangible {}
export class PropertyValue extends Intangible {}
simpleField(['propertyID', 'value', 'unitText'], PropertyValue.prototype);

// --- CreativeWork ---
export class CreativeWork extends Thing {
  addDetailedDescription(detailedDescription) {
    this.detailedDescription.push(ref(detailedDescription));
  }

  addPart(obj) {
    //if (this.hasPart.some(p => (p['@id'] || p.$id) === obj.$id)) return;
    //this.hasPart.push(ref(obj));
    this.addOnce('hasPart', obj);
  }

  addLicense(obj) {
    this.addOnce('license', obj);
  }

  addCopyrightHolder(obj) {
    this.addOnce('copyrightHolder', obj);
  }

  addEncoding(obj) {
    this.addOnce('encoding', obj);
  }

  addProvider(obj) {
    this.addOnce('provider', obj);
  }

  addIsBasedOn(obj) {
    this.addOnce('isBasedOn', obj);
  }

  addExampleOfWork(obj) {
    this.addOnce('exampleOfWork', obj);
  }

  addComment(obj) {
    this.addOnce('comment', obj);
  }

  addNote(obj) {
    this.addOnce('note', obj);
  }

  addAbout(obj) {
    this.addOnce('about', obj);
  }

  addAuthor(obj) {
    this.addOnce('author', obj);
  }

  addContributor(obj) {
    this.addOnce('contributor', obj);
  }

  addCitation(obj) {
    this.addOnce('citation', obj);
  }
}
// XXX pageStart/pageEnd are on Article (and others)
simpleField(
  [
    'resourceOf',
    'headline',
    'isSupportingResource',
    'copyrightYear',
    'creator',
    'dateCreated',
    'datePublished',
    'doi',
    'legislationIdentifier',
    'abbreviatedLegislationIdentifier',
    'legislationType',
    'patentNumber',
    'recordingNumber',
    'chapterNumber',
    'fileFormat',
    'inSupportOf',
    'isAccessibleForFree',
    'isPartOf',
    'mainEntity',
    'pageEnd',
    'pageStart',
    'pagination',
    'bookEdition',
    'position',
    'text',
    'version',
    'citeAs',
    'encodingFormat',
    'location'
  ],
  CreativeWork.prototype
);

arrayField(
  [
    'about',
    'annotation',
    'artist',
    'author',
    'broadcaster',
    'comment',
    'note',
    'compiler',
    'composer',
    'contributor',
    'copyrightHolder',
    'citation',
    'conductor',
    'detailedDescription',
    'director',
    'distributor',
    'editor',
    'encoding',
    'exampleOfWork',
    'funder',
    'hasPart',
    'interviewee',
    'interviewer',
    'inventor',
    'isBasedOn',
    'isbn',
    'image',
    'keywords',
    'counsel',
    'reporter',
    'license',
    'performer',
    'provider',
    'publication',
    'publisher',
    'producer',
    'sponsor',
    'translator',
    'writer'
  ],
  CreativeWork.prototype
);

// --- Disclosure ---
export class WPDisclosure extends CreativeWork {}

// --- Acknowledgements ---
export class WPAcknowledgements extends CreativeWork {}

// --- Abstracts ---
export class WPAbstract extends CreativeWork {}

// --- ImpactStatement ---
export class WPImpactStatement extends CreativeWork {}

// --- Resource ---
// This does not exist formally in the ontology but we treat it in its own special way
export class Resource extends CreativeWork {}
// XXX caption is normally only on ImageObject/VideoObject => bug in schema.org
simpleField(['caption'], Resource.prototype);

export class Dataset extends Resource {
  addDistribution(obj) {
    this.addOnce('distribution', obj);
  }
}
arrayField(['distribution'], Dataset.prototype);

export class Image extends Resource {}
export class Video extends Resource {}
export class Audio extends Resource {}
export class Formula extends Resource {}
export class TextBox extends Resource {}
export class SoftwareSourceCode extends Resource {}
simpleField(['codeRepository', 'codeSampleType'], SoftwareSourceCode.prototype);
arrayField(['programmingLanguage'], SoftwareSourceCode.prototype);
export class WebPageElement extends Resource {}
export class Table extends WebPageElement {}

// --- Encodings ---
export class MediaObject extends CreativeWork {
  addChecksum(checksum) {
    this.contentChecksum.push(ref(checksum));
  }
  addThumbnail(encoding) {
    this.thumbnail.push(ref(encoding));
  }
  addImage(encoding) {
    this.image.push(ref(encoding));
  }
}

simpleField(
  ['contentUrl', 'contentSize', 'encodesCreativeWork', 'height', 'width'],
  MediaObject.prototype
);
arrayField(
  // XXX contentChecksum do NOT exist in schema.org; thumbnail is on Image
  ['contentChecksum', 'thumbnail'],
  MediaObject.prototype
);

// third argument is an existing object on which to set the parsed values
MediaObject.fromJSON = function(store, obj, target) {
  let type;
  if (obj['@type']) {
    type = obj['@type']; // needed in advance
  }

  if (!target) {
    let meth = `create${type}`;
    if (!store[meth]) meth = 'createEncoding';

    target = store[meth]({ '@id': obj['@id'] });
  }

  for (let k in obj) {
    if ({}.hasOwnProperty.call(obj, k)) {
      let val = obj[k];
      if (k === 'contentChecksum') {
        let chs = arrayify(val).map(ch => {
          if (ch['@type'] === 'PerceptualHash') {
            return store.createPerceptualHash(ch);
          }
          return store.createChecksum(ch);
        });
        chs.forEach(ch => target.addChecksum(ch));
      } else if (k === 'exifData') {
        let exs = arrayify(val).map(ex => store.createPropertyValue(ex));
        exs.forEach(ex => target.addExifData(ex));
      } else if (k === 'thumbnail') {
        let ths = arrayify(val).map(th => MediaObject.fromJSON(store, th));
        ths.forEach(th => target.addThumbnail(th));
      } else if (k === 'encodesCreativeWork' && val) {
        val = arrayify(val)[0];

        const parentMap = {
          TextBoxObject: 'TextBox',
          DataDownload: 'Dataset',
          ImageObject: 'Image',
          SoftwareSourceCodeObject: 'SoftwareSourceCode',
          FormulaObject: 'Formula',
          TableObject: 'Table',
          DocumentObject: 'ScholarlyArticle',
          VideoObject: 'Video',
          AudioObject: 'Audio'
        };

        let meth = `create${parentMap[type]}`;
        let cw = store.get(val['@id'] || val);

        if (cw) {
          target[k] = ref(cw);
        } else if (!store[meth]) {
          target[k] = store.createCreativeWork(val);
        } else {
          target[k] = store[meth](val);
        }
      } else if (k === 'isBasedOn') {
        val = arrayify(val)[0];
        let meth = `create${type}`,
          cw = store.get(val['@id'] || val);
        if (cw) {
          target[k] = ref(cw);
        } else if (!store[meth]) {
          target[k] = store.createMediaObject(val);
        } else {
          target[k] = store[meth](val);
        }
      } else {
        target[k] = val;
      }
    }
  }

  return target;
};

export class DataDownload extends MediaObject {}
export class ImageObject extends MediaObject {
  addExifData(ex) {
    this.exifData.push(ref(ex));
  }
}
arrayField(['exifData'], ImageObject.prototype);

export class SoftwareSourceCodeObject extends MediaObject {}
export class FormulaObject extends MediaObject {}
export class TableObject extends MediaObject {}
export class DocumentObject extends MediaObject {}
export class VideoObject extends MediaObject {}
export class AudioObject extends MediaObject {}
export class TextBoxObject extends MediaObject {}

export class Checksum extends Intangible {}
simpleField(['checksumAlgorithm', 'checksumValue'], Checksum.prototype);
export class PerceptualHash extends Checksum {}

// --- Organization ---
export class Organization extends Thing {}
simpleField(
  ['address', 'parentOrganization', 'location'],
  Organization.prototype
);

Organization.fromJSON = function(store, obj, options = {}) {
  if (!store || !obj) return;
  if (obj['@type'] !== 'Organization') return;
  let orglist = [obj];
  while (obj.parentOrganization) {
    obj = obj.parentOrganization;
    orglist.push(obj);
  }

  orglist = orglist.reverse();

  let prevOrg = orglist.shift();

  if (prevOrg.location && !(prevOrg.location instanceof Place)) {
    let pl = { '@id': prevOrg.location['@id'] };
    if (prevOrg.location.address) {
      let ad = prevOrg.location.address;
      pl.address = store.createPostalAddress(ad, options);
    }
    let place = store.createPlace(pl, options);
    prevOrg.location = place;
  }

  prevOrg = store.createOrganization(prevOrg, options);

  while (orglist.length) {
    let org = orglist.shift();
    org.parentOrganization = prevOrg;
    prevOrg = store.createOrganization(org, options);
  }

  return prevOrg;
};

// --- Person ---
export class Person extends Thing {
  addAffiliation(org) {
    this.affiliation.push(ref(org));
  }
}
simpleField(
  [
    'additionalName',
    'deathDate',
    'email',
    'familyName',
    'faxNumber',
    'givenName',
    'telephone'
  ],
  Person.prototype
);
arrayField(['affiliation'], Person.prototype);

// --- Role ---
export class Role extends Intangible {}
simpleField(['roleName', 'startDate', 'endDate'], Role.prototype);

// --- ContributorRole ---
export class ContributorRole extends Role {
  // TODO delete (use `addRoleAffiliation` instead)
  addAffiliation(org) {
    this.roleAffiliation.push(ref(org));
  }
  addRoleAffiliation(org) {
    this.roleAffiliation.push(ref(org));
  }
  addRoleAction(ra) {
    this.roleAction.push(ref(ra));
  }
  // TODO delete (used `addRoleContactPoint` instead)
  addContactPoint(cp) {
    this.roleContactPoint.push(ref(cp));
  }
  addRoleContactPoint(cp) {
    this.roleContactPoint.push(ref(cp));
  }
}
simpleField(
  ['author', 'contributor', 'recipient', 'roleContactPointNoteIdentifier'],
  ContributorRole.prototype
);
arrayField(
  ['roleAction', 'roleAffiliation', 'roleContactPoint'],
  ContributorRole.prototype
);

// --- SponsorRole ---
export class SponsorRole extends Role {}
simpleField(['roleOffer'], SponsorRole.prototype);
arrayField(['sponsor'], SponsorRole.prototype);

// --- FunderRole ---
export class FunderRole extends Role {}
simpleField(['roleOffer'], FunderRole.prototype);
arrayField(['funder'], FunderRole.prototype);

// -- TargetRole --
export class TargetRole extends Role {}
simpleField(['hasSelector', 'citation'], TargetRole.prototype);

// --- Addresses and Places ---
export class ContactPoint extends StructuredValue {}
// XXX `address` does not belong here, it should be areaServed: { @type: Place, address: ... }
// but that's absurd
simpleField(
  ['email', 'faxNumber', 'telephone', 'contactType', 'address'],
  ContactPoint.prototype
);

export class PostalAddress extends ContactPoint {}
simpleField(
  [
    'addressCountry',
    'addressLocality',
    'addressRegion',
    'streetAddress',
    'postalCode'
  ],
  PostalAddress.prototype
);

export class Place extends Thing {}
simpleField(['address'], Place.prototype);

export class Courthouse extends Place {}
export class RadioStation extends Place {}
export class PerformingArtsTheater extends Place {}

// --- Money stuff ---
export class Offer extends Intangible {}
simpleField(['serialNumber'], Offer.prototype);
export class FundingSource extends Offer {}

// --- Actions ---
export class Action extends Thing {}
simpleField(
  ['actionStatus', 'endTime', 'location', 'result', 'startTime'],
  Action.prototype
);
arrayField(
  [
    'about',
    'instrument',
    'participant',
    'recipient',
    'target',
    'error',
    'object'
  ],
  Action.prototype
);
maybeArrayField(['agent'], Thing.prototype);

export class ContributeAction extends Action {}
simpleField(['noteIdentifier'], Action.prototype);
export class AuthorizeSourceUsageAction extends Action {}

// --- Comment ---
export class Comment extends CreativeWork {}

export class Footnote extends Comment {}
simpleField(['noteIdentifier'], Footnote.prototype);
export class Endnote extends Comment {}
simpleField(['noteIdentifier'], Endnote.prototype);

// --- PVI Stuff ---
export class PublicationIssue extends CreativeWork {}
simpleField(['issueNumber'], PublicationIssue.prototype);
export class PublicationVolume extends CreativeWork {}
simpleField(['volumeNumber'], PublicationVolume.prototype);
simpleField(['numberOfItems'], PublicationVolume.prototype);
export class CreativeWorkSeries extends CreativeWork {}
export class Periodical extends CreativeWorkSeries {}
arrayField(['issn'], Periodical.prototype);

// --- Selector ---
export class Selector extends Intangible {}
simpleField(
  ['startOffset', 'endOffset', 'selectionContent', 'selectionHash'],
  Selector.prototype
);

// --- NodeSelector ---
export class NodeSelector extends Selector {}
simpleField(['nodeId', 'nodeKey', 'nodeValueId'], NodeSelector.prototype);

// --- WebVerseSelector ---
export class WebVerseSelector extends NodeSelector {}
simpleField(
  ['webVerseId', 'webVerseKey', 'webVerseHash'],
  WebVerseSelector.prototype
);

// --- CreativeWork Types ---
export class Article extends CreativeWork {}

export class ScholarlyArticle extends Article {}

export class Report extends Article {}

export class Book extends CreativeWork {}

export class Chapter extends CreativeWork {}

export class MusicRecording extends CreativeWork {}

export class VisualArtwork extends CreativeWork {}

export class Movie extends CreativeWork {}

export class WebPage extends CreativeWork {}

export class WebSite extends CreativeWork {}

export class DigitalDocument extends CreativeWork {}

export class Interview extends CreativeWork {}

export class Patent extends CreativeWork {}

export class Legislation extends CreativeWork {}

// --- Event ---
export class Event extends Thing {}
simpleField(['endDate', 'startDate'], Event.prototype);
// XXX about is not normally on Event
arrayField(['about', 'location', 'organizer'], Event.prototype);
export class PublicationEvent extends Event {}
simpleField(['isAccessibleForFree'], PublicationEvent.prototype);

// --- Errors & Warnings ---
export class Error extends Thing {}
export class Warning extends Thing {}

// --- Helpers ---
// simple get/set
function simpleField(fields, obj) {
  arrayify(fields).forEach(pn =>
    Object.defineProperty(obj, pn, {
      get() {
        return this._[pn];
      },
      set(val) {
        this._[pn] = ref(val);
      },
      enumerable: true
    })
  );
}

// Guarantees that you can always just obj.foo.push(...). Also allows you to set a scalar and it
// will DTRT.
function arrayField(fields, obj) {
  arrayify(fields).forEach(pn =>
    Object.defineProperty(obj, pn, {
      get() {
        if (!this._[pn]) {
          this._[pn] = [];
        }
        return this._[pn];
      },

      set(val) {
        if (Array.isArray(val)) {
          this._[pn] = val.map(ref);
        } else {
          if (!this._[pn]) {
            this._[pn] = [];
          }
          this._[pn].push(ref(val));
        }
      },
      enumerable: true
    })
  );
}

function maybeArrayField(fields, obj) {
  arrayify(fields).forEach(pn =>
    Object.defineProperty(obj, pn, {
      get() {
        if (!this._[pn]) {
          this._[pn] = [];
        }

        if (this._[pn].length === 0) {
          return undefined;
        } else if (this._[pn].length === 1) {
          return this._[pn][0];
        }

        return this._[pn];
      },

      set(val) {
        if (Array.isArray(val)) {
          this._[pn] = val.map(ref);
        } else {
          if (!this._[pn]) {
            this._[pn] = [];
          }
          this._[pn].push(ref(val));
        }
      },
      enumerable: true
    })
  );
}

// return only @id-references to keep things flat, and the reverse operation
function ref(obj) {
  if (!(obj instanceof Thing)) return obj;
  return obj.ref();
}
