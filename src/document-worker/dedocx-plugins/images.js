import { ELEMENT_NODE } from 'dom-node-types';

/**
 * By default, dedocx will just create an img with a simple src but no
 * dimensions and typically embedded in a whole lot of markup. We get the size,
 * replace the crap markup, and maintain captioning information.
 */
export default function dedocxImagesPlugin() {
  return function imagesPlugin({ doc } = {}, callback) {
    Array.from(doc.querySelectorAll('img[src]')).forEach(img => {
      let drawing;
      let parent = img.parentNode;

      while (parent) {
        if (
          parent.nodeType === ELEMENT_NODE &&
          parent.getAttribute('class') === 'w_drawing'
        ) {
          drawing = parent;
          break;
        }
        parent = parent.parentNode;
      }

      if (!drawing) return;

      let extent = drawing.querySelector('.wp_extent');
      if (extent) {
        let cx = parseInt(extent.getAttribute('data-cx') || '0', 10);
        let cy = parseInt(extent.getAttribute('data-cy') || '0', 10);
        let style = img.getAttribute('style') || '';

        if (cx) {
          style += `width: ${(cx / 360000).toFixed(2)}cm; `;
        }
        if (cy) {
          style += `height: ${(cy / 360000).toFixed(2)}cm; `;
        }
        if (style) {
          img.setAttribute('style', style);
        }
      }

      // Assess if img is inline or block
      // we rely on the wp_inline and wp_anchor classes (see http://www.datypic.com/sc/ooxml/e-w_drawing-1.html)
      // TODO refine for images nested in table (see http://www.datypic.com/sc/ooxml/e-v_shape.html and http://www.datypic.com/sc/ooxml/t-wvml_ST_WrapType.html)
      const isInline = !!drawing.querySelector('.wp_inline');
      img.setAttribute('data-display', isInline ? 'inline' : 'block');
      // TODO `data-wrap` ? with more info

      drawing.parentNode.replaceChild(img, drawing);
    });

    process.nextTick(callback);
  };
}
