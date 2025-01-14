/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/

import RequestError from './routes/RequestError.mjs';
import { tasks } from "./configdata.mjs";
import { activeTasksStore_async, outputStore_async } from "./storage.mjs";
import { commandUpdate_async } from "./commandUpdate.mjs";
import { commandStart_async } from "./commandStart.mjs";
import { commandInit_async } from "./commandInit.mjs";
import { commandError_async } from "./commandError.mjs";
import { utils } from './utils.mjs';
import taskSync_async from "./taskSync.mjs";
import { haveCoProcessor } from "../config.mjs";

// Could try to detect error cycles
const maxErrorRate = 20; // per minute
let lastErrorDate;
let errorCountThisMinute = 0;

function processorInHubOut(task, activeTask, requestId) {
  const { command, id, coProcessingPosition, coProcessing, coProcessingDone  } = task.processor;
  // Could initiate from a processor before going through the coprocessor
  // Could be initiated by the coprocessor
  //utils.logTask(task, "task.processor.initiatingProcessorId ", task.processor.initiatingProcessorId);
  let initiatingProcessorId = task.processor.initiatingProcessorId || id;
  //utils.logTask(task, "initiatingProcessorId", initiatingProcessorId);
  if (!task.processor.isCoProcessor) {
    initiatingProcessorId = id;
  }
  //utils.logTask(task, "initiatingProcessorId", initiatingProcessorId);
  let commandArgs = {};
  if (task.processor.commandArgs) {
    commandArgs = JSON.parse(JSON.stringify(task.processor.commandArgs))
  }
  task.processor.command = null;
  task.processor.commandArgs = null;
  task.processor.coProcessing = null;
  task.processor.coProcessingDone = null;
  task.processor.coProcessingPosition = null;
  const activeTaskProcessors = activeTask?.processors || {};
  activeTaskProcessors[id] = JSON.parse(JSON.stringify(task.processor));
  task.processors = activeTaskProcessors;
  task.users = activeTask?.users || {};
  task.hub = {
    command,
    commandArgs,
    sourceProcessorId: id,
    initiatingProcessorId,
    requestId,
    coProcessingPosition,
    coProcessingDone,
    coProcessing,
  };
  utils.logTask(task, "processorToHub " + command + " state " + task?.state?.current + " commandArgs ", commandArgs, " initiatingProcessorId " + initiatingProcessorId);
  return task;
}

function checkLockConflict(task, activeTask) {
  if (task.meta) {
    const lock = task.hub.commandArgs.lock || false;
    const unlock = task.hub.commandArgs.unlock || false;
    const lockBypass = task.hub.commandArgs.lockBypass || false;
    const lockProcessorId = task.hub.initiatingProcessorId;
    
    if (lock && activeTask && !activeTask.meta?.locked) {
      task.meta.locked = lockProcessorId;
      utils.logTask(task, "LOCKED ",task.id, task.meta.locked);
    } else if (unlock) {
      task.meta.locked = null;
      utils.logTask(task, "UNLOCK explicit",task.id, task.meta.locked);
    } else if (activeTask && activeTask.meta?.locked && activeTask.meta.locked === lockProcessorId) {
      task.meta.locked = null;
      utils.logTask(task, "UNLOCK implicit",task.id, task.meta.locked);
    }
    
    if (activeTask && activeTask.meta?.locked && activeTask.meta.locked !== lockProcessorId && !lockBypass && !unlock) {
      const now = new Date();
      let localUpdatedAt;
      if (task.meta.updatedAt) {
        localUpdatedAt = new Date(task.meta.updatedAt.date);
      }
      
      const differenceInMinutes = (now - localUpdatedAt) / 1000 / 60;
      
      if (differenceInMinutes > 5 || localUpdatedAt === undefined) {
        utils.logTask(task, `UNLOCK task lock expired for ${lockProcessorId} locked by ${activeTask.meta.locked} localUpdatedAt ${localUpdatedAt}`);
      } else {
        utils.logTask(task, `CONFLICT Task lock conflict with ${lockProcessorId} command ${task.hub.command} locked by ${activeTask.meta.locked} ${differenceInMinutes} minutes ago.`);
        throw new RequestError("Task locked", 423);
      }
    }
  }
  
  return task;
}

function checkAPIRate(task) {
  const maxRequestRate = task?.config?.maxRequestRate ?? 0; 
  if (maxRequestRate && task?.meta?.lastUpdatedAt) {
    const lastUpdatedAt = new Date(task.meta.lastUpdatedAt.date);
    const updatedAt = new Date(task.meta.updatedAt.date);

    if (lastUpdatedAt.getUTCMinutes() !== updatedAt.getUTCMinutes()) {
      //console.log("checkAPIRate", lastUpdatedAt.getUTCMinutes(), updatedAt.getUTCMinutes())
      task.meta.requestsThisMinute = 0;
    } else {
      task.meta.requestsThisMinute++;
      //console.log("checkAPIRate requestsThisMinute", task.meta.requestsThisMinute);
    }

    if (task.meta.requestsThisMinute >= maxRequestRate) {
      task.error = {message: `Task update rate exceeded ${maxRequestRate} per minute`};
    }

    const maxRequestCount = task?.config?.maxRequestCount;
    if (maxRequestCount && task.meta.requestCount > maxRequestCount) {
      utils.logTask(task, `Task request count: ${task.meta.requestCount} of ${maxRequestCount}`);
      task.error = {message: "Task request count of " + maxRequestCount + " exceeded."};
    }
    //utils.logTask(task, `Task request count: ${task.meta.requestCount} of ${maxRequestCount}`);
    task.meta.requestCount++;
  }
  return task;
}

