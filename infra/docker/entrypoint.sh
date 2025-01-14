#!/bin/bash

screen -S my-session -d -m
screen -S my-session -p 0 -X stuff "cd /app/hub\n"
screen -S my-session -p 0 -X stuff "npm install\n"
screen -S my-session -p 0 -X stuff "npm run debug 2>&1 | tee hub.log\n"

# create a new window within the "my-session" screen
screen -S my-session -X screen bash
screen -S my-session -p 1 -X stuff "cd /app/processor/nodejs\n"
screen -S my-session -p 1 -X stuff "npm install\n"
screen -S my-session -p 1 -X stuff "npm run debug 2>&1 | tee nodejs.log\n"

# create a new window within the "my-session" screen
screen -S my-session -X screen bash
screen -S my-session -p 2 -X stuff "cd /app/processor/rxjs\n"
screen -S my-session -p 2 -X stuff "npm install\n"
screen -S my-session -p 2 -X stuff "npm run debug 2>&1 | tee rxjs.log\n"

# create a new window within the "my-session" screen
screen -S my-session -X screen bash
screen -S my-session -p 3 -X stuff "cd /app/shared\n"
screen -S my-session -p 3 -X stuff "npm install\n"
screen -S my-session -p 3 -X stuff "npm run generate-converter-v02\n"

# create a new window within the "my-session" screen
screen -S my-session -X screen bash
screen -S my-session -p 4 -X stuff "cd /app/processor/react\n"
screen -S my-session -p 4 -X stuff "npm install\n"
screen -S my-session -p 4 -X stuff "npm start 2>&1 | tee react.log\n"

# create a new window within the "my-session" screen
screen -S my-session -X screen bash
screen -S my-session -p 5 -X stuff "cd /app/\n"
screen -S my-session -p 5 -X stuff "npm install\n"

sleep infinity