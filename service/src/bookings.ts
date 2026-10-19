// Meeting rooms and bookings, with every rule of the API. No HTTP here, so the rules are unit-tested directly.
import { randomUUID } from 'node:crypto';

export interface Room {
  id: string;
  name: string;
  capacity: number;
}

export interface Booking {
  id: string;
  roomId: string;
  title: string;
  /** ISO-8601 date-time in UTC, e.g. 2030-05-20T09:00:00.000Z */
  start: string;
  end: string;
  attendees: number;
}

/** A broken rule in the client's input: HTTP 400 (with the field), 404 or 409. */
export class BookingError extends Error {
  readonly status: number;
  readonly field: string | undefined;

  /** status is the HTTP status the server answers with; field names the input that broke the rule. */
  constructor(status: number, message: string, field?: string) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

export const ROOMS: readonly Room[] = [
  { id: 'atlas', name: 'Atlas', capacity: 4 },
  { id: 'borealis', name: 'Borealis', capacity: 8 },
  { id: 'cosmos', name: 'Cosmos', capacity: 20 },
];

const MAX_HOURS = 8;
const FIELDS = ['roomId', 'title', 'start', 'end', 'attendees'];

/** Parses an ISO-8601 date-time with a time zone; anything else is a 400 on that field. */
function parseTime(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new BookingError(400, `${field} must be an ISO-8601 date-time with a time zone`, field);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BookingError(400, `${field} is not a real date`, field);
  return date;
}

/**
 * Creates an empty in-memory store with the three rooms. Bookings live only as long as the process: every
 * deployment starts empty, which is why the API tests use a day of their own.
 */
export function createStore() {
  let bookings: Booking[] = [];

  return {
    rooms: (): readonly Room[] => ROOMS,

    /** Bookings, optionally of one room and/or one UTC day (YYYY-MM-DD), sorted by start. */
    list(roomId?: string, day?: string): Booking[] {
      if (day !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        throw new BookingError(400, 'date must be YYYY-MM-DD', 'date');
      }
      return bookings
        .filter((b) => roomId === undefined || b.roomId === roomId)
        .filter((b) => day === undefined || b.start.startsWith(day))
        .sort((a, b) => a.start.localeCompare(b.start));
    },

    /** Validates and stores a booking. Throws BookingError (400, 404 or 409). */
    create(input: unknown): Booking {
      if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        throw new BookingError(400, 'Body must be a JSON object');
      }
      const body = input as Record<string, unknown>;
      const unknown = Object.keys(body).find((key) => !FIELDS.includes(key));
      if (unknown) throw new BookingError(400, `Unknown field: ${unknown}`, unknown);

      const room = ROOMS.find((r) => r.id === body.roomId);
      if (!room) throw new BookingError(404, `Room ${String(body.roomId)} not found`, 'roomId');

      if (typeof body.title !== 'string' || body.title.trim().length < 3 || body.title.trim().length > 60) {
        throw new BookingError(400, 'title must be 3-60 characters', 'title');
      }
      const start = parseTime(body.start, 'start');
      const end = parseTime(body.end, 'end');
      if (end <= start) throw new BookingError(400, 'end must be after start', 'end');
      if (end.getTime() - start.getTime() > MAX_HOURS * 3_600_000) {
        throw new BookingError(400, `A booking can last at most ${MAX_HOURS} hours`, 'end');
      }
      if (!Number.isInteger(body.attendees) || (body.attendees as number) < 1) {
        throw new BookingError(400, 'attendees must be a whole number of at least 1', 'attendees');
      }
      if ((body.attendees as number) > room.capacity) {
        throw new BookingError(400, `${room.name} holds at most ${room.capacity} people`, 'attendees');
      }

      // Two bookings overlap when each starts before the other ends; back-to-back (end == start) is fine.
      const clash = bookings.find(
        (b) => b.roomId === room.id && new Date(b.start) < end && start < new Date(b.end),
      );
      if (clash) throw new BookingError(409, `${room.name} is already booked: "${clash.title}"`);

      const booking: Booking = {
        id: randomUUID(),
        roomId: room.id,
        title: body.title.trim(),
        start: start.toISOString(),
        end: end.toISOString(),
        attendees: body.attendees as number,
      };
      bookings.push(booking);
      return booking;
    },

    /** True when the booking existed and was cancelled. */
    cancel(id: string): boolean {
      const before = bookings.length;
      bookings = bookings.filter((b) => b.id !== id);
      return bookings.length < before;
    },
  };
}

export type Store = ReturnType<typeof createStore>;
