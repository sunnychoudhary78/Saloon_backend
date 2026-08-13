const { SettlementLedger } = require('../models');
const AppError = require('../middlewares/AppError');
const { cashExtraAmount, roundMoney } = require('./paymentService');

const EXTRA_CASH_NOTES = 'Extra cash collected at shop';

async function createFromPayment(payment, transaction = null) {
  const plain = typeof payment.get === 'function' ? payment.get({ plain: true }) : payment;
  const lineItems = plain.line_items || payment.line_items || [];

  const existing = await SettlementLedger.count({
    where: { payment_id: plain.id },
    transaction,
  });
  if (existing > 0) return [];

  const isDirectCash = plain.method === 'PAY_AT_SHOP';
  const salonEntryStatus = isDirectCash ? 'COLLECTED' : 'PENDING';
  const bookingGroupId = plain.booking_group_id || plain.booking_id;
  if (!bookingGroupId) {
    throw new AppError('Payment is missing booking group for settlement ledger', 500);
  }

  const entries = [];
  const base = {
    payment_id: plain.id,
    booking_group_id: bookingGroupId,
    salon_id: plain.salon_id,
    settings_version: plain.settings_version != null ? Number(plain.settings_version) : 1,
    currency: plain.currency || 'INR',
  };

  if (plain.premium_platform_amount && Number(plain.premium_platform_amount) > 0) {
    entries.push({
      ...base,
      payment_line_item_id: null,
      booking_id: plain.booking_id,
      entry_type: 'PREMIUM_PLATFORM',
      amount: Number(plain.premium_platform_amount),
      source_split_percent: Number(plain.premium_fee_platform_percent),
      status: 'PENDING',
    });
  }

  if (plain.premium_salon_amount && Number(plain.premium_salon_amount) > 0) {
    entries.push({
      ...base,
      payment_line_item_id: null,
      booking_id: plain.booking_id,
      entry_type: 'PREMIUM_SALON',
      amount: Number(plain.premium_salon_amount),
      source_split_percent: Number(plain.premium_fee_salon_percent),
      status: salonEntryStatus,
    });
  }

  for (const line of lineItems) {
    const linePlain = typeof line.get === 'function' ? line.get({ plain: true }) : line;
    if (Number(linePlain.commission_amount) > 0) {
      entries.push({
        ...base,
        payment_line_item_id: linePlain.id,
        booking_id: linePlain.booking_id,
        entry_type: 'SERVICE_COMMISSION',
        amount: Number(linePlain.commission_amount),
        source_commission_percent: Number(linePlain.commission_percent),
        status: 'PENDING',
      });
    }
    if (Number(linePlain.salon_net_amount) > 0) {
      entries.push({
        ...base,
        payment_line_item_id: linePlain.id,
        booking_id: linePlain.booking_id,
        entry_type: 'SERVICE_SALON_NET',
        amount: Number(linePlain.salon_net_amount),
        source_commission_percent: Number(linePlain.commission_percent),
        status: salonEntryStatus,
      });
    }
  }

  const extra = cashExtraAmount(plain.amount, plain.cash_confirmed_amount);
  if (extra > 0) {
    entries.push({
      ...base,
      payment_line_item_id: null,
      booking_id: plain.booking_id,
      entry_type: 'ADJUSTMENT',
      amount: extra,
      status: 'COLLECTED',
      notes: EXTRA_CASH_NOTES,
    });
  }

  if (entries.length === 0) return [];

  try {
    return await SettlementLedger.bulkCreate(entries, { transaction });
  } catch (err) {
    const detail = err?.message || 'unknown error';
    console.error('[settlement] createFromPayment failed:', detail);
    throw new AppError(
      `Failed to record earnings for payment: ${detail}`,
      500,
    );
  }
}

async function appendCashExtraAdjustment(payment, extra, transaction = null) {
  const amount = roundMoney(extra);
  if (!(amount > 0)) return null;

  const plain = typeof payment.get === 'function' ? payment.get({ plain: true }) : payment;
  const bookingGroupId = plain.booking_group_id || plain.booking_id;
  if (!bookingGroupId) {
    throw new AppError('Payment is missing booking group for settlement ledger', 500);
  }

  const existing = await SettlementLedger.findOne({
    where: {
      payment_id: plain.id,
      entry_type: 'ADJUSTMENT',
      notes: EXTRA_CASH_NOTES,
    },
    transaction,
  });
  if (existing) {
    if (roundMoney(existing.amount) === amount) return existing;
    throw new AppError('Extra cash has already been recorded for this payment', 409);
  }

  try {
    return await SettlementLedger.create({
      payment_id: plain.id,
      payment_line_item_id: null,
      booking_id: plain.booking_id,
      booking_group_id: bookingGroupId,
      salon_id: plain.salon_id,
      entry_type: 'ADJUSTMENT',
      amount,
      currency: plain.currency || 'INR',
      settings_version: plain.settings_version != null ? Number(plain.settings_version) : 1,
      status: 'COLLECTED',
      notes: EXTRA_CASH_NOTES,
    }, { transaction });
  } catch (err) {
    const detail = err?.message || 'unknown error';
    console.error('[settlement] appendCashExtraAdjustment failed:', detail);
    throw new AppError(
      `Failed to record extra cash for payment: ${detail}`,
      500,
    );
  }
}

async function queryLedger({ salonId, status, page = 1, limit = 20 }) {
  const where = {};
  if (salonId) where.salon_id = salonId;
  if (status) where.status = status;

  const offset = (page - 1) * limit;
  const { count, rows } = await SettlementLedger.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit,
    offset,
  });

  return {
    rows: rows.map((r) => r.get({ plain: true })),
    meta: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
  };
}

module.exports = {
  EXTRA_CASH_NOTES,
  appendCashExtraAdjustment,
  createFromPayment,
  queryLedger,
};
