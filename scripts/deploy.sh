#!/usr/bin/env bash
# Deploys room-booking into a namespace and waits until the rollout is complete.
#   deploy.sh <namespace> <image> <version> <commit>
# The image must already be in the cluster (kind load docker-image).
set -euo pipefail

NAMESPACE="$1"
IMAGE="$2"
VERSION="$3"
COMMIT="$4"
cd "$(dirname "$0")/.."

kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

sed -e "s|__IMAGE__|$IMAGE|" -e "s|__VERSION__|$VERSION|" -e "s|__COMMIT__|$COMMIT|" k8s/deployment.yaml \
  | kubectl apply -n "$NAMESPACE" -f -
kubectl apply -n "$NAMESPACE" -f k8s/service.yaml

# Waits until both pods of the new version are ready (readiness probe on /health). Fails after 2 minutes.
if ! kubectl rollout status deployment/room-booking -n "$NAMESPACE" --timeout=120s; then
  echo "Rollout failed. Pods and recent events:"
  kubectl get pods -n "$NAMESPACE" -o wide
  kubectl get events -n "$NAMESPACE" --sort-by=.lastTimestamp | tail -20
  exit 1
fi
kubectl get pods -n "$NAMESPACE" -o wide
