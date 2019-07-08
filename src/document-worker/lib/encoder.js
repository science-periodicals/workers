import fs from 'fs';
import once from 'once';
import slug from 'slug';
import { basename, join, isAbsolute } from 'path';
import asyncMapLimit from 'async/mapLimit';
import mime from 'mime-types';
import { textify } from '@scipe/jsonld';
import { ImageWorker, AudioVideoWorker } from '../../';
import { MediaObject } from './types';
import { arrayify, remove, checkAbsolute } from './utils';

const res2type = {
  Audio: 'AudioObject',
  CreativeWork: 'MediaObject',
  Dataset: 'DataDownload',
  Formula: 'FormulaObject',
  Image: 'ImageObject',
  SoftwareSourceCode: 'SoftwareSourceCodeObject',
  Table: 'TableObject',
  Video: 'VideoObject',
  TextBox: 'TextBoxObject'
};

function getEncodingName(encodingId, resource, fileFormat, filePath) {
  const extension = mime.extension(fileFormat);
  const ext = extension ? `.${extension}` : '';
  const label = resource && textify(arrayify(resource.alternateName)[0]);

  if (label) {
    return `${slug(label, { lower: true })}${ext}`;
  } else if (filePath) {
    return basename(filePath);
  } else if (encodingId) {
    return `${encodingId}${ext}`;
  }
}

export function encodeHTML(ctx, res, body, parentEncodingId, callback) {
  let { store, graphId, isNodeOfId } = ctx;
  let encodingId = ctx.uuid({ curiePrefix: 'node' });

  ctx.blobStore.put(
    {
      '@type': res2type[res.$type],
      body,
      graphId,
      isNodeOfId,
      resourceId: res.$id,
      encodingId,
      fileFormat: 'text/html',
      name: getEncodingName(encodingId, res, 'text/html'),
      encodesCreativeWork: { '@id': res.$id }
    },
    (err, encoding) => {
      if (err) {
        ctx.log.error(err);
        return callback();
      }

      try {
        if (parentEncodingId) encoding.isBasedOn = { '@id': parentEncodingId };
        let enc = MediaObject.fromJSON(store, encoding);
        res.addEncoding(enc);
      } catch (e) {
        ctx.log.error(e);
      } finally {
        callback(null);
      }
    }
  );
}

// This finds media given a source in a media path. It first looks for the exact requested path in
// the media directory, after cleaning it up for security. If that fails, it will look for the same
// file name at the root of the media directory. Then it will assume that some stupid extension-less
// business is going on, likely to support CONNEG, and so it will look for a file with the same
// extension-less name in both the exact directory and the media directory. Finally, it will walk
// the entire media directory and pick the first file with the matching file name.
export function findMedia(ctx, src, usage) {
  if (!src) return;
  if (isDataURL(src)) return ctx.mediaFiles.find(f => f.path === src);
  let fileName = basename(src),
    { mediaFiles, mediaPath } = ctx;
  if (!fileName || fileName === '.') return null;

  let absPath = isAbsolute(src) ? src : join(mediaPath, src),
    res = mediaFiles.find(f => f.path === absPath);
  if (res) return res;

  let candidates = mediaFiles.filter(f => f.basename === fileName);
  if (candidates.length === 1) return candidates[0];
  if (!candidates.length)
    candidates = mediaFiles.filter(f => f.connegName === fileName);
  if (candidates.length === 1) return candidates[0];
  if (!candidates.length) return null;

  if (usage) {
    if (usage === 'other')
      candidates = candidates.filter(
        c => !/^(image|audio|video)$/.test(c.type)
      );
    else candidates = candidates.filter(c => c.type.indexOf(usage) === 0);
    if (candidates.length === 1) return candidates[0];
    if (!candidates.length) return null;
  }
  // If we still have multiple candidates left, we pick the one with the largest file size. This may
  // seem counterintuitive but these files are used for transcoding and we are assuming the largest
  // is the one with the highest precision. This could be wrong but it's our best heuristic.
  return candidates.sort((a, b) => {
    if (a.stat.size < b.stat.size) return 1;
    if (a.stat.size > b.stat.size) return -1;
    return 0;
  })[0];
}

