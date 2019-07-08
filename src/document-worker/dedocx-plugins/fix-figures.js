import { prefix } from '@scipe/jsonld';

const typeMap = {
  math: prefix('Formula'),
  image: prefix('Image'),
  'multi-image': prefix('Image'),
  table: prefix('Table'),
  hyper: prefix('Dataset'),
  code: prefix('SoftwareSourceCode'),
  textbox: prefix('TextBox')
};

export default function fixFigures({ doc, log }, cb) {
  try {
    // we change the multi-figures
    Array.from(doc.querySelectorAll('figure.dedocx-picture-grid-item')).forEach(
      pg => {
        pg.setAttribute('typeof', 'sa:Image');
        pg.setAttribute('property', 'schema:hasPart');
      }
    );

    // type them
    //Note: this will be refined in post-process/extract-external.js
    Array.from(
      doc.querySelectorAll('[data-dedocx-caption-target-type]')
    ).forEach(fig => {
      let type = fig.getAttribute('data-dedocx-caption-target-type');

      if (!typeMap[type]) return;
      fig.setAttribute('typeof', typeMap[type]);
    });

    // labelify
    Array.from(doc.querySelectorAll('.dedocx-label')).forEach(label => {
      label.setAttribute('property', 'schema:alternateName');
    });
  } catch (e) {
    log.error(e);
  }
  process.nextTick(cb);
}
