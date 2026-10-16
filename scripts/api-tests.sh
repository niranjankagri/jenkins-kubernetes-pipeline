#!/usr/bin/env bash
# Runs the pytest API tests against the deployment in a namespace, through kubectl port-forward.
#   api-tests.sh <namespace> <expected version> <marker: smoke | regression> <local port>
# Writes tests/reports/<marker>.xml (JUnit) and tests/reports/<marker>.html.
set -euo pipefail

NAMESPACE="$1"
VERSION="$2"
MARKER="$3"
PORT="$4"
cd "$(dirname "$0")/../tests"

# Forward a local port to the Service; stop the forward however the script ends.
kubectl port-forward -n "$NAMESPACE" service/room-booking "$PORT:8080" > "port-forward-$MARKER.log" 2>&1 &
FORWARD_PID=$!
trap 'kill $FORWARD_PID 2>/dev/null || true' EXIT

for _ in $(seq 1 30); do
  curl -sf "http://127.0.0.1:$PORT/health" > /dev/null && break
  sleep 1
done

mkdir -p reports
BASE_URL="http://127.0.0.1:$PORT" EXPECTED_VERSION="$VERSION" \
  "${PYTHON:-python3}" -m pytest -m "$MARKER" \
  --junitxml="reports/$MARKER.xml" -o junit_suite_name="api-$MARKER" \
  --html="reports/$MARKER.html" --self-contained-html
