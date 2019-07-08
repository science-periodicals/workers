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
  'undefined-notes.ds3.docx'
);

//wiley sample that was failing due to undefined notes (https://github.com/scienceai/stories/blob/master/data/wiley/clinical-transplantation/ctr12551/manuscript.ds3.docx)

describe('DOCX: undefined notes', function() {
  this.timeout(20 * 1000);

  let ctx;
  let framed;
  before('processing the undefined notes fixture', done => {
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

  it('should still have an author list', () => {
    // console.log(require('util').inspect(framed.author, { depth: null }));
    assert.equal(framed.author.length, 2);
  });

  it('should only include crossreferences to defined author notes', () => {
    const author1ExpectedRoleActions = [
      {
        '@type': 'ContributeAction',
        description: 'Author note.',
        noteIdentifier: 1
      },
      {
        '@type': 'ContributeAction',
        description: 'Previously deleted author note.',
        noteIdentifier: 2
      }
    ];

    assert.deepEqual(
      comparableJSONLD(author1ExpectedRoleActions),
      comparableJSONLD(framed.author[0].roleAction)
    );

    //author 2 should have no author notes
    assert(!framed.author[1].roleAction);
  });

  it('should only include crossreferences to defined footnotes and endnotes', () => {
    //check that there are two notes (1 footnote and 1 endnote, but we do not distinguish between the two)
    assert.equal(framed.note.length, 2);

    //get the ids of the two notes
    const noteIds = framed.note.map(note => note['@id']);

    //check that any link with rel="footnote" has an id that matches on of the valid noteIds in the document (id starts with node:_)

    // Array.from(ctx.doc.querySelectorAll('a')).forEach(a =>
    //   console.log(a.getAttribute('resource'))
    // );

    assert(
      Array.from(ctx.doc.querySelectorAll('a[rel="footnote"]')).every(a =>
        noteIds.includes(a.getAttribute('resource'))
      )
    );
  });

  it('should have no empty sup elements', () => {
    //after removing undefined note references, make sure that there are not any empty sups left behind
    assert(
      Array.from(ctx.doc.querySelectorAll('sup')).every(
        sup => sup.childNodes.length > 0
      )
    );
  });
});
