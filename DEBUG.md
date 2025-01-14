# Debug Strategies

Following the setup of T@askFlow in a docker container as per [README.md](infra/docker/README.md) it can be difficult to debug issues.

The following assumes you are using VS Code as an IDE. There are several extensions which are of use:
* Dev Containers (run VS Code remotely in a Docker container)
* Remote - SSH (connect to a remote server using SSH and from there we can use Dev Containers to connect to a Docker container)
* SQLite Viewer (view SQLite database files as tables)
* Codeium AI (chat + search + code completion)
* Print (add a print option to VS Code)
* Prettier (code formatting)

From the VS Code command palette, create a terminal tab: Terminal Create new Terminal in Editor Area. 
From the new terminal start screen: `screen -rd`.
There are multiple servers running in the Docker container and each has a window running in the [screen](https://linuxize.com/post/how-to-use-linux-screen/) application.
The node servers (e.g. Hub, RxJS, NodeJS) run in debug mode so breakpoints can be set in VS Code.
The output of each server can be viewed in the screen window (keyboard shortcuts allow navigating beween screens e.g. `Ctrl-a X` where X is the number of the terminal e.g. `Ctrl-a 1`).
The output of the servers are also split into files and these can be opened in VS Code (which will update the contents in real-time and allows for searching).
Open the logs:
* /app/hub/hub.log
* /app/processor/rxjs/rxjs.log
* /app/processor/nodejs/nodejs.log
The `/app/shared` directory is soft linked from `/app/hub/src/shared`, `/app/processor/nodejs/src/shared`, `/app/processor/react/src/shared`, `/app/processor/rxjs/src/shared`. In that directory we have the JSON schema for the Task object, `utils.mjs`, and XState finite state machine definitions in `/app/shared/fsm`.
The React procssor runs in a web browser (perference for Firefox).
From the Javascript console in Web Developer tools the current Task objects can be read in the variable `window.tasks`.
The NodeJS processor can use a dummy API (to reduce the risk of wasting money on OpenAI API calls), set `DUMMY_OPENAI=true` in `/app/processor/nodejs/.env`.
The System > Log Task provides insights into the sequence of task messages that have gone through coprocessing on the Task Hub.

## Tips

### Firefox

* Regular expressions in "Filter Output" of Javascript console: wrap your regex pattern in forward slashes (/).
* React Dev Tools
