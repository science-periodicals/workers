const path = require('path');
const assert = require('assert');
const { processDocx } = require('../../src/document-worker/lib/test-utils');

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'abstract.ds3.docx'
);

describe('DOCX: Abstract', function() {
  this.timeout(20 * 1000);
  it('should remove abstract into the model', done => {
    processDocx(docx, (err, ctx) => {
      assert.ifError(err);
      let { doc, store, resource } = ctx;
      assert(!doc.querySelector('h2'), 'No h2');

      const abstracts = resource.detailedDescription
        .map(store.mapper())
        .map(abstract => abstract.toJSON());
      const abstract = abstracts.find(abs => abs.name === 'Abstract');
      const structuredAbstract = abstracts.find(
        abs => abs.name === 'Structured Abstract'
      );
      const impactStatement = abstracts.find(
        abs => abs.name === 'Impact Statement'
      );
      const plainLanguageSummary = abstracts.find(
        abs => abs.name === 'Plain Language Summary'
      );

      assert(abstract);
      assert(structuredAbstract);
      assert(impactStatement);
      assert(plainLanguageSummary);
      assert.equal(abstract['@type'], 'WPAbstract');
      assert.equal(structuredAbstract['@type'], 'WPAbstract');
      assert.equal(impactStatement['@type'], 'WPImpactStatement');
      assert.equal(plainLanguageSummary['@type'], 'WPImpactStatement');
      assert(
        /<em>emphasis<\/em>/.test(abstract.text['@value']),
        'value has the <em>'
      );
      assert(
        /<strong>strength<\/strong>/.test(abstract.text['@value']),
        'value has the <strong>'
      );
      done();
    });
  });
});
