/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/

import { instancesStore_async, familyStore_async, activeTasksStore_async, activeTaskProcessorsStore_async, activeProcessorTasksStore_async, activeProcessors, outputStore_async } from "./storage.mjs";
import { users, groups, tasks, autoStartTasks } from "./configdata.mjs";
import { v4 as uuidv4 } from "uuid";
import { utils } from "./utils.mjs";
import taskSync_async from "./taskSync.mjs";

// Test handling of error

// The async function taskStart_async is where the sequence for starting a task is managed.
// It makes use of many helper functions defined above it.

async function checkActiveTaskAsync(instanceId, activeProcessors) {
  let activeTask = await activeTasksStore_async.get(instanceId);
  let doesContain = false;
  if (activeTask) {
    let activeTaskProcessors = await activeTaskProcessorsStore_async.get(instanceId)
    let environments = [];
    if (activeTaskProcessors) {
      // For each of the processors associated with this task
      // build a list of environments that are already active 
      for (let taskProcessorId of activeTaskProcessors) {
        const processorData = activeProcessors.get(taskProcessorId);
        if (processorData) {
          doesContain = true;
          environments.push(...processorData.environments);
          //console.log("Adding environments to task " + activeTask.id, processorData.environments)
        }
      }
    }
    // Check that we have at least one environment active
    
    if (doesContain) {
      if (activeTask.environments && activeTask.environments.length > 0) {
        const allEnvironmentsPresent = activeTask.environments.every(env => environments.includes(env));
        //console.log("activeTask.environments:", activeTask.environments, "processor environments:", environments, "allEnvironmentsPresent:", allEnvironmentsPresent);
        if (!allEnvironmentsPresent) {
          doesContain = false;
        }
      } else {
        console.log("activeTask.environments empty");
        doesContain = false;
      }
    }
  }
  return { activeTask, doesContain };
}

async function processInstanceAsync(task, instanceId, mode) {
  let instance = await instancesStore_async.get(instanceId);
  if (instance) {
    let { activeTask, doesContain } = await checkActiveTaskAsync(instanceId, activeProcessors);
    if (activeTask && doesContain) {
      utils.logTask(task, "Task already active", instanceId);
      task = activeTask;
      task["hub"]["command"] = "join";
      utils.logTask(task, `Joining ${mode} for ${task.id}`);
    } else {
      task = instance;
      //utils.logTask(task, "processInstanceAsync task", task);
      task["hub"]["command"] = "init";
      if (task?.state?.current) {
        task.state["current"] = "start";
      }
      task.meta["updateCount"] = 0;
      task.meta["locked"] = null;
      await activeTasksStore_async.delete(instanceId);
      utils.logTask(task, `Restarting ${mode} ${instanceId} for ${task.id}`);
    }
  } else {
    utils.logTask(task, `Initiating ${mode} with instanceId ${instanceId}`);
  }
  return task;
}

function checkUserGroup(groupId, userId) {
  if (!groups[groupId]?.users) {
    throw new Error("No users in group " + groupId);
  }
  if (!groups[groupId].users.includes(userId)) {
    throw new Error(`User ${userId} not in group ${groupId}`);
  } else {
    console.log("User in group", groupId, userId);
    return true;
  }
}

function isAllCaps(str) {
  return /^[A-Z\s]+$/.test(str);
}

function processTemplateArrays(obj, task, outputs, familyId) {
  // Do substitution on arrays of strings and return a string
  if (Array.isArray(obj) && obj.every(item => typeof item === 'string')) {
    const user = users[task.user.id];
    return obj.reduce(function (acc, curr) {
      // Substitute variables with previous outputs
      const regex = /^([^\s.]+).*?\.([^\s.]+)$/;
      const matches = regex.exec(curr);
      //utils.logTask(task, "curr ", curr, " matches", matches)
      if (matches && !isAllCaps(matches[1])) {
        const path = curr.split('.');
        let outputPath;
        if (path[0] === "root") {
          outputPath = curr.replace(/\.[^.]+$/, '');
        } else {
          outputPath = task.meta.parentId + "." + matches[1] + ".output";
        }
        if (outputs[outputPath] === undefined) {
          throw new Error("outputStore " + familyId + " " + outputPath + " does not exist")
        }
        if (outputs[outputPath][matches[2]] === undefined) {
          throw new Error("outputStore " + familyId + " " + outputPath + " output " + matches[2] + " does not exist in " + JSON.stringify(outputs[matches[1]]))
        }
        //utils.logTask(task, "Here ", outputPath, matches[2], outputs[outputPath][matches[2]])
        return acc.concat(outputs[outputPath][matches[2]]);
      } else {
        const regex = /^(USER)\.([^\s.]+)$/;
        const matches = regex.exec(curr);
        if (matches) {
          // Substitute variables with user data
          return acc.concat(user[matches[2]])
        } else {
          return acc.concat(curr);
        }
      }
    }, []).join("");
  } else {
    for (const key in obj) {
      if (Array.isArray(obj[key])) {
        obj[key] = processTemplateArrays(obj[key], task, outputs, familyId);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        processTemplateArrays(obj[key], task, outputs, familyId);
      }
    }
  }
  return obj
}

