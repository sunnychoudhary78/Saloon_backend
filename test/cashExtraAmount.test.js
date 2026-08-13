'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SettlementLedger } = require('../models');
const {
  cashExtraAmount,
  resolveCashConfirmedAmount,
  shapePayment,
} = require('../services/paymentService');
const {
  EXTRA_CASH_NOTES,
  appendCashExtraAdjustment,
  createFromPayment,
} = require('../services/settlementLedgerService');
const { recordExtraCashOnPaidPayment } = require('../services/paymentFulfillmentService');

test('resolveCashConfirmedAmount uses extra on top of the booked fee', () => {
  assert.equal(resolveCashConfirmedAmount(500, { extraAmount: 200 }), 700);
  assert.equal(resolveCashConfirmedAmount(500, { extraAmount: 0 }), 500);
  assert.equal(resolveCashConfirmedAmount(500, {}), 500);
});

test('resolveCashConfirmedAmount treats confirmed_amount as a total', () => {
  assert.equal(resolveCashConfirmedAmount(500, { confirmedAmount: 650 }), 650);
  assert.equal(resolveCashConfirmedAmount(500, { extraAmount: 50, confirmedAmount: 900 }), 550);
});

test('resolveCashConfirmedAmount rejects negative extra or a total below the booked fee', () => {
  assert.throws(
    () => resolveCashConfirmedAmount(500, { extraAmount: -1 }),
    (err) => err.statusCode === 400,
  );
  assert.throws(
    () => resolveCashConfirmedAmount(500, { confirmedAmount: 499 }),
    (err) => err.statusCode === 400,
  );
});

test('shapePayment exposes cash extra separately from the booked amount', () => {
  const shaped = shapePayment({
    id: 'pay-1',
    amount: 500,
    cash_confirmed_amount: 720,
    status: 'PAID',
    method: 'PAY_AT_SHOP',
    line_items: [],
  });
  assert.equal(shaped.amount, 500);
  assert.equal(shaped.cash_confirmed_amount, 720);
  assert.equal(shaped.cash_extra_amount, 220);
  assert.equal(cashExtraAmount(500, 500), 0);
});

test('createFromPayment records extra cash as COLLECTED ADJUSTMENT without changing commission', async (t) => {
  const original = {
    count: SettlementLedger.count,
    bulkCreate: SettlementLedger.bulkCreate,
  };
  t.after(() => {
    SettlementLedger.count = original.count;
    SettlementLedger.bulkCreate = original.bulkCreate;
  });

  let created = [];
  SettlementLedger.count = async () => 0;
  SettlementLedger.bulkCreate = async (entries) => {
    created = entries;
    return entries;
  };

  await createFromPayment({
    id: 'pay-1',
    booking_id: 'book-1',
    booking_group_id: 'group-1',
    salon_id: 'salon-1',
    method: 'PAY_AT_SHOP',
    amount: 500,
    cash_confirmed_amount: 700,
    currency: 'INR',
    settings_version: 1,
    line_items: [{
      id: 'line-1',
      booking_id: 'book-1',
      commission_amount: 50,
      commission_percent: 10,
      salon_net_amount: 450,
    }],
  });

  const commission = created.find((e) => e.entry_type === 'SERVICE_COMMISSION');
  const salonNet = created.find((e) => e.entry_type === 'SERVICE_SALON_NET');
  const extra = created.find((e) => e.entry_type === 'ADJUSTMENT');
  assert.equal(commission.amount, 50);
  assert.equal(salonNet.amount, 450);
  assert.equal(salonNet.status, 'COLLECTED');
  assert.equal(extra.amount, 200);
  assert.equal(extra.status, 'COLLECTED');
  assert.equal(extra.notes, 'Extra cash collected at shop');
});

test('createFromPayment omits extra cash when confirmed amount matches the booked fee', async (t) => {
  const original = {
    count: SettlementLedger.count,
    bulkCreate: SettlementLedger.bulkCreate,
  };
  t.after(() => {
    SettlementLedger.count = original.count;
    SettlementLedger.bulkCreate = original.bulkCreate;
  });

  let created = [];
  SettlementLedger.count = async () => 0;
  SettlementLedger.bulkCreate = async (entries) => {
    created = entries;
    return entries;
  };

  await createFromPayment({
    id: 'pay-2',
    booking_id: 'book-2',
    booking_group_id: 'group-2',
    salon_id: 'salon-1',
    method: 'PAY_AT_SHOP',
    amount: 500,
    cash_confirmed_amount: 500,
    currency: 'INR',
    settings_version: 1,
    line_items: [{
      id: 'line-2',
      booking_id: 'book-2',
      commission_amount: 50,
      commission_percent: 10,
      salon_net_amount: 450,
    }],
  });

  assert.equal(created.some((e) => e.entry_type === 'ADJUSTMENT'), false);
  assert.equal(created.length, 2);
});

test('appendCashExtraAdjustment records COLLECTED extra on an already-paid online payment', async (t) => {
  const original = {
    findOne: SettlementLedger.findOne,
    create: SettlementLedger.create,
  };
  t.after(() => {
    SettlementLedger.findOne = original.findOne;
    SettlementLedger.create = original.create;
  });

  SettlementLedger.findOne = async () => null;
  let created = null;
  SettlementLedger.create = async (entry) => {
    created = entry;
    return entry;
  };

  await appendCashExtraAdjustment({
    id: 'pay-online-1',
    booking_id: 'book-3',
    booking_group_id: 'group-3',
    salon_id: 'salon-1',
    method: 'RAZORPAY',
    amount: 500,
    currency: 'INR',
    settings_version: 1,
  }, 150);

  assert.equal(created.entry_type, 'ADJUSTMENT');
  assert.equal(created.status, 'COLLECTED');
  assert.equal(created.amount, 150);
  assert.equal(created.notes, EXTRA_CASH_NOTES);
});

test('recordExtraCashOnPaidPayment is a no-op when extra is 0', async () => {
  const payment = {
    status: 'PAID',
    amount: 500,
    cash_confirmed_amount: null,
    save: async () => {
      throw new Error('should not save when extra is 0');
    },
  };
  const result = await recordExtraCashOnPaidPayment(
    payment,
    'owner-1',
    { extraAmount: 0 },
  );
  assert.equal(result.extra, 0);
});

test('recordExtraCashOnPaidPayment sets cash fields and appends extra without changing amount', async (t) => {
  const original = {
    findOne: SettlementLedger.findOne,
    create: SettlementLedger.create,
  };
  t.after(() => {
    SettlementLedger.findOne = original.findOne;
    SettlementLedger.create = original.create;
  });

  SettlementLedger.findOne = async () => null;
  let created = null;
  SettlementLedger.create = async (entry) => {
    created = entry;
    return entry;
  };

  const payment = {
    id: 'pay-online-2',
    booking_id: 'book-4',
    booking_group_id: 'group-4',
    salon_id: 'salon-1',
    status: 'PAID',
    method: 'RAZORPAY',
    amount: 500,
    cash_confirmed_amount: null,
    currency: 'INR',
    settings_version: 1,
    save: async () => payment,
  };

  const result = await recordExtraCashOnPaidPayment(
    payment,
    'owner-1',
    { extraAmount: 80 },
  );
  assert.equal(result.extra, 80);
  assert.equal(payment.amount, 500);
  assert.equal(payment.cash_confirmed, true);
  assert.equal(payment.cash_confirmed_amount, 580);
  assert.equal(created.amount, 80);
  assert.equal(created.status, 'COLLECTED');
});
