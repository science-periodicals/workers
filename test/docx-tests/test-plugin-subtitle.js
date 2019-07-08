import assert from 'assert';
import { join, dirname } from 'path';
import dedocx from '@scipe/dedocx';
import subtitle from '../../src/document-worker/dedocx-plugins/subtitle';
import makeSelectron from 'selectron-test';

const sourcePath = join(
  dirname(__dirname),
  'fixtures/document-worker/plugins/subtitle.docx'
);

describe('Subtitles', () => {
  it('should have subtitles', done => {
    dedocx({ sourcePath, plugins: [subtitle()] }, (err, { doc } = {}) => {
      assert.ifError(err);
      let selectron = makeSelectron(doc);
      selectron('header');
      selectron('header > h1', 'Are Subtitles Hop-less?');
      selectron('header > p', 2);
      selectron('header > p:first-of-type', 'I really think they are');
      selectron('header > p:not(:first-of-type)', 'But that might be sad');
      selectron('header + p', 'This is not a subtitle.');
      done();
    });
  });
});
