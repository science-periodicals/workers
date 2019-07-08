import omit from 'lodash/omit';
import isPlainObject from 'lodash/isPlainObject';
import BlobStore from '@scipe/blob-store';
import {
  Librarian,
  createId,
  getScopeId,
  schema,
  getUrlTemplateCtx,
  getAgentId,
  setId,
  getMetaActionParticipants
} from '@scipe/librarian';
import { getId, arrayify } from '@scipe/jsonld';
import { Worker } from '../';

export default class DbWorker extends Worker {
  constructor(config = {}) {
    super(config);

    this.librarian = config.librarian || new Librarian(config);
    this.blobStore = config.blobStore || new BlobStore(config);
    this.log.info(
      {
        blobStorageBackend: this.blobStore.getBlobStorageBackend()
      },
      'Blob store blobStorageBackend'
    );
  }

  getParams(action = {}, params) {
    params = Object.assign(params || {}, action.params); // sometimes params is null

    params = Object.assign(
      ['graphId', 'resourceId', 'encodingId', 'agentId', 'isNodeOfId'].reduce(
        (params, p) => {
          if (p in action) {
            params[p] = action[p];
          }
          return params;
        },
        {}
      ),
      action.target ? getUrlTemplateCtx(action) : {}, // fill in what may be missing from the schema:Action
      params //  params will overwrite action values
    );

    if (!('agentId' in params) && action.agent) {
      const agentId = getAgentId(action.agent);
      if (agentId) {
        params.agentId = agentId;
      }
    }

    if (!('graphId' in params) && action._id) {
      const graphId = getScopeId(action);
      if (graphId && graphId.startsWith('graph:')) {
        params.graphId = graphId;
      }
    }

    const { object } = action;

    // Infer more params from the object when it is an encoding
    if (
      object &&
      typeof object === 'object' &&
      (schema.is(object['@type'], 'MediaObject') ||
        object.encodesCreativeWork ||
        object.contentUrl ||
        object.encodingFormat ||
        object.fileFormat ||
        object.contentSize)
    ) {
      if (!('encodingId' in params)) {
        params.encodingId = getId(object);
      }

      const parsed = this.blobStore.getParams(object);

      [
        'graphId',
        'resourceId',
        'encodingId',
        'encodesCreativeWork',
        'isNodeOfId'
      ].forEach(p => {
        if (p in parsed && !(p in params)) {
          params[p] = parsed[p];
        }
      });
    }

    return params;
  }

  onActiveActionStatus(action, callback) {
    this.librarian.post(
      Object.assign({}, action, {
        actionStatus: 'ActiveActionStatus'
      }),
      { acl: false },
      callback
    );
  }

  onFailedActionStatus(err, action, callback) {
    this.librarian.post(
      Object.assign({}, action, {
        actionStatus: 'FailedActionStatus',
        error: {
          '@type': 'Error',
          description: err && err.message,
          statusCode: err && err.code
        }
      }),
      { acl: false },
      callback
    );
  }

  onCanceledActionStatus(action, callback) {
    this.librarian.post(
      Object.assign({}, action, {
        actionStatus: 'CanceledActionStatus'
      }),
      { acl: false },
      callback
    );
  }

  onCompletedActionStatus(handledAction, callback) {
    // write the UpdateAction (result of the handledAction) to CouchDB
    const { graphId } = this.getParams(handledAction);

    const updateAction = setId(
      Object.assign(
        {
          '@type': 'UpdateAction'
        },
        isPlainObject(handledAction.result) ? handledAction.result : undefined,
        {
          // re-embed the webify action for processing convenience
          resultOf: Object.assign(omit(handledAction, ['result']), {
            actionStatus: 'CompletedActionStatus'
          })
        }
      ),
      createId('action', getId(handledAction.result), graphId)
    );

    // If the the worker is in charge to apply the update
    // we emit a progress event
    let superEvent;
    if (handledAction.autoUpdate) {
      const nNodes =
        updateAction.object && updateAction.object['@graph']
          ? arrayify(updateAction.object['@graph']).length
          : 1;

      superEvent = this.emitEvent(
        handledAction,
        `Saving update payload (${nNodes} ${nNodes > 1 ? 'nodes' : 'node'})`
      );
    }

    this.librarian.post(
      Object.assign({}, handledAction, {
        actionStatus: 'CompletedActionStatus',
        result: updateAction
      }),
      { acl: false },
      (err, handledAction) => {
        if (err) return callback(err);

        if (superEvent) {
          superEvent.emitEndedEvent();
        }

        callback(
          null,
          Object.assign({}, handledAction, { result: updateAction }) // we embed the full update action for convenience of downstream processing
        );
      }
    );
  }
}
