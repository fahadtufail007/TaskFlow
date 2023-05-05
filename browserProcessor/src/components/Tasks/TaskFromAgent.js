import React, { useEffect, useState, useRef } from "react";
import { Typography, TextareaAutosize } from "@mui/material";
/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/

/*
Task Process
  Can present a text generated by an agent
  Can collect inpput from the user
  Makes use of steps and can be configured to follow different sequences
  
ToDo:
  
*/

import Paper from "@mui/material/Paper";

import withTask from "../../hoc/withTask";

const TaskFromAgent = (props) => {
  const {
    log,
    leaving,
    task,
    setTask,
    updateTask,
    updateStep,
    component_depth,
    useTaskWebSocket,
  } = props;

  const [responseText, setResponseText] = useState("");
  const [userInput, setUserInput] = useState("");
  const [showUserInput, setShowUserInput] = useState(false);
  const [userInputWordCount, setUserInputWordCount] = useState(0);
  const [responseTextWordCount, setResponseTextWordCount] = useState(0);
  const userInputRef = useRef(null);
  const [userInputHeight, setUserInputHeight] = useState(0);
  const [myTaskId, setMyTaskId] = useState();
  const [myStep, setMyStep] = useState("");
  const [myLastStep, setMyLastStep] = useState("");

  // This is the level where we are going to use the task so set the component_depth
  // Could have a setDepth function in withTask
  useEffect(() => {
    updateTask({ stackPtr: component_depth });
  }, []);

  // Reset the task. Allows for the same component to be reused for different tasks.
  // Probably always better to associate a component with a single task.
  useEffect(() => {
    if (task && !myTaskId) {
      setMyTaskId(task.id);
      setResponseText("");
      setUserInput("");
      setUserInputWordCount(0);
      setResponseTextWordCount(0);
      if (!task.config?.nextStates) {
        // Default sequence is to just get response based on prompt text
        updateTask({
          "config.nextStates": { start: "response", response: "stop" },
        });
        //setTask((p) => {return {...p, steps: {'start' : 'response', 'response' : 'stop'}}});
      }
      setMyStep("start");
    }
  }, [task]);

  // Stream to the response_text)
  function updateResponse(mode, text) {
    switch (mode) {
      case "delta":
        // Don't use updateTask because we want to append to a property in the task
        setResponseText((prevResponse) => prevResponse + text);
        break;
      case "partial":
        setResponseText(text);
        break;
      case "final":
        // So observers of the task know we finished
        setResponseText(text);
        break;
    }
  }

  useTaskWebSocket((partialTask) => {
    if (partialTask?.response) {
      if (partialTask.response?.mode && partialTask.response?.text) {
        updateResponse(partialTask.response.mode, partialTask.response.text);
      }
    }
  });

  // Sub_task state machine
  // Unique for each component that requires steps
  useEffect(() => {
    if (myTaskId && myTaskId === task.id) {
      const leaving_now =
        leaving?.direction === "next" && leaving?.task.name === task.name;
      const next_step = task.config.nextStates[myStep];
      //console.log("task.id " + task.id + " myStep " + myStep + " next_step " + next_step + " leaving_now " + leaving_now)
      switch (myStep) {
        case "start":
          // Next state
          setMyStep(next_step);
          // Actions
          break;
        case "response":
          function response_action(text) {
            if (text) {
              const words = text.trim().split(/\s+/).filter(Boolean);
              setResponseTextWordCount(words.length);
              setResponseText(text);
              if (next_step === "input") {
                setShowUserInput(true);
              }
            } else {
              console.log("No text for response_action in TaskFromAgent");
            }
          }
          // We cache the response browserProcessor side
          if (task.response?.text) {
            log("Response cached browserProcessor side");
            // Next state
            setMyStep(next_step);
            // Actions
            response_action(task.response.text);
          } else {
            if (task.response.updated) {
              setMyStep(next_step);
            }
            // Actions
            // send prompt to get response from agent
            updateTask({ send: true });
            updateStep(myStep);
            // show the response
            if (task.response.updated) {
              // This is not making sense - check prior to v0.2
              const response_text = task.response.text;
              updateTask({ "response.text": response_text });
              //setTask((p) => {return {...p, response: response_text}});
              response_action(response_text);
            }
          }
          break;
        case "input":
          // Next state
          if (task.response.updated) {
            setMyStep(next_step);
          }
          // Actions
          if (leaving_now) {
            // Send the userInput input
            updateStep(myStep);
            updateTask({ send: true });
          }
          break;
        case "stop":
          // Next state
          // Actions
          // Should defensively avoid calling taskDone twice?
          if (leaving_now) {
            updateTask({ "state.done": true });
            //setTask((p) => {return {...p, done: true}});
          }
          break;
        default:
          console.log("ERROR unknown step : " + myStep);
      }
      updateStep(myStep);
      //setTask((p) => {return {...p, step: myStep}});
      setMyLastStep(myStep); // Useful if we want an action only performed once in a state
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving, myStep, task.response.updated]);

  // Align task data with userInput input
  useEffect(() => {
    if (userInput) {
      updateTask({ "request.input": userInput });
      // Make available to other tasks an output of this task
      updateTask({ "output.input": userInput });
      //setTask((p) => {return {...p, input: userInput}});
      console.log("Updating input " + userInput);
    }
  }, [userInput]);

  // Adjust userInput input area size when input grows
  useEffect(() => {
    if (userInputRef.current) {
      setUserInputHeight(userInputRef.current.scrollHeight + 300);
    }
    // filter removes empty entry
    const words = userInput.trim().split(/\s+/).filter(Boolean);
    setUserInputWordCount(words.length);
  }, [userInput]);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {props.task.config?.instruction ? (
        <Paper
          elevation={3}
          style={{
            overflow: "auto",
            textAlign: "left",
            padding: "18px",
            marginBottom: "12px",
          }}
        >
          <Typography style={{ marginTop: "16px" }}>
            {props.task.config.instruction}
          </Typography>
        </Paper>
      ) : (
        ""
      )}
      {responseText ? (
        <>
          <Paper
            elevation={3}
            style={{
              overflow: "auto",
              maxHeight: `calc(100vh - ${userInputHeight}px)`,
              textAlign: "justify",
              padding: "16px",
            }}
          >
            {responseText.split("\\n").map((line, index) => (
              <Typography style={{ marginTop: "16px" }} key={index}>
                {line}
              </Typography>
            ))}
          </Paper>

          <p
            style={{
              fontSize: "12px",
              color: "gray",
              margin: "4px 0 0 0",
              textAlign: "left",
            }}
          >
            {responseTextWordCount} words
          </p>
        </>
      ) : (
        ""
      )}
      {showUserInput ? (
        <div>
          <TextareaAutosize
            placeholder={props.task.request?.inputLabel}
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            style={{ marginTop: "16px" }}
            ref={userInputRef}
          />
          <p
            style={{
              fontSize: "12px",
              color: "gray",
              margin: "4px 0 0 0",
              textAlign: "left",
            }}
          >
            {userInputWordCount} words
          </p>
        </div>
      ) : (
        ""
      )}
    </div>
  );
};

export default React.memo(withTask(TaskFromAgent));