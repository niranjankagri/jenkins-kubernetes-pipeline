#!/usr/bin/env bash
# Creates the kind cluster (Kubernetes in Docker) once and writes a kubeconfig for this machine.
# Later pipeline runs reuse the cluster; each run deploys into a namespace of its own.
#
#   KIND_CLUSTER  cluster name (default: qa)
#   KUBECONFIG    where to write the kubeconfig (default: .kube/config in the current folder)
set -euo pipefail

CLUSTER="${KIND_CLUSTER:-qa}"
KUBECONFIG_FILE="${KUBECONFIG:-$PWD/.kube/config}"

if ! kind get clusters 2>/dev/null | grep -qx "$CLUSTER"; then
  echo "Creating kind cluster '$CLUSTER'"
  kind create cluster --name "$CLUSTER" --wait 120s
else
  echo "Reusing kind cluster '$CLUSTER'"
fi

mkdir -p "$(dirname "$KUBECONFIG_FILE")"
if [ -f /.dockerenv ]; then
  # Running inside a container (the Jenkins controller): the cluster's API server is not on this container's
  # localhost. Join Docker's "kind" network and use the cluster's internal address instead.
  docker network connect kind "$(hostname)" 2>/dev/null || true
  kind get kubeconfig --name "$CLUSTER" --internal > "$KUBECONFIG_FILE"
else
  kind get kubeconfig --name "$CLUSTER" > "$KUBECONFIG_FILE"
fi

KUBECONFIG="$KUBECONFIG_FILE" kubectl get nodes