function processTemplates(task, obj, outputs, familyId) {
  if (!obj) {
    return task;
  }
  // Traverse every key-value pair in the object
  for (const [key, value] of Object.entries(obj)) {
    // If the value is an object, then recurse
    if (typeof value === 'object' && value !== null) {
        processTemplates(task, value, outputs, familyId);
    }

    // If the key ends with "Template", process it
    if (key.endsWith('Template')) {
        const strippedKey = key.replace('Template', '');
        const templateCopy = JSON.parse(JSON.stringify(value));
        obj[strippedKey] = processTemplateArrays(templateCopy, task, outputs, familyId);
    }
  }
  return task;
}

function checkUserPermissions(task, groups, authenticate) {
  // Check if the user has permissions
  if (authenticate && !utils.authenticatedTask(task, task.user.id, groups)) {
    throw new Error("Task authentication failed");
  }
}

async function updateFamilyStoreAsync(task, familyStore_async) {
  // Update familyStore_async
  if (task.familyId) {
    // If task.instanceId already exists then do nothing otherwise add instance to family
    let instanceIds = await familyStore_async.get(task.familyId);
    if (!instanceIds) {
      await familyStore_async.set(task.familyId, [task.instanceId]);
      utils.logTask(task, "Initiating family " + task.familyId + " with instanceId: " + task.instanceId);
    } else if (!instanceIds.includes(task.instanceId)) {
      instanceIds.push(task.instanceId);
      await familyStore_async.set(task.familyId, instanceIds);
      utils.logTask(task, "Adding to family " + task.familyId + " instanceId: " + task.instanceId);
    } else {
      utils.logTask(task, "Instance already in family " + task.familyId + " instanceId: " + task.instanceId);
    }
  }
  return task;
}

async function updateTaskAndPrevTaskAsync(task, prevTask, processorId, instancesStore_async, activeTasksStore_async) {
  // Copy information from prevTask and update prevTask children
  if (prevTask) {
    task.meta["prevInstanceId"] = prevTask.meta.prevInstanceId || prevTask.instanceId;
    task.meta["parentInstanceId"] = prevTask.instanceId;
    // Copying processor information from previous task instance
    // In the case where the task sequence advances on another processor 
    // we need to be able to associate a more recent tasks with an older
    // task that is waiting on the next task.
    task.processors = prevTask.processors;
    task.processor = prevTask.processor;
    task.processor["command"] = null;
    task.processor["commandArgs"] = null;
    task.users = prevTask.users || {}; // Could be mepty in the case of error task
    task.state.address = prevTask.state?.address ?? task.state.address;
    task.state.lastAddress = prevTask.state?.lastAddress ?? task.state.lastAddress;
    // Update all the active prevTask with new child
    prevTask.meta.childrenInstanceId = prevTask.meta.childrenInstanceId ?? [];
    prevTask.meta.childrenInstanceId.push(task.instanceId);
    // We update the prevTask and set sourceProcessorId to hub so all Processors will be updated
    await instancesStore_async.set(prevTask.instanceId, prevTask);
    // The prevTask task may be "done" so no longer active
    // Also we do not want to update a task that errored
    if (!prevTask.done && !task.id.endsWith(".error")) {
      if (await activeTasksStore_async.has(prevTask.instanceId)) {
        /*
        This has been removed for now becaus sending an update can impact the state machine
        and it is not intuitive. We need another way of managing the familyTree - TaskFamilyTree
        prevTask.hub.command = "update";
        prevTask.hub.sourceProcessorId = "hub";
        await utils.hubActiveTasksStoreSet_async(activeTasksStore_async, prevTask);
        await taskSync_async(prevTask.instanceId, prevTask);
        */
      }
    }
  }
  return task;
}

