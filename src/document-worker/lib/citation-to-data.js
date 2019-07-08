import doiRegex from 'doi-regex';
import urlRegex from 'url-regex';
import pickBy from 'lodash/pickBy';
import moment from 'moment';
import { arrayify } from '@scipe/jsonld';

// converts OOXML citations to schema.org

// mapping from ooxml type (http://www.datypic.com/sc/ooxml/e-docxBibliography_SourceType-1.html) to schema types
const schemaTypes = {
  ArticleInAPeriodical: 'Article',
  Book: 'Book',
  BookSection: 'Chapter',
  JournalArticle: 'ScholarlyArticle',
  ConferenceProceedings: 'ScholarlyArticle',
  Report: 'Report',
  SoundRecording: 'MusicRecording',
  Performance: 'Event', //considered TheaterEvent but too narrow in scope
  Art: 'VisualArtwork',
  DocumentFromInternetSite: 'DigitalDocument',
  InternetSite: 'WebPage',
  Film: 'Movie',
  Interview: 'Interview',
  Patent: 'Patent',
  ElectronicSource: 'WebPage',
  Case: 'Legislation',
  Misc: 'CreativeWork'
};

export function createSchemaCitationFromDocx(store, docxBiblio = {}, refId) {
  const data = pickBy({
    '@type': schemaTypes[docxBiblio.SourceType] || 'ScholarlyArticle',
    identifier: docxBiblio.Tag,
    name: docxBiblio.Title,
    alternateName: docxBiblio.ShortTitle,
    url: docxBiblio.URL,
    version: docxBiblio.Version,
    bookEdition: docxBiblio.Edition,
    numberOfItems: docxBiblio.NumberVolumes,
    inSupportOf: docxBiblio.ThesisType,
    encodingFormat: docxBiblio.Medium,
    legislationIdentifier: docxBiblio.CaseNumber,
    legislationType: docxBiblio.SourceType === 'Case' ? 'case' : undefined,
    abbreviatedLegislationIdentifier: docxBiblio.AbbreviatedCaseNumber,
    patentNumber: docxBiblio.PatentNumber,
    recordingNumber: docxBiblio.RecordingNumber,
    chapterNumber: docxBiblio.ChapterNumber
  });

  // ---------------- //
  // Persons and Orgs //
  // ---------------- //

  // if key is "Person" then it can be a list of people, if key is corporate then it's just text with the organization name
  // TODO detect when there are multiple corporate entities (there is no way of entering multiple corporate authors in word, but they are often separated by `;` in a plain text list)
  const personOrOrgProps = pickBy({
    author: docxBiblio.Author,
    editor: docxBiblio.Editor,
    translator: docxBiblio.Translator,
    composer: docxBiblio.Composer,
    director: docxBiblio.Director,
    // Both 'ProducerName' and 'ProductionCompany' are schema.org/producer so we merge them to one array (Note, Production company is a simple field in OOXML and always an organization or 'Corporate' in OOXML)
    producer:
      docxBiblio.ProducerName && docxBiblio.ProductionCompany
        ? arrayify(docxBiblio.ProducerName).concat({
            Corporate: docxBiblio.ProductionCompany
          })
        : docxBiblio.ProductionCompany
        ? [{ Corporate: docxBiblio.ProductionCompany }]
        : docxBiblio.ProducerName,
    artist: docxBiblio.Artist,
    performer: docxBiblio.Performer,
    broadcaster: docxBiblio.Broadcaster,
    conductor: docxBiblio.Conductor,
    writer: docxBiblio.Writer,
    interviewer: docxBiblio.Interviewer,
    interviewee: docxBiblio.Interviewee,
    compiler: docxBiblio.Compiler,
    inventor: docxBiblio.Inventor,
    reporter: docxBiblio.Reporter,
    counsel: docxBiblio.Counsel,
    distributor: docxBiblio.Distributor
  });

  Object.keys(personOrOrgProps).forEach(prop => {
    data[prop] = Array.isArray(personOrOrgProps[prop])
      ? personOrOrgProps[prop].map(personOrOrg =>
          convertPersonOrOrgDocxToSchema(personOrOrg)
        )
      : prop === 'broadcaster' || prop === 'distributor' //simple fields in OOXML (no person or corpate options. Note, broadcaster and distributors is always organization in schema.org)
      ? {
          '@type': 'Organization',
          name: personOrOrgProps[prop]
        }
      : {};
  });

  // ---------------- //
  // Standard Numbers //
  // ---------------- //

  // Add standard numbers (DOI, ISBN, ISSN, PMID, PMCID)
  // Standard numbers are contained in the StandardNumber field or in comments.
  // First Look at the syntax, then if there is no DOI or URL, check the URL for a DOI (DOIs can be formatted as urls)
  const DOI = /^(?:(?:https?:\/\/(?:dx\.)?doi\.org\/)|DOI:\s*)/i;
  const ISBN = /^(?:(?:http:\/\/books\.google\.com\/books\?vid=ISBN)|ISBN:\s*)/i;
  const ISSN = /^(?:(?:http:\/\/books\.google\.com\/books\?vid=ISSN)|ISSN:\s*)/i;
  const PMCID = /^PMC(?:ID)?:\s*/i;
  const PMID = /^PMID:\s*/i;

  // check for DOI and URL in the comment field
  // TODO check for multiple identifiers (merge with section below)
  if (docxBiblio.Comments) {
    const doiFromComments =
      doiRegex().exec(docxBiblio.Comments) &&
      doiRegex().exec(docxBiblio.Comments)[0];
    const urlFromComments =
      urlRegex().exec(docxBiblio.Comments) &&
      urlRegex().exec(docxBiblio.Comments)[0];

    if (!docxBiblio.StandardNumber) {
      docxBiblio.StandardNumber = doiFromComments;
      if (doiFromComments && docxBiblio.Comments === doiFromComments) {
        delete docxBiblio.Comments;
      }
    }

    if (!data.url && urlFromComments) {
      data.url = urlFromComments;
      if (urlFromComments && docxBiblio.Comments === urlFromComments) {
        delete docxBiblio.Comments;
      }
    }
  }

  // we use pmcid and pmid as sameAs properties, and reserve doi, isbn, or issn for the primary ids
  let pmcid;
  let pmid;
  if (docxBiblio.StandardNumber) {
    if (DOI.test(docxBiblio.StandardNumber)) {
      data.doi = docxBiblio.StandardNumber.replace(DOI, '');
    } else if (doiRegex().test(docxBiblio.StandardNumber)) {
      data.doi = docxBiblio.StandardNumber;
    } else if (ISBN.test(docxBiblio.StandardNumber)) {
      data.isbn = docxBiblio.StandardNumber.replace(ISBN, '');
    } else if (ISSN.test(docxBiblio.StandardNumber)) {
      data.issn = docxBiblio.StandardNumber.replace(ISSN, '');
    } else if (PMCID.test(docxBiblio.StandardNumber)) {
      pmcid = docxBiblio.StandardNumber.replace(PMCID, '');
    } else if (PMID.test(docxBiblio.StandardNumber)) {
      pmid = docxBiblio.StandardNumber.replace(PMID, '');
    } else if (/^PMC/.test(docxBiblio.StandardNumber)) {
      pmcid = docxBiblio.StandardNumber;
    }
  }
  if (!data.doi && data.url && DOI.test(data.URL)) {
    data.doi = data.URL.replace(DOI, '');
  }

  if (docxBiblio.Pages) {
    if (/^\s*\d+\s*$/.test(docxBiblio.Pages)) {
      data.pageStart = parseInt(docxBiblio.Pages, 10);
    } else if (/^\s*\d+\s*-\s*\d+\s*$/.test(docxBiblio.Pages)) {
      const [start, end] = docxBiblio.Pages.split(/\s*-\s*/).map(p =>
        parseInt(p, 10)
      );
      data.pageStart = start;
      data.pageEnd = end;
    } else {
      data.pagination = docxBiblio.Pages;
    }
  }

  // Note, we use node in order to have a proper identifier for the link to the
  // citation callout, so that the HTML and JSON-LD stay in sync
  const work = store.createCreativeWork(data, data['@type'], {
    curiePrefix: 'node'
  });

  // ---------------- //
  //     Comment      //
  // ---------------- //

  // Comments that were only URLs or DOIs have already been deleted
  if (docxBiblio.Comments) {
    work.addComment({
      '@type': 'Comment',
      text: docxBiblio.Comments
    });
  }

  // ---------------- //
  //     Same as      //
  // ---------------- //

  // DOI is the primary identifier, so we sameAs PMID and PMCIDs
  if (pmcid) {
    work.addSameAs(`pmcid:${pmcid}`);
  }
  if (pmid) {
    work.addSameAs(`pmid:${pmid}`);
  }

  //-----------------------//
  //    Location           //
  //-----------------------//

  // Some source types have a location property (Interviews, legal cases, and
  // performances). Note, this is different from publisher location, and there can
  // only be 1 location at the root level of a citation

  if (docxBiblio.Court) {
    work.location = store.createCourthouse(
      {
        '@type': 'Courthouse',
        name: docxBiblio.Court
      },
      { curiePrefix: '_' }
    );
  }
  if (docxBiblio.Station) {
    work.location = store.createRadioStation(
      {
        '@type': 'RadioStation',
        name: docxBiblio.Station
      },
      { curiePrefix: '_' }
    );
  }
  if (docxBiblio.Theater) {
    work.location = store.createPerformingArtsTheater(
      {
        '@type': 'PerformingArtsTheater',
        name: docxBiblio.Theater
      },
      { curiePrefix: '_' }
    );
  }

  // ---------------- //
  //     Publisher    //
  // ---------------- //

  if (docxBiblio.Publisher) {
    const location =
      docxBiblio.City || docxBiblio.StateProvince || docxBiblio.CountryRegion
        ? pickBy({
            '@type': 'PostalAddress',
            addressLocality: docxBiblio.City,
            addressRegion: docxBiblio.StateProvince,
            addressCountry: docxBiblio.CountryRegion
          })
        : undefined;

    work.publisher = store.createOrganization(
      pickBy({
        '@type': 'Organization',
        name: docxBiblio.Publisher,
        department: docxBiblio.Department,
        parentOrganization: docxBiblio.Institution, //TODO check this is correct (not sure it should be parentOrganization)
        location: location
      }),
      { curiePrefix: '_' }
    );
  }

  //-------------//
  //    Dates    //
  //-------------//

  // Access date
  if (
    docxBiblio.YearAccessed ||
    docxBiblio.MonthAccessed ||
    docxBiblio.DayAccessed
  ) {
    // re-assign to avoid to push as we don't have a cache key for that
    work.potentialAction = [
      store.createAction(
        {
          '@type': 'ViewAction',
          actionStatus: 'CompletedActionStatus',
          endTime: dateFromDocxBiblio({
            year: docxBiblio.YearAccessed,
            month: convertMonth(docxBiblio.MonthAccessed),
            day: docxBiblio.DayAccessed
          })
        },
        { curiePrefix: '_' }
      )
    ];
  }

  // Publication date
  if (docxBiblio.Year || docxBiblio.Month || docxBiblio.Day) {
    work.datePublished = dateFromDocxBiblio({
      year: docxBiblio.Year,
      month: convertMonth(docxBiblio.Month),
      day: docxBiblio.Day
    });
  }

  //---------------------------------------//
  //    Issues, Volumes, and Containers    //
  //---------------------------------------//

  let root = work;
  if (docxBiblio.Issue) {
    const issue = store.createPublicationIssue(
      {
        '@type': 'PublicationIssue',
        issueNumber: docxBiblio.Issue
      },
      { curiePrefix: '_' }
    );
    root.isPartOf = issue;
    root = issue;
  }

  if (docxBiblio.Volume) {
    const volume = store.createPublicationVolume(
      {
        '@type': 'PublicationVolume',
        volumeNumber: docxBiblio.Volume
      },
      { curiePrefix: '_' }
    );
    root.isPartOf = volume;
    root = volume;
  }

  // add data for types with containers (e.g., journal articles in journals, periodical articles in periodicals, book sections in books)
  // for a complete example of OOXML fields for each source type see https://github.com/scienceai/dedocx/blob/0a3451bdbf1b511ae60c9b315afc3f576da03059/test/fixtures/expected-bibliography.json
  const containerDataBySourceType = pickBy({
    JournalArticle:
      docxBiblio.JournalName || data.issn
        ? {
            '@type': 'Periodical',
            name: docxBiblio.JournalName,
            issn: data.issn
          }
        : undefined,
    BookSection:
      docxBiblio.BookTitle || docxBiblio.BookAuthor
        ? {
            '@type': 'Book',
            name: docxBiblio.BookTitle,
            author:
              docxBiblio.BookAuthor &&
              docxBiblio.BookAuthor.map(author =>
                convertPersonOrOrgDocxToSchema(author)
              )
          }
        : undefined,
    DocumentFromInternetSite: docxBiblio.InternetSiteTitle
      ? {
          '@type': 'WebPage',
          name: docxBiblio.InternetSiteTitle
        }
      : undefined,
    ArticleInAPeriodical:
      docxBiblio.PeriodicalTitle || data.issn
        ? {
            '@type': 'Periodical',
            name: docxBiblio.PeriodicalTitle,
            issn: data.issn
          }
        : undefined,
    Art: docxBiblio.PublicationTitle
      ? {
          '@type': 'Book',
          name: docxBiblio.PublicationTitle
        }
      : undefined,
    SoundRecording: docxBiblio.AlbumTitle
      ? {
          '@type': 'MusicAlbum',
          name: docxBiblio.AlbumTitle
        }
      : undefined,
    Interview: docxBiblio.BroadcastTitle
      ? {
          '@type': 'BroadcastEvent',
          name: docxBiblio.BroadcastTitle
        }
      : undefined,
    ConferenceProceedings: docxBiblio.ConferenceName
      ? {
          '@type': 'Periodical',
          name: docxBiblio.ConferenceName //This is the name of the proceedings publications which is why it's classified as a periodical not an event
        }
      : undefined,
    Misc: docxBiblio.PublicationTitle
      ? {
          '@type': 'CreativeWork',
          name: docxBiblio.PublicationTitle
        }
      : undefined
  });

  if (Object.keys(containerDataBySourceType).includes(docxBiblio.SourceType)) {
    const containerData = pickBy({
      '@type': containerDataBySourceType[docxBiblio.SourceType]['@type'],
      name: containerDataBySourceType[docxBiblio.SourceType].name,
      author: containerDataBySourceType[docxBiblio.SourceType].author,
      issn: containerDataBySourceType[docxBiblio.SourceType].issn
    });

    root.isPartOf = store.createCreativeWork(containerData, {
      curiePrefix: '_'
    });
  }

  store.mapIDs(docxBiblio.id, work);
  store.mapIDs(data.identifier, work);
  if (refId) {
    store.mapIDs(refId, work);
  }

  return work;
}

