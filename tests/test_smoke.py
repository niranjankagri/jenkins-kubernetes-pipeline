"""Smoke tests: the deployment answers and runs the build the pipeline just made (also the TEST_SUITE=smoke run)."""

import os

import pytest

pytestmark = pytest.mark.smoke


def test_health(api):
    """The service answers its health check."""
    response = api.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_the_expected_build_is_deployed(api):
    """The running pod reports the build number the pipeline just deployed."""
    # The pipeline passes the build number it deployed; a stale pod or wrong image would fail here.
    expected = os.environ.get("EXPECTED_VERSION")
    if not expected:
        pytest.skip("EXPECTED_VERSION not set (local run)")

    assert api.get("/version").json()["version"] == expected


def test_lists_the_three_rooms(api):
    """The three rooms are there, each with a capacity."""
    rooms = api.get("/rooms").json()["rooms"]

    assert [room["id"] for room in rooms] == ["atlas", "borealis", "cosmos"]
    assert all(room["capacity"] > 0 for room in rooms)
