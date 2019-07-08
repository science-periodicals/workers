import uuid from 'uuid';

const METHODS = { v1: 'v1', v4: 'v4' };

/**
 * Generate a globally unique ID, with an optional prefix, using the
 * UUID method specified.
 */
export default function({ curiePrefix, method } = {}) {
  const prefix = curiePrefix != null ? curiePrefix : this.CURIE_PREFIX;
  method = method && method in METHODS ? method : 'v4';

  return (prefix ? prefix + ':' : '') + uuid[method]();
}
