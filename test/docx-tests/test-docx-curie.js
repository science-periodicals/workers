import assert from 'assert';
import cloneDeep from 'lodash/cloneDeep';
import DocumentWorker from '../../src/document-worker';
import DataStore from '../../src/document-worker/lib/data-store';
import { Organization } from '../../src/document-worker/lib/types';

describe('DOCX: Curie', () => {
  let store;
  before('setting up store', () => {
    let w = new DocumentWorker({
      log: { level: 'error', name: 'document-worker' }
    });
    store = new DataStore(w.uuid);
  });

  it('should use the right CURIE', () => {
    test('_', store.createImage({}), 'default Image');
    test(
      'node',
      store.createImage({}, { curiePrefix: 'node' }),
      'scienceai Image'
    );
    test('_', store.createImageObject({}), 'default ImageObject');
    test(
      'node',
      store.createImageObject({}, { curiePrefix: 'node' }),
      'scienceai ImageObject'
    );
    test('_', store.createPerson({ name: 'Batman' }), 'default Person');
    test(
      'node',
      store.createPerson({ name: 'Batman' }, { curiePrefix: 'node' }),
      'scienceai Person'
    );
    test('_', store.createOrganization({ name: 'Batman' }), 'default Org');
    test(
      'node',
      store.createOrganization({ name: 'Batman' }, { curiePrefix: 'node' }),
      'scienceai Org'
    );
    let orgJSON = {
        '@type': 'Organization',
        name: 'Evil League of Evil',
        parentOrganization: {
          '@type': 'Organization',
          name: 'Small Hands Inc.',
          location: {
            '@type': 'Place',
            address: {
              '@type': 'PostalAddress',
              addressCountry: 'USA'
            }
          }
        }
      },
      org = Organization.fromJSON(store, cloneDeep(orgJSON)),
      namedOrg = Organization.fromJSON(store, cloneDeep(orgJSON), {
        curiePrefix: 'whatever'
      });
    [[org, '_'], [namedOrg, 'whatever']].forEach(([obj, pfx]) => {
      test(pfx, obj, `${pfx} org`);
      let parent = store.get(obj.parentOrganization);
      test(pfx, parent, `${pfx} parentOrg`);
      let location = store.get(parent.location);
      test(pfx, location, `${pfx} location`);
      let address = store.get(location.address);
      test(pfx, address, `${pfx} address`);
    });
    test('_', store.createPerson({ name: 'Batman' }).clone(), 'default clone');
    test(
      'node',
      store.createPerson({ name: 'Batman' }, { curiePrefix: 'node' }).clone(),
      'scienceai clone'
    );
  });
});

function test(pfx, obj, desc) {
  assert.equal(obj.$id.replace(/:.*/, ''), pfx, desc);
}
