/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/

import { activeTasksStore_async } from "./storage.mjs";
import { wsSendObject } from "./websocket.js";

const syncTasks_async = async (key, value) => {

  //console.log("syncTasks_async", key)

  const task = value.task;
  const processorIds = value.processorIds;
  const has = await activeTasksStore_async.has(key);
  if (has) { 
    const activeTask = await activeTasksStore_async.get(key);
    // Here we could calculate the diff
  }
  // foreach processorId in processorIds send the task to the processor
  if (processorIds) {
    console.log("syncTasks_async task " + task.id + " from " + task.newSource);
    for (const processorId of processorIds) {
      if (processorId !== task.newSource) {
        const message = { command: "update", task: task };
        wsSendObject(processorId, message);
        //console.log("syncTasks_async updating", key, processorId);
      } else {
        //console.log("syncTasks_async skipping", key, processorId);
      }
    }
  } else {
    console.log("syncTasks_async no processorIds", key, value);
  }

};

export default syncTasks_async;