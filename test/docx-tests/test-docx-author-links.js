import assert from 'assert';
import path from 'path';
import { getId } from '@scipe/jsonld';
import {
  comparableJSONLD,
  processDocx,
  frame
} from '../../src/document-worker/lib/test-utils';

const samplePath = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'author-links.ds3.docx'
);

describe('DOCX: author links', function() {
  this.timeout(20 * 1000);

  describe('no role id re-use', () => {
    let ctx;
    let framed;
    before('processing the author link fixture', done => {
      processDocx(samplePath, (err, _ctx) => {
        if (err) return done(err);
        ctx = _ctx;
        frame(ctx, (err, _framed) => {
          if (err) {
            return done(err);
          }
          framed = _framed['@graph'][0];
          done();
        });
      });
    });

    it('should extract author list (with science.ai links)', () => {
      // console.log(require('util').inspect(framed.author, { depth: null }));

      assert.deepEqual(comparableJSONLD(framed.author), [
        {
          '@type': 'ContributorRole',
          author: [
            {
              '@type': 'Person',
              additionalName: 'L',
              familyName: 'Bogich',
              givenName: 'Tiffany',
              name: 'Tiffany L Bogich',
              sameAs: ['https://orcid.org/0000-0002-8143-5289']
            }
          ],
          roleName: 'author'
        },
        {
          '@type': 'ContributorRole',
          author: [
            {
              '@id': 'user:tony',
              '@type': 'Person',
              familyName: 'Smith',
              givenName: 'Tony',
              name: 'Tony Smith'
            }
          ],
          roleName: 'author'
        },
        {
          '@type': 'ContributorRole',
          author: [
            {
              '@id': 'org:monster-inc',
              '@type': 'Organization',
              alternateName: 'MI',
              name: 'Monster inc',
              parentOrganization: {
                '@type': 'Organization',
                name: 'Creature inc',
                sameAs: [
                  'http://example.com/creature',
                  'http://example.com/inc'
                ]
              }
            }
          ],
          roleName: 'author'
        }
      ]);
    });

    it('should extract contributor list (with science.ai links)', () => {
      // console.log(require('util').inspect(framed.contributor, { depth: null }));

      assert.deepEqual(comparableJSONLD(framed.contributor), [
        {
          '@type': 'ContributorRole',
          contributor: [
            {
              '@id': 'user:heather',
              '@type': 'Person',
              familyName: 'Brown',
              givenName: 'Heather',
              name: 'Heather Brown'
            }
          ],
          roleName: 'author'
        }
      ]);
    });
  });

  describe('role id re-use', () => {
    let ctx;
    let framed;
    before('processing the author link fixture', done => {
      processDocx(
        {
          docx: samplePath,
          unroledIdToRoleIdMap: {
            'user:tony': { __mainEntity__: 'role:tony' },
            'org:monster-inc': { __mainEntity__: 'role:monster-inc' }
          }
        },
        (err, _ctx) => {
          if (err) return done(err);
          ctx = _ctx;
          frame(ctx, (err, _framed) => {
            if (err) {
              return done(err);
            }
            framed = _framed['@graph'][0];
            done();
          });
        }
      );
    });

    it('should re-use the roles', () => {
      const tonyRole = framed.author.find(
        role => getId(role.author) === 'user:tony'
      );
      assert.equal(getId(tonyRole), 'role:tony');

      const monsterRole = framed.author.find(
        role => getId(role.author) === 'org:monster-inc'
      );
      assert.equal(getId(monsterRole), 'role:monster-inc');
    });
  });
});