// Create citation callouts (e.g., Smith, page 2)
// Note, only the subset of fields below are used for the first part of the citation callout and the order matters (e.g., writer is preferred over performer if both are present)
export function createCitationCalloutTextContent(citation = {}) {
  let {
    Tag,
    Author = [],
    Interviewee = [],
    Inventor = [],
    Writer = [],
    Performer = [],
    Counsel = [],
    Title,
    Year
  } = citation;
  let content = '';

  const authorNames = (
    Author ||
    Interviewee ||
    Inventor ||
    Writer ||
    Performer ||
    Counsel
  )
    .map(p => {
      const { familyName, name } = convertPersonOrOrgDocxToSchema(p);
      if (familyName) {
        return familyName;
      } else {
        return name;
      }
    })
    .filter(Boolean);

  if (!authorNames.length && !Title) {
    content = Tag || ''; // there should always be an id
  } else {
    if (!authorNames.length) {
      content = Title;
    } else if (authorNames.length === 1) {
      content = authorNames[0];
    } else if (authorNames.length === 2) {
      content = authorNames.join(' and ');
    } else if (authorNames.length === 3) {
      let sep = authorNames.find(n => /,/.test(n)) ? ';' : ',';
      content = `${authorNames[0]}${sep} ${authorNames[1]}${sep} and ${
        authorNames[2]
      }`;
    } else {
      content = `${authorNames[0]} et al.`;
    }

    if (Year) {
      content += ` ${Year}`;
    }
  }
  return content;
}

