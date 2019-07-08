const path = require('path');
const assert = require('assert');
import { arrayify, getNodeMap, getId } from '@scipe/jsonld';
const { processDocx } = require('../../src/document-worker/lib/test-utils');

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'solo-images.ds3.docx'
);

describe('DOCX: Solo Images', function() {
  this.timeout(20 * 1000);

  let ctx;
  before(done => {
    processDocx(docx, (err, _ctx) => {
      if (err) return done(err);
      ctx = _ctx;
      done();
    });
  });

  it('should produce a graph that has the floating image encoding', done => {
    let { doc, store, graphId } = ctx;
    assert(doc.querySelector('img'), 'There is an image');

    store.graph((err, flattened) => {
      if (err) return done(err);

      const nodes = flattened['@graph'];
      const nodeMap = getNodeMap(flattened);

      const resource = nodes.find(node => node['@type'] === 'ScholarlyArticle');
      const htmlEncoding = nodes.find(
        node =>
          node['@type'] === 'DocumentObject' &&
          node.fileFormat &&
          node.fileFormat.includes('text/html')
      );

      // check that the HTML encoding list the floating image in the `image` prop
      assert(htmlEncoding.image);
      assert(
        arrayify(htmlEncoding.image).every(nodeId => {
          const node = nodeMap[nodeId];
          return node && node['@type'] === 'ImageObject';
        })
      );

      assert.equal(nodes.filter(n => n['@type'] === 'Checksum').length, 8);
      assert.equal(
        nodes.filter(n => n['@type'] === 'DocumentObject').length,
        2
      );
      assert.equal(nodes.filter(n => n['@type'] === 'Image').length, 0);
      assert.equal(nodes.filter(n => n['@type'] === 'PropertyValue').length, 2);
      assert.equal(
        nodes.filter(n => n['@type'] === 'PerceptualHash').length,
        2
      );
      assert.equal(
        nodes.filter(n => n['@type'] === 'ScholarlyArticle').length,
        1
      );

      const images = nodes.filter(n => n['@type'] === 'ImageObject');
      assert.equal(images.length, 8);
      assert(images.every(image => image.isNodeOf === graphId));
      assert(
        images.every(image => image.encodesCreativeWork === getId(resource))
      );

      done();
    });
  });
});
