#!/bin/sh

node ./src/lightclient.js &

node ./src/start.js &

wait