'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Booking, Payment, sequelize } = require('../models');
const {
  invalidatePremiumConfigCache,
  loadPremiumConfig,
  normalizePaymentWindowMinutes,
  shapePremiumConfig,
} = require('../services/slotService');
const { PlatformSetting } = require('../models');
const {
  applyPremiumPaymentDueAt,
  cancelExpiredPremiumGroup,
  isPremiumPaymentWindowExpired,
  processExpiredPremiumBookings,
} = require('../services/premiumPaymentExpiryService');
const {
  bookingConfirmed,
  premiumPaymentWindowExpiredCustomer,
  premiumPaymentWindowExpiredOwner,
} = require('../services/pushNotificationTemplates');

test('normalizePaymentWindowMinutes clamps to 1–120 and defaults to 15', () => {
  assert.equal(normalizePaymentWindowMinutes(15), 15);
  assert.equal(normalizePaymentWindowMinutes(1), 1);
  assert.equal(normalizePaymentWindowMinutes(120), 120);
  assert.equal(normalizePaymentWindowMinutes(999), 120);
  assert.equal(normalizePaymentWindowMinutes(0), 15);
  assert.equal(normalizePaymentWindowMinutes('nope'), 15);
});

test('shapePremiumConfig includes payment_window_minutes', () => {
  const shaped = shapePremiumConfig({
    enabled: true,
    fee: 250,
    currency: 'INR',
    payment_window_minutes: 20,
  });
  assert.equal(shaped.enabled, true);
  assert.equal(shaped.fee, 250);
  assert.equal(shaped.payment_window_minutes, 20);
});

test('loadPremiumConfig returns payment_window_minutes from platform settings', async (t) => {
  const original = PlatformSetting.findOne;
  t.after(() => {
    PlatformSetting.findOne = original;
    invalidatePremiumConfigCache();
  });
  PlatformSetting.findOne = async () => ({
    setting_value: { enabled: true, fee: 199, currency: 'INR', payment_window_minutes: 8 },
  });
  invalidatePremiumConfigCache();
  const config = await loadPremiumConfig();
  assert.equal(config.payment_window_minutes, 8);
});

test('applyPremiumPaymentDueAt only stamps PREMIUM rows', () => {
  const dueAt = new Date('2026-08-14T12:00:00.000Z');
  const group = [
    { booking_type: 'PREMIUM' },
    { booking_type: 'STANDARD' },
  ];
  applyPremiumPaymentDueAt(group, dueAt);
  assert.equal(group[0].premium_payment_due_at, dueAt);
  assert.equal(group[1].premium_payment_due_at, undefined);
});

test('isPremiumPaymentWindowExpired requires unpaid premium with a past due_at', () => {
  const past = new Date(Date.now() - 1000);
  const future = new Date(Date.now() + 60 * 1000);
  assert.equal(isPremiumPaymentWindowExpired({
    booking_type: 'PREMIUM',
    premium_payment_status: 'PENDING',
    premium_payment_due_at: past,
  }), true);
  assert.equal(isPremiumPaymentWindowExpired({
    booking_type: 'PREMIUM',
    premium_payment_status: 'PAID',
    premium_payment_due_at: past,
  }), false);
  assert.equal(isPremiumPaymentWindowExpired({
    booking_type: 'PREMIUM',
    premium_payment_status: 'PENDING',
    premium_payment_due_at: future,
  }), false);
  assert.equal(isPremiumPaymentWindowExpired({
    booking_type: 'PREMIUM',
    premium_payment_status: 'PENDING',
    premium_payment_due_at: null,
  }), false);
  assert.equal(isPremiumPaymentWindowExpired({
    booking_type: 'STANDARD',
    premium_payment_status: 'PENDING',
    premium_payment_due_at: past,
  }), false);
});

function bookingStub(overrides) {
  return {
    id: 'prem-1',
    booking_group_id: 'g1',
    booking_type: 'PREMIUM',
    booking_status: 'ACCEPTED',
    premium_payment_status: 'PENDING',
    premium_payment_due_at: new Date(Date.now() - 5000),
    save: async function save() { return this; },
    ...overrides,
  };
}

