const assert = require('assert');
const path = require('path');
const {
  processDocx,
  comparableJSONLD,
  frame
} = require('../../src/document-worker/lib/test-utils');

let fixtures = {
  affiliations: require(`../fixtures/document-worker/affiliations.json`),
  'affiliations-elife-07892': require(`../fixtures/document-worker/affiliations-elife-07892.json`)
};

describe('DOCX: Affiliations', function() {
  this.timeout(40 * 1000);

  Object.keys(fixtures).forEach(fix => {
    it(`processes the ${fix} fixture`, done => {
      processDocx(
        path.join(
          path.dirname(__dirname),
          'fixtures',
          'document-worker',
          `${fix}.docx`
        ),
        (err, ctx) => {
          if (err) return done(err);
          frame(ctx, (err, framed) => {
            if (err) return done(err);
            let resource = framed['@graph'][0];

            fixtures[fix].author.forEach((au, idx) => {
              assert.deepEqual(
                comparableJSONLD(resource.author[idx]),
                comparableJSONLD(fixtures[fix].author[idx])
              );
            });
            done();
          });
        }
      );
    });
  });
});
