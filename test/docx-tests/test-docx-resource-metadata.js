import assert from 'assert';
import path from 'path';

import {
  processDocx,
  frame,
  comparableJSONLD
} from '../../src/document-worker/lib/test-utils';

const docx = path.join(
  path.dirname(__dirname),
  'fixtures',
  'document-worker',
  'resource-metadata-test.ds3.docx'
);

describe('DOCX: resource metadata', function() {
  this.timeout(20 * 1000);
  let ctx, framed, image, code, data;

  before('processing the resource metadata fixture', function(done) {
    processDocx(docx, (err, _ctx) => {
      if (err) return done(err);
      ctx = _ctx;

      frame(ctx, (err, _framed) => {
        if (err) return done(err);
        framed = _framed['@graph'][0];

        image = framed.hasPart.find(part => part['@type'] === 'Image');

        code = framed.hasPart.find(
          part => part['@type'] === 'SoftwareSourceCode'
        );

        data = framed.hasPart.find(part => part['@type'] === 'Dataset');

        done();
      });
    });
  });

  describe('figure', () => {
    it('label', () => {
      assert.equal('Figure 1', image.alternateName);
    });

    it('caption', () => {
      assert.equal('Smooth operator.', image.caption);
    });

    it('author', () => {
      const expected = [
        {
          '@type': 'ContributorRole',
          roleAction: [
            {
              '@type': 'ContributeAction',
              description: 'Prepared the figure',
              noteIdentifier: 2
            }
          ],
          roleAffiliation: [
            {
              '@type': 'Organization',
              name: 'Department of Biology',
              parentOrganization: {
                '@type': 'Organization',
                alternateName: 'NYU',
                location: {
                  '@type': 'Place',
                  address: {
                    '@type': 'PostalAddress',
                    addressCountry: 'USA',
                    addressLocality: 'New York',
                    addressRegion: 'NY'
                  }
                },
                name: 'New York University'
              }
            },
            {
              '@type': 'Organization',
              name: 'EEB',
              parentOrganization: {
                '@type': 'Organization',
                location: {
                  '@type': 'Place',
                  address: {
                    '@type': 'PostalAddress',
                    addressCountry: 'NJ',
                    addressLocality: 'Princeton'
                  }
                },
                name: 'Princeton University'
              }
            }
          ],
          roleContactPointNoteIdentifier: 1,
          roleContactPoint: [
            {
              '@type': 'ContactPoint',
              contactType: 'office',
              description: 'karen@example.com',
              name: 'Email',
              url: 'mailto:karen@example.com',
              email: 'mailto:karen@example.com'
            },
            {
              '@type': 'ContactPoint',
              contactType: 'home',
              description: 'krhome@example.com',
              name: 'Email',
              url: 'mailto:krhome@example.com',
              email: 'mailto:krhome@example.com'
            },
            {
              '@type': 'ContactPoint',
              description: '@krogers',
              name: 'Twitter',
              url: 'https://twitter.com/krogers'
            },
            {
              '@type': 'ContactPoint',
              description: 'krogers',
              name: 'Github',
              url: 'https://github.com/krogers'
            },
            {
              '@type': 'ContactPoint',
              description: '+19178825422',
              name: 'Tel',
              telephone: 'tel:+19178825422',
              url: 'tel:+19178825422'
            },
            {
              '@type': 'ContactPoint',
              description: '+12121234567.',
              faxNumber: 'fax:+12121234567',
              name: 'Fax',
              url: 'fax:+12121234567'
            }
          ],
          author: [
            {
              '@type': 'Person',
              familyName: 'Rogers',
              givenName: 'Karen',
              name: 'Karen Rogers'
            }
          ],
          roleName: 'author'
        },

        {
          '@type': 'ContributorRole',
          roleAffiliation: [
            {
              '@type': 'Organization',
              alternateName: 'IAS',
              name: 'Institute for Advanced Studies',
              parentOrganization: {
                '@type': 'Organization',
                location: {
                  '@type': 'Place',
                  address: {
                    '@type': 'PostalAddress',
                    addressCountry: 'NJ',
                    addressLocality: 'Princeton'
                  }
                },
                name: 'Princeton University'
              },
              sameAs: ['https://www.ias.edu/']
            },
            {
              '@type': 'Organization',
              alternateName: 'PSU',
              location: {
                '@type': 'Place',
                address: {
                  '@type': 'PostalAddress',
                  addressCountry: 'USA',
                  addressLocality: 'University Park',
                  addressRegion: 'PA'
                }
              },
              name: 'Penn State University'
            }
          ],
          roleContactPointNoteIdentifier: 3,
          roleContactPoint: [
            {
              '@type': 'ContactPoint',
              description: 'einstein@example.com.',
              name: 'Email',
              url: 'mailto:einstein@example.com',
              email: 'mailto:einstein@example.com'
            }
          ],
          author: [
            {
              '@type': 'Person',
              familyName: 'Einstein',
              givenName: 'Albert',
              name: 'Albert Einstein',
              sameAs: ['https://en.wikipedia.org/wiki/Albert_Einstein']
            }
          ],
          roleName: 'author'
        }
      ];

      assert.deepEqual(
        comparableJSONLD(expected),
        comparableJSONLD(image.author)
      );
    });

    it('contributor', () => {
      const expected = [
        {
          '@type': 'ContributorRole',
          roleAffiliation: [
            {
              '@type': 'Organization',
              alternateName: 'PSU',
              location: {
                '@type': 'Place',
                address: {
                  '@type': 'PostalAddress',
                  addressCountry: 'USA',
                  addressLocality: 'University Park',
                  addressRegion: 'PA'
                }
              },
              name: 'Penn State University'
            },
            {
              '@type': 'Organization',
              name: 'Department of Biology',
              parentOrganization: {
                '@type': 'Organization',
                alternateName: 'NYU',
                location: {
                  '@type': 'Place',
                  address: {
                    '@type': 'PostalAddress',
                    addressCountry: 'USA',
                    addressLocality: 'New York',
                    addressRegion: 'NY'
                  }
                },
                name: 'New York University'
              }
            }
          ],
          contributor: [
            {
              '@type': 'Person',
              familyName: 'Johnson',
              givenName: 'Derek',
              name: 'Derek Johnson, PhD'
            }
          ],
          roleName: 'author'
        },
        {
          '@type': 'ContributorRole',
          roleAffiliation: [
            {
              '@type': 'Organization',
              name: 'Department of Biology',
              parentOrganization: {
                '@type': 'Organization',
                alternateName: 'NYU',
                location: {
                  '@type': 'Place',
                  address: {
                    '@type': 'PostalAddress',
                    addressCountry: 'USA',
                    addressLocality: 'New York',
                    addressRegion: 'NY'
                  }
                },
                name: 'New York University'
              }
            },
            {
              '@type': 'Organization',
              alternateName: 'PSU',
              location: {
                '@type': 'Place',
                address: {
                  '@type': 'PostalAddress',
                  addressCountry: 'USA',
                  addressLocality: 'University Park',
                  addressRegion: 'PA'
                }
              },
              name: 'Penn State University'
            }
          ],
          contributor: [
            {
              '@type': 'Person',
              familyName: 'Rogers',
              givenName: 'Karen',
              name: 'Karen Rogers'
            }
          ],
          roleName: 'author'
        }
      ];

      assert.deepEqual(
        comparableJSONLD(expected),
        comparableJSONLD(image.contributor)
      );
    });

    it('copyright', () => {
      const expectedCopyrightHolder = {
        '@type': 'Organization',
        name: 'Department of Biology',
        parentOrganization: {
          '@type': 'Organization',
          alternateName: 'NYU',
          location: {
            '@type': 'Place',
            address: {
              '@type': 'PostalAddress',
              addressCountry: 'USA',
              addressLocality: 'New York',
              addressRegion: 'NY'
            }
          },
          name: 'New York University'
        }
      };

      assert.deepEqual(
        expectedCopyrightHolder,
        comparableJSONLD(image.copyrightHolder)
      );

      const expectedCopyrightYear = '2018';
      assert.equal(expectedCopyrightYear, image.copyrightYear);
    });

    it('license', () => {
      const expectedLicense = 'spdx:CC-BY-4.0';
      assert.equal(expectedLicense, image.license);
    });

    it('should have keywords and subjects', () => {
      const expectedKeywords = ['Longboard dancing', 'Paris, France'];
      assert.deepEqual(expectedKeywords, image.keywords);

      const expectedSubjects = [
        {
          name: 'Loaded Boards',
          url: 'http://loadedboards.com/'
        },
        {
          '@id': 'subjects:mechanical-engineering',
          name: 'mechanical engineering'
        }
      ];
      assert.deepEqual(expectedSubjects, comparableJSONLD(image.about));
    });

    it('isBasedOn', () => {
      assert.equal(image.isBasedOn[0].alternateName, 'Supporting Dataset 1');
    });

    it('exampleOfWork', () => {
      const expectedExampleOfWork = [
        {
          '@type': 'Report',
          author: [
            { '@type': 'Person', familyName: 'Adams', givenName: 'T' },
            { '@type': 'Person', familyName: 'Langley', givenName: 'A' }
          ],
          copyrightHolder: {
            '@type': 'Person',
            familyName: 'Langley',
            givenName: 'A',
            name: 'A Langley'
          },
          copyrightYear: '2005',
          datePublished: { '@type': 'xsd:gYear', '@value': 2005 },
          identifier: 'Ada05',
          name:
            'The Potential for Development of Fisheries in the Pitcairn EEZ',
          pageEnd: 79,
          pageStart: 1,
          potentialAction: [
            {
              '@type': 'AuthorizeSourceUsageAction',
              actionStatus: 'CompletedActionStatus'
            }
          ],
          publisher: {
            '@type': 'Organization',
            location: {
              '@type': 'PostalAddress',
              addressLocality: 'Noumea, New Caledonia'
            },
            name:
              'Secretariat of the Pacific Community Marine Resources Division'
          }
        }
      ];

      assert.deepEqual(
        comparableJSONLD(expectedExampleOfWork),
        comparableJSONLD(image.exampleOfWork)
      );
    });

    it('provider', () => {
      const expectedProvider = [
        {
          '@type': 'Person',
          familyName: 'Seck',
          givenName: 'Aboubakry',
          name: 'Aboubakry Seck'
        }
      ];

      assert.deepEqual(expectedProvider, comparableJSONLD(image.provider));
    });
  });

  describe('code', () => {
    it('programmingLanguage', () => {
      const expectedProgrammingLanguage = 'JavaScript';
      assert.equal(
        comparableJSONLD(expectedProgrammingLanguage),
        comparableJSONLD(code.programmingLanguage)
      );
    });

    it('all', () => {
      const expected = {
        '@type': 'SoftwareSourceCode',
        isSupportingResource: false,
        alternateName: 'Code 1',
        author: [
          {
            '@type': 'ContributorRole',
            author: [
              {
                '@type': 'Person',
                familyName: 'Rogers',
                givenName: 'Karen',
                name: 'Karen Rogers'
              }
            ],
            roleName: 'author'
          }
        ],
        caption: 'Code example.',
        codeSampleType: 'inline',
        contributor: [
          {
            '@type': 'ContributorRole',
            contributor: [
              {
                '@id': 'user:watson',
                '@type': 'Person',
                familyName: 'Watson',
                givenName: 'James',
                name: 'James Watson'
              }
            ],
            roleName: 'author'
          }
        ],
        copyrightHolder: [
          {
            '@type': 'Organization',
            alternateName: 'SRI',
            location: {
              '@type': 'Place',
              address: {
                '@type': 'PostalAddress',
                addressCountry: 'USA',
                addressLocality: 'Menlo Park',
                addressRegion: 'CA'
              }
            },
            name: 'SRI International'
          },
          {
            '@type': 'Person',
            familyName: 'Smith',
            givenName: 'John',
            name: 'Professor John Smith'
          }
        ],
        copyrightYear: '2019',
        creator: 'bot:DocumentWorker',
        encoding: [
          {
            '@type': 'SoftwareSourceCodeObject',
            creator: 'bot:BlobStore',
            fileFormat: 'text/html',
            isBasedOn: [
              {
                '@type': 'DocumentObject',
                creator: 'bot:BlobStore',
                fileFormat:
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                name: 'resource-metadata-test.ds3.docx'
              }
            ],
            name: 'code-1.html',
            encoding: [
              {
                '@type': 'MediaObject',
                encodingFormat: 'gzip'
              }
            ]
          }
        ],
        exampleOfWork: [
          {
            '@type': 'TargetRole',
            hasSelector: { '@type': 'Selector', name: 'fig. 2' },
            citation: [
              {
                '@type': 'ScholarlyArticle',
                doi: '10.1007/BF00346827',
                author: [
                  { '@type': 'Person', familyName: 'Brown', givenName: 'IL' },
                  { '@type': 'Person', familyName: 'Ehrlich', givenName: 'PR' }
                ],
                copyrightHolder: [
                  {
                    '@type': 'Person',
                    additionalName: 'L',
                    familyName: 'Brown',
                    givenName: 'Irene',
                    name: 'Irene L. Brown'
                  },
                  {
                    '@type': 'Person',
                    additionalName: 'R',
                    familyName: ' Ehrlich',
                    givenName: 'Paul',
                    name: 'Paul R. Ehrlich'
                  },
                  {
                    '@type': 'Person',
                    familyName: 'Rogers',
                    givenName: 'Karen',
                    name: 'Karen Rogers'
                  },
                  {
                    '@type': 'Organization',
                    name: 'Cryptozoology',
                    parentOrganization: {
                      '@type': 'Organization',
                      location: {
                        '@type': 'Place',
                        address: {
                          '@type': 'PostalAddress',
                          addressCountry: 'USA',
                          addressLocality: 'Union',
                          addressRegion: 'NJ'
                        }
                      },
                      name: 'Kean University'
                    }
                  }
                ],
                copyrightYear: '2016',
                datePublished: { '@type': 'xsd:gYear', '@value': 1980 },
                identifier: 'Bro80',
                isPartOf: {
                  '@type': 'PublicationVolume',
                  isPartOf: { '@type': 'Periodical', name: 'Oecologia' },
                  volumeNumber: 47
                },
                name:
                  'Population biology of the checkerspot butterfly, Euphydryas chalcedona structure of the Jasper Ridge colony',
                pageEnd: 251,
                pageStart: 239
              }
            ],
            name: 'Brown and Ehrlich 1980, fig. 2'
          }
        ],
        isBasedOn: [
          {
            '@type': 'Report',
            author: [
              { '@type': 'Person', familyName: 'Adams', givenName: 'T' },
              { '@type': 'Person', familyName: 'Langley', givenName: 'A' }
            ],
            copyrightHolder: {
              '@type': 'Person',
              familyName: 'Langley',
              givenName: 'A',
              name: 'A Langley'
            },
            copyrightYear: '2005',
            datePublished: { '@type': 'xsd:gYear', '@value': 2005 },
            identifier: 'Ada05',
            name:
              'The Potential for Development of Fisheries in the Pitcairn EEZ',
            pageEnd: 79,
            pageStart: 1,
            potentialAction: [
              {
                '@type': 'AuthorizeSourceUsageAction',
                actionStatus: 'CompletedActionStatus'
              }
            ],
            publisher: {
              '@type': 'Organization',
              location: {
                '@type': 'PostalAddress',
                addressLocality: 'Noumea, New Caledonia'
              },
              name:
                'Secretariat of the Pacific Community Marine Resources Division'
            }
          },
          {
            '@type': 'ScholarlyArticle',
            doi: '10.1007/BF00346827',
            author: [
              { '@type': 'Person', familyName: 'Brown', givenName: 'IL' },
              { '@type': 'Person', familyName: 'Ehrlich', givenName: 'PR' }
            ],
            copyrightHolder: [
              {
                '@type': 'Person',
                additionalName: 'L',
                familyName: 'Brown',
                givenName: 'Irene',
                name: 'Irene L. Brown'
              },
              {
                '@type': 'Person',
                additionalName: 'R',
                familyName: ' Ehrlich',
                givenName: 'Paul',
                name: 'Paul R. Ehrlich'
              },
              {
                '@type': 'Person',
                familyName: 'Rogers',
                givenName: 'Karen',
                name: 'Karen Rogers'
              },
              {
                '@type': 'Organization',
                name: 'Cryptozoology',
                parentOrganization: {
                  '@type': 'Organization',
                  location: {
                    '@type': 'Place',
                    address: {
                      '@type': 'PostalAddress',
                      addressCountry: 'USA',
                      addressLocality: 'Union',
                      addressRegion: 'NJ'
                    }
                  },
                  name: 'Kean University'
                }
              }
            ],
            copyrightYear: '2016',
            datePublished: { '@type': 'xsd:gYear', '@value': 1980 },
            identifier: 'Bro80',
            isPartOf: {
              '@type': 'PublicationVolume',
              isPartOf: { '@type': 'Periodical', name: 'Oecologia' },
              volumeNumber: 47
            },
            name:
              'Population biology of the checkerspot butterfly, Euphydryas chalcedona structure of the Jasper Ridge colony',
            pageEnd: 251,
            pageStart: 239
          }
        ],
        license: ['spdx:AFL-1.1', 'spdx:CC-BY-4.0'],
        programmingLanguage: 'JavaScript'
      };

      assert.deepEqual(comparableJSONLD(expected), comparableJSONLD(code));
    });
  });

  describe('data', () => {
    it('all', () => {
      const expected = {
        '@id': 'node:0b024a31-d323-4734-ba6d-0420a4f1845b',
        '@type': 'Dataset',
        isSupportingResource: true,
        resourceOf: 'graph:fddb7302-4db5-40e0-a1b4-72cba902a5cd',
        alternateName: 'Supporting Dataset 1',
        author: [
          {
            '@id': 'role:8da5dbfe-3308-4643-9ce5-dd89f4a71c45',
            '@type': 'ContributorRole',
            author: [
              {
                '@id': '_:4e7645db-12ce-4829-ac6a-6d681b943663',
                '@type': 'Organization',
                name: 'Department of Biology',
                parentOrganization: {
                  '@id': '_:d207f809-ecda-42c2-b588-4d55c9f97200',
                  '@type': 'Organization',
                  alternateName: 'NYU',
                  location: {
                    '@id': '_:960c07a5-8835-4601-ad27-80ab905c7b7b',
                    '@type': 'Place',
                    address: {
                      '@id': '_:3aab59f3-65dd-4293-8702-40c4efa5afd0',
                      '@type': 'PostalAddress',
                      addressCountry: 'USA',
                      addressLocality: 'New York',
                      addressRegion: 'NY'
                    }
                  },
                  name: 'New York University'
                }
              }
            ],
            roleName: 'author'
          }
        ],
        caption: 'This is a test.',
        contributor: [
          {
            '@id': 'role:d34b8e5b-1d76-4d73-94d6-d19dad220389',
            '@type': 'ContributorRole',
            contributor: [
              {
                '@id': '_:4da649b7-e009-4109-b1e6-c36ee7c33f01',
                '@type': 'Organization',
                alternateName: 'IAS',
                name: 'Institute for Advanced Studies',
                parentOrganization: {
                  '@id': '_:70840a47-66b4-4768-92c2-4127f0735c3c',
                  '@type': 'Organization',
                  location: {
                    '@id': '_:beddcf67-30d9-42ab-a248-6cad4ece4337',
                    '@type': 'Place',
                    address: {
                      '@id': '_:9ad8e6a0-c645-4da3-a106-cb2ffaac27af',
                      '@type': 'PostalAddress',
                      addressCountry: 'USA',
                      addressLocality: 'Princeton',
                      addressRegion: 'NJ'
                    }
                  },
                  name: 'Princeton University'
                },
                sameAs: ['https://www.ias.edu/']
              }
            ],
            roleName: 'author'
          }
        ],
        copyrightHolder: {
          '@id': '_:5a4a2d6e-8f44-4897-8791-219407c9dbd3',
          '@type': 'Person',
          name: 'Francis Crick',
          sameAs: ['https://en.wikipedia.org/wiki/Francis_Crick']
        },
        copyrightYear: '1962',
        creator: 'bot:DocumentWorker',
        dateCreated: '2019-03-25T17:31:47.379Z',
        distribution: [
          {
            '@id': 'node:13132642-92a3-4e0d-b8df-8737acfe7774',
            '@type': 'DataDownload',
            contentUrl:
              'file:fileuserstiffanyworkerstestfixturesdocument-workerdata-xls.xlsx?r=node:89546170-78a9-43ef-ac98-17c2fd6a077d',
            creator: 'bot:DocumentWorker',
            dateCreated: '2019-03-25T17:31:47.095Z',
            name: 'data-xls.xlsx'
          }
        ],
        isBasedOn: [
          {
            '@id': '_:acd3f781-1ad4-413d-9137-c32b2d638008',
            '@type': 'Organization',
            name: 'Cryptozoology',
            parentOrganization: {
              '@id': '_:0aadc9e8-1e51-4d42-8904-ce2760380b14',
              '@type': 'Organization',
              location: {
                '@id': '_:ff8ffb7d-f69b-4ec7-a585-c164651f01fd',
                '@type': 'Place',
                address: {
                  '@id': '_:f93c1f32-ca46-4926-8f57-4f66f0356179',
                  '@type': 'PostalAddress',
                  addressCountry: 'USA',
                  addressLocality: 'Union',
                  addressRegion: 'NJ'
                }
              },
              name: 'Kean University'
            }
          }
        ],
        isPartOf: 'node:89546170-78a9-43ef-ac98-17c2fd6a077d',
        provider: [
          {
            '@id': '_:89feff06-9982-45ce-a958-0ec2dc15cd51',
            '@type': 'Person',
            affiliation: [
              {
                '@id': '_:acd3f781-1ad4-413d-9137-c32b2d638008',
                '@type': 'Organization',
                name: 'Cryptozoology',
                parentOrganization: {
                  '@id': '_:0aadc9e8-1e51-4d42-8904-ce2760380b14',
                  '@type': 'Organization',
                  location: {
                    '@id': '_:ff8ffb7d-f69b-4ec7-a585-c164651f01fd',
                    '@type': 'Place',
                    address: {
                      '@id': '_:f93c1f32-ca46-4926-8f57-4f66f0356179',
                      '@type': 'PostalAddress',
                      addressCountry: 'USA',
                      addressLocality: 'Union',
                      addressRegion: 'NJ'
                    }
                  },
                  name: 'Kean University'
                }
              }
            ],
            familyName: 'Regal',
            givenName: 'Brian',
            name: 'Dr. Brian Regal'
          }
        ],
        url: '#_Ref533171355'
      };

      assert.deepEqual(comparableJSONLD(expected), comparableJSONLD(data));
    });
  });
});