function checkErrorRate(task) {
  if (task.error || task?.hub?.command === "error" || (task.id && task.id.endsWith(".error"))) {
    //console.log("checkErrorRate errorCountThisMinute:", errorCountThisMinute, "lastErrorDate:", lastErrorDate, "task.error:", task.error);
    const currentDate = new Date();
    const resetDate = new Date(
      currentDate.getUTCFullYear(),
      currentDate.getUTCMonth(),
      currentDate.getUTCDate(),
      currentDate.getUTCHours(),
      currentDate.getUTCMinutes()
    );
    const maxRequestRate = maxErrorRate ?? 0;
    if (maxRequestRate) {
      if (lastErrorDate && resetDate > lastErrorDate) {
        errorCountThisMinute = 0;
      }
      errorCountThisMinute++;
      lastErrorDate = resetDate;
      if (errorCountThisMinute > maxRequestRate) {
        throw new Error(`Hub error rate exceeded ${maxRequestRate} per minute`);
      }
    }
  }
}


function findClosestErrorTask(taskId, tasks) {
  const taskLevels = taskId.split('.');
  for (let i = taskLevels.length - 1; i >= 0; i--) {
    taskLevels[i] = "error";
    const errorTaskId = taskLevels.join('.');
    if (tasks[errorTaskId]) {
      return errorTaskId;
    }
    taskLevels.splice(i, 1);
  }
  return null;
}

function processError(task, tasks) {
  if (task.error) {
    let errorTask;
    if (task.config && task.config.errorTask) {
      errorTask = task.config.errorTask;
    } else {
      errorTask = findClosestErrorTask(task.id, tasks);
    }
    task.hub.command = "error";
    task.hub.commandArgs = { errorTask };
  }
  return task;
}

async function processOutput_async(task, outputStore) {
  // Check task.output is not empty as empty will override via deepMerge
  if (task.output && Object.keys(task.output).length > 0) {
    let output = await outputStore.get(task.familyId);
    if (!output) {
      output = {};
    }
    // Merge because we are receiving a diff
    output[`${task.id}.output`] = utils.deepMerge(output[`${task.id}.output`], task.output);
    await outputStore.set(task.familyId, output);
  }
  return task;
}

async function processCommand_async(task, res) {
  const command = task.hub.command;
  switch (command) {
    case "init":
      return await commandInit_async(task, res);
    case "start":
      return await commandStart_async(task, res);
    case "update":
      return await commandUpdate_async(task, res);
    case "error":
      return await commandError_async(task, res);
    default:
      throw new Error("Unknown command " + command);
  }
}

async function taskProcess_async(task, req, res) {
  try {
    if (!task.processor) {
      throw new Error("Missing task.processor in /hub/api/task");
    }
    utils.logTask(task, "");
    utils.logTask(task, "From processor:" + task.processor.id + " command:" + task.processor.command);
    let activeTask = {};
    checkErrorRate(task);
    if (task.instanceId !== undefined) {
      activeTask = await activeTasksStore_async.get(task.instanceId);
      if (activeTask && Object.keys(activeTask).length !== 0) {
        if (task.meta.hashDiff) {
          // This is running on "partial" which seems a waste
          utils.checkHashDiff(activeTask, task);
        }
        // Need to restore meta for checkLockConflict, checkAPIRate
        task.meta = utils.deepMerge(activeTask.meta, task.meta);
        // Need to restore config for checkAPIRate
        task.config = utils.deepMerge(activeTask.config, task.config);
      } else if (task.processor.command !== "start") {
        console.error("Should have activeTask if we have an instanceId");
        return;
      }
    }
    let requestId;
    if (req) {
      requestId = req.id;
    }
    task = processorInHubOut(task, activeTask, requestId);
    if (task.hub.command !== "partial") {
      task = checkLockConflict(task, activeTask);
      if (!task.hub.coProcessing) {
        task = checkAPIRate(task);
      }
      task = processError(task, tasks);
    }
    // Deep copy
    let error;
    if (task.error) {
      error = JSON.parse(JSON.stringify(task.error));
    }
    if (task.hub.command === "update" || task.hub.command === "init") {
      // We may receive a diff where familyId is not sent but
      // we need familyId to set the outputStore_async
      task.familyId = task.familyId || activeTask.familyId;
      task = await processOutput_async(task, outputStore_async);
    }
    if (haveCoProcessor && !task.hub.coProcessing && !task.processor.isCoProcessor) {
      // Send to first coprocessor
      // We will receive the task back from the coprocessor through websocket
      await taskSync_async(task.instanceId, task);
      utils.hubActiveTasksStoreSet_async(activeTasksStore_async, task);
      return null;
    // If HTTP without coprocessing then we return (this is no longer used)
    } else if (res) {
      const result = await processCommand_async(task, res);
      if (error !== undefined) {
        // Maybe throw from here ?
        utils.logTask(task, "Error in /hub/api/task " + error);
        if (res) {
          res.status(500).json({ error: error });
        }
      } else {
        if (res) {
          res.status(200).json(result);
        }
      }
    }
  } catch (err) {
    if (err instanceof RequestError) {
      utils.logTask(task, "Error in /hub/api/task " + err.code + " " + err.message, err.origError);
      if (res) {
        res.status(err.code).send(err.message);
      }
    } else {
      utils.logTask(task, "Error in /hub/api/task " + err.message, task);
      throw err;
      /*
      if (res) {
        res.status(500).json({ error: "Error in /hub/api/task " + err.message });
      }
      */
    }
  }
  return task;
}

export { taskProcess_async }