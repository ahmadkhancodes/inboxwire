#!/bin/sh
# Checks the licence offline, prints the result, then starts the command. An unlicensed or lapsed instance still starts
# (Developer plan limits, see the banner in the dashboard); it never phones home.
set -u
if [ -n "${INBOXWIRE_LICENCE:-}" ]; then
  node scripts/verify-licence.mjs || true
else
  echo "licence: none set, running with Developer plan limits (set INBOXWIRE_LICENCE to unlock Self-host)"
fi
exec "$@"
