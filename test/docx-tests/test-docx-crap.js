const assert = require('assert');
const path = require('path');
const {
  processDocx,
  frame,
  makeTestLog
} = require('../../src/document-worker/lib/test-utils');

const list = [
    // readable but not DS3
    {
      name: 'wiley-brb3362.docx',
      giveUp: false,
      check: (doc, res) => {
        firstP(
          doc,
          'An update on immunopathogenesis, diagnosis and treatment of multiple sclerosis'
        );
        numEl(doc, 'table', 5);
      }
    },
    {
      name: 'wiley-cbdd12527.docx',
      giveUp: false,
      check: (doc, res) => {
        firstP(doc, 'Triazole: A Promising Antituburcular Agent');
        numEl(doc, 'em', 190);
      }
    },
    {
      name: 'wiley-cbdd12604.docx',
      giveUp: false,
      check: (doc, res) => {
        firstP(
          doc,
          'Synthesis, Biological Evaluation and Docking of Dihydropyrazole ' +
            'Sulfonamide Containing 2-hydroxyphenyl Moiety: A Series of Novel MMP-2 Inhibitors'
        );
        numEl(doc, 'table', 1);
      }
    },
    {
      name: 'wiley-clen201400222.docx',
      giveUp: false,
      check: (doc, res) => {
        firstP(
          doc,
          'Dual purpose system for water treatment from a polluted river and the ' +
            'production of Pistia stratiotes biomass within a biorefinery '
        );
        numEl(doc, 'table', 4);
      }
    },
    {
      name: 'wiley-cmi12525.docx',
      giveUp: false,
      check: (doc, res) => {
        firstP(
          doc,
          'Vibrio fischeri-derived outer membrane vesicles trigger host development '
        );
        numEl(doc, 'table', 1);
      }
    },
    {
      name: 'wiley-da22357.docx',
      giveUp: false,
      check: (doc, res) => {
        firstP(
          doc,
          'Suicidal Thoughts and Behaviors in Children and Adolescents with ' +
            'Chronic Tic Disorders'
        );
        numEl(doc, 'table', 4);
      }
    },
    {
      name: 'wiley-qua25027.docx',
      giveUp: false,
      check: (doc, res) => {
        firstP(
          doc,
          'CL-20 is powerful energetic material with good detonation performance, ' +
            'but high sensitivity limits its widespread implementation. Nitroguanidine' +
            ' (NQ) is proposed as a cocrystal to limit the sensitivity of CL-20. ' +
            'Molecular Dynamics simulations and Density Functional Theory are used to ' +
            'optimize the molecular ratio and intermolecular interaction nature of the ' +
            'CL-20/NQ cocrystal explosive. By increasing the strength of trigger bonds ' +
            'van der Waals forces reduce the sensitivity of the cocrystal explosive.'
        );
        numEl(doc, 'p', 3);
        numEl(doc, 'img', 1);
        numEl(doc, 'figure', 0);
        numParts(res, 0);
      }
    }
  ],
  log = makeTestLog([
    // /Failed to unzip/,
    // /Failed to load docx defaults/,
    // /Unexpected token Y in JSON at position 0/,
    // /Attempted to parse: YGTSS\)25/,
    // /Unexpected token C in JSON at position 0/,
    // /Attempted to parse: CBCL\)35/,
    /License text is neither SPDX nor URL/
  ]);

describe('DOCX: Random Crappy Files', function() {
  this.timeout(40 * 1000);
  list.forEach(item => {
    it(`processes ${item.name}`, done => {
      processDocx(
        {
          docx: path.join(
            path.dirname(__dirname),
            'fixtures',
            'document-worker',
            'crap',
            item.name
          ),
          log
        },
        (err, ctx) => {
          // console.log(ctx.doc.documentElement.outerHTML);
          // error handling
          // TODO: be more specific about expected errors
          if (item.giveUp) {
            assert(err, `Error expected for ${item.name}`);
            return done();
          }
          assert.ifError(err);
          frame(ctx, (err, framed) => {
            assert.ifError(err);
            let resource = framed['@graph'][0];
            if (item.check) item.check(ctx.doc, resource);
            done();
          });
        }
      );
    });
  });
});

function firstP(doc, txt) {
  assert.equal(
    doc.querySelector('p:first-of-type').textContent,
    txt,
    `title is ${txt}`
  );
}

function numEl(doc, el, num) {
  assert.equal(doc.querySelectorAll(el).length, num, `there are ${num} ${el}`);
}

function numParts(res, num) {
  if (!num) return assert(!res.hasPart, 'there are no parts');
  assert(res.hasPart, 'there are parts');
  assert.equal(res.hasPart.length, num, `there are ${num} parts`);
}