function dateFromDocxBiblio({ year, month, day }) {
  if (!year && !month && !day) {
    return;
  }
  if (year && month && day) {
    return {
      '@type': 'xsd:date',
      '@value': `${year}-${fmt(convertMonth(month))}-${fmt(day)}`
    };
  } else if (year && month && !day) {
    return {
      '@type': 'xsd:gYearMonth',
      '@value': `${year}-${fmt(convertMonth(month))}`
    };
  } else if (year && !month && !day) {
    return {
      '@type': 'xsd:gYear',
      '@value': year
    };
  }
}

function fmt(num, len = 2) {
  num = String(parseInt(num, 10));

  while (num.length < len) num = `0${num}`;
  return num;
}

function convertMonth(month) {
  if (!month) {
    return;
  }
  if (month >= 1 || month <= 12) {
    return month;
  }
  if (typeof month === 'string' || month instanceof String) {
    const monthNumberString = moment()
      .month(month)
      .format('MM');
    // if an invalid month/month abbreviation is given moment returns 12, so we have to check that 12 is December and not an erroneous input
    return (monthNumberString == '12' &&
      month.toLowerCase().startsWith('dec')) ||
      monthNumberString != '12'
      ? monthNumberString
      : undefined;
  } else return;
}

function convertPersonOrOrgDocxToSchema(personOrOrg) {
  return personOrOrg.Person &&
    personOrOrg.Person[0] &&
    (personOrOrg.Person[0]['Last'] ||
      personOrOrg.Person[0]['Middle'] ||
      personOrOrg.Person[0]['First'])
    ? pickBy({
        '@type': 'Person',
        familyName: personOrOrg.Person[0]['Last'],
        additionalName: personOrOrg.Person[0]['Middle'],
        givenName: personOrOrg.Person[0]['First']
      })
    : personOrOrg.Corporate
    ? {
        '@type': 'Organization',
        name: personOrOrg.Corporate
      }
    : {};
}
