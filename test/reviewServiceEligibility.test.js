'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeBookingDate,
  getSlotEndDateTime,
  hasSlotEnded,
  isBookingReviewable,
  applyVisitReviewFlags,
  visitBookingIds,
} = require('../services/reviewService');

test('normalizeBookingDate handles ISO strings and Date objects', () => {
  assert.equal(normalizeBookingDate('2024-06-01'), '2024-06-01');
  assert.equal(normalizeBookingDate('2024-06-01T00:00:00.000Z'), '2024-06-01');

  const asDate = new Date(2024, 5, 1); // local Jun 1 2024
  assert.equal(normalizeBookingDate(asDate), '2024-06-01');
});

test('getSlotEndDateTime works when booking_date is a Date (not Invalid Date)', () => {
  const end = getSlotEndDateTime(
    {
      booking_date: new Date(2024, 5, 1),
      booking_time: '10:00:00',
    },
    { duration_minutes: 60 },
  );
  assert.equal(Number.isNaN(end.getTime()), false);
  assert.equal(end.getHours(), 11);
  assert.equal(end.getMinutes(), 0);
});

test('COMPLETED is reviewable without relying on slot-end math', () => {
  const booking = {
    booking_status: 'COMPLETED',
    booking_date: new Date('invalid'),
    booking_time: '10:00:00',
  };
  assert.equal(isBookingReviewable(booking, { duration_minutes: 60 }, null), true);
  assert.equal(
    isBookingReviewable(booking, { duration_minutes: 60 }, { id: 'r1' }),
    false,
  );
});

test('ACCEPTED requires slot to have ended', () => {
  const past = {
    booking_status: 'ACCEPTED',
    booking_date: '2020-01-01',
    booking_time: '10:00:00',
  };
  const future = {
    booking_status: 'ACCEPTED',
    booking_date: '2099-01-01',
    booking_time: '10:00:00',
  };
  assert.equal(hasSlotEnded(past, { duration_minutes: 30 }), true);
  assert.equal(isBookingReviewable(past, { duration_minutes: 30 }, null), true);
  assert.equal(hasSlotEnded(future, { duration_minutes: 30 }), false);
  assert.equal(isBookingReviewable(future, { duration_minutes: 30 }, null), false);
});

test('CANCELLED and PENDING are not reviewable', () => {
  const base = { booking_date: '2020-01-01', booking_time: '10:00:00' };
  assert.equal(
    isBookingReviewable({ ...base, booking_status: 'CANCELLED' }, null, null),
    false,
  );
  assert.equal(
    isBookingReviewable({ ...base, booking_status: 'PENDING' }, null, null),
    false,
  );
});

test('applyVisitReviewFlags marks every sibling reviewed when one has a review', () => {
  const rows = applyVisitReviewFlags([
    {
      id: 'a',
      booking_group_id: 'g1',
      has_review: true,
      can_review: false,
    },
    {
      id: 'b',
      booking_group_id: 'g1',
      has_review: false,
      can_review: true,
    },
  ]);
  assert.equal(rows[0].has_review, true);
  assert.equal(rows[0].can_review, false);
  assert.equal(rows[1].has_review, true);
  assert.equal(rows[1].can_review, false);
});

test('applyVisitReviewFlags leaves other visits unchanged', () => {
  const rows = applyVisitReviewFlags([
    { id: 'a', booking_group_id: 'g1', has_review: true, can_review: false },
    { id: 'c', booking_group_id: 'g2', has_review: false, can_review: true },
    { id: 'legacy', has_review: false, can_review: true },
  ]);
  assert.equal(rows[1].has_review, false);
  assert.equal(rows[1].can_review, true);
  assert.equal(rows[2].has_review, false);
  assert.equal(rows[2].can_review, true);
});

test('visitBookingIds includes siblings for duplicate-visit rejection', () => {
  const booking = { id: 'b', booking_group_id: 'g1' };
  const ids = visitBookingIds(booking, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  assert.deepEqual([...ids].sort(), ['a', 'b', 'c']);
});

test('visitBookingIds for a legacy row is only itself', () => {
  assert.deepEqual(visitBookingIds({ id: 'solo' }, [{ id: 'other' }]), ['solo']);
});