function supportMultipleLanguages(task, users) {
  // Multiple language support for config fields
  // Eventually replace with a standard solution
  // For example, task.config.demo_FR is moved to task.config.demo if user.language is FR
  const user = users[task.user.id];
  const language = user?.language || "EN";
  // Array of the objects
  let configs = [task.config];
  if (task.config?.local) {
    configs.push(task.config.local);
  }
  // Loop over the objects in the array
  for (const config of configs) {
    for (const [key, value] of Object.entries(config)) {
      if (key.endsWith("_" + language.toUpperCase())) {
        const newKey = key.replace(/_\w{2}$/, "");
        if (config[newKey] === undefined) {
          config[newKey] = value;
        }
      }
      // Strip out the language configs
      const match = key.match(/_(\w{2})$/);
      if (match) {
        delete config[key];
      }
    }
  }
  return task;
}

function allocateTaskToProcessors(task, processorId, activeProcessors, autoStart) {
  // Build list of processors/environments that need to receive this task
  let taskProcessors = []

  if (!task.environments) {
    throw new Error("No environments in task " + task.id);
  }

  //utils.logTask(task, "task.environments", task.environments);

  // If the task only runs on coprocessor
  if (task.config.autoStartCoProcessor) {
    return [];
  }
  // Allocate the task to processors that supports the environment(s) requested
  const sourceProcessor = activeProcessors.get(processorId);
  for (const environment of task.environments) {
    // Favor the source Task Processor if we need that environment
    let found = false;
    if (sourceProcessor && sourceProcessor.environments && sourceProcessor.environments.includes(environment)) {
      found = true;
      taskProcessors.push(processorId);
    }
    // If there are already processor entries then favor these
    if (!found && task.processors) {
      for (let id in task.processors) {
        const processor = activeProcessors.get(id);
        if (processor && processor.environments && processor.environments.includes(environment)) {
          found = true;
          taskProcessors.push(id);
          task.processors[id] = {id: id};
        }
      }
    }
    // Find an active processor that supports this environment
    if (!found) {
      for (const [activeProcessorId, value] of activeProcessors.entries()) {
        const environments = value.environments;
        if (environments && environments.includes(environment)) {
            found = true;
            taskProcessors.push(activeProcessorId);
            task.processors[activeProcessorId] = {id: activeProcessorId};
            break;
        }
      }       
    }
    if (!found) {
      console.error("No processor found for environment " + environment);
      //throw new Error("No processor found for environment " + environment);
    }
  }

  if (taskProcessors.length == 0) {
    throw new Error("No processors allocated for task " + task.id);
  }

  utils.logTask(task, "Allocated new task " + task.id + " to processors ", taskProcessors);

  return taskProcessors;
}

async function recordTasksAndProcessorsAsync(task, taskProcessors, activeTaskProcessorsStore_async, activeProcessorTasksStore_async) {
  // Record which processors have this task
  if (await activeTaskProcessorsStore_async.has(task.instanceId)) {
    let processorIds = await activeTaskProcessorsStore_async.get(task.instanceId);
    taskProcessors.forEach(id => {
      if (processorIds && !processorIds.includes(id)) {
        processorIds.push(id);
      } 
    });
    await activeTaskProcessorsStore_async.set(task.instanceId, processorIds);
  } else {
    await activeTaskProcessorsStore_async.set(task.instanceId, taskProcessors);
  }
  //utils.logTask(task, "Processors with task instance " + task.instanceId, taskProcessors);
  // Record which tasks have this processor
  await Promise.all(
    taskProcessors.map(async (processorId) => {
      if (await activeProcessorTasksStore_async.has(processorId)) {
        let taskInstanceIds = await activeProcessorTasksStore_async.get(processorId);
        if (taskInstanceIds && !taskInstanceIds.includes(task.instanceId)) {
          taskInstanceIds.push(task.instanceId);
        }
        await activeProcessorTasksStore_async.set(processorId, taskInstanceIds);
      } else {
        await activeProcessorTasksStore_async.set(processorId, [task.instanceId]);
      }
      //utils.logTask(task, "Added task instance " + task.instanceId + " to processor " + processorId);
    })
  );
}

