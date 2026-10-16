#!/usr/bin/env bash
# Creates tests/.venv once and installs the API test requirements (pip skips what is already installed).
# Prints nothing but errors and the final line, to keep the build log readable.
set -euo pipefail
cd "$(dirname "$0")/../tests"

[ -x .venv/bin/python ] || python3 -m venv .venv
.venv/bin/python -m pip install --quiet --disable-pip-version-check -r requirements.txt
echo "Python test environment ready: $(.venv/bin/python -m pytest --version)"
