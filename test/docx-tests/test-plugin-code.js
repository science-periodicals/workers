import assert from 'assert';
import { join, dirname } from 'path';
import dedocx from '@scipe/dedocx';
import code from '../../src/document-worker/dedocx-plugins/code';

describe('Code Blocks', () => {
  it('should merged code blocks', done => {
    dedocx(
      {
        sourcePath: join(
          dirname(__dirname),
          'fixtures/document-worker/plugins/codeblock-samples.docx'
        ),
        plugins: [code()]
      },
      (err, { doc } = {}) => {
        assert.ifError(err);
        let codeContent = [
          `obj.prototype.method = function (name) {
    return name.toUpperCase();
};
`,
          `import Text.Parsec
import Text.Parsec.Error
import qualified Text.Pandoc.UTF8 as UTF8
import Paths_pandoc (version)

-- | Version number of pandoc library.
pandocVersion :: String
pandocVersion = showVersion version`,
          `static void save_env(void)
{
  int i;
  if (saved_environment)
    return;
  saved_environment = 1;
  orig_cwd = xgetcwd();
  for (i = 0; i < ARRAY_SIZE(env_names); i++) {
    orig_env[i] = getenv(env_names[i]);
    if (orig_env[i])
      orig_env[i] = xstrdup(orig_env[i]);
  }
}`,
          `func showVersion() {
  if utils.ExperimentalBuild() {
    fmt.Printf("Docker version %s, build %s, experimental\\n", dockerversion.VERSION, dockerversion.GITCOMMIT)
  } else {
    fmt.Printf("Docker version %s, build %s\\n", dockerversion.VERSION, dockerversion.GITCOMMIT)
  }
}`
        ];
        let codes = Array.from(doc.querySelectorAll('code'));
        assert.equal(codes.length, 4, 'four code blocks');
        codes.forEach((cnt, idx) =>
          assert.equal(cnt.textContent, codeContent[idx], `code ${idx} matches`)
        );
        done();
      }
    );
  });
});
