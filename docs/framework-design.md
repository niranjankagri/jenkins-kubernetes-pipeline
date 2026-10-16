# Design

Why the pipeline is built the way it is. The README says what it does and how to run it.

## 1. Goals

1. Show a realistic test pipeline: build, deploy to a real (if small) Kubernetes cluster, test the
   deployment, report, clean up.
2. Keep Jenkins itself reproducible: nothing configured by clicking.
3. Test the pipeline like code: every push starts a real Jenkins in CI and requires a passing build.

## 2. Jenkins as code

| Piece | File | Role |
|---|---|---|
| Image | `jenkins/Dockerfile` | official LTS image + tools (docker CLI, kind, kubectl, Node, Python) + plugins |
| Plugins | `jenkins/plugins.txt` | installed by `jenkins-plugin-cli` at image build time, with dependencies |
| Configuration | `jenkins/casc.yaml` | JCasC: executors, users and permissions, URL, credentials, the job |
| Job | Job DSL inside `casc.yaml` | a pipeline job reading `Jenkinsfile` from the mounted repository |
| Runtime | `jenkins/docker-compose.yml` | port, environment, Docker socket, repository mount, health check |

Consequences: a new Jenkins with the same setup is one `docker compose up`; configuration changes go through
review like code; the setup wizard is switched off because nothing is left to set up.

Secrets come from the environment (`JENKINS_ADMIN_PASSWORD`, `NOTIFY_TOKEN`), never from the files; JCasC
substitutes `${...}` at start-up.

## 3. The Jenkinsfile

- **Declarative** syntax: structure Jenkins understands (stages, parallel, post, options) and can validate before
  running; `script {}` only where logic is needed (the quality gate).
- **Parallel** where steps are independent: unit tests and lint; API smoke and regression.
- **Options**: timestamps, a 30-minute timeout, log rotation, no concurrent builds (one shared cluster).
- **Parameters**: the test scope and whether to keep the deployment.
- **Post conditions**: `always` publishes and archives reports and tears down; `success` notifies; `cleanup`
  removes report folders so an old report can never be counted by the next build.
- **Credentials**: `withCredentials` binds a secret to a variable for one step; Jenkins masks it in the log.

## 4. Scripts, not pipeline code

All work is in `scripts/*.sh`: `kind-up`, `deploy`, `smoke-job`, `api-tests`, `teardown`, `python-env`. The
Jenkinsfile calls them, GitHub Actions calls them too. Benefits: the logic can be run and debugged by hand, CI
proves it without Jenkins, and the Jenkinsfile stays readable.

## 5. Kubernetes

- **kind** runs Kubernetes nodes as Docker containers: a real API server, scheduler and kubelet, enough to test
  manifests, probes and rollouts.
- The controller is itself a container using the host's Docker. `kind-up.sh` therefore joins Docker's `kind`
  network and uses the cluster's **internal** address; outside a container it uses the normal kubeconfig.
- Images are **loaded** into the cluster (`kind load docker-image`, `imagePullPolicy: Never`) instead of pushed to
  a registry.
- **Namespace per build** (`qa-<n>`): builds never see each other's objects; teardown is one delete.
- **Probes**: readiness gates traffic and the rollout (`kubectl rollout status`); liveness restarts a hung
  container. On a failed rollout the script prints pods and events.
- **Two levels of deployment test**: the smoke **Job** runs inside the cluster through the Service's DNS name;
  the pytest suites run outside through `kubectl port-forward`.
- The service handles **SIGTERM**, which Kubernetes sends before stopping a pod.

## 6. Tests and the quality gate

- 4 unit tests (fast feedback before any build), 3 smoke and 14 regression API tests against the deployment.
- Each API test books on its own random future day, so tests are independent without resetting the service.
- `/version` returns the build number from the Deployment; a smoke test compares it with the build, so a stale
  pod or a wrong image cannot pass.
- The **quality gate** fails on any failed test and when fewer tests ran than expected: a suite that silently
  ran nothing must not look green. It adds up the summaries each stage recorded; recording the files again
  counted every test twice (42 instead of 21) in the first version.

## 7. CI that runs Jenkins

GitHub Actions builds the controller image, starts it with the runner's Docker group, triggers the job through
the REST API (with a CSRF crumb and session cookie) and requires SUCCESS. Findings from making it work:

- git does not fetch from a **shallow** checkout (only a warning: "shallow roots are not allowed to be
  updated"), so the Jenkins job needs a full checkout (`fetch-depth: 0`).
- After its first run, a job with parameters must be started with `buildWithParameters`.
- The Groovy sandbox rejected `Collection.sum()`; the gate uses a plain loop instead of approving methods by hand.

## 8. What a production setup changes

- Agents instead of controller executors, ideally Kubernetes pod agents (the Kubernetes plugin) with one pod per
  build.
- A registry for images, and a real cluster (or several) with RBAC per namespace.
- No Docker socket on the controller (rootless builds: BuildKit/Kaniko in agent pods).
- Pinned plugin versions and a tested upgrade path; a shared library for steps used by many pipelines.
- Notifications to chat, and reports in a dashboard (Allure, a test management tool).
