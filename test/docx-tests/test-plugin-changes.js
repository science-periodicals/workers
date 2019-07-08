import { join, dirname } from 'path';
import assert from 'assert';
import makeSelectron from 'selectron-test';
import dedocx from '@scipe/dedocx';
import changes from '../../src/document-worker/dedocx-plugins/changes';

const sourcePath = join(
  dirname(__dirname),
  'fixtures/document-worker/plugins/tracking.docx'
);

describe('dedocx-plugin-changes', () => {
  it('should kill comments', done =>
    testForOptions({ killComments: true }, done));
  it('should keep comments', done =>
    testForOptions({ killComments: false }, done));
  it('should kill markup', done => testForOptions({ keepMarkup: false }, done));
  it('should keep markup', done => testForOptions({ keepMarkup: true }, done));
  it('should kill markup (reject)', done =>
    testForOptions({ mode: 'reject', keepMarkup: false }, done));
  it('should keep markup (reject)', done =>
    testForOptions({ mode: 'reject', keepMarkup: true }, done));
});

function testForOptions(
  { mode = 'accept', keepMarkup = false, killComments = true },
  done
) {
  dedocx(
    {
      sourcePath,
      plugins: [changes({ mode, keepMarkup, killComments })]
    },
    (err, { doc } = {}) => {
      assert.ifError(err);
      let selectron = makeSelectron(doc),
        text = doc.body.textContent;
      selectron(
        '.commentRangeStart, .commentRangeEnd, .commentReference',
        !killComments
      );
      selectron('ins, del', keepMarkup);
      assert.equal(
        /a bit removed/.test(text),
        mode === 'reject',
        `removal (${mode}) ok`
      );
      assert.equal(
        /something added/.test(text),
        mode === 'accept',
        `insertion (${mode}) ok`
      );
      assert(!/interject/.test(text), 'comment not in body');
      assert(/has a comment/.test(text), 'comment content ok');
      done();
    }
  );
}