// `candidates` is an array of types and usage is one of image | audio | video | other. It returns
// the most recommended type. If it fails, it just returns the first one.
export function pickFromMediaType(candidates = [], usage = 'other') {
  candidates = candidates.map(c => {
    let [type, subtype] = c
      .replace(/;.*/, '')
      .toLowerCase()
      .split('/');
    return { type, subtype };
  });
  if (usage !== 'other') candidates = candidates.filter(c => c.type === usage);
  else
    candidates = candidates.filter(c => !/^(image|audio|video)$/.test(c.type));
  if (!candidates.length) return;

  if (usage === 'image') {
    let best =
      candidates.find(c => c.subtype === 'jpeg') ||
      candidates.find(c => c.subtype === 'png') ||
      candidates.find(c => c.subtype === 'gif');
    if (best) return best;
  }
  if (usage === 'video') {
    let best =
      candidates.find(c => c.subtype === 'webm') ||
      candidates.find(c => c.subtype === 'ogg') ||
      candidates.find(c => c.subtype === 'mp4') ||
      candidates.find(c => c.subtype === 'mp2') ||
      candidates.find(c => c.subtype === 'mpeg');
    if (best) return best;
  }
  if (usage === 'audio') {
    let best =
      candidates.find(c => c.subtype === 'ogg') ||
      candidates.find(c => c.subtype === 'aac') ||
      candidates.find(c => c.subtype === 'mp4') ||
      candidates.find(c => c.subtype === 'mpeg') ||
      candidates.find(c => c.subtype === 'mp3');
    if (best) return best;
  }
  return candidates[0];
}

