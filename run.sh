#!/bin/bash

# Set the name for your tmux session
SESSION_NAME="unblink"

# Check if a tmux session with the same name already exists
tmux has-session -t $SESSION_NAME 2>/dev/null

# $? is a special variable that holds the exit code of the last command.
# If the session does not exist, tmux has-session returns a non-zero exit code.
if [ $? != 0 ]; then
  # Create a new detached tmux session and run the command
  tmux new-session -d -s $SESSION_NAME 'NODE_ENV=development bun index.ts'
  echo "Started a new tmux session named '$SESSION_NAME'."
else
  echo "A tmux session named '$SESSION_NAME' is already running."
fi