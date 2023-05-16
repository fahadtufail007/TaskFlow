/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/

import React, { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import "./styles/App.css";
import "./styles/normal.css";
import Taskflows from "./components/Taskflows";
import { useGeolocation } from "./useGeolocation";
import { useGlobalStateContext } from "./contexts/GlobalStateContext";
import { useWebSocketContext } from "./contexts/WebSocketContext";
import { taskhubUrl } from "./config";
import debug from "debug";

function App() {
  const [enableGeolocation, setEnableGeolocation] = useState(false);
  const { address } = useGeolocation(enableGeolocation);
  const { globalState, mergeGlobalState, replaceGlobalState } =
    useGlobalStateContext();
  const { sendJsonMessagePlus } = useWebSocketContext();

  //debug.disable();
  // This gives us a central place to control debug
  // We can enable per component
  //debug.enable(`${appAbbrev}:TaskChat*`);
  //debug.enable(`${appAbbrev}:TaskConversation*`);
  debug.enable(`*`);
  
  // Address is sent via utils/fetchTask.js
  useEffect(() => {
    if (globalState?.use_address && !enableGeolocation) {
      setEnableGeolocation(true);
      console.log("Enabling use of address");
    }
  }, [globalState, enableGeolocation]);

  useEffect(() => {
    if (enableGeolocation && address && globalState?.address !== address) {
      replaceGlobalState("address", address);
    }
  }, [address, enableGeolocation]);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const response = await fetch(`${taskhubUrl}/api/session`, {
          credentials: "include",
        });
        const data = await response.json();
        const user = data.user;
        mergeGlobalState({ user });
        console.log("Set user: ", user);
        if (!globalState?.sessionId) {
          const sessionId = data.sessionId;
          mergeGlobalState({ sessionId });
          sendJsonMessagePlus({"sessionId" : sessionId})
          console.log("Set sessionId ", sessionId);
        }
        // Should have a separate API
        if (data?.taskflowsTree) {
          const taskflowsTree = data.taskflowsTree;
          mergeGlobalState({ taskflowsTree });
        }
      } catch (err) {
        console.log(err.message);
      }
    };
    fetchSession();
  }, []);

  return (
    <Routes>
      <Route exact path="/" element={<Taskflows />} />
    </Routes>
  );
}

export default App;