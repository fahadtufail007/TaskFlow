/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/
import { utils } from "../utils.mjs";
import { CEPFunctions } from "../CEPFunctions.mjs";
import { commandUpdate_async } from "../commandUpdate.mjs";
import { activeTasksStore_async } from "../storage.mjs";
import TreeModel from 'tree-model';

/*
  For TaskChat we want to swap service type openaigpt for openaistub
  root.user.testing.zeroshot.start
*/

// eslint-disable-next-line no-unused-vars
const TaskSystemTest_async = async function (wsSendTask, T, fsmHolder, CEPFuncs) {

  function serviceStub(functionName, wsSendTask, CEPinstanceId, task, args) {
    const key = args.key;
    const value = args.value;
    const type = args.type;
    //task.config.services
    if (task.processor.command === "init" && task?.config?.services) {
      for (const service of task.config.services) {
        if (service.type === type) {
          service[key] = value;
          task.config.subtasks.SubTaskLLM.useCache = false;
        }
        // Your code logic for each service entry
      }
      utils.logTask(task, "task.config.services", type, key, value);
      return;
    }
  }

  // This sync the familyTree but we are not using this if we test via UI 
  // eslint-disable-next-line no-unused-vars
  async function familyTree(functionName, wsSendTask, CEPinstanceId, task, args) {
    utils.logTask(task, "familyTree command", task.processor.command);
    // Only run this when going through the coprocessor the first time
    if (task.processor.command === "init" && !task.processor.coProcessingDone) {
      let CEPtask;
      // In this case we are starting the TaskSystemTest
      if (CEPinstanceId === task.instanceId) {
        CEPtask = task;
      } else {
        CEPtask = await activeTasksStore_async.get(CEPinstanceId);
      }
      const tree = new TreeModel();
      let root;
      if (CEPtask.state.familyTree) {
        root = tree.parse(CEPtask.state.familyTree);
      } else {
        root = tree.parse({id: CEPinstanceId, taskInstanceId: CEPinstanceId, taskId: CEPtask.id, type: CEPtask.type});
      }
      //utils.logTask(task, "familyTree", root);
      let node = root.first(node => node.model.id === task.instanceId);
      if (!node) {
        node = tree.parse({id: task.instanceId, taskInstanceId: task.instanceId, taskId: task.id, type: task.type});
        let parentNode;
        if (!task.meta.parentInstanceId) {
          utils.logTask(task, "No parentInstanceId", node);
        } else {
          parentNode = root.first(node => node.model.id === task.meta.parentInstanceId);
          if (parentNode) {
            parentNode.addChild(node);
            utils.logTask(task, "Found parentInstanceId so adding node");
          } else {
            utils.logTask(task, "No parentNode for parentInstanceId", task.meta.parentInstanceId);
          }
        }
        let diff = {
          state: {
            familyTree: root.model,
          }
        };
        utils.logTask(task, "New state.familyTree", JSON.stringify(diff, null, 2));
        // We send a sync which updates much faster because it sets coProcessingDone
        // Otherwise we can get race conditions with the next task reading an old state of state.familyTree
        // How can we more robustly fix this ?
        await commandUpdate_async(wsSendTask, CEPtask, diff, true);
      }
    }
  }

  // We can also register a CEP by declaring it in ./CEPFunctions.mjs
  CEPFunctions.register("serviceStub", serviceStub);
  CEPFunctions.register("familyTree", familyTree);

  // Here we install the CEP from the task but this could also be done through the Task config
  const match = "id-" + T("config.local.targetTaskId");
  const config = {
    functionName: "serviceStub",
    args: {
      type: "openaigpt.chatgptzeroshot",
      key: "API", 
      value: "openaistub"
    },
  }
  utils.createCEP(CEPFuncs, CEPFunctions, T(), match, config);

  return T();
};

export { TaskSystemTest_async };