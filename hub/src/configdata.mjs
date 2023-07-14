/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/

import { utils } from "./utils.mjs";
import { CONFIG_DIR } from "../config.mjs";
import assert from "assert";
import { validateTasks } from "./validateTasks.mjs";
import { fromTask } from "./taskConverterWrapper.mjs";
import fs from 'fs/promises'; // Use promises variant of fs for async/await style
import jsonDiff from 'json-diff'; // You need to install this package: npm install json-diff

// For now we use JS data structures instead of a DB
// Removes need for an admin interface during dev
console.log("Loading config data from " + CONFIG_DIR);
var users = await utils.load_data_async(CONFIG_DIR, "users");
var groups = await utils.load_data_async(CONFIG_DIR, "groups");
var tasks = await utils.load_data_async(CONFIG_DIR, "tasks");
var tasktypes = await utils.load_data_async("../config", "tasktypes");

// We adopt a DRY strategy in the code and config files
// But not in the data structures that are generated from the config for the code
// Transform hierarchical tasks structure into a hash
// Build tasks hash from the tasks array

tasktypes = utils.flattenObjects(tasktypes);
//console.log(JSON.stringify(tasktypes, null, 2))

try {
  await validateTasks(tasks);
} catch (e) {
  console.error("Error validating tasks", e);
  throw new Error("Error validating tasks");
}

function mergeTasks(childTask, tasksObj) {
  // Merge the taskType first so we can take APPEN_ PREPREND_ into account from tasktype
  if (childTask.type) {
    // Need to deal with a list of components
    const tasktemplatename = childTask.type;
    if (tasktypes[tasktemplatename]) {
      for (const key2 in tasktypes[tasktemplatename]) {
        if (key2 !== "id" && key2 !== "name" && key2 !== "parentName") {
          //console.log("Adding " + key2, tasktypes[tasktemplatename][key2])
          if (key2 === "config") {
            // ChildTask has priority so it can override default config
            childTask[key2] =  utils.deepMerge(tasktypes[tasktemplatename][key2], childTask[key2])
          } else {
            childTask[key2] =  utils.deepMerge(childTask[key2], tasktypes[tasktemplatename][key2])
          }
        }
      }
    } else {
      console.log("Count not find task template", tasktemplatename)
    }
  }
  for (const key in tasksObj) {
    if (tasksObj.hasOwnProperty(key)) {
      if (key === "label" || key === "type" || key === "meta" || key === "initiator") {
        continue;
      }
      if (key === "config" && childTask.config) {
        for (const configKey in tasksObj.config) {
          mergeObj(childTask.config, configKey, tasksObj.config);
        }
      } else {
        mergeObj(childTask, key, tasksObj);
      }
    }
  }  
}

// Could replace PREPEND_ with ...+ and APPEND with +...
function mergeObj(childTask, key, tasksObj) {
  if (childTask.hasOwnProperty(key) &&
    !key.startsWith("APPEND_") &&
    !key.startsWith("PREPEND_")) {
    childTask[key] = utils.deepMerge(tasksObj[key], childTask[key]);
  } else if (!childTask.hasOwnProperty(key) &&
    !key.startsWith("APPEND_") &&
    !key.startsWith("PREPEND_")) {
    childTask[key] = tasksObj[key];
  }
  if (childTask.hasOwnProperty("PREPEND_" + key)) {
    childTask[key] = prependOperation(childTask, key, tasksObj);
  }
  if (childTask.hasOwnProperty("APPEND_" + key)) {
    childTask[key] = appendOperation(childTask, key, tasksObj);
  }
}

function prependOperation(taskflow, key, tasksObj) {
  if (Array.isArray(taskflow["PREPEND_" + key])) {
    return taskflow["PREPEND_" + key].concat(tasksObj[key]);
  } else {
    return taskflow["PREPEND_" + key] + tasksObj[key];
  }
}

function appendOperation(taskflow, key, tasksObj) {
  if (Array.isArray(taskflow["APPEND_" + key])) {
    return tasksObj[key].concat(taskflow["APPEND_" + key]);
  } else {
    return tasksObj[key] + taskflow["APPEND_" + key];
  }
}

