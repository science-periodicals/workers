# `@scipe/workers`

[![CircleCI](https://circleci.com/gh/science-periodicals/workers.svg?style=svg&circle-token=20a8bbea4fe6a650c8b9aa9ddfefcfb3dedee004)](https://circleci.com/gh/science-periodicals/workers)

[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)

Multi-threaded workers processing
schema.org [`Action`](http://schema.org/Action) concurrently.

Note: this module is auto published to npm on CircleCI. Only run `npm version
patch|minor|major` and let CI do the rest.


![Logo](./test/fixtures/worker/pieuvre.png?raw=true)

## Getting Started

Workers work with schema.org [`Action`](http://schema.org/Action). Readers not
familiar with [`Action`](http://schema.org/Action) should refer
to
[schema.org](http://schema.org) [Actions overview document](http://schema.org/docs/actions.html) for
a quick introduction.

For an API endpoint receiving actions like:

```js
{
  "@context": "http://schema.org",
  "@id-input": { "@type": "PropertyValueSpecification", "valueRequired": true },
  "@type-input": { "@type": "PropertyValueSpecification", "valueRequired": true },
  "actionStatus": "PotentialActionStatus",
  "agent-input": { "@type": "PropertyValueSpecification", "valueRequired": true },
  "object-input": {
    "@type": "PropertyValueSpecification",
    "valueRequired": true,
    "valueName": "objectId"
  },
  "result": {
    "@id-output": {
      "@type": "PropertyValueSpecification",
      "valueRequired": true,
      "valueName": "resultId"
    },
    "@type": "UpdateAction"
  },
  "target": {
    "@type": "EntryPoint",
    "httpMethod": "PUT",
    "urlTemplate": "http://example.com/{objectId}",
    "encodingType": "application/ld+json",
    "contentType": "application/ld+json"
  }
}
```

`@scipe/workers` provides everything required to create scalable action
processing pipelines supporting cancellation and real time progress events.

## Worker

### Worker.prototype.handleAction, Worker.prototype.handleExit and life cycle methods

`@scipe/workers` provides a base `Worker` class.  Workers implementors
must extend this base class with:

- a `handleAction` method (required)
- a `handleExit` method (optional)
- life cycles methods (`onActiveActionStatus`,
  `onCompletedActionStatus`, `onFailedActionStatus`) (optional).


```js
import { Worker } from '@scipe/workers';

class CustomWorker extends Worker {
  constructor(config) {
    super(config);
  }

  handleAction(action, callback) {
    // Do work
    callback(err, handledAction, nextAction);
  }

  handleExit(err) {
    // err is an error in case of crash or a status code in case of clean exit
    // Do cleanup things like killing child processes
  }

  onActiveActionStatus(action, callback) {
    // Called before the worker starts to emit the first
    // ActiveActionStatus message. Calling the callback with an error will
    // abort the work.
  }

  onCompletedActionStatus(handledAction, callback) {
    // Called if handleAction succesfully completed and before emitting
    // CompletedActionStatus message. Calling the callback with an error will
    // call onFailedActionStatus (passing the error and the handledAction).
  }

  onCanceledAction(action, callback) {
    // Called when the user issue a `CancelAction` targetting `action`
    // Calling the callback with an error will abort the cancellation
  }

  onFailedActionStatus(err, action, callback) {
    // Called if handleAction or onCompletedActionStatus failed
    // Calling the callback with and error with a negative
    // property will trigger the suicide of the worker. After suicide, a new
    // worker node will be automatically respawned.
  }
}
```


Workers are spawned (using
Node.js [cluster module](https://nodejs.org/api/cluster.html)) and
expose [ZeroMQ](http://zeromq.org/) sockets so that:

- work (action) can be dispatched to the workers.
- workers can notify their progress.
- ongoing work (action) can be canceled.

If the `handleAction` method calls its completion callback with a
`nextAction` argument, the next actions will be automatically
dispatched.

Errors should be instances of
[Error](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error).
Errors may have a `code` property.

Errors with a **code < 0** triggers the suicide of the current
worker. After suicide, a new worker node will be automatically
respawned.


### Worker.prototype.listen, Worker.prototype.stop, Worker.prototype.dispatch

**worker**:

```js
import { Worker } from '@scipe/workers';

class CustomWorker extends Worker {
  constructor(config) {
    super(config);
  }

  handleAction(action, callback) {
    callback(err, processedAction, nextAction);
  }

  handleExit(err) {
  }

}

let w = new CustomWorker({nWorkers: 1});
w.listen();
w.stop(() => {
  //stopped
});
```

**client**:

```js
import { Worker } from '@scipe/workers';

let w = new Worker();
w.dispatch({
  '@context': 'http://schema.org',
  '@id': 'http://example.com/actionId',
  '@type': 'Action',
  agent: 'http://example.com/agentId',
  object: 'http://example.com/objectId',
  result: {
    '@id-outptut': {
      '@type': 'PropertyValueSpecification',
      valueRequired: true,
      valueName: 'resultId'
    }
  },
  target: {
    '@type': 'EntryPoint',
    httpMethod: 'PUT',
    urlTemplate: 'http://example.com/{resultId}',
    encodingType: 'application/ld+json',
    contentType: 'application/ld+json'
  }
}, (err) => {
  // the worker acknowledge the dispatch as soon as the action is received by the worker
});
```

A broker is needed so that the client can reach the worker. The broker
will also ensure proper balancing of the load among the multiple
connected workers (using a least recently used strategy).

**Broker**:

```js
import { Broker } from '@scipe/workers';

const broker = new Broker();
broker.listen(err => {
  if (err) {
    throw err;
  }
});
broker.on('change', (data) => {
 console.log(data);
})
```

The `broker` is an `EventEmitter` and emit `change` event that can be tracked to
know:
- the number of pending requests
- the number of available workers (in READY state).

This data can be used to auto-scale the workers based on work load.


### Cancellation ([`CancelAction`](http://example.com/CancelAction))

Workers subscribe to a [ZeroMQ](http://zeromq.org/) SUB socket and
messages can be sent to this socket to administrate the workers.

In particular, work related to a given `action` can be canceled by sending
a [`CancelAction`](http://example.com/CancelAction)
whose [`object`](http://schema.org/object) is the `action` `@id` to the
worker [zeromq](http://zeromq.org/) under the `worker` topic to the pub socket.


```js
import zmq from 'zmq';

const pub = zmq.socket('push');
const topic = 'worker';
const cancelAction = {
  '@type': CancelAction,
  actionStatus: 'CompletedActionStatus',
  object: 'scipe:actionId'
}
pub.connect(w.PULL_ENDPOINT);
pub.send([topic, JSON.stringify(cancelAction)]);
```

### Worker status

Workers publish the status of their work through a
[ZeroMQ](http://zeromq.org/) SUB socket.


```js
import zmq from 'zmq';

let sub = zmq.socket('sub');
sub.connect(w.XPUB_ENDPOINT);
sub.subscribe('');

sub.on('message', function(topic, action) {
  // topic is the action agent['@id']
  // note that topic and action are Buffers
});

```

#### `ActiveActionStatus`

When a worker starts (and while the job is running), it will re-emit
the action sent at a regular interval with an
[`actionStatus`](http://schema.org/actionStatus) of
[`ActiveActionStatus`](http://schema.org/ActiveActionStatus).


#### `CanceledActionStatus`

If a user cancel a job, the worker will emit emit the original action with an
[`actionStatus`](http://schema.org/actionStatus) of
[`CanceledActionStatus`](http://ns.sci.pe/CanceledActionStatus).

#### `FailedActionStatus`

If a worker fails, it will emit emit the original action with an
[`actionStatus`](http://schema.org/actionStatus) of
[`FailedActionStatus`](http://schema.org/FailedActionStatus) and
an [`error`](http://schema.org/error) property containing more
information on the cause of the failure.

#### `CompletedActionStatus`

When a worker is done processing an action, it will emit the
`handledAction` returned by the `handleAction` method usually with an
`actionStatus` of
[`CompletedActionStatus`](http://schema.org/CompletedActionStatus) .


### `Worker.prototype.emitEvent`

Within a worker, further information can be published to
the [ZeroMQ](http://zeromq.org/) PUB socket by calling the `emitEvent(action,
event)` method. Calling `emitEvent` will publish
a [`ProgressEvent`](http://ns.science.ai/ProgressEvent) to the PUB socket. The
topic (required by ZeroMQ) will be set to the action agent `@id`.

```js
{
  "@context": "http://schema.org",
  "@id": "scipe:eventId",
  "@type": "Event",
  "about": "scipe:actionId",
  "description": "starting to process the action",
  "startDate": "2016-02-29T16:21:32.886Z"
}
```

In addition to publishing the `ProgressEvent`, the `emitEvent` method
returns an object with:

- `emitEndedEvent`, a function returning the same `ProgressEvent` as the
  one emitted the previous call but, with an added `endDate` property.
- `emitEvent`, returning a new `ProgressEvent` linked to the previous event
  through the [superEvent](http://schema.org/superEvent) property.
- `toJSON`, function returning the emitted `ProgressEvent` JavaScript object (note
  that this function will be called by JSON.stringify).

```js
import { Worker } from '@scipe/workers';

class CustomWorker extends Worker {
  handleAction(action, callback) {
    const superEvent = this.emitEvent(action, 'starting to process the action');
    const imageConversionEvent = superEvent.emitEvent('starting image conversion');
    // convert images...
    imageConversionEvent.emitEndedEvent();
    superEvent.emitEndedEvent();

    callback(err, handledAction, nextAction);
  }
}
```

## Config

Workers can be configured by passing a `config` object to their
constructor (see worker source code for details).


## Specialized workers

```js
import { ImageWorker, AudioVideoWorker, DocumentWorker } from '@scipe/workers';
```

### ImageWorker

The `ImageWorker` class extends the `Worker` class and
process [Action](http://schema.org/Action)
whose [`object`](http://schema.org/object)
are [`ImageObject`](http://schema.org/ImageObject).

### AudioVideoWorker

The `AudioVideoWorker` class extends the `Worker` class and
process [`Action`](http://schema.org/Action)
whose [`object`](http://schema.org/object)
are [`VideoObject`](http://schema.org/VideoObject)
or [`AudioObject`](http://schema.org/AudioObject).

### DocumentWorker

The `DocumentWorker` class extends the `Worker` class and
processes [Actions](http://schema.org/Action)
the [`object`](http://schema.org/object) of which are `DocumentObject`, a
subclass of [`MediaObject`](http://schema.org/MediaObject).


## CLI

A CLI is available to quickly launch a broker and all the specialized worker.

See

```sh
run-workers --help
```

For more details


---

## Installation

- Install [graphicsmagick](http://www.graphicsmagick.org/) (```brew install graphicsmagick --with-libtiff``` on OSX).
- Install [imagemagick](http://www.imagemagick.org/) (```brew install imagemagick --with-libtiff``` on OSX).
- Install [ffmpeg](https://www.ffmpeg.org/) (```brew install ffmpeg --with-libvpx --with-libvorbis --with-theora --with-aac --with-libx264``` on OSX).
- Install [LibreOffice](http://www.libreoffice.org/) (it needs to be used headless)

- Run ```npm install```


## Tests

Run `npm test`


## License

`@scipe/workers` is dual-licensed under commercial and open source licenses
([AGPLv3](https://www.gnu.org/licenses/agpl-3.0.en.html)) based on the intended
use case. Contact us to learn which license applies to your use case.
