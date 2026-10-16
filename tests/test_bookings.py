"""Regression tests of the booking API: create, list, cancel, conflicts and validation."""

import pytest

pytestmark = pytest.mark.regression


def test_creates_a_booking_and_lists_it(api, booking, free_day):
    created = api.post("/bookings", json=booking())

    assert created.status_code == 201
    body = created.json()
    assert body["start"] == f"{free_day}T09:00:00.000Z"
    listed = api.get("/bookings", params={"roomId": "atlas", "date": free_day}).json()["bookings"]
    assert [b["id"] for b in listed] == [body["id"]]


def test_normalises_time_zones_to_utc(api, booking, free_day):
    body = api.post(
        "/bookings", json=booking(start=f"{free_day}T11:00:00+02:00", end=f"{free_day}T12:00:00+02:00")
    )

    assert body.json()["start"] == f"{free_day}T09:00:00.000Z"


def test_refuses_an_overlapping_booking_with_409(api, booking, free_day):
    api.post("/bookings", json=booking(title="Original"))

    clash = api.post("/bookings", json=booking(start=f"{free_day}T09:30:00Z", end=f"{free_day}T10:30:00Z"))

    assert clash.status_code == 409
    assert "Original" in clash.json()["error"]


def test_allows_back_to_back_bookings_and_other_rooms(api, booking, free_day):
    assert api.post("/bookings", json=booking()).status_code == 201

    after = api.post("/bookings", json=booking(start=f"{free_day}T10:00:00Z", end=f"{free_day}T11:00:00Z"))
    other_room = api.post("/bookings", json=booking(roomId="borealis"))

    assert after.status_code == 201
    assert other_room.status_code == 201


def test_cancels_a_booking_once(api, booking, free_day):
    booking_id = api.post("/bookings", json=booking()).json()["id"]

    assert api.delete(f"/bookings/{booking_id}").status_code == 204
    assert api.delete(f"/bookings/{booking_id}").status_code == 404
    assert api.get("/bookings", params={"date": free_day}).json()["bookings"] == []


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"title": "ab"}, "title"),
        ({"start": "tomorrow at nine"}, "start"),
        ({"end": "2030-01-01 10:00"}, "end"),
        ({"attendees": 0}, "attendees"),
        ({"attendees": 5}, "attendees"),  # Atlas holds 4
        ({"colour": "red"}, "colour"),
    ],
    ids=["short-title", "start-not-iso", "end-no-zone", "no-attendees", "over-capacity", "unknown-field"],
)
def test_refuses_invalid_bookings_with_the_field(api, booking, overrides, field):
    response = api.post("/bookings", json=booking(**overrides))

    assert response.status_code == 400
    assert response.json()["field"] == field


def test_refuses_end_before_start_and_too_long_bookings(api, booking, free_day):
    backwards = api.post("/bookings", json=booking(end=f"{free_day}T08:00:00Z"))
    all_day = api.post("/bookings", json=booking(end=f"{free_day}T18:00:00Z"))

    assert (backwards.status_code, backwards.json()["field"]) == (400, "end")
    assert (all_day.status_code, all_day.json()["field"]) == (400, "end")


def test_answers_404_for_an_unknown_room(api, booking):
    response = api.post("/bookings", json=booking(roomId="nowhere"))

    assert response.status_code == 404
    assert response.json() == {"error": "Room nowhere not found", "field": "roomId"}


def test_answers_400_for_a_body_that_is_not_json(api):
    response = api.post("/bookings", data="{not json", headers={"Content-Type": "application/json"})

    assert response.status_code == 400
