'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Booking } = require('../models');
const { assertCustomerServiceSlotFree } = require('../services/slotService');

test('allows booking when customer has no active booking for service+slot', async (t) => {
  const originalFindOne = Booking.findOne;
  t.after(() => {
    Booking.findOne = originalFindOne;
  });
  Booking.findOne = async () => null;

  await assert.doesNotReject(() =>
    assertCustomerServiceSlotFree(
      'salon-1',
      '2026-08-10',
      '10:00',
      'service-1',
      'customer-1',
    )
  );
});

test('rejects duplicate customer service+slot for PENDING/ACCEPTED', async (t) => {
  const originalFindOne = Booking.findOne;
  t.after(() => {
    Booking.findOne = originalFindOne;
  });
  Booking.findOne = async () => ({ id: 'existing-booking' });

  await assert.rejects(
    () =>
      assertCustomerServiceSlotFree(
        'salon-1',
        '2026-08-10',
        '10:00',
        'service-1',
        'customer-1',
      ),
    (error) =>
      error.statusCode === 409 &&
      error.message === 'You already booked this service for the selected slot',
  );
});
