// Unit tests of the booking rules (node:test). The pipeline writes them as JUnit XML for Jenkins.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BookingError, createStore } from '../src/bookings.ts';

const booking = (overrides: Record<string, unknown> = {}) => ({
  roomId: 'atlas',
  title: 'Sprint planning',
  start: '2030-05-20T09:00:00Z',
  end: '2030-05-20T10:00:00Z',
  attendees: 3,
  ...overrides,
});

/** The status and field of the BookingError thrown by `fn`. */
function failure(fn: () => unknown): { status: number; field?: string } {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof BookingError);
    return { status: error.status, field: error.field };
  }
  assert.fail('expected a BookingError');
}

describe('create', () => {
  it('stores a valid booking with normalised UTC times', () => {
    const store = createStore();
    const created = store.create(booking({ start: '2030-05-20T11:00:00+02:00', end: '2030-05-20T12:00:00+02:00' }));
    assert.equal(created.start, '2030-05-20T09:00:00.000Z');
    assert.equal(store.list().length, 1);
  });

  it('refuses an overlapping booking with 409, but allows back-to-back ones', () => {
    const store = createStore();
    store.create(booking());
    assert.equal(failure(() => store.create(booking({ start: '2030-05-20T09:30:00Z', end: '2030-05-20T10:30:00Z' }))).status, 409);
    assert.doesNotThrow(() => store.create(booking({ start: '2030-05-20T10:00:00Z', end: '2030-05-20T11:00:00Z' })));
    // The same time in another room is fine.
    assert.doesNotThrow(() => store.create(booking({ roomId: 'borealis' })));
  });

  it('checks every field', () => {
    const store = createStore();
    assert.deepEqual(failure(() => store.create(booking({ roomId: 'nowhere' }))), { status: 404, field: 'roomId' });
    assert.equal(failure(() => store.create(booking({ title: 'ab' }))).field, 'title');
    assert.equal(failure(() => store.create(booking({ start: '2030-05-20 09:00' }))).field, 'start');
    assert.equal(failure(() => store.create(booking({ end: '2030-05-20T08:00:00Z' }))).field, 'end');
    assert.equal(failure(() => store.create(booking({ end: '2030-05-20T18:00:00Z' }))).field, 'end');
    assert.equal(failure(() => store.create(booking({ attendees: 5 }))).field, 'attendees');
    assert.equal(failure(() => store.create(booking({ attendees: 0 }))).field, 'attendees');
    assert.equal(failure(() => store.create(booking({ colour: 'red' }))).field, 'colour');
  });
});

describe('list and cancel', () => {
  it('lists by room and day, sorted by start, and cancels', () => {
    const store = createStore();
    const late = store.create(booking({ start: '2030-05-20T15:00:00Z', end: '2030-05-20T16:00:00Z' }));
    store.create(booking());
    store.create(booking({ start: '2030-05-21T09:00:00Z', end: '2030-05-21T10:00:00Z' }));
    assert.deepEqual(
      store.list('atlas', '2030-05-20').map((b) => b.start),
      ['2030-05-20T09:00:00.000Z', '2030-05-20T15:00:00.000Z'],
    );
    assert.equal(store.cancel(late.id), true);
    assert.equal(store.cancel(late.id), false);
    assert.equal(failure(() => store.list(undefined, '20.05.2030')).field, 'date');
  });
});