export function encodeImage(
  ctx,
  $img,
  imgRes,
  parent,
  action,
  emitEvent,
  { contentUrl } = {},
  callback
) {
  callback = once(callback);
  let src = ($img && $img.src) || contentUrl;
  if (!src) return callback(null);

  let { resource, graphId, isNodeOfId, worker, store } = ctx;

  let handleEncode = file => {
    if (!parent || !parent.encoding || !parent.encoding[0]) {
      parent = resource;
    }

    let parentEncoding =
      (parent && parent.encoding && parent.encoding[0]) || resource.encoding[0];
    let parentEncodingId = parentEncoding.$id || parentEncoding['@id'];
    let resourceId = imgRes ? imgRes.$id : ctx.resource.$id;
    let encodingId = ctx.uuid({ curiePrefix: 'node' });
    const name = getEncodingName(encodingId, imgRes, file.type, file.path);
    const event = emitEvent(action, `Processing image ${name}`);

    ctx.blobStore.put(
      {
        '@type': 'ImageObject',
        path: file.path,
        graphId,
        isNodeOfId,
        resourceId,
        encodingId,
        name,
        fileFormat: file.type,
        encodesCreativeWork: { '@id': resourceId }
      },
      (err, encoding) => {
        if (err) {
          ctx.log.error(err);
          event.emitEndedEvent();
          return callback(null);
        }
        encoding.isBasedOn = { '@id': parentEncodingId };

        let iwParams = {
          graphId,
          resourceId,
          encodingId,
          fileFormat: encoding.fileFormat,
          name: encoding.name,
          emitEvent: event.emitEvent
        };

        // Note: this also adds thumbnails
        ImageWorker.prototype.probeImage.call(
          worker,
          fs.createReadStream(file.path),
          action,
          iwParams,
          (err, metadata) => {
            if (err) {
              ctx.log.error(err);
              event.emitEndedEvent();
              return callback(null);
            }
            Object.keys(metadata).forEach(p => {
              if (p === 'contentChecksum') {
                if (p in encoding) {
                  if (!Array.isArray(encoding[p])) {
                    encoding[p] = [encoding[p]];
                  }
                  encoding[p].push(metadata[p]);
                } else {
                  encoding[p] = [metadata[p]];
                }
              } else {
                encoding[p] = metadata[p];
              }
            });

            if ($img && /image\/(png|jpeg)/i.test(encoding.fileFormat)) {
              responsivify($img, encoding);
            }

            // make encoding a store object
            encoding = MediaObject.fromJSON(store, encoding);
            if (imgRes) {
              imgRes.addEncoding(encoding);
              imgRes.creator = `bot:${worker.constructor.name}`;
            }

            // If image is png or jpeg we are done
            if (/image\/(png|jpeg)/i.test(encoding.fileFormat)) {
              event.emitEndedEvent();
              return callback(null);
            }

            // Image was not png or jpeg we need to transcode it and add the transcoded encoding to the resource (if we have a resource)
            iwParams.encodesCreativeWork = { '@id': resourceId };
            ImageWorker.prototype.convertImage.call(
              worker,
              fs.createReadStream(file.path),
              'image/png',
              action,
              iwParams,
              (err, convertedEncoding) => {
                if (err) {
                  ctx.log.error(err);
                  event.emitEndedEvent();
                  return callback(null);
                }

                try {
                  if ($img) {
                    responsivify($img, convertedEncoding);
                  }

                  convertedEncoding = MediaObject.fromJSON(
                    store,
                    convertedEncoding
                  );
                  if (imgRes) {
                    imgRes.addEncoding(convertedEncoding);
                  }
                } catch (e) {
                  ctx.log.error(e);
                } finally {
                  event.emitEndedEvent();
                  callback(null);
                }
              }
            );
          }
        );
      }
    );
  };

  try {
    if (checkAbsolute(contentUrl || src)) {
      let encoding = ctx.store.createImageObject(
        {
          contentUrl: contentUrl || src,
          dateCreated: new Date().toISOString()
        },
        { curiePrefix: 'node' }
      );
      if (imgRes) {
        imgRes.encoding = [encoding];
        imgRes.creator = `bot:${worker.constructor.name}`;
      }
      return callback(null);
    } else if (contentUrl) {
      handleEncode({ path: contentUrl });
    } else {
      let f = findMedia(ctx, src, 'image');
      if (f && isDataURL(f.path)) {
        return callback(null);
      }
      if (!f) {
        ctx.log.error(new Error(`File not found: ${src}`));
        return callback(null);
      }
      handleEncode(f);
    }
  } catch (e) {
    ctx.log.error(e);
    return callback(null);
  }
}

function responsivify($img, encoding) {
  // `encoding.thumbnail` is a list of encodings with `contentUrl`, `height`, `width`,
  // and `fileFormat`
  // https://jakearchibald.com/2015/anatomy-of-responsive-images/
  $img.src = encoding.contentUrl;

  // We restrict thumbnails to the ones that can  be used  for responsive images
  const thumbnails = arrayify(encoding.thumbnail).filter(
    thumbnail => thumbnail.contentUrl && typeof thumbnail.width === 'number'
  );
  if (thumbnails.length) {
    // we go over each size to produce the srcset
    // we let the browser work its magic for the sizes, based on what the CSS we use has
    const srcSet = thumbnails
      .map(pic => `${pic.contentUrl} ${pic.width}w`)
      .join(', ');
    $img.setAttribute('srcset', srcSet);

    const max = Math.max.apply(Math, thumbnails.map(x => x.width));
    if (!isNaN(max)) {
      $img.setAttribute(
        'sizes',
        `(min-width: 1900px) ${max >= 804 ? 804 : max}px,
                     (min-width: 1000px) ${max >= 772 ? 772 : max}px,
                     (min-width:  800px) ${
                       max >= 640 ? 'calc(100vw - 232px)' : `${max}px`
                     },
                     (min-width:  400px) ${
                       max >= 320 ? 'calc(100vw - 116px)' : `${max}px`
                     },
                     ${max < 320 ? `${max}px` : 'calc(100vw - 58px)'}`
      );
    }

    if (typeof encoding.width === 'number' && !isNaN(encoding.width)) {
      $img.setAttribute('data-width', encoding.width);
    }
    if (typeof encoding.height === 'number' && !isNaN(encoding.height)) {
      $img.setAttribute('data-height', encoding.height);
    }
  } else {
    if (typeof encoding.width === 'number' && !isNaN(encoding.width)) {
      $img.setAttribute('width', encoding.width);
    }
    if (typeof encoding.height === 'number' && !isNaN(encoding.height)) {
      $img.setAttribute('height', encoding.height);
    }
  }
}

