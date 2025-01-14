/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/

import React, { useState, useEffect, useCallback, useRef } from "react";
import "../styles/App.css";
import "../styles/normal.css";
import SideMenu from "./SideMenu/SideMenu";
import ObjectDisplay from "./Generic/ObjectDisplay";
import Stack from "@mui/material/Stack";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import MenuIcon from "@mui/icons-material/Menu";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Drawer from "@mui/material/Drawer";
import useGlobalStateContext from "../contexts/GlobalStateContext";
import DynamicComponent from "./Generic/DynamicComponent";
import withTask from "../hoc/withTask";
import { utils } from "../utils/utils";
import { appLabel } from "../config";
import IFrame from './Generic/IFrame.js'

// If there is only one agent then do not show side menu

function Taskflows(props) {
  const {
    setTask,
    useTasksState,
    startTaskError,
    startTask,
  } = props;

  const { globalState, replaceGlobalState } = useGlobalStateContext();
  const [tasks, setTasks] = useTasksState([]);
  // We maintain a list of tasksIds so we can quickly find the relevant task
  // if it has been previousyl created in tasks
  const [tasksIds, setTasksIds] = useState([]);
  const [taskKeys, setTaskKeys] = useState([]);
  const [tasksIdx, setTasksIdx] = useState(0);
  const [title, setTitle] = useState(appLabel);
  const [hideSide, setHideSide] = useState(false);
  const [drawWidth, setDrawWidth] = useState(220);
  const [counter, setCounter] = useState(0);

  const [mobileViewOpen, setMobileViewOpen] = React.useState(false);

  useEffect(() => {
    const selectedTaskId = globalState.selectedTaskId
    if (selectedTaskId) {
      /*
      // For now we are loading a new instance instead of reseting (resetting requires coordinating processors)
      // The counter is used in the key of the component
      // If it chenages then this can "reset" the Task as it will be re-mounted.
      // This only happens if we click on the task in the menu while using the same task
      if (selectedTaskId === tasksIds[tasksIdx]) {
        setCounter(prevCounter => prevCounter + 1);
        setTaskKeys(prevTaskKeys => {
          const updated = [...prevTaskKeys];
          updated[tasksIdx] = updated[tasksIdx] + counter;
          return updated;
        });
      }
      */
      const start = selectedTaskId;
      const index = tasksIds.indexOf(start);
      // If we select a task in the menu while using it then start the task again (new instanceId)
      if (index === -1 || selectedTaskId === tasksIds[tasksIdx]) {
        if (selectedTaskId === tasksIds[tasksIdx]) {
          // Remove the instanceId so it will not be rendered (see conditional in the returned jsx)
          const t = JSON.parse(JSON.stringify(tasks[tasksIdx]));
          delete t.instanceId;
          utils.setArrayState(setTasks, tasksIdx, t)
        }
        setTask({
          command: "start",
          commandArgs: {
            id: selectedTaskId,
          }
        });
        console.log("Taskflows start", selectedTaskId)
      } else {
        setTasksIdx(index);
      }
      setTitle(globalState.taskflowsTree[selectedTaskId].label);
      replaceGlobalState("selectedTaskId", null);
      replaceGlobalState("lastSelectedTaskId", selectedTaskId);
      replaceGlobalState("maxWidth", "800px");
      replaceGlobalState("xStateDevTools", false);
    }
    // If we only have one start task and the Processor has registered with the hub
    if (globalState?.taskflowLeafCount && globalState.taskflowLeafCount === 1 && !globalState?.hubId) {
      setTask({
        command: "start",
        commandArgs: {
          id: selectedTaskId,
        }
      });
      setHideSide(true);
      setDrawWidth(0);
    }
  }, [globalState]);

  useEffect(() => {
    if (startTask) {
      setTasksIdx(tasks.length);
      setTasks((prevVisitedTasks) => [...prevVisitedTasks, startTask]);
      setTasksIds((p) => [...p, startTask.id]);
      setTaskKeys((p) => [...p, startTask.instanceId]);
    }
  }, [startTask]);

  const handleToggle = () => {
    setMobileViewOpen(!mobileViewOpen);
  };

  /*
  function setTasksTask(t, idx) {
    utils.setArrayState(setTasks, idx, t);
  }
  */

  const setTasksTask = useCallback((t, idx) => {
    // This is a hack to push updates outside of the rendering 
    // The websocket is asynchronous so it can create calls during rendering
    // Also passing the task and setTask down means that during the rendering of Taskflows
    // DynamicComponents can call setTask which is aliased to setTasksTask
    // Maybe Redux is the way to work around this
    setTimeout(() => utils.setArrayState(setTasks, idx, t), 0);
    //utils.setArrayState(setTasks, idx, t)
  }, [utils.setArrayState]);

  //Tracing

  useEffect(() => {
    //console.log("Tasks ", tasks, tasksIdx)
  }, [tasks]);

   const appDivStyle={
    maxWidth:'100%'
  }
  return (
    <div className="App" style={{maxWidth: globalState.maxWidth}}>
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawWidth}px)` },
          ml: { sm: `${drawWidth}px` },
          backgroundColor: "grey",
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={handleToggle}
            sx={{ mr: 2, display: { sm: "none" } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6">{title}</Typography>
        </Toolbar>
      </AppBar>

      <Stack
        direction="row"
        spacing={3}
        sx={{ width: "100%", marginRight: "24px" }}
      >
        <Box
          component="nav"
          sx={{
            width: { sm: drawWidth },
            flexShrink: { sm: 0 },
            ...(hideSide && { display: "none" }),
          }}
        >
          <Drawer
            variant="temporary"
            open={mobileViewOpen}
            onClose={handleToggle}
            ModalProps={{
              keepMounted: true,
            }}
            sx={{
              display: { xs: "block", sm: "none" },
              "& .MuiDrawer-paper": {
                boxSizing: "border-box",
                width: drawWidth,
              },
            }}
          >
            <SideMenu onClose={handleToggle} interfaceType={globalState.user?.interface} />
          </Drawer>

          <Drawer
            variant="permanent"
            sx={{
              display: { xs: "none", sm: "block" },
              "& .MuiDrawer-paper": {
                boxSizing: "border-box",
                width: drawWidth,
              },
            }}
            open
          >
            <SideMenu onClose={() => (null)}  interfaceType={globalState.user?.interface}/>
          </Drawer>
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
          <Toolbar />
          {tasks.map(
            ({ instanceId }, idx) =>
              instanceId && 
              (
                <div
                  key={taskKeys[idx]}
                  className={`${tasksIdx !== idx ? "hide" : "flex-grow"}`}
                >
                  <DynamicComponent
                    key={instanceId}
                    is={tasks[idx].type}
                    task={tasks[idx]}
                    setTask={(t) => setTasksTask(t, idx)} // Pass idx as an argument
                    parentTask={null}
                  />
                </div>
              )
          )}
          <div className={`${globalState.user?.interface !== "debug" ? "hide" : ""}`}>
            <ObjectDisplay data={globalState} />
          </div>
          <IFrame />
        </Box>

      </Stack>
    </div>
  );
}

export default withTask(Taskflows);
