/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/

const xutils = {};

xutils.taskAction = function(id, ...args) {
  return {
    type: 'taskAction',
    id: id,
    args: args,
  };
}
  
xutils. taskQuery = function(id, ...args) {
  return { 
    type: 'taskQuery', 
    id: id,
    args: args,
  };
}

xutils.logMsg = function(message, ...args) {
  return {
    type: 'logMsg',
    message: message,
    args: args,
  };
}

xutils.convertToSnakeCase = function(str) {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')  // Convert from camelCase to snake_case
    .toUpperCase();                       
}

xutils.toCamelCase = function(str) {
  return str.toLowerCase()
    .replace(/_./g, match => match.charAt(1).toUpperCase()); // Convert from snake_case to camelCase
}

xutils.action2event = function(eventType) {
  eventType = eventType.replace("ENTER", "ENTERED");
  eventType = eventType.replace("SUBMIT", "SUBMITTED");
  return eventType;
}

xutils.query2event = function(eventType) {
  eventType = eventType.replace("FIND", "FOUND");
  return eventType;
}

// This is not yet making use of the optional arguments to taskQuery and taskAction
// Could detect the entry is an array or hash and then deal with arguments also
xutils.actionThenQuery = function(state, actions, queries) {
  let entry = [];
  let on = {};
  for (const action of actions) {
    entry.push(xutils.taskAction(action));
  }
  for (const query of queries) {
    entry.push(xutils.taskQuery(query));
    let eventType = xutils.convertToSnakeCase(query);
    eventType = xutils.query2event(eventType);
    const nextState = xutils.toCamelCase(eventType);
    on[eventType] = nextState;
  }
  let result = {[state]: {
    "entry": entry,
    "on": on,
  }};
  return result;
}

export const { taskAction, taskQuery, logMsg, actionThenQuery } = xutils;
export { xutils }