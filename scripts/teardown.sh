#!/usr/bin/env bash
# Deletes a pipeline run's namespace (deployment, service, job, pods). The cluster stays for the next run.
#   teardown.sh <namespace>
set -euo pipefail

kubectl delete namespace "$1" --ignore-not-found --wait=false
