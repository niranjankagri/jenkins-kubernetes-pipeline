#!/usr/bin/env bash
# Starts the pipeline job through Jenkins' REST API, waits for the result, prints the console log and exits
# with 0 only for SUCCESS. Used by CI (a real Jenkins in GitHub Actions) and for local runs.
#
#   JENKINS_URL             default http://localhost:8088
#   JENKINS_USER            default admin
#   JENKINS_ADMIN_PASSWORD  default admin
#   JOB                     default room-booking-pipeline
set -euo pipefail

URL="${JENKINS_URL:-http://localhost:8088}"
AUTH="${JENKINS_USER:-admin}:${JENKINS_ADMIN_PASSWORD:-admin}"
JOB="${JOB:-room-booking-pipeline}"
COOKIES="$(mktemp)"
trap 'rm -f "$COOKIES"' EXIT

json() { python3 -c "import json,sys; print(json.load(sys.stdin)$1)"; }

# Jenkins' CSRF protection: a crumb, valid together with the session cookie it was issued with.
crumb_json="$(curl -fsS -u "$AUTH" -c "$COOKIES" "$URL/crumbIssuer/api/json")"
CRUMB_FIELD="$(echo "$crumb_json" | json "['crumbRequestField']")"
CRUMB="$(echo "$crumb_json" | json "['crumb']")"

next="$(curl -fsS -u "$AUTH" "$URL/job/$JOB/api/json" | json "['nextBuildNumber']")"
echo "Starting $JOB #$next"
# A job that knows its parameters (after its first run) must be started with buildWithParameters (defaults
# used); before that, only /build works.
curl -fsS -u "$AUTH" -b "$COOKIES" -H "$CRUMB_FIELD: $CRUMB" -X POST "$URL/job/$JOB/buildWithParameters" > /dev/null \
  || curl -fsS -u "$AUTH" -b "$COOKIES" -H "$CRUMB_FIELD: $CRUMB" -X POST "$URL/job/$JOB/build" > /dev/null

# Wait until the build exists and has finished (the job's own timeout is 30 minutes).
for _ in $(seq 1 360); do
  result="$(curl -fsS -u "$AUTH" "$URL/job/$JOB/$next/api/json" 2>/dev/null | json "['result']" 2>/dev/null || true)"
  if [ -n "$result" ] && [ "$result" != "None" ]; then break; fi
  sleep 5
done

curl -fsS -u "$AUTH" "$URL/job/$JOB/$next/consoleText" > "jenkins-build-$next.log" || true
cat "jenkins-build-$next.log"
echo
echo "Result of $JOB #$next: ${result:-unknown}"
[ "$result" = "SUCCESS" ]
