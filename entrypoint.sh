#!/bin/sh

# This script runs as root to fix permissions,
# then drops privileges to run the main application as the 'bun' user.

# Fix ownership of the volume mount.
# This allows the non-root 'bun' user to write to it.
chown -R bun:bun /data/unblink

# Use 'exec' to replace the shell process with the application process.
# Use 'gosu' to drop from root to the 'bun' user.
# "$@" passes along the CMD from the Dockerfile ("bun", "index.ts").
exec gosu bun "$@"