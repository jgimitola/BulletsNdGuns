#!/bin/sh
# Volumes can arrive owned by root (Railway's always do), but the server runs as the unprivileged
# `node` user. As root, hand the data folder to `node`, then drop to it for the server itself.
set -e
if [ "$(id -u)" = '0' ]; then
  chown -R node:node /data
  exec su-exec node "$@"
fi
exec "$@"
