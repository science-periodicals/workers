import path from 'path';
import dedocx from '@scipe/dedocx';
import noOpener from './dedocx-plugins/noopener';
import css from './dedocx-plugins/css';
import changes from './dedocx-plugins/changes';
import subtitle from './dedocx-plugins/subtitle';
import code from './dedocx-plugins/code';
import mathBlocks from './dedocx-plugins/math-blocks';
import quotify from './dedocx-plugins/quotify';
import sectionify from './dedocx-plugins/sectionify';
import biblio from './dedocx-plugins/biblio';
import images from './dedocx-plugins/images';
import alternateContent from './dedocx-plugins/alternate-content';
import figurify from './dedocx-plugins/figurify';
import lang from './dedocx-plugins/lang';
import cleanup from './dedocx-plugins/cleanup';
import saver from './dedocx-plugins/saver';
import fixFigures from './dedocx-plugins/fix-figures';
import tableDoubleBorder from './dedocx-plugins/table-double-border';
import cleanNotes from './dedocx-plugins/clean-notes';
import fileInfo from './lib/file-info';

export default function(ctx, callback) {
  const { action, emitEvent, store, resource, log } = ctx;
  const superEvent = emitEvent(
    action,
    `Converting ${action.object.name} into HTML`
  );
  ctx.emitEvent = superEvent.emitEvent;

  dedocx(
    {
      sourcePath: ctx.sourcePath,
      plugins: [
        css(),
        changes(),
        subtitle(),
        code(),
        mathBlocks(),
        quotify(),
        sectionify(),
        biblio({ removeBibliographySection: false, store, resource, log }),
        images(),
        alternateContent(),
        figurify(),
        lang(),
        noOpener(),
        fixFigures,
        tableDoubleBorder,
        cleanNotes,
        cleanup({ strictData: true }),
        saver({ dir: ctx.root })
      ]
    },
    (err, { doc, bibliography } = {}) => {
      if (err) {
        superEvent.emitEndedEvent();
        ctx.emitEvent = emitEvent;
        return callback(err);
      }

      ctx.mediaPath = path.join(ctx.root, 'img');
      ctx.bibliography = bibliography;
      ctx.doc = doc;
      fileInfo(ctx.mediaPath, (err, fileDetails) => {
        if (err) {
          superEvent.emitEndedEvent();
          ctx.emitEvent = emitEvent;
          return callback(err);
        }
        ctx.mediaFiles = fileDetails;
        doc.normalize();

        superEvent.emitEndedEvent();
        ctx.emitEvent = emitEvent;

        callback(null, ctx);
      });
    }
  );
}
