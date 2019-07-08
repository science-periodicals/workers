import assert from 'assert';
import path from 'path';
import { createId } from '@scipe/librarian';
import { contextUrl, jsonld, arrayify } from '@scipe/jsonld';
import {
  getResource,
  processDocx,
  comparableJSONLD,
  frame,
  reImportFigures
} from '../../src/document-worker/lib/test-utils';

const sampleAuthors = require('../fixtures/document-worker/sample-authors.json');
const sampleContributors = require('../fixtures/document-worker/sample-contributors.json');
const articleSponsor = require('../fixtures/document-worker/article-sponsor.json');
const peterSponsor = require('../fixtures/document-worker/peter-sponsor.json');
const tiffSponsor = require('../fixtures/document-worker/tiff-sponsor.json');
const ehaSponsor = require('../fixtures/document-worker/eha-sponsor.json');

const samplePath = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'bib-sample.ds3.docx'
);

describe('DOCX: processing', function() {
  this.timeout(20 * 1000);
  let w, ctx, doc, resource, store;
  before('processing the sample doc', done => {
    processDocx(samplePath, (err, _ctx, _w) => {
      assert.ifError(err);
      w = _w;
      ctx = _ctx;
      reImportFigures(ctx);
      // console.log(require('pretty')(require('jsdom').serializeDocument(ctx.doc)));

      doc = ctx.doc;
      store = ctx.store;
      frame(ctx, (err, framed) => {
        assert.ifError(err);
        resource = framed['@graph'][0];
        done();
      });
    });
  });

  after(done => {
    w.stop(done);
  });

  it('should extract provenance info', () => {
    assert.deepEqual(
      comparableJSONLD(resource.author),
      comparableJSONLD(sampleAuthors)
    );

    assert.deepEqual(
      comparableJSONLD(resource.contributor),
      comparableJSONLD(sampleContributors)
    );
  });

  it('should extract keywords', () => {
    let kw = [
      'Emerging Infectious Diseases',
      'wildlife disease',
      'surveillance',
      'zoonoses',
      'epizootic mortality'
    ];
    assert.deepEqual(
      resource.keywords,
      kw,
      'keywords were processed correctly'
    );
  });

  it('should extract licenses', () => {
    assert.deepEqual(
      arrayify(resource.license)[0],
      'spdx:CC0-1.0',
      'licenses were processed correctly'
    );
  });

  it('should extract copyright', () => {
    assert.equal(resource.copyrightYear, '2013', 'copyright is 2013');
    let copy = comparableJSONLD(sampleAuthors)
      .concat(comparableJSONLD(sampleContributors))
      .map(
        p => (p.author && p.author[0]) || (p.contributor && p.contributor[0])
      );
    assert.deepEqual(
      comparableJSONLD(resource.copyrightHolder),
      copy,
      'copyrights were processed correctly'
    );
  });

  it('should extract funding info', () => {
    assert(resource.funder, 'resource has a funder');
    assert.equal(arrayify(resource.funder).length, 1, 'article has one funder');

    assert.deepEqual(
      comparableJSONLD(arrayify(resource.funder)),
      comparableJSONLD(articleSponsor)
    );

    let peter = resource.author.filter(au =>
      /peter/i.test(au.author[0].name)
    )[0];
    assert.deepEqual(
      comparableJSONLD(arrayify(peter.author[0].funder)),
      comparableJSONLD(peterSponsor)
    );

    let tiff = resource.author.filter(au => /tiff/i.test(au.author[0].name))[0];
    assert.deepEqual(
      comparableJSONLD(arrayify(tiff.author[0].funder)),
      comparableJSONLD(tiffSponsor)
    );

    let eha = tiff.roleAffiliation.filter(aff =>
      /eha/i.test(arrayify(aff.alternateName)[0])
    )[0];
    assert.deepEqual(
      comparableJSONLD(arrayify(eha.funder)),
      comparableJSONLD(ehaSponsor)
    );
  });

  it('should extract equations', () => {
    let $figure = doc.querySelector('figure[typeof="sa:Formula"]'),
      res = getResource($figure, store);
    assert.equal(res.alternateName, 'Equation 1', 'equation 1 was extracted');
  });

  it('should generate text boxes', () => {
    assert.equal(
      doc.querySelectorAll('aside').length,
      1,
      '1 aside element is present'
    );
    let res = getResource(doc.querySelector('aside'), store);
    assert.equal(
      res.alternateName,
      'Text Box 1',
      'text box has the right label'
    );
  });

  it('should extract footnotes', () => {
    let $section = doc.querySelector('section[role="doc-endnotes"]');
    assert(!$section, 'the footnotes section was wiped');
    assert.equal(resource.note.length, 1, 'there is 1 article footnote');
    let table = resource.hasPart
      .map(store.mapper())
      .find(res => res.$type === 'Table');
    assert.equal(table.note.length, 2, 'there are 2 table footnotes');
  });

  it('should successfully convert DOCX to HTML and return the generated html and resources', () => {
    assert(doc, 'there is a document in the context');
    assert(resource, 'there is a resource in the context');
    assert(resource['@id'], 'the resource has an @id');
    assert(resource.encoding, 'the resource has an endocing');
    assert.equal(
      resource.encoding.length,
      2,
      'the resource has exactly 2 encoding'
    );
    assert(resource.name, 'resource has a name');

    let nestedFigs = {};
    Array.from(doc.querySelectorAll('figure[typeof="sa:Image"]')).forEach(
      fig => {
        if (fig.parentNode.localName === 'figure') {
          nestedFigs[fig.parentNode.getAttribute('resource')].push(fig);
        } else {
          nestedFigs[fig.getAttribute('resource')] = [fig];
        }
      }
    );
    Object.keys(nestedFigs).forEach(k => {
      let subfigs = nestedFigs[k],
        fig = subfigs.shift(),
        figres;
      assert(
        resource.hasPart.some(r => {
          // if it's not a multi-figure
          if (!subfigs.length) {
            let src = fig.querySelector('img').src;
            return (r.encoding || []).some(
              e =>
                e.contentUrl === src ||
                (Array.isArray(e.thumbnail) &&
                  e.thumbnail.some(t => t.contentUrl === src))
            );
          }
          if (r['@id'] === fig.getAttribute('resource')) figres = r;
          return figres && r.hasPart.length === subfigs.length;
        }),
        `top-level resource ${k} is there`
      );
      if (figres) {
        subfigs.forEach(sf => {
          assert(
            figres.hasPart.some(r => r['@id'] === sf.getAttribute('resource'))
          );
        });
      }
    });

    resource.hasPart.forEach(r => {
      assert(
        arrayify(r.alternateName)[0],
        `Resource part ${r['@id']} has a name`
      );
    });

    let fig1 = resource.hasPart.filter(
      r => arrayify(r.alternateName)[0] === 'Figure 1'
    )[0];
    let fig2 = resource.hasPart.filter(
      r => arrayify(r.alternateName)[0] === 'Figure 2'
    )[0];
    let table1 = resource.hasPart.filter(
      r => arrayify(r.alternateName)[0] === 'Table 1'
    )[0];

    assert(fig1);
    assert(fig2);
    assert(table1);
    assert.equal(fig1['@type'], 'Image');
    assert.equal(fig2['@type'], 'Image');
    assert.equal(table1['@type'], 'Table');

    assert.equal(
      table1.isPartOf,
      resource['@id'],
      'table1 is part of the scholarly article resource'
    );
    // multi part figure
    assert.equal(
      fig1.isPartOf,
      resource['@id'],
      'fig1 is part of the scholarly article resource'
    );
    fig1.hasPart.forEach(part => {
      assert.equal(
        part.isPartOf,
        fig1['@id'],
        `fig1 part ${arrayify(part.alternateName)[0]} is part of fig 1`
      );
    });
    assert.equal(
      fig2.isPartOf,
      resource['@id'],
      'fig2 is part of the scholarly article resource'
    );

    assert.equal(table1.encoding[0]['@type'], 'TableObject');

    const fig1ID = doc.querySelector(`figure[resource='${fig1['@id']}']`).id;
    const fig2ID = doc.querySelector(`figure[resource='${fig2['@id']}']`).id;
    const table1ID = doc.querySelector(`figure[resource='${table1['@id']}']`)
      .id;

    assert.equal(
      doc.querySelectorAll('a[href="#' + fig1ID + '"]').length,
      5,
      '5 links to fig1'
    );
    assert.equal(
      doc.querySelectorAll('a[href="#' + fig2ID + '"]').length,
      1,
      '1 link to fig2'
    );
    assert.equal(
      doc.querySelectorAll('a[href="#' + table1ID + '"]').length,
      2,
      '2 links to table1'
    );

    assert(
      /schema:hasPart/.test(
        doc
          .querySelectorAll('a[href="#' + fig1ID + '"]')[0]
          .getAttribute('property')
      ),
      'fig1 flavoured links'
    );
    assert(
      /schema:hasPart/.test(
        doc
          .querySelectorAll('a[href="#' + fig2ID + '"]')[0]
          .getAttribute('property')
      ),
      'fig2 flavoured links'
    );
    assert(
      /schema:hasPart/.test(
        doc
          .querySelectorAll('a[href="#' + table1ID + '"]')[0]
          .getAttribute('property')
      ),
      'table1 flavoured links'
    );
  });

  it('extractCitations: should extract citations', () => {
    assert.equal(resource.citation.length, 18);
    resource.citation.forEach(c => {
      let altName = arrayify(c.alternateName)[0];
      if (!altName) return;
      // this one is in a footnote
      if (altName === 'The091') {
        assert(
          resource.note
            .map(store.mapper())
            .map(({ text }) => {
              let div = doc.createElement('div');
              if (text && text['@value']) div.innerHTML = text['@value'];
              else div.textContent = text || '';
              return div;
            })
            .some(div => div.querySelector(`a[href="#${c['@id']}"]`)),
          `there is a footnote citation anchor for ${altName}`
        );
      } else {
        assert(
          doc.querySelector(`a[href="#${c['@id']}"]`),
          `there is a citation anchor for ${altName}`
        );
      }
    });
  });

  it('should handle action', done => {
    let action = Object.assign(createId('action', null, ctx.graphId), {
      agent: 'user:userId',
      object: ctx.action.object,
      result: 'updateActionId'
    });

    w.handleAction(action, (err, handledAction) => {
      assert.ifError(err);
      // console.log(require('util').inspect(handledAction.result.object['@graph'], {depth: null}));
      const graph = {
        '@context': contextUrl,
        '@graph': handledAction.result.object['@graph']
      };
      const frame = {
        '@context': contextUrl,
        '@id': resource['@id'],
        '@embed': '@always'
      };
      const rof = ctx.graphId;

      // checking resourceOf
      let nRof = 0;
      graph['@graph'].forEach(node => {
        if (node.resourceOf) {
          nRof++;
          assert.equal(rof, node.resourceOf);
        }
      });

      assert.equal(nRof, 12);

      // test that we can frame back the output
      jsonld.frame(graph, frame, (err, framed) => {
        assert.ifError(err);
        // console.log(require('util').inspect(framed, { depth: null }));
        assert.equal(
          framed['@graph'][0]['@id'],
          resource['@id'],
          'update action object can be framed'
        );
        done();
      });
    });
  });
});
