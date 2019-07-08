import assert from 'assert';
import path from 'path';

import {
  processDocx,
  frame,
  comparableJSONLD
} from '../../src/document-worker/lib/test-utils';

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'author-notes.ds3.docx'
);

describe('DOCX: author notes', function() {
  this.timeout(20 * 1000);

  let ctx;
  let framed;
  before('processing the author notes fixture', done => {
    processDocx(docx, (err, _ctx) => {
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

  it('should extract the author list', () => {
    // console.log(require('util').inspect(framed.author, { depth: null }));
    assert.equal(framed.author.length, 2);
  });

  it('should extract an author contact point', () => {
    const expectedContactPoint = [
      {
        '@type': 'ContactPoint',
        contactType: 'office',
        description: 'barbara@example.com',
        name: 'Email',
        url: 'mailto:barbara@example.com',
        email: 'mailto:barbara@example.com'
      },
      {
        '@type': 'ContactPoint',
        contactType: 'home',
        description: 'b@example.com',
        name: 'Email',
        url: 'mailto:b@example.com',
        email: 'mailto:b@example.com'
      },
      {
        '@type': 'ContactPoint',
        description: '@barbara',
        name: 'Twitter',
        url: 'https://twitter.com/barbara'
      },
      {
        '@type': 'ContactPoint',
        description: 'https://facebook.com/barbara',
        name: 'Facebook',
        url: 'https://facebook.com/barbara'
      },
      {
        '@type': 'ContactPoint',
        contactType: 'office',
        description: '+1-917-882-5422',
        name: 'Tel',
        telephone: 'tel:+1-917-882-5422',
        url: 'tel:+1-917-882-5422'
      },
      {
        '@type': 'ContactPoint',
        contactType: 'mobile',
        description: '+1-917-882-5423',
        name: 'Tel',
        telephone: 'tel:+1-917-882-5423',
        url: 'tel:+1-917-882-5423'
      },
      {
        '@type': 'ContactPoint',
        description: '+1-212-222-0000',
        faxNumber: 'fax:+1-212-222-0000',
        name: 'Fax',
        url: 'fax:+1-212-222-0000'
      },
      {
        '@type': 'ContactPoint',
        address: '7 World Trade Center, 46th Floor, New York, NY 10007',
        name: 'Address'
      }
    ];

    assert.deepEqual(
      expectedContactPoint,
      comparableJSONLD(framed.author[0].roleContactPoint)
    );
    assert.equal(framed.author[0].roleContactPointNoteIdentifier, 1);
  });

  it('should extract author notes', () => {
    const author1ExpectedRoleActions = [
      {
        '@type': 'ContributeAction',
        noteIdentifier: 2,
        description: 'Wrote the manuscript.'
      }
    ];

    assert.deepEqual(
      author1ExpectedRoleActions,
      comparableJSONLD(framed.author[0].roleAction)
    );

    const author2ExpectedRoleActions = [
      {
        '@type': 'ContributeAction',
        noteIdentifier: '2',
        description: 'Wrote the manuscript.'
      },
      {
        '@type': 'ContributeAction',
        noteIdentifier: '3',
        description: 'Collected the data.'
      }
    ];
    assert.deepEqual(
      comparableJSONLD(author2ExpectedRoleActions),
      comparableJSONLD(framed.author[1].roleAction)
    );
  });
});
