const assert = require('assert');
const path = require('path');
const { processDocx } = require('../../src/document-worker/lib/test-utils');

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'programming-language.ds3.docx'
);

describe('DOCX: Programming Language', function() {
  this.timeout(20 * 1000);
  let resource, store;
  before('processing the programming language fixture', done => {
    processDocx(docx, (err, ctx) => {
      assert.ifError(err);
      resource = ctx.resource;
      store = ctx.store;
      done();
    });
  });

  it('should set programming languages', () => {
    let [js, perl] = resource.hasPart.map(
      store.mapper()
    )[0].programmingLanguage;
    assert.equal('JavaScript', js, 'JS ok');
    assert.equal('Perl', perl, 'Perl ok');
  });
});