export function encodeVideo(
  ctx,
  $video,
  videoRes,
  parent,
  action,
  emitEvent,
  options = {},
  callback
) {
  let src = ($video && $video.src) || options.contentUrl;
  if (!src) return callback();

  let { resource, mediaPath, graphId, isNodeOfId, worker, store } = ctx;

  let handleEncode = file => {
    if (!parent || !parent.encoding || !parent.encoding[0]) parent = resource;
    let parentEncoding =
        (parent && parent.encoding && parent.encoding[0]) ||
        resource.encoding[0],
      parentEncodingId = parentEncoding.$id || parentEncoding['@id'],
      resourceId = videoRes ? videoRes.$id : ctx.resource.$id,
      encodingId = ctx.uuid({ curiePrefix: 'node' });

    const name = getEncodingName(encodingId, videoRes, file.type, file.path);
    const event = emitEvent(action, `Processing video ${name}`);

    ctx.blobStore.put(
      {
        '@type': 'VideoObject',
        path: file.path,
        graphId,
        isNodeOfId,
        resourceId,
        encodingId,
        name,
        fileFormat: file.type,
        encodesCreativeWork: { '@id': resourceId }
      },
      (err, encoding) => {
        if (err) {
          ctx.log.error(err);
          event.emitEndedEvent();
          return callback(null);
        }
        encoding.isBasedOn = { '@id': parentEncodingId };

        let wParams = {
          graphId,
          resourceId,
          encodingId,
          fileFormat: encoding.fileFormat,
          name: encoding.name,
          emitEvent: event.emitEvent
        };

        AudioVideoWorker.prototype.probeAudioVideo.call(
          worker,
          mediaPath,
          file.path,
          action,
          wParams,
          (err, metadata) => {
            if (err) {
              ctx.log.error(err);
              event.emitEndedEvent();
              return callback(null);
            }

            Object.keys(metadata).forEach(p => {
              if (p === 'contentChecksum') {
                if (p in encoding) {
                  if (!Array.isArray(encoding[p])) {
                    encoding[p] = [encoding[p]];
                  }
                  encoding[p].push(metadata[p]);
                } else {
                  encoding[p] = [metadata[p]];
                }
              } else {
                encoding[p] = metadata[p];
              }
            });

            encoding = MediaObject.fromJSON(store, encoding);
            if (videoRes) {
              videoRes.addEncoding(encoding);
            }

            wParams.encodesCreativeWork = { '@id': resourceId };
            let targetFormats = ['video/webm', 'video/mp4', 'video/ogg'];
            asyncMapLimit(
              targetFormats,
              1,
              (format, cb) => {
                AudioVideoWorker.prototype.transcodeAudioVideo.call(
                  worker,
                  mediaPath,
                  file.path,
                  format,
                  action,
                  wParams,
                  cb
                );
              },
              (err, encodings) => {
                if (err) {
                  ctx.log.error(err);
                  event.emitEndedEvent();
                  return callback(null);
                }

                try {
                  let poster, width, height;
                  if (videoRes) {
                    encodings.forEach(enc => {
                      videoRes.addEncoding(MediaObject.fromJSON(store, enc));
                    });
                  }

                  encodings.forEach(enc => {
                    if (poster) return;
                    if (!enc.thumbnail || !arrayify(enc.thumbnail).length)
                      return;
                    poster = arrayify(enc.thumbnail)
                      .map(th => th.contentUrl)
                      .find(x => x);
                  });

                  encodings.forEach(enc => {
                    if (width && height) return;
                    if (!enc.width || !enc.height) return;
                    width = enc.width;
                    height = enc.height;
                  });

                  if ($video) {
                    $video.removeAttribute('src');
                    $video.setAttribute('controls', 'controls');
                    if (poster) $video.setAttribute('poster', poster);
                    if (width) $video.setAttribute('width', width);
                    if (height) $video.setAttribute('height', height);
                    encodings.forEach(enc => {
                      let $source = $video.ownerDocument.createElement(
                        'source'
                      );
                      $source.setAttribute('src', enc.contentUrl);
                      $source.setAttribute('type', enc.fileFormat);
                      $video.appendChild($source);
                    });
                  }
                } catch (e) {
                  ctx.log.error(e);
                } finally {
                  event.emitEndedEvent();
                  callback(null);
                }
              }
            );
          }
        );
      }
    );
  };

  try {
    if (checkAbsolute(options.contentUrl || src)) {
      let encoding = ctx.store.createVideoObject(
        {
          contentUrl: options.contentUrl || src,
          dateCreated: new Date().toISOString()
        },
        {
          curiePrefix: 'node'
        }
      );
      if (videoRes) {
        videoRes.encoding = [encoding];
        videoRes.creator = `bot:${worker.constructor.name}`;
      }
      return callback(null);
    } else if (options.contentUrl) {
      handleEncode({ path: options.contentUrl });
    } else {
      let f = findMedia(ctx, src, 'video');
      if (isDataURL(f.path)) {
        return callback(null);
      }
      if (!f) {
        ctx.log.error(new Error(`File not found: ${src}`));
        return callback(null);
      }
      handleEncode(f);
    }
  } catch (e) {
    ctx.log.error(e);
    callback(null);
  }
}

