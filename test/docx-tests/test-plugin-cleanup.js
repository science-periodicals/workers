import assert from 'assert';
import { join, dirname } from 'path';
import dedocx from '@scipe/dedocx';
import cleanup from '../../src/document-worker/dedocx-plugins/cleanup';

describe('Empty Heading', () => {
  it('should have cleaned up empty headings', done => {
    dedocx(
      {
        sourcePath: join(
          dirname(__dirname),
          'fixtures/document-worker/plugins/empty-heading.docx'
        ),
        plugins: [cleanup()]
      },
      (err, { doc } = {}) => {
        assert.ifError(err);
        assert.equal(
          doc.querySelectorAll(
            'h1:empty, h2:empty, h3:empty, h4:empty, h5:empty, h6:empty'
          ).length,
          0,
          'no empty headings'
        );
        done();
      }
    );
  });
});
