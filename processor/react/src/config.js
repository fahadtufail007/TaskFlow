/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/

import { appLabel as appLabelDefault, appName, appAbbrev, TASKHUB_URL } from "./shared/config.mjs"

export { appName, appAbbrev }
export const appLabel = process.env.REACT_APP_LABEL || appLabelDefault; 
export const hubUrl = process.env.REACT_APP_TASKHUB_URL || TASKHUB_URL;

const socketProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";

//export const socketUrl = `${socketProtocol}//${window.location.hostname}/nodejs/ws`;
export const socketUrl = 'ws://localhost:5000/nodejs/ws';
export const nodejsUrl = window.location.protocol + "//" + (process.env.REACT_APP_NODEJS_HOST || "localhost:5000") + `/nodejs`;
export const hubSocketUrl = `${socketProtocol}//${window.location.hostname}/hub/ws`;