// Not that this has huge side-effects
// Transform tasks array into flattened tasks hash
function flattenTasks(tasks) {
  // The default level is named 'root'
  var parent2id = { root: "" };
  var children = {};
  var taskflowLookup = {};
  tasks.forEach(function (taskflow) {
    // Debug option 
    let debug = false;
    //if (taskflow.name.includes("chatgptzeroshot")) {debug = true;}
    if (debug) {console.log("Taskflow: " + taskflow?.name)}

    const parentId = parent2id[taskflow.parentName]
    
    // Defensive programming
    if (taskflow.name !== "root" && !parentId) {
      throw new Error(
        "Error: Taskflow parentName " +
          taskflow.parentName +
          " does not exist in parent2id");
    }
    
    // Add id
    var id;
    if (taskflow.name === "root") {
      id = "root";
    } else {
      id = parentId + "." + taskflow.name;
    }
    if (taskflowLookup[id]) {
      throw new Error("Error: Duplicate taskflow " + id);
    }
    taskflow["id"] = id;

    if (!taskflow.config) {
      taskflow['config'] = {}
    }
    if (taskflow.config?.label === undefined) {
      taskflow.config["label"] = utils.capitalizeFirstLetter(taskflow.name);
    }
    taskflow["meta"] = {};
    if (taskflow.name !== "root") {
      taskflow.meta["parentId"] = parentId;
    }
    if (id !== "root") {
      let parent = taskflowLookup[parentId]
      if (parent.meta.childrenId) {
        parent.meta.childrenId.push(taskflow.id);
      } else {
        parent.meta["childrenId"] = [taskflow.id];
      }
    }
    
    // Copy keys from the parent
    const parentTaskflow = taskflowLookup[parentId];
    mergeTasks(taskflow, parentTaskflow);

    // Convert relative task references to absolute
    const nextTask = taskflow?.config?.nextTask;
    if (nextTask && !nextTask.includes(".")) {
      taskflow.config.nextTask = parentId + "." + nextTask;
    }
    const nextTaskTemplate = taskflow?.config?.nextTaskTemplate;
    if (nextTaskTemplate) {
      for (const key in nextTaskTemplate) {
        if (nextTaskTemplate.hasOwnProperty(key)) {
          if (!nextTaskTemplate[key].includes(".")) {
            nextTaskTemplate[key] = parentId + "." + nextTaskTemplate[key];
          }
        }
      }
    }
    
    taskflowLookup[id] = taskflow;
    parent2id[taskflow.name] = id;
    // Build children data
    if (children[parentId]) {
      children[parentId].push(taskflow.id);
    } else {
      children[parentId] = [taskflow.id];
    }
  });

  // Replace array of tasks with hash
  // Array just made it easier for the user to specify parents in the config file
  return taskflowLookup;
}

// This has side-effects, modifying tasks in-place
// Could check that each taskflow has a 'start' task
tasks = flattenTasks(tasks);
//console.log(JSON.stringify(tasks, null, 2))

users = utils.flattenObjects(users);
//console.log(JSON.stringify(users, null, 2))

//Create a group for each user
for (const userKey in users) {
  if (users.hasOwnProperty(userKey)) {
    //console.log("Creating group for user " + userKey)
    if (!groups[userKey]) {
      const group = {
        name: users[userKey].name,
        users: [userKey],
      }
      groups.push(group)
    }
  }
}

groups = utils.flattenObjects(groups);
//console.log(JSON.stringify(groups, null, 2))

//Add list of groups to each user (a view in a DB)
for (const groupKey in groups) {
  if (groups.hasOwnProperty(groupKey)) {
    const group = groups[groupKey];
    assert(group.hasOwnProperty("users"), "Group " + groupKey + " has no users");
    group.users.forEach(function (userId) {
      // Groups may have users that do not exist
      if (!users[userId]) {
        console.log(
          "Could not find user " + userId + " expected in group " + groupKey
        );
      } else {
        if (users[userId]["groups"]) {
          // Should check that not already in groups
          users[userId]["groups"].push(groupKey);
        } else {
          users[userId]["groups"] = [groupKey];
        }
      }
    });
  }
}
//console.log(JSON.stringify(users, null, 2))


/**
 * Save tasks to a file if the file does not exist.
 * If the file exists then perform a diff.
 * This is useful during refactoring to make sure intentional changes are made.
 *
 * @param {Array} tasks - An array of tasks to be saved.
 * @return {Promise<void>} A promise that resolves when the tasks are saved successfully.
 */
async function saveTasks(tasks) {
  const tasksJson = JSON.stringify(tasks, null, 2);
  let existingTasks;

  try {
    const data = await fs.readFile('/tmp/tasks.json', 'utf8');
    existingTasks = JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') { // file does not exist
      await fs.writeFile('/tmp/tasks.json', tasksJson);
      console.log('Successfully wrote tasks to file');
      return;
    } else {
      console.error('Error reading file', error);
      return;
    }
  }

  const diff = jsonDiff.diffString(existingTasks, tasks);
  if (diff) {
    console.log('Differences between the existing tasks and the new tasks:', diff);
  } else {
    console.log('No differences found');
  }
}
//await saveTasks(tasks);

//console.log(JSON.stringify(tasks["root.conversation.chatgptzeroshot.start"], null, 2));
//console.log(JSON.stringify(tasks["root.exercices.production.ecrit.resume.start"], null, 2)); 

// For each task in tasks run fromTask to validate the task
Object.keys(tasks).forEach(key => {
  const task = tasks[key];
  fromTask(task);
});

function getConfigHash() {
  return utils.djb2Hash(JSON.stringify([users, groups, tasktypes, tasks]));
}
export { users, groups, tasktypes, tasks, getConfigHash };
