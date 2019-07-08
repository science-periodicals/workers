import path from 'path';
import isUrl from 'is-url';
import slug from 'slug';
import { normalizeText } from 'web-verse';
import { prefix } from '@scipe/jsonld';
import { isSupporting } from '../lib/utils';

export default function extractExternal(ctx, callback) {
  const { doc, resource, store, worker, graphId } = ctx;

  // We recognise <figure>s that contain a <p> containing an <a> as links to external resources.
  for (let $a of doc.querySelectorAll('figure > p > a')) {
    let $figure = $a.parentNode.parentNode;
    let cap = $figure.lastElementChild;
    let tc =
      cap &&
      cap.querySelector('span[property="schema:alternateName"]') &&
      cap.querySelector('span[property="schema:alternateName"]').textContent;

    let externalResource;
    const externalResourceParams = {
      dateCreated: new Date().toISOString(),
      resourceOf: graphId,
      creator: `bot:${worker.constructor.name}`,
      isPartOf: resource.$id,
      isSupportingResource: isSupporting($figure)
    };

    const url = normalizeText($a.getAttribute('href'));
    const isFile = !isUrl(url) || /^file:/i.test(url);
    const externalEncodingParams = {
      creator: `bot:${worker.constructor.name}`,
      contentUrl: isFile
        ? `file:${slug(url, slug.defaults.modes['rfc3986'])}?r=${
            resource.$id
          }` /* we keep the `.` in slug and we add the resourceId to help with librarian reconciliation */
        : url,
      dateCreated: new Date().toISOString()
    };
    if (isFile) {
      externalEncodingParams.name = path.basename(url);
    }

    if (/data/i.test(tc)) {
      // Dataset
      externalResource = store.createDataset(externalResourceParams, {
        curiePrefix: 'node'
      });
      externalResource.addDistribution(
        store.createDataDownload(externalEncodingParams, {
          curiePrefix: 'node'
        })
      );
      $figure.setAttribute('typeof', prefix('Dataset'));
    } else if (/image|figure|photo|picture/i.test(tc)) {
      // Image
      externalResource = store.createImage(externalResourceParams, {
        curiePrefix: 'node'
      });
      externalResource.addEncoding(
        store.createImageObject(externalEncodingParams, {
          curiePrefix: 'node'
        })
      );
      $figure.setAttribute('typeof', prefix('Image'));
    } else if (/video|film|movie/i.test(tc)) {
      // Video
      externalResource = store.createVideo(externalResourceParams, {
        curiePrefix: 'node'
      });
      externalResource.addEncoding(
        store.createVideoObject(externalEncodingParams, {
          curiePrefix: 'node'
        })
      );
      $figure.setAttribute('typeof', prefix('Video'));
    } else if (/audio|sound|recording/i.test(tc)) {
      // Audio
      externalResource = store.createAudio(externalResourceParams, {
        curiePrefix: 'node'
      });
      externalResource.addEncoding(
        store.createAudioObject(externalEncodingParams, {
          curiePrefix: 'node'
        })
      );
      $figure.setAttribute('typeof', prefix('Audio'));
    } else if (/formula|equation|math/i.test(tc)) {
      // Formula
      externalResource = store.createFormula(externalResourceParams, {
        curiePrefix: 'node'
      });
      externalResource.addEncoding(
        store.createFormulaObject(externalEncodingParams, {
          curiePrefix: 'node'
        })
      );
      $figure.setAttribute('typeof', prefix('Formula'));
    } else if (/table/i.test(tc)) {
      // Table
      externalResource = store.createTable(externalResourceParams, {
        curiePrefix: 'node'
      });
      externalResource.addEncoding(
        store.createTableObject(externalEncodingParams, {
          curiePrefix: 'node'
        })
      );
      $figure.setAttribute('typeof', prefix('Table'));
    } else if (/code|software|application/i.test(tc)) {
      // SoftwareSourceCode
      externalResource = store.createSoftwareSourceCode(
        Object.assign({ codeSampleType: 'external' }, externalResourceParams, {
          curiePrefix: 'node'
        })
      );
      externalResource.addEncoding(
        store.createSoftwareSourceCodeObject(externalEncodingParams, {
          curiePrefix: 'node'
        })
      );
      $figure.setAttribute('typeof', prefix('SoftwareSourceCode'));
    } else if (/box/i.test(tc)) {
      // TextBox
      externalResource = store.createTextBox(externalResourceParams, {
        curiePrefix: 'node'
      });
      externalResource.addEncoding(
        store.createMediaObject(externalEncodingParams, {
          curiePrefix: 'node'
        })
      );
      $figure.setAttribute('typeof', prefix('TextBox'));
    } else {
      // CreativeWork
      externalResource = store.createResource(externalResourceParams, {
        curiePrefix: 'node'
      });
      externalResource.addEncoding(
        store.createMediaObject(externalEncodingParams, {
          curiePrefix: 'node'
        })
      );
      $figure.setAttribute('typeof', prefix('CreativeWork'));
    }

    $figure.setAttribute('resource', externalResource.$id);
    if ($figure.hasAttribute('id')) {
      store.mapIDs($figure.getAttribute('id'), externalResource);
    }
    resource.addPart(externalResource);
  }

  process.nextTick(callback);
}

extractExternal.message = `Extracting external references`;
