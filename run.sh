#!/bin/bash

while true
do
  node index.js
  echo "Slack bot has crashed with exit code $?.  Respawning.." >&2
  sleep 1
done

