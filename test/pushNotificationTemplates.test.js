'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { newBooking, cashConfirmed } = require('../services/pushNotificationTemplates');

test('premium new booking uses urgent title and isPremium flag', () => {
  const payload = newBooking(
    { id: 'b1', booking_type: 'PREMIUM', booking_date: '2026-08-13', booking_time: '10:00' },
    { customerName: 'Riya', serviceName: 'Haircut', isPremium: true, amount: '199' }
  );
  assert.equal(payload.notification.title, 'Urgent booking request');
  assert.equal(payload.data.isPremium, 'true');
  assert.equal(payload.data.type, 'new_booking');
});

test('standard new booking keeps the default title', () => {
  const payload = newBooking(
    { id: 'b2', booking_type: 'STANDARD' },
    { customerName: 'Riya', serviceName: 'Trim', isPremium: false }
  );
  assert.equal(payload.notification.title, 'New Booking Request');
  assert.equal(payload.data.isPremium, 'false');
});

test('cash confirmed without extra uses booked amount', () => {
  const payload = cashConfirmed(
    { id: 'b3' },
    'Glow',
    { bookedAmount: 500, confirmedAmount: 500, extraAmount: 0 }
  );
  assert.equal(payload.notification.title, 'Cash confirmed');
  assert.equal(payload.notification.body, 'Glow confirmed cash of ₹500.');
  assert.equal(payload.data.type, 'payment_successful');
  assert.equal(payload.data.userRole, 'customer');
});

test('cash confirmed with extra includes total extra and booked', () => {
  const payload = cashConfirmed(
    { id: 'b4' },
    'Glow',
    { bookedAmount: 500, confirmedAmount: 700, extraAmount: 200 }
  );
  assert.equal(payload.notification.title, 'Extra cash recorded');
  assert.equal(
    payload.notification.body,
    'Glow confirmed ₹700 cash (₹200 extra on the booked ₹500).'
  );
});
