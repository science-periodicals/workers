import { remove, renameElement } from '../lib/utils';

/**
 * DOCX has no real notion of figures and captions. Everything is just a flat
 * paragraph without genuine relationships maintained in the content, eg. an image
 * in a paragraph that might happen to be followed or preceded by another paragraph
 * that might happen to be styled like a caption.
 *
 * By default, dedocx carries out a decent amount of processing to try to infer
 * what content is (really) a caption and to what other piece of content it
 * actually applies. However, since this is all a bunch of ugly heuristics it does
 * not go so far as to generate a figure and figcaption to go with but instead just
 * leaves data-* attributes and classes to make that explicit. This plugin fills
 * that gap.
 *
 * It is likely better to run this after dedocx-plugin-code (strongly recommended)
 * and dedocx-plugin-alternate-content
 */
export default function dedocxFigurifyPlugin() {
  return function figurifyPlugin({ doc, log } = {}, callback) {
    Array.from(
      doc.querySelectorAll('[data-dedocx-caption-target-type]')
    ).forEach(target => {
      let type = target.getAttribute('data-dedocx-caption-target-type');
      let group = target.getAttribute('data-dedocx-caption-group');
      let caption = doc.querySelector(
        `.dedocx-caption[data-dedocx-caption-group="${group}"]`
      );
      let figure = doc.createElement('figure');
      let figcaption = doc.createElement('figcaption');
      let content = target;

      if (!caption) {
        return log.warn(`No caption for type "${type}"`);
      }

      if (type !== 'multi-image') {
        if (group) {
          figure.setAttribute('data-dedocx-caption-group', group);
          target.removeAttribute('data-dedocx-caption-group');
        }
        if (type) {
          figure.setAttribute('data-dedocx-caption-target-type', type);
          target.removeAttribute('data-dedocx-caption-target-type');
        }
      }

      // not all targets are directly the content, though we should be okay for table, code,
      // and hyper (which won't be the link but that's fine), and textbox is directly
      // an aside
      if (type === 'image' && target.localName !== 'img') {
        content = target.querySelector('img');
      } else if (type === 'math' && target.localName !== 'math') {
        content = Array.from(target.querySelectorAll('math'));
        if (!content.length) {
          content = null;
        }
      }

      if (!content) {
        return log.warn(`No content for caption "${caption.textContent}"`);
      }

      if (caption.children.length > 1) {
        while (caption.hasChildNodes()) {
          figcaption.appendChild(caption.firstChild);
        }
      } else if (caption.children.length === 1) {
        figcaption = renameElement(caption.firstElementChild, 'figcaption');
      }
      remove(caption);

      if (type === 'multi-image') {
        figure = renameElement(target, 'figure');
      } else {
        target.parentNode.replaceChild(figure, target);
        if (Array.isArray(content)) {
          content.forEach(cnt => figure.appendChild(cnt));
        } else {
          figure.appendChild(content);
        }
      }
      figure.appendChild(figcaption);

      if (figcaption.hasAttribute('id')) {
        figure.setAttribute('id', figcaption.getAttribute('id'));
        figcaption.removeAttribute('id');
      } else if (
        figcaption.firstElementChild &&
        figcaption.firstElementChild.hasAttribute('id')
      ) {
        figure.setAttribute(
          'id',
          figcaption.firstElementChild.getAttribute('id')
        );
        figcaption.firstElementChild.removeAttribute('id');
      }
    });

    // some captions are also the heading box for asides
    Array.from(doc.querySelectorAll('aside')).forEach(aside => {
      let caption = aside.querySelector('.dedocx-caption');
      let header = doc.createElement('header');

      if (!caption) {
        return;
      }
      let group = caption.getAttribute('data-dedocx-caption-group');
      aside.setAttribute('data-dedocx-caption-group', group);
      aside.setAttribute('data-dedocx-caption-target-type', 'textbox');

      if (caption.children.length > 1) {
        while (caption.hasChildNodes()) {
          header.appendChild(caption.firstChild);
        }
      } else if (caption.children.length === 1) {
        header = renameElement(caption.firstElementChild, 'header');
      }
      remove(caption);
      aside.insertBefore(header, aside.firstElementChild);

      if (header.hasAttribute('id')) {
        aside.setAttribute('id', header.getAttribute('id'));
        header.removeAttribute('id');
      } else if (header.firstElementChild.hasAttribute('id')) {
        aside.setAttribute('id', header.firstElementChild.getAttribute('id'));
        header.firstElementChild.removeAttribute('id');
      }
    });

    // grid items are figures too
    Array.from(doc.querySelectorAll('.dedocx-picture-grid-item')).forEach(
      gi => {
        renameElement(
          gi.querySelector('.dedocx-picture-grid-label'),
          'figcaption'
        );
        renameElement(gi, 'figure');
      }
    );

    // grid label captions aren't like other captions, so we normalise them
    Array.from(doc.querySelectorAll('.dedocx-picture-grid-label')).forEach(
      label => {
        label.removeAttribute('class');
        let span = doc.createElement('span');
        span.setAttribute('class', 'dedocx-label');
        while (label.hasChildNodes()) {
          span.appendChild(label.firstChild);
        }
        label.appendChild(span);
      }
    );

    // asides can end up in paragraphs
    Array.from(doc.querySelectorAll('p aside')).forEach(aside => {
      let parent = aside.parentNode;
      while (parent && parent.localName !== 'p') parent = parent.parentNode;
      if (!parent) {
        return;
      }
      parent.parentNode.insertBefore(aside, parent);
    });

    process.nextTick(callback);
  };
}
