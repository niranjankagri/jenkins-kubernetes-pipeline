"""Fixtures for the API tests: where the service is, an HTTP session, and a free day for each test."""

import os
import random
from datetime import date, timedelta

import pytest
import requests

# The pipeline points BASE_URL at the deployed service (a kubectl port-forward); locally it is npm start.
BASE_URL = os.environ.get("BASE_URL", "http://localhost:8080").rstrip("/")


class Api:
    """A thin client: every call returns the raw response, so tests can check any status code."""

    def __init__(self, base_url: str) -> None:
        self.base_url = base_url
        self.session = requests.Session()

    def get(self, path: str, **kwargs) -> requests.Response:
        """GET with a 10-second timeout, so a hung service fails the test instead of the build."""
        return self.session.get(f"{self.base_url}{path}", timeout=10, **kwargs)

    def post(self, path: str, **kwargs) -> requests.Response:
        """POST with a 10-second timeout."""
        return self.session.post(f"{self.base_url}{path}", timeout=10, **kwargs)

    def delete(self, path: str) -> requests.Response:
        """DELETE with a 10-second timeout."""
        return self.session.delete(f"{self.base_url}{path}", timeout=10)


@pytest.fixture(scope="session")
def api() -> Api:
    """One client for the whole run, pointed at BASE_URL."""
    return Api(BASE_URL)


@pytest.fixture
def free_day() -> str:
    """A random future day (YYYY-MM-DD). The service keeps every booking in memory, so each test books on a day
    of its own: tests stay independent without resetting the deployment."""
    return (date(2031, 1, 1) + timedelta(days=random.randrange(3650))).isoformat()


@pytest.fixture
def booking(free_day: str):
    """Builds a booking body on the test's own day; keyword arguments override fields."""

    def build(**overrides) -> dict:
        """A valid booking (Atlas, 09:00-10:00 UTC, 3 attendees) with the given fields replaced."""
        body = {
            "roomId": "atlas",
            "title": "Sprint planning",
            "start": f"{free_day}T09:00:00Z",
            "end": f"{free_day}T10:00:00Z",
            "attendees": 3,
        }
        body.update(overrides)
        return body

    return build
