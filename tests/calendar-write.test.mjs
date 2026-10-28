import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { validDate, validTime, validEventIdentity } from '../src/lib/calendar/validation.ts';
import { eventRange, eventDate } from '../src/lib/calendar/types.ts';

const source = (await readFile(new URL('../src/lib/calendar/write.ts', import.meta.url), 'utf8'))
  .replace('import "server-only";', '')
  .replace('@/lib/calendar/colors', new URL('../src/lib/calendar/colors.ts', import.meta.url).href)
  .replace('@/lib/result', new URL('../src/lib/result.ts', import.meta.url).href);
const api = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
const draft = { calendarId: 'team@example.com', title: 'Fixture', allDay: true, startDate: '2026-12-31', endDate: '2026-12-31' };

test('strict dates, times and concurrency identities reject malformed input', () => {
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(validDate('2028-02-29'), true);
  assert.equal(validTime('24:00'), false);
  assert.equal(validTime('23:59'), true);
  assert.equal(validEventIdentity('event_20261028T000000Z', '"version1"'), true);
  assert.equal(validEventIdentity('../events', '"version1"'), false);
  assert.equal(validEventIdentity('event', '*'), false);
});

test('Google exclusive all-day end and Seoul dates retain local day', () => {
  assert.deepEqual(eventRange({ ...draft, start: '2026-12-31', end: '2027-01-01', source: 'google' }), { start: '2026-12-31', end: '2026-12-31' });
  assert.equal(eventDate('2026-10-27T16:00:00Z'), '2026-10-28');
});

test('mock Google create, edit, delete preserve calendar and ETag semantics', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return new Response(null, { status: 204 }); };
  try {
    assert.equal((await api.createGoogleEvent(draft, 'fixture')).ok, true);
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(JSON.parse(calls[0].options.body).end.date, '2027-01-01');
    await api.createGoogleEvent({ ...draft, allDay: false, startTime: '09:00', endTime: '10:00' }, 'fixture', { eventId: 'instance_20261231', etag: '"v1"' });
    assert.equal(calls[1].options.method, 'PATCH');
    assert.equal(calls[1].options.headers['If-Match'], '"v1"');
    const body = JSON.parse(calls[1].options.body);
    assert.equal(body.start.timeZone, 'Asia/Seoul');
    assert.equal('attendees' in body, false);
    assert.equal('recurrence' in body, false);
    await api.deleteGoogleEvent(draft.calendarId, 'instance_20261231', '"v1"', 'fixture');
    assert.equal(calls[2].options.method, 'DELETE');
    assert.equal(calls[2].options.headers['If-Match'], '"v1"');
    assert.match(calls[2].url, /team%40example.com\/events\/instance_20261231$/);
    globalThis.fetch = async () => new Response(null, { status: 412 });
    assert.equal((await api.createGoogleEvent(draft, 'fixture', { eventId: 'instance', etag: '"old"' })).ok, false);
    assert.equal((await api.deleteGoogleEvent(draft.calendarId, 'instance', '"old"', 'fixture')).ok, false);
  } finally { globalThis.fetch = original; }
});

const actionSource = (await readFile(new URL('../src/app/calendar-actions.ts', import.meta.url), 'utf8'))
  .replace('import { refresh } from "next/cache";', 'const refresh = () => {};')
  .replace('import { auth } from "@/lib/auth";', 'const auth = async () => globalThis.calendarFixture.session;')
  .replace('import { getWritableCalendars } from "@/lib/calendar/events";', 'const getWritableCalendars = async () => globalThis.calendarFixture.calendars;')
  .replace('import { createGoogleEvent, deleteGoogleEvent } from "@/lib/calendar/write";', 'const createGoogleEvent = async (...args) => { globalThis.calendarFixture.writes.push(args); return { ok: true }; }; const deleteGoogleEvent = createGoogleEvent;')
  .replace('@/lib/calendar/validation', new URL('../src/lib/calendar/validation.ts', import.meta.url).href);
const actions = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(actionSource)).toString('base64')}`);
test('server actions reject missing membership, foreign calendars and unconfirmed deletion', async () => {
  globalThis.calendarFixture = { session: null, calendars: [], writes: [] };
  const form = new FormData();
  for (const [key, value] of Object.entries({ calendarId: 'team@example.com', title: 'Fixture', startDate: '2026-10-28', endDate: '2026-10-28', allDay: 'on', eventId: 'fixture_id', etag: '"v1"' })) form.set(key, value);
  await assert.rejects(actions.createEventAction({ error: null }, form));
  globalThis.calendarFixture.session = { user: { member: 'fixture' }, accessToken: 'fixture' };
  assert.ok((await actions.createEventAction({ error: null }, form)).error);
  globalThis.calendarFixture.calendars = [{ id: 'team@example.com' }];
  assert.ok((await actions.deleteEventAction(form)).error);
  assert.equal(globalThis.calendarFixture.writes.length, 0);
  assert.equal((await actions.createEventAction({ error: null }, form)).error, null);
  form.set('confirmed', 'yes');
  assert.equal((await actions.deleteEventAction(form)).error, null);
  assert.equal(globalThis.calendarFixture.writes.length, 2);
  delete globalThis.calendarFixture;
});