export function encodeAudio(
  ctx,
  $audio,
  audioRes,
  parent,
  action,
  emitEvent,
  options = {},
  callback
) {
  let src = ($audio && $audio.src) || options.contentUrl;
  if (!src) return callback();
  let { resource, mediaPath, graphId, isNodeOfId, worker, store } = ctx;

  let handleEncode = file => {
    if (!parent || !parent.encoding || !parent.encoding[0]) parent = resource;
    let parentEncoding =
        (parent && parent.encoding && parent.encoding[0]) ||
        resource.encoding[0],
      parentEncodingId = parentEncoding.$id || parentEncoding['@id'],
      resourceId = audioRes ? audioRes.$id : ctx.resource.$id,
      encodingId = ctx.uuid({ curiePrefix: 'node' });

    const name = getEncodingName(encodingId, audioRes, file.type, file.path);
    const event = emitEvent(action, `Processing audio ${name}`);

    ctx.blobStore.put(
      {
        '@type': 'AudioObject',
        path: file.path,
        graphId,
        isNodeOfId,
        resourceId,
        encodingId,
        name,
        fileFormat: file.type,
        encodesCreativeWork: { '@id': resourceId }
      },
      (err, encoding) => {
        if (err) {
          ctx.log.error(err);
          event.emitEndedEvent();
          return callback(null);
        }

        encoding.isBasedOn = { '@id': parentEncodingId };

        let wParams = {
          graphId,
          resourceId,
          encodingId,
          fileFormat: encoding.fileFormat,
          name: encoding.name,
          emitEvent: event.emitEvent
        };

        AudioVideoWorker.prototype.probeAudioVideo.call(
          worker,
          mediaPath,
          file.path,
          action,
          wParams,
          (err, metadata) => {
            if (err) {
              ctx.log.error(err);
              event.emitEndedEvent();
              return callback(null);
            }

            Object.keys(metadata).forEach(p => {
              if (p === 'contentChecksum') {
                if (p in encoding) {
                  if (!Array.isArray(encoding[p])) {
                    encoding[p] = [encoding[p]];
                  }
                  encoding[p].push(metadata[p]);
                } else {
                  encoding[p] = [metadata[p]];
                }
              } else {
                encoding[p] = metadata[p];
              }
            });

            encoding = MediaObject.fromJSON(store, encoding);
            if (audioRes) {
              audioRes.addEncoding(encoding);
            }

            wParams.encodesCreativeWork = { '@id': resourceId };
            const targetFormats = ['audio/mpeg', 'audio/ogg'];

            asyncMapLimit(
              targetFormats,
              1,
              (format, cb) => {
                AudioVideoWorker.prototype.transcodeAudioVideo.call(
                  worker,
                  mediaPath,
                  file.path,
                  format,
                  action,
                  wParams,
                  cb
                );
              },
              (err, encodings) => {
                if (err) {
                  ctx.log.error(err);
                  event.emitEndedEvent();
                  return callback(null);
                }

                try {
                  if (audioRes) {
                    encodings.forEach(enc => {
                      audioRes.addEncoding(MediaObject.fromJSON(store, enc));
                    });
                  }

                  if ($audio) {
                    $audio.removeAttribute('src');
                    encodings.forEach(enc => {
                      let $source = $audio.ownerDocument.createElement(
                        'source'
                      );
                      $source.setAttribute('src', enc.contentUrl);
                      $source.setAttribute('type', enc.fileFormat);
                      $audio.appendChild($source);
                    });
                  }
                } catch (e) {
                  ctx.log.error(err);
                } finally {
                  event.emitEndedEvent();
                  callback(null);
                }
              }
            );
          }
        );
      }
    );
  };

  try {
    if (checkAbsolute(options.contentUrl || src)) {
      let encoding = ctx.store.createAudioObject(
        {
          contentUrl: options.contentUrl || src,
          dateCreated: new Date().toISOString()
        },
        {
          curiePrefix: 'node'
        }
      );
      if (audioRes) {
        audioRes.encoding = [encoding];
        audioRes.creator = `bot:${worker.constructor.name}`;
      }
      callback(null);
    } else if (options.contentUrl) {
      handleEncode({ path: options.contentUrl });
    } else {
      let f = findMedia(ctx, src, 'audio');
      if (isDataURL(f.path)) {
        return callback(null);
      }
      if (!f) {
        ctx.log.error(new Error(`File not found: ${src}`));
        return callback(null);
      }
      handleEncode(f);
    }
  } catch (e) {
    ctx.log.error(e);
    callback(null);
  }
}

