import once from 'once';
import asyncSeries from 'async/series';
import abbr from './post-process/abbr-dfn';
import addPrefixes from './post-process/add-prefixes';
import cleanupFigures from './post-process/cleanup-figures';
import handleFootnotes from './post-process/handle-footnotes';
import flavorLinks from './post-process/flavor-links';
import extractAcknowledgments from './post-process/extract-acknowledgements';
import extractAuthorsAndAffiliations from './post-process/extract-authors-and-affiliations';
import extractCode from './post-process/extract-code';
import extractCopyright from './post-process/extract-copyright';
import extractDisclosure from './post-process/extract-disclosures';
import extractEquations from './post-process/extract-equations';
import extractExternal from './post-process/extract-external';
import extractFunding from './post-process/extract-funding';
import extractImages from './post-process/extract-images';
import extractKeywords from './post-process/extract-keywords';
import extractLicense from './post-process/extract-license';
import extractSoloImages from './post-process/extract-solo-images';
import extractTables from './post-process/extract-tables';
import extractTextBoxes from './post-process/extract-text-boxes';
import mathify from './post-process/mathify';
import cleanup from './post-process/cleanup';
import extractTitleAndSubtitle from './post-process/extract-title-and-subtitle';
import partsOrdering from './post-process/parts-ordering';
import saveResourceEncodings from './post-process/save-resource-encodings';
import resourceMetadata from './post-process/resource-metadata';
import unabstract from './post-process/unabstract';
import extractDescription from './post-process/extract-description';
import sectionExtractor from './post-process/section-extractor';
import structureArticle from './post-process/structure-article';

const modalPipelines = {
  ds3: [
    sectionExtractor,
    abbr, // needs to happen _before_ `extractAuthorsAndAffiliations` so it handles the author notes case

    extractAuthorsAndAffiliations,
    extractKeywords,
    extractLicense,
    extractCopyright,
    mathify,

    extractSoloImages,
    extractImages,
    extractEquations,
    extractTables,
    extractCode,
    extractTextBoxes,
    extractExternal,

    addPrefixes,
    cleanup,
    extractTitleAndSubtitle,

    resourceMetadata, // before `handleFootnotes` so that author contribution notes + contact point are excluded from footnotes
    handleFootnotes, // Note: this is fine _after_ `resourceMetadata` as it also re-process the HTML stored in the Graph
    flavorLinks, // Note: this is fine at the end as it re-process the HTML stored in the Graph

    unabstract,
    extractDescription,

    extractFunding,
    extractAcknowledgments,
    extractDisclosure,
    saveResourceEncodings,
    cleanupFigures,
    partsOrdering,
    structureArticle // Note this will also remove footnote and endnote sections
  ]
};

/**
 * Process the HTML after dedocx has been through it
 */
export default function postProcessHtml(ctx, callback) {
  const { action, emitEvent, mode } = ctx;
  const superEvent = emitEvent(action, `Post processing ${action.object.name}`);
  ctx.emitEvent = superEvent.emitEvent;

  // TODO generalize based on `mode` when we do scholarly archive (`sa`)
  const pipelineMode = 'ds3';

  asyncSeries(
    modalPipelines[pipelineMode].map(step => cb => {
      cb = once(cb);
      try {
        ctx.log.trace(`• ${step.name}`);
        const subEvent = ctx.emitEvent(action, step.message);
        ctx.emitEvent = subEvent.emitEvent;
        step(ctx, err => {
          if (err) {
            ctx.log.error(err, `PostProcessHtml: error at ${step.name}`);
          }
          subEvent.emitEndedEvent();
          ctx.emitEvent = superEvent.emitEvent;
          cb();
        });
      } catch (e) {
        ctx.emitEvent = superEvent.emitEvent;
        ctx.log.error(e, `PostProcessHtml: error at ${step.name}`);
        cb();
      }
    }),
    err => {
      if (err) {
        ctx.log.error(err);
      }
      superEvent.emitEndedEvent();
      ctx.emitEvent = emitEvent;
      callback(null, ctx);
    }
  );
}
