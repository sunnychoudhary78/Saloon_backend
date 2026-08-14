const { Op } = require('sequelize');
const { Booking, Payment, sequelize } = require('../models');
const { canTransition } = require('./bookingService');

const PAYMENT_WINDOW_EXPIRED_REASON = 'Premium payment window expired';

function isPremiumPaymentWindowExpired(booking, now = new Date()) {
  if (!booking || booking.booking_type !== 'PREMIUM') return false;
  if (booking.premium_payment_status === 'PAID') return false;
  if (!booking.premium_payment_due_at) return false;
  return new Date(booking.premium_payment_due_at).getTime() <= now.getTime();
}

function applyPremiumPaymentDueAt(bookings, dueAt) {
  for (const item of bookings) {
    if (item.booking_type === 'PREMIUM') {
      item.premium_payment_due_at = dueAt;
    }
  }
  return bookings;
}

function premiumDueAtFromGroup(bookings) {
  const premium = (bookings || []).find((b) => b.booking_type === 'PREMIUM');
  return premium?.premium_payment_due_at || null;
}

async function loadGroupForUpdate(primary, transaction) {
  if (!primary.booking_group_id) return [primary];
  return Booking.findAll({
    where: { booking_group_id: primary.booking_group_id },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
}

async function expirePendingPaymentsForGroup(group, transaction) {
  const bookingIds = group.map((b) => b.id);
  const groupIds = [...new Set(group.map((b) => b.booking_group_id).filter(Boolean))];
  const or = [{ booking_id: { [Op.in]: bookingIds } }];
  if (groupIds.length) {
    or.push({ booking_group_id: { [Op.in]: groupIds } });
  }

  const payments = await Payment.findAll({
    where: {
      status: 'PENDING',
      [Op.or]: or,
    },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  for (const payment of payments) {
    payment.status = 'EXPIRED';
    payment.failure_reason = PAYMENT_WINDOW_EXPIRED_REASON;
    await payment.save({ transaction });
  }
}

async function cancelExpiredPremiumGroup(primary, { userId = null, transaction } = {}) {
  const group = await loadGroupForUpdate(primary, transaction);
  const premium = group.find((b) => b.booking_type === 'PREMIUM') || primary;

  if (premium.booking_status !== 'ACCEPTED') {
    return { cancelled: false, group, primary: premium };
  }
  if (premium.premium_payment_status === 'PAID') {
    return { cancelled: false, group, primary: premium };
  }
  if (!isPremiumPaymentWindowExpired(premium)) {
    return { cancelled: false, group, primary: premium };
  }

  for (const item of group) {
    if (!canTransition(item.booking_status, 'CANCELLED')) continue;
    item.booking_status = 'CANCELLED';
    if (item.booking_type === 'PREMIUM' && item.premium_payment_status !== 'PAID') {
      item.premium_payment_status = 'FAILED';
    }
    item.updated_by = userId;
    await item.save({ transaction });
  }

  await expirePendingPaymentsForGroup(group, transaction);
  return { cancelled: true, group, primary: premium };
}

async function processExpiredPremiumBookings() {
  const expired = await Booking.findAll({
    where: {
      booking_type: 'PREMIUM',
      booking_status: 'ACCEPTED',
      premium_payment_status: { [Op.ne]: 'PAID' },
      premium_payment_due_at: { [Op.lte]: new Date() },
    },
  });

  const cancelledIds = [];
  for (const booking of expired) {
    const t = await sequelize.transaction();
    try {
      const locked = await Booking.findByPk(booking.id, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!locked) {
        await t.commit();
        continue;
      }
      const result = await cancelExpiredPremiumGroup(locked, { transaction: t });
      await t.commit();
      if (result.cancelled) cancelledIds.push(locked.id);
    } catch (err) {
      await t.rollback();
      console.error('[premium-expiry] cancel failed:', err.message);
    }
  }
  return cancelledIds;
}

module.exports = {
  PAYMENT_WINDOW_EXPIRED_REASON,
  applyPremiumPaymentDueAt,
  cancelExpiredPremiumGroup,
  isPremiumPaymentWindowExpired,
  premiumDueAtFromGroup,
  processExpiredPremiumBookings,
};
