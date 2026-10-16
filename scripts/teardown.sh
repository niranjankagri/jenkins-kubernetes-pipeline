#!/usr/bin/env bash
# Deletes a pipeline run's namespace (deployment, service, job, pods). The cluster stays for the next run.
#   teardown.sh <namespace>
set -euo pipefail

# No kubeconfig means the run stopped before the cluster stage: nothing to delete. (Without this check kubectl
# falls back to localhost:8080, which inside the Jenkins container is Jenkins itself.)
if [ ! -f "${KUBECONFIG:-$HOME/.kube/config}" ]; then
  echo "No kubeconfig: nothing to tear down"
  exit 0
fi
kubectl delete namespace "$1" --ignore-not-found --wait=false
