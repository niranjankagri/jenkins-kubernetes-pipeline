// Declarative pipeline: check, build, deploy to Kubernetes, test the deployment, report.
// The work is done by the scripts in scripts/ (also used by GitHub Actions); this file orchestrates them.

// Each stage records its JUnit report once and keeps the summary here; the quality gate adds them up.
// (Recording the same reports again in the gate would count every test twice in Jenkins.)
def testSummaries = [:]

pipeline {
  agent any

  options {
    timestamps()
    timeout(time: 30, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '20'))
    // One run at a time: runs share the kind cluster.
    disableConcurrentBuilds()
  }

  parameters {
    choice(name: 'TEST_SUITE', choices: ['all', 'smoke'], description: 'API tests to run after the deployment')
    booleanParam(name: 'KEEP_NAMESPACE', defaultValue: false, description: 'Keep the deployment for debugging')
  }

  environment {
    IMAGE = "room-booking:build-${env.BUILD_NUMBER}"
    NAMESPACE = "qa-${env.BUILD_NUMBER}"
    KIND_CLUSTER = 'qa'
    KUBECONFIG = "${env.WORKSPACE}/.kube/config"
    PYTHON = "${env.WORKSPACE}/tests/.venv/bin/python"
  }

  stages {
    stage('Checks') {
      // Independent checks run side by side.
      parallel {
        stage('Unit tests') {
          steps {
            dir('service') {
              // Node's JUnit reporter does not create the folder itself.
              sh 'mkdir -p reports && node --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=reports/unit-tests.xml "test/*.test.ts"'
            }
          }
          post {
            always {
              script { testSummaries.unit = junit 'service/reports/unit-tests.xml' }
            }
          }
        }
        stage('Lint tests') {
          steps {
            sh 'scripts/python-env.sh'
            dir('tests') {
              sh '.venv/bin/ruff check . && .venv/bin/ruff format --check .'
            }
          }
        }
      }
    }

    stage('Build image') {
      steps {
        sh 'docker build -t "$IMAGE" service'
      }
    }

    stage('Kubernetes cluster') {
      steps {
        sh 'scripts/kind-up.sh'
        // The cluster cannot pull from this machine's Docker: load the image into its nodes.
        sh 'kind load docker-image "$IMAGE" --name "$KIND_CLUSTER"'
      }
    }

    stage('Deploy') {
      steps {
        sh "scripts/deploy.sh \"\$NAMESPACE\" \"\$IMAGE\" \"\$BUILD_NUMBER\" \"${env.GIT_COMMIT?.take(7) ?: 'unknown'}\""
      }
    }

    stage('In-cluster smoke') {
      steps {
        sh 'scripts/smoke-job.sh "$NAMESPACE" "$BUILD_NUMBER"'
      }
    }

    stage('API tests') {
      parallel {
        stage('Smoke') {
          steps {
            sh 'scripts/api-tests.sh "$NAMESPACE" "$BUILD_NUMBER" smoke 18081'
          }
        }
        stage('Regression') {
          when { expression { params.TEST_SUITE == 'all' } }
          steps {
            sh 'scripts/api-tests.sh "$NAMESPACE" "$BUILD_NUMBER" regression 18082'
          }
        }
      }
      post {
        always {
          script { testSummaries.api = junit allowEmptyResults: true, testResults: 'tests/reports/*.xml' }
        }
      }
    }

    stage('Quality gate') {
      steps {
        script {
          def total = testSummaries.values().sum { it.totalCount }
          def failed = testSummaries.values().sum { it.failCount }
          def skipped = testSummaries.values().sum { it.skipCount }
          def minimum = params.TEST_SUITE == 'all' ? 20 : 6
          echo "Tests: ${total} run, ${failed} failed, ${skipped} skipped"
          if (failed > 0) {
            error("Quality gate: ${failed} test(s) failed")
          }
          // A suite that silently ran (almost) nothing must not pass.
          if (total < minimum) {
            error("Quality gate: only ${total} tests ran, expected at least ${minimum}")
          }
        }
      }
    }
  }

  post {
    always {
      publishHTML(target: [reportName: 'API tests: smoke', reportDir: 'tests/reports', reportFiles: 'smoke.html',
                           allowMissing: true, alwaysLinkToLastBuild: true, keepAll: true])
      publishHTML(target: [reportName: 'API tests: regression', reportDir: 'tests/reports',
                           reportFiles: 'regression.html', allowMissing: true, alwaysLinkToLastBuild: true,
                           keepAll: true])
      archiveArtifacts artifacts: 'service/reports/**, tests/reports/**, tests/*.log', allowEmptyArchive: true
      script {
        if (!params.KEEP_NAMESPACE) {
          sh 'scripts/teardown.sh "$NAMESPACE" || true'
        }
      }
    }
    success {
      // A real setup would post to chat or a dashboard; the token shows how secrets reach a step (masked in the log).
      withCredentials([string(credentialsId: 'notify-token', variable: 'NOTIFY_TOKEN')]) {
        sh 'echo "Notify: build $BUILD_NUMBER passed (token ${#NOTIFY_TOKEN} characters, value masked)"'
      }
    }
    failure {
      echo "Build ${env.BUILD_NUMBER} failed: see the stage that failed and the archived reports."
    }
    cleanup {
      // Old test reports must never be counted by the next build's quality gate.
      sh 'rm -rf service/reports tests/reports'
    }
  }
}