// store is the store, resource is the specific resource being considered, element is the element
// that encodes it, figure is the figure wrapping the latter.
// options is variable:
//  - for Formula, the `label` string
export function htmlEncodingExtractor(
  store,
  resource,
  element,
  figure,
  options = {}
) {
  let type = resource.$type;
  if (type === 'SoftwareSourceCode') {
    return (
      element.querySelector('code') ||
      element.querySelector('pre') ||
      element
    ).innerHTML;
  }

  if (type === 'Formula') {
    let hasDataEq = figure.hasAttribute('data-equation-number');
    if (options.label && !hasDataEq) {
      let num = options.label.replace(/\D/g, '');
      if (num) {
        figure.setAttribute('data-equation-number', num);
        hasDataEq = true;
      }
    }
    if (hasDataEq)
      resource.position = parseInt(
        figure.getAttribute('data-equation-number'),
        10
      );
    return element.localName === 'div' ? element.innerHTML : element.outerHTML;
  }

  if (type === 'Table') {
    return element.outerHTML;
  }

  if (type === 'TextBox') {
    let $clone = element.cloneNode(true);
    remove($clone.querySelector('header'));
    return $clone.innerHTML;
  }

  if (type === 'CreativeWork') {
    let $clone = element.cloneNode(true);
    remove($clone.querySelector('figcaption'));
    return $clone.innerHTML;
  }

  // NOTE it would be good to log this error
  console.warn(`Unknown type of HTML encoding container: ${type}`);
  return '';
}

export function isDataURL(url) {
  return url && /^data:/i.test(url);
}
