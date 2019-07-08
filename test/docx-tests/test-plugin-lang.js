import assert from 'assert';
import { join, dirname } from 'path';
import dedocx from '@scipe/dedocx';
import lang from '../../src/document-worker/dedocx-plugins/lang';

describe('Language', () => {
  // NOTE: here we _could_ rely on the theme's default for the language, as it might provide some
  // indication. It is likely, however, that such indication will often be wrong, so at this point
  // we don't touch it.
  it('should have expose various languages', done => {
    dedocx(
      {
        sourcePath: join(
          dirname(__dirname),
          'fixtures/document-worker/plugins/lang.docx'
        ),
        plugins: [lang()]
      },
      (err, { doc } = {}) => {
        assert.ifError(err);
        let paras = Array.from(doc.querySelectorAll('p'));
        [
          undefined,
          undefined,
          'en-US',
          'fr-FR',
          'zh-CN',
          undefined,
          'ja-JP',
          'zh-CN'
        ].forEach((lng, idx) =>
          assert.equal(
            paras[idx].getAttribute('lang'),
            lng,
            `language is ${lng}: ${paras[idx].getAttribute('lang')}`
          )
        );
        done();
      }
    );
  });
  it('should merge the language up the tree', done => {
    dedocx(
      {
        sourcePath: join(
          dirname(__dirname),
          'fixtures/document-worker/plugins/fr.docx'
        ),
        plugins: [lang()]
      },
      (err, { doc } = {}) => {
        assert.ifError(err);
        let langs = Array.from(doc.querySelectorAll('[lang]'));
        assert.equal(langs.length, 1, 'only one');
        assert.equal(langs[0].localName, 'body', 'move up to the body');
        done();
      }
    );
  });
});
