import { getAgentId } from '@scipe/librarian';

export default function emitAction(action, params) {
  params = params || {}; // sometimes params is null

  const agentId = getAgentId(action.agent) || `bot:${this.constructor.name}`;

  const data = params ? Object.assign({}, action, params) : action;

  this.emit(this.PUB_EVENT, agentId, data);

  return data;
}
