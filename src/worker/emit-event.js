import { getId } from '@scipe/jsonld';
import { getAgentId } from '@scipe/librarian';

export default function emitEvent(
  action,
  event // can be a string, in which case it's the description of the event
) {
  const agentId = getAgentId(action.agent) || `bot:${this.constructor.name}`;

  event = Object.assign(
    {
      '@id': this.uuid({ curiePrefix: '_' }),
      '@type': 'ProgressEvent',
      about: getId(action),
      startDate: new Date().toISOString()
    },
    typeof event === 'string' ? { description: event } : event
  );

  this.emit(this.PUB_EVENT, agentId, event);

  return {
    emitEndedEvent: () => {
      const endedEvent = Object.assign({}, event, {
        endDate: new Date().toISOString()
      });

      this.emit(this.PUB_EVENT, agentId, endedEvent);
      return endedEvent;
    },
    emitEvent: (action, nextEvent) => {
      if (event && nextEvent) {
        nextEvent = Object.assign(
          {},
          typeof nextEvent === 'string'
            ? { description: nextEvent }
            : nextEvent,
          { superEvent: event['@id'] }
        );
      }
      return this.emitEvent(action, nextEvent);
    },
    toJSON: function() {
      return event;
    }
  };
}
