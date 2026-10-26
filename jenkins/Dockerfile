# Jenkins controller for the demo: the official LTS image plus the tools the pipeline needs, and every plugin
# pre-installed. Configured entirely as code (casc.yaml): no setup wizard, no clicking.
#
# Tools: docker CLI (talks to the host's Docker through the mounted socket), kind + kubectl (Kubernetes),
# Node 24 (the service's unit tests), Python 3 (the API tests).
FROM docker:29.9.2-cli AS docker-cli
FROM node:26-trixie-slim AS node

FROM jenkins/jenkins:2.580.1-lts-jdk21

USER root

ARG KIND_VERSION=v0.33.0
ARG KUBECTL_VERSION=v1.37.1

# Static binaries copied from the official images: no extra package repositories needed.
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-buildx /usr/local/libexec/docker/cli-plugins/docker-buildx
COPY --from=node /usr/local/bin/node /usr/local/bin/node

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv \
 && rm -rf /var/lib/apt/lists/* \
 # kind and kubectl, checked against their published SHA-256 sums.
 && curl -fsSLo /usr/local/bin/kind "https://github.com/kubernetes-sigs/kind/releases/download/${KIND_VERSION}/kind-linux-amd64" \
 && echo "$(curl -fsSL "https://github.com/kubernetes-sigs/kind/releases/download/${KIND_VERSION}/kind-linux-amd64.sha256sum" | cut -d' ' -f1)  /usr/local/bin/kind" | sha256sum -c - \
 && curl -fsSLo /usr/local/bin/kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" \
 && echo "$(curl -fsSL "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl.sha256")  /usr/local/bin/kubectl" | sha256sum -c - \
 && chmod +x /usr/local/bin/kind /usr/local/bin/kubectl \
 # The repository is mounted read-only from the host (another owner): let git use it.
 && git config --system --add safe.directory '*'

USER jenkins

# Plugins, resolved with their dependencies at build time.
COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt

# Jenkins Configuration as Code reads this file at start-up.
COPY casc.yaml /var/jenkins_conf/casc.yaml
ENV CASC_JENKINS_CONFIG=/var/jenkins_conf/casc.yaml
