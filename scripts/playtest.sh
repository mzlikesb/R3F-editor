#!/usr/bin/env bash
# Persona playtest runner entry point. All logic lives in playtest.mjs.
exec node "$(dirname "$0")/playtest.mjs" "$@"