async function taskStart_async(
    initTask,
    authenticate,
    processorId,
    prevInstanceId,
  ) {
    
    if (!tasks[initTask.id]) {
      throw new Error("Could not find task with id " + initTask.id)
    }

    // Instantiate new task
    let task = JSON.parse(JSON.stringify(tasks[initTask.id])); // deep copy

    //utils.logTask(task, "Task template", task)

    // Note that instanceId may change due to task.config.oneFamily or task.config.collaborateGroupId
    task.instanceId = uuidv4();

    const autoStart = initTask?.autoStart;

    if (Object.keys(initTask).length > 0) {
      task = utils.deepMerge(task, initTask);
    }

    // The task template may not have initialized some top level objects 
    ['config', 'input', 'meta', 'output', 'privacy', 'processor', 'processors', 'hub', 'request', 'response', 'state', 'users'].forEach(key => task[key] = task[key] || {});

    //utils.logTask(task, "Task after merge", task)

    checkUserPermissions(task, groups, authenticate)

    const prevTask = prevInstanceId ? await instancesStore_async.get(prevInstanceId) : undefined;
       
    if (task.config.oneFamily) {
      // '.' is not used in keys or it breaks setNestedProperties
      // Maybe this could be added to schema
      task["instanceId"] = (task.id + task.user.id).replace(/\./g, '-');
      task.familyId = task.instanceId;
      task = await processInstanceAsync(task, task.instanceId, "oneFamily");
    }
    
    if (task.config.collaborateGroupId) {
      // GroupId should be an array of group Ids?
      task.groupId = task.config.collaborateGroupId;
      if (checkUserGroup(task.groupId, task.user.id)) {
        // '.' is not used in keys or it breaks setNestedProperties
        // Maybe this could be added to schema
        task["instanceId"] = (task.id + task.groupId).replace(/\./g, '-');
        task.familyId = task.instanceId;
        task = await processInstanceAsync(task, task.instanceId, "collaborate");
      }
    }

    if (!task.config.oneFamily && !task.config.collaborateGroupId) {
      // task.familyId may set by task.config.oneFamily or task.config.collaborateGroupId
      if (prevTask) {
        utils.logTask(task, "Using prev familyId", prevTask.familyId);
        task.familyId = prevTask.familyId;
        if (!task.familyId) {
          task.familyId = prevTask.instanceId;
          utils.logTask(task, "No familyId in prevTask", prevTask);
          utils.logTask(task, "No familyId prevInstanceId", prevInstanceId);
        }
      } else if (initTask.familyId) { 
        utils.logTask(task, "Using init familyId", initTask.familyId);
        task.familyId = initTask.familyId;
      } else {
        utils.logTask(task, "Using instanceId familyId", task.instanceId);
        task.familyId = task.instanceId;
      }
    }

    // Side-effect on task.familyd
    task = await updateFamilyStoreAsync(task, familyStore_async)

    // Initialize task.hub.sourceProcessorId
    task.hub["command"] = "init";
    task.hub["sourceProcessorId"] = autoStart ? undefined : processorId;
    task.hub["initiatingProcessorId"] = autoStart ? "autostart" : processorId;
    task.hub["coProcessingDone"] = false;
    
    // Initialize meta object
    // If already set (e.g. joining the task) keep the current values
    task.meta["requestsThisMinute"] = task.meta.requestsThisMinute ?? 0;
    task.meta["requestCount"] = task.meta.requestCount ?? 0;
    task.meta["createdAt"] = task.meta.createdAt ?? utils.updatedAt();
    task.meta["updatedAt"] = task.meta.updatedAt ?? utils.updatedAt();
    task.meta["updateCount"] = task.meta.updateCount ?? 0;
    task.meta["broadcastCount"] = task.meta.broadcastCount ?? 0;

    task = await updateTaskAndPrevTaskAsync(task, prevTask, processorId, instancesStore_async, activeTasksStore_async);
    // Set task.processor.id after copying info from prevTask
    task.processors[processorId] = task.processors[processorId] ?? {};
    task.processors[processorId]["id"] = processorId;

    if (task.users[task.user.id]) {
      task.users[task.user.id] = utils.deepMerge(users[task.user.id], task.users[task.user.id]);
    } else {
      task.users[task.user.id] = users[task.user.id];
    }
    
    // This is only for task.config 
    task = supportMultipleLanguages(task, users);

    // Templating functionality
    const outputs = await outputStore_async.get(task.familyId);
    // Using side-effects to update task.config
    task = processTemplates(task, task.config, outputs, task.familyId);
    task = processTemplates(task, task.config.local, outputs, task.familyId);

    const taskProcessors = allocateTaskToProcessors(task, processorId, activeProcessors, autoStart)

    await recordTasksAndProcessorsAsync(task, taskProcessors, activeTaskProcessorsStore_async, activeProcessorTasksStore_async);

    // Could mess up the join function ?
    task.meta.hash = utils.taskHash(task);

    task.hub.origTask = JSON.parse(JSON.stringify(task));

    utils.logTask(task, "Init task.id:", task.id, task.familyId);

    return task;
  }

  export default taskStart_async;