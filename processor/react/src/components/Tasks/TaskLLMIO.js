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

import React, { useEffect, useState, useRef } from "react";
import { Typography, TextareaAutosize } from "@mui/material";
import usePartialWSFilter from "../../hooks/usePartialWSFilter";
import Paper from "@mui/material/Paper";
import withTask from "../../hoc/withTask";
import { utils } from "../../utils/utils";

const TaskLLMIO = (props) => {
  const {
    log,
    entering,
    leaving,
    task,
    modifyTask,
    onDidMount,
    transition,
    transitionTo, 
    transitionFrom,
    componentName,
  } = props;

  const [responseText, setResponseText] = useState("");
  const [userInput, setUserInput] = useState("");
  const [showUserInput, setShowUserInput] = useState(false);
  const [userInputWordCount, setUserInputWordCount] = useState(0);
  const [responseTextWordCount, setResponseTextWordCount] = useState(0);
  const userInputRef = useRef(null);
  const responseTextRef = useRef("");
  const responseTextRectRef = useRef(null);
  const paraTopRef = useRef(0);
  const [userInputHeight, setUserInputHeight] = useState(0);
  const [socketResponses, setSocketResponses] = useState([]);

  // onDidMount so any initial conditions can be established before updates arrive
  onDidMount();

  // Each time this component is mounted then we reset the task state
  useEffect(() => {
    // This can write over the update
    task.state.current = "start";
    task.state.done = false;
  }, []);

  // This is asynchronous to the rendering so there may be conflicts where
  // state is updated during rendering and this impacts the parent
  // Probably needs to be moved outside of the component maybe into Redux
  useEffect(() => {
    const processResponses = () => {
      setSocketResponses((prevResponses) => {
        for (const response of prevResponses) {
          const text = response.partial.text;
          const mode = response.partial.mode;
          switch (mode) {
            case 'delta':
              responseTextRef.current += text;
              break;
            case 'partial':
            case 'final':
              responseTextRef.current = text;
              setResponseText(text);
              break;
          }
        }
        //console.log(`${componentName} processResponses responseTextRef.current:`, responseTextRef.current);
        setResponseText(responseTextRef.current);
        return []; // Clear the processed responses
      });
    };
    if (socketResponses.length > 0) {
      processResponses();
    }
  }, [socketResponses]);

  // I guess the websocket can cause events during rendering
  // Putting this in the HoC causes a warning about setting state during rendering
  usePartialWSFilter(task,
    (partialTask) => {
      //console.log(`${componentName} usePartialWSFilter partialTask`, partialTask.response);
      setSocketResponses((prevResponses) => [...prevResponses, partialTask.response]);
    }
  )

  // Task state machine
  // Unique for each component that requires steps
  useEffect(() => {
    if (!props.checkIfStateReady()) {return}
    const nextConfigState = task?.config?.nextStates?.[task.state.current]
    let nextState;
    if (transition()) { log(`${componentName} State Machine State ${task.state.current} nextConfigState ${nextConfigState}`) }
    switch (task.state.current) {
      case "start":
        nextState = nextConfigState;
        break;
      case "display":
        setResponseText(task.config.local.display);
        break;
      case "response":
        // Don't fetch if we already have the output
        if (task.output?.LLMtext) {
          setResponseText(task.output.LLMtext);
          nextState = "received";
        } else if (transition()) {
          modifyTask({ "command": "update" });
        } 
      case "receiving":
        // NodeJS should be streaming the response
        // When it has finished it will set the state to received
        break;
      case "received":
        nextState = nextConfigState;
        setResponseText(task.output.LLMtext);
        if (nextConfigState === "input") {
          setShowUserInput(true);
        }
        break;
      case "input":
        // Show any previous input stored
        if (task.output?.userInput && !userInput) {
          setUserInput(task.output.userInput);
        }
        break;
      case "exit":
        if (transitionFrom("input")) {
          modifyTask({ "command": "update", "output.userInput": userInput });
        } else {
          nextState = "stop"
        }
        break;
      case "wait":
        // If not collecting input we are in the wait state before exiting
        break;
      case "stop":
        if (transition()) {
          modifyTask({ "state.done": true });
        }
        break;
      default:
        console.log("ERROR unknown state : ", task.state.current);
    }
    // Manage state.current and state.last
    props.modifyState(nextState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);

  useEffect(() => {
    //console.log("task", task);
  }, [task]);

  // Adjust userInput input area size when input grows
  useEffect(() => {
    if (userInputRef.current) {
      setUserInputHeight(userInputRef.current.scrollHeight);
    }
    // filter removes empty entry
    const words = userInput.trim().split(/\s+/).filter(Boolean);
    setUserInputWordCount(words.length);
  }, [userInput, responseText]);

  useEffect(() => {
    const rect = responseTextRectRef.current?.getBoundingClientRect()
    // Avoid decreasing so it does not jitter
    if (rect?.top >= paraTopRef.current && rect.height > 100) {
      paraTopRef.current = rect.top;
    }
    // filter removes empty entry
    const words = responseText.trim().split(/\s+/).filter(Boolean);
    setResponseTextWordCount(words.length);
  }, [responseText]);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {props.task.config?.local?.instruction ? (
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
            {props.task.config.local.instruction}
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
              maxHeight: `max(calc(100vh - ${userInputHeight + paraTopRef.current + 120}px), 200px)`,
              textAlign: "justify",
              padding: "16px",
            }}
            ref={responseTextRectRef}
          >
            {responseText.split("\\n").map((line, index) => (
              <Typography 
                style={{ marginTop: "16px" }} 
                key={index}
                className="text2html"
                dangerouslySetInnerHTML={{ __html: utils.replaceNewlinesWithParagraphs(line) }}
              />
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
            placeholder={props.task.config?.local?.inputLabel}
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

export default withTask(TaskLLMIO);