test('cancelExpiredPremiumGroup cancels the visit and expires pending payments', async (t) => {
  const original = { findAll: Booking.findAll, paymentFindAll: Payment.findAll };
  t.after(() => {
    Booking.findAll = original.findAll;
    Payment.findAll = original.paymentFindAll;
  });

  const premium = bookingStub();
  const sibling = bookingStub({
    id: 'std-1',
    booking_type: 'STANDARD',
    premium_payment_status: 'NONE',
    premium_payment_due_at: null,
  });
  const payment = {
    status: 'PENDING',
    failure_reason: null,
    save: async function save() { return this; },
  };

  Booking.findAll = async () => [premium, sibling];
  Payment.findAll = async () => [payment];

  const result = await cancelExpiredPremiumGroup(premium, { userId: 'u1' });
  assert.equal(result.cancelled, true);
  assert.equal(premium.booking_status, 'CANCELLED');
  assert.equal(premium.premium_payment_status, 'FAILED');
  assert.equal(sibling.booking_status, 'CANCELLED');
  assert.equal(payment.status, 'EXPIRED');
});

test('cancelExpiredPremiumGroup skips a paid premium booking', async (t) => {
  const original = { findAll: Booking.findAll };
  t.after(() => {
    Booking.findAll = original.findAll;
  });
  const premium = bookingStub({ premium_payment_status: 'PAID' });
  Booking.findAll = async () => [premium];
  const result = await cancelExpiredPremiumGroup(premium);
  assert.equal(result.cancelled, false);
  assert.equal(premium.booking_status, 'ACCEPTED');
});

test('processExpiredPremiumBookings cancels unpaid expired groups', async (t) => {
  const original = {
    findAll: Booking.findAll,
    findByPk: Booking.findByPk,
    paymentFindAll: Payment.findAll,
    transaction: sequelize.transaction,
  };
  t.after(() => {
    Booking.findAll = original.findAll;
    Booking.findByPk = original.findByPk;
    Payment.findAll = original.paymentFindAll;
    sequelize.transaction = original.transaction;
  });

  const premium = bookingStub();
  const sibling = bookingStub({
    id: 'std-1',
    booking_type: 'STANDARD',
    premium_payment_status: 'NONE',
    premium_payment_due_at: null,
  });

  Booking.findAll = async (opts) => {
    if (opts?.where?.booking_group_id) return [premium, sibling];
    return [premium];
  };
  Booking.findByPk = async () => premium;
  Payment.findAll = async () => [];
  sequelize.transaction = async () => ({
    LOCK: { UPDATE: 'UPDATE' },
    commit: async () => {},
    rollback: async () => {
      throw new Error('should not rollback');
    },
  });

  const ids = await processExpiredPremiumBookings();
  assert.deepEqual(ids, ['prem-1']);
  assert.equal(premium.booking_status, 'CANCELLED');
  assert.equal(sibling.booking_status, 'CANCELLED');
});

test('premium bookingConfirmed mentions the pay timer', () => {
  const payload = bookingConfirmed(
    { id: 'b1', booking_type: 'PREMIUM' },
    'Glow',
  );
  assert.equal(payload.notification.title, 'Urgent booking accepted');
  assert.match(payload.notification.body, /timer/i);
});

test('standard bookingConfirmed keeps the default copy', () => {
  const payload = bookingConfirmed(
    { id: 'b2', booking_type: 'STANDARD' },
    'Glow',
  );
  assert.equal(payload.notification.title, 'Booking Confirmed');
});

test('expiry notifications use a dedicated reason', () => {
  const customer = premiumPaymentWindowExpiredCustomer({ id: 'b1' }, 'Glow');
  const owner = premiumPaymentWindowExpiredOwner({ id: 'b1' }, 'Riya');
  assert.equal(customer.notification.title, 'Urgent booking cancelled');
  assert.equal(owner.notification.title, 'Urgent booking cancelled');
  assert.equal(customer.data.reason, 'premium_payment_window_expired');
  assert.equal(owner.data.reason, 'premium_payment_window_expired');
});
