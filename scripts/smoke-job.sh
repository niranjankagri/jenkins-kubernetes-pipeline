#!/usr/bin/env bash
# Runs the in-cluster smoke Job and fails if it does not complete.
#   smoke-job.sh <namespace> <version>
set -euo pipefail

NAMESPACE="$1"
VERSION="$2"
cd "$(dirname "$0")/.."

kubectl delete job smoke -n "$NAMESPACE" --ignore-not-found
sed -e "s|__VERSION__|$VERSION|g" k8s/smoke-job.yaml | kubectl apply -n "$NAMESPACE" -f -

# Waits for completion; a failed Job never completes, so failure shows at the timeout. Logs are shown either way.
if kubectl wait job/smoke -n "$NAMESPACE" --for=condition=complete --timeout=90s; then
  kubectl logs job/smoke -n "$NAMESPACE"
else
  echo "Smoke job did not complete:"
  kubectl logs job/smoke -n "$NAMESPACE" || true
  kubectl describe job/smoke -n "$NAMESPACE" | tail -15
  exit 1
fi
