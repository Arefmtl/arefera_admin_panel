#!/bin/bash
# Start the scheduler mini-service in the background
cd "$(dirname "$0")"
exec bun index.ts >> service.log 2>&1
