import assert from 'assert';
import { DbWorker } from '../src';
import {
  createId,
  Librarian,
  getDefaultGraphDigitalDocumentPermissions,
  getDefaultPeriodicalDigitalDocumentPermissions
} from '@scipe/librarian';
import { getId, arrayify, unrole } from '@scipe/jsonld';
import uuid from 'uuid';
import createError from '@scipe/create-error';

describe('DbWorker', function() {
  this.timeout(100000);

  describe('getParams', () => {
    const w = new DbWorker({
      log: { name: 'db-worker', level: 'error' }
    });

    it('should get params from a graph encoding', () => {
      const action = {
        '@id': 'action:actionId',
        '@type': 'ImageProcessingAction',
        object: {
          '@id': 'node:encodingId',
          '@type': 'ImageObject',
          encodesCreativeWork: 'node:resourceId',
          isNodeOf: 'graph:graphId'
        }
      };
      const params = w.getParams(action);
      assert.deepEqual(params, {
        encodingId: 'node:encodingId',
        resourceId: 'node:resourceId',
        graphId: 'graph:graphId',
        encodesCreativeWork: 'node:resourceId',
        isNodeOfId: 'graph:graphId'
      });
    });

    it('should get params from a journal logo encoding', () => {
      const action = {
        '@id': 'action:actionId',
        '@type': 'ImageProcessingAction',
        object: {
          '@id': 'node:encodingId',
          '@type': 'ImageObject',
          encodesCreativeWork: 'node:resourceId',
          isNodeOf: 'journal:journalId'
        }
      };

      const params = w.getParams(action);
      assert.deepEqual(params, {
        encodingId: 'node:encodingId',
        resourceId: 'node:resourceId',
        graphId: 'journal:journalId',
        isNodeOfId: 'journal:journalId',
        encodesCreativeWork: 'node:resourceId'
      });
    });

    it('should get params from an issue style encoding', () => {
      const action = {
        '@id': 'action:actionId',
        '@type': 'ImageProcessingAction',
        object: {
          '@id': 'node:encodingId',
          '@type': 'ImageObject',
          isNodeOf: 'issue:journalId/issueId',
          encodesCreativeWork: 'node:styleId'
        }
      };
      const params = w.getParams(action);
      assert.deepEqual(params, {
        encodingId: 'node:encodingId',
        resourceId: 'node:styleId',
        encodesCreativeWork: 'node:styleId',
        graphId: 'journal:journalId',
        isNodeOfId: 'issue:journalId/issueId'
      });
    });
  });

  describe('life cycle methods', () => {
    let librarian, user, graph;
    const w = new DbWorker({
      log: { name: 'db-worker', level: 'error' }
    });

    beforeEach(done => {
      librarian = new Librarian();

      const tokenId = createId('token')['@id'];
      const password = uuid.v4();

      librarian.post(
        {
          '@type': 'RegisterAction',
          actionStatus: 'ActiveActionStatus',
          agent: {
            '@id': `user:${uuid.v4()}`,
            email: `${uuid.v4()}@science.ai`
          },
          instrument: {
            '@type': 'Password',
            value: password
          }
        },
        { tokenId },
        (err, activeRegisterAction) => {
          if (err) return done(err);

          librarian.post(
            Object.assign({}, activeRegisterAction, {
              actionStatus: 'CompletedActionStatus',
              instrument: {
                '@id': tokenId,
                '@type': 'Token',
                tokenType: 'registrationToken'
              }
            }),
            (err, registerAction) => {
              if (err) return done(err);

              user = registerAction.result;

              librarian.post(
                {
                  '@type': 'CreateOrganizationAction',
                  agent: getId(user),
                  actionStatus: 'CompletedActionStatus',
                  result: {
                    '@id': createId('org', uuid.v4())['@id'],
                    '@type': 'Organization',
                    name: 'org'
                  }
                },
                { acl: user, skipPayments: true },
                (err, createOrganizationAction) => {
                  if (err) return done(err);
                  const organization = createOrganizationAction.result;

                  librarian.post(
                    {
                      '@type': 'CreatePeriodicalAction',
                      agent: getId(user),
                      actionStatus: 'CompletedActionStatus',
                      object: getId(organization),
                      result: {
                        '@id': createId('journal', uuid.v4())['@id'],
                        '@type': 'Periodical',
                        name: 'my journal',
                        editor: {
                          roleName: 'editor',
                          editor: getId(user)
                        },
                        hasDigitalDocumentPermission: getDefaultPeriodicalDigitalDocumentPermissions(
                          user,
                          { createGraphPermission: true }
                        )
                      }
                    },
                    { acl: user, skipPayments: true },
                    (err, createPeriodicalAction) => {
                      if (err) return done(err);
                      const periodical = createPeriodicalAction.result;

                      librarian.post(
                        {
                          '@type': 'CreateWorkflowSpecificationAction',
                          agent: getId(user),
                          actionStatus: 'CompletedActionStatus',
                          object: getId(periodical),
                          result: {
                            '@type': 'WorkflowSpecification',
                            expectedDuration: 'P30D',
                            potentialAction: {
                              '@type': 'CreateGraphAction',
                              agent: {
                                '@type': 'Role',
                                roleName: 'author'
                              },
                              result: {
                                '@type': 'Graph',
                                hasDigitalDocumentPermission: getDefaultGraphDigitalDocumentPermissions(),
                                potentialAction: {
                                  '@type': 'StartWorkflowStageAction',
                                  participant: [
                                    {
                                      '@type': 'Audience',
                                      audienceType: 'author'
                                    },
                                    {
                                      '@type': 'Audience',
                                      audienceType: 'editor'
                                    },
                                    {
                                      '@type': 'Audience',
                                      audienceType: 'producer'
                                    },
                                    {
                                      '@type': 'Audience',
                                      audienceType: 'reviewer'
                                    }
                                  ],
                                  result: {
                                    '@type': 'CreateReleaseAction',
                                    actionStatus: 'ActiveActionStatus',
                                    agent: {
                                      '@type': 'ContributorRole',
                                      roleName: 'author'
                                    },
                                    participant: [
                                      {
                                        '@type': 'Audience',
                                        audienceType: 'author'
                                      },
                                      {
                                        '@type': 'Audience',
                                        audienceType: 'editor'
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          }
                        },
                        { acl: user },
                        (err, createWorkflowSpecificationAction) => {
                          if (err) return done(err);
                          const workflowSpecification =
                            createWorkflowSpecificationAction.result;

                          const defaultCreateGraphAction = arrayify(
                            workflowSpecification.potentialAction
                          ).find(
                            action => action['@type'] === 'CreateGraphAction'
                          );

                          librarian.post(
                            Object.assign({}, defaultCreateGraphAction, {
                              actionStatus: 'CompletedActionStatus',
                              agent: getId(user),
                              result: {
                                '@type': 'Graph',
                                author: {
                                  roleName: 'author',
                                  author: getId(user)
                                },
                                mainEntity: '_:video',
                                '@graph': [
                                  {
                                    '@id': '_:video',
                                    '@type': 'Video',
                                    encoding: {
                                      '@type': 'VideoObject',
                                      fileFormat: 'video/ogg',
                                      contentUrl: `/encoding/${uuid.v4()}`
                                    }
                                  }
                                ]
                              }
                            }),
                            { acl: user, skipPayments: true },
                            (err, createGraphAction) => {
                              if (err) return done(err);
                              graph = createGraphAction.result;
                              done();
                            }
                          );
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        }
      );
    });

    describe('onActiveActionStatus', () => {
      it('should set the actionStatus to ActivateActionStatus', done => {
        const encoding = graph['@graph'].find(
          node => node['@type'] === 'VideoObject'
        );
        librarian.put(
          Object.assign(createId('action', null, graph), {
            agent: getId(arrayify(graph.author)[0]),
            '@type': 'AudioVideoProcessingAction',
            actionStatus: 'PotentialActionStatus',
            object: encoding,
            result: createId('action', null, graph)['@id']
          }),
          { force: true },
          (err, action) => {
            w.onActiveActionStatus(action, (err, activeAction) => {
              if (err) return done(err);
              // console.log(
              //   require('util').inspect(activeAction, { depth: null })
              // );
              assert.equal(activeAction.actionStatus, 'ActiveActionStatus');
              done();
            });
          }
        );
      });
    });

    describe('onFailedActionStatus', () => {
      it('should report the error', done => {
        const encoding = graph['@graph'].find(
          node => node['@type'] === 'VideoObject'
        );
        librarian.put(
          Object.assign(createId('action', null, graph), {
            agent: getId(arrayify(graph.author)[0]),
            '@type': 'AudioVideoProcessingAction',
            actionStatus: 'PotentialActionStatus',
            object: encoding,
            result: createId('action', null, graph)['@id']
          }),
          { force: true },
          (err, action) => {
            w.onFailedActionStatus(
              createError(400, 'error'),
              action,
              (err, failedAction) => {
                if (err) return done(err);
                // console.log(
                //   require('util').inspect(failedAction, { depth: null })
                // );

                assert.equal(failedAction.actionStatus, 'FailedActionStatus');
                assert.equal(failedAction.error['@type'], 'Error');
                done();
              }
            );
          }
        );
      });
    });

    describe('onCompletedActionStatus', () => {
      it('should handle a completed action', done => {
        const createReleaseAction = arrayify(graph.potentialAction).find(
          action => action['@type'] === 'CreateReleaseAction'
        );

        const encoding = graph['@graph'].find(
          node => node['@type'] === 'VideoObject'
        );

        librarian.put(
          Object.assign(createId('action', null, graph), {
            agent: getId(arrayify(graph.author)[0]),
            '@type': 'AudioVideoProcessingAction',
            participant: {
              '@type': 'Audience',
              audienceType: 'author'
            },
            actionStatus: 'ActiveActionStatus',
            object: encoding,
            result: createId('action', null, graph)['@id']
          }),
          { force: true },
          (err, action) => {
            if (err) return done(err);

            const handledAction = Object.assign({}, action, {
              actionStatus: 'CompletedActionStatus',
              endTime: new Date().toISOString(),
              result: {
                '@id': getId(action.result),
                '@type': 'UpdateAction',
                agent: getId(arrayify(graph.author)[0]),
                instrumentOf: getId(createReleaseAction),
                mergeStrategy: 'ReconcileMergeStrategy',
                actionStatus: 'PotentialActionStatus',
                object: {
                  '@graph': [
                    {
                      '@id': encoding.encodesCreativeWork,
                      name: 'resource name'
                    }
                  ]
                },
                targetCollection: getId(graph)
              }
            });

            w.onCompletedActionStatus(handledAction, (err, handledAction) => {
              if (err) return done(err);

              //console.log(
              //  require('util').inspect(handledAction, { depth: null })
              //);

              assert.equal(getId(handledAction.result), getId(action.result));

              assert.equal(handledAction.actionStatus, 'CompletedActionStatus');
              librarian.get(
                handledAction.result,
                { acl: false },
                (err, updateAction) => {
                  if (err) return done(err);
                  assert.equal(updateAction['@type'], 'UpdateAction');
                  assert.equal(getId(updateAction.resultOf), getId(action));

                  //console.log(
                  //  require('util').inspect(updateAction, { depth: null })
                  //);

                  // Check that audience of the webify action is propagated
                  assert(
                    arrayify(updateAction.participant).some(participant => {
                      const unroled = unrole(participant, 'participant');
                      return unroled && unroled.audienceType === 'author';
                    })
                  );
                  done();
                }
              );
            });
          }
        );
      });
    });
  });
});
