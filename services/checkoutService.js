const crypto = require('crypto');
const {
  Payment,
  PaymentLineItem,
  Booking,
  Service,
  Customer,
  Salon,
  sequelize,
} = require('../models');
const AppError = require('../middlewares/AppError');
const { buildCheckoutSnapshot, round2 } = require('./checkoutSnapshotService');
const { createOrReuseRazorpayOrder, markExpired, isExpired, deadlineFromNow } = require('./paymentService');
const { resolvePremiumConfigForSalon } = require('./slotService');

const ACTIVE_CHECKOUT_STATUSES = ['PENDING', 'PAID'];

function resolveGroupId(booking) {
  return booking.booking_group_id || booking.id;
}

async function loadBookingGroup(bookingGroupId, customerId, transaction) {
  const anchor = await Booking.findOne({
    where: { customer_id: customerId },
    include: [{ model: Service, as: 'service' }],
    transaction,
  });

  const first = await Booking.findOne({
    where: {
      customer_id: customerId,
      ...(bookingGroupId
        ? { booking_group_id: bookingGroupId }
        : {}),
    },
    transaction,
  });

  if (!first) throw new AppError('Booking group not found', 404);

  const groupId = first.booking_group_id || first.id;
  const bookings = await Booking.findAll({
    where: {
      customer_id: customerId,
      booking_group_id: groupId,
    },
    include: [{ model: Service, as: 'service' }],
    order: [['created_at', 'ASC']],
    transaction,
  });

  if (bookings.length === 0) {
    const single = await Booking.findOne({
      where: { id: groupId, customer_id: customerId },
      include: [{ model: Service, as: 'service' }],
      transaction,
    });
    if (!single) throw new AppError('Booking group not found', 404);
    return [single];
  }

  return bookings;
}

async function loadBookingGroupById(bookingGroupId, customerId, transaction) {
  const byGroup = await Booking.findAll({
    where: { booking_group_id: bookingGroupId, customer_id: customerId },
    include: [{ model: Service, as: 'service' }],
    order: [['created_at', 'ASC']],
    transaction,
  });
  if (byGroup.length > 0) return byGroup;

  const single = await Booking.findOne({
    where: { id: bookingGroupId, customer_id: customerId },
    include: [{ model: Service, as: 'service' }],
    transaction,
  });
  if (!single) throw new AppError('Booking group not found', 404);
  return [single];
}

function assertGroupAccepted(bookings) {
  if (!bookings.every((b) => b.booking_status === 'ACCEPTED')) {
    throw new AppError('Payment is available only after salon accepts the booking', 400);
  }
}

function mapLegacyPaymentType(checkoutKind) {
  if (checkoutKind === 'PREMIUM_ONLY') return 'PREMIUM_FEE';
  return 'SALON_FEE';
}

async function findActiveCheckout(bookingGroupId, checkoutKind, transaction) {
  return Payment.findOne({
    where: {
      booking_group_id: bookingGroupId,
      checkout_kind: checkoutKind,
      status: ACTIVE_CHECKOUT_STATUSES,
    },
    include: [{ model: PaymentLineItem, as: 'line_items' }],
    order: [['created_at', 'DESC']],
    transaction,
  });
}

async function createCheckoutPayment({
  bookings,
  checkoutKind,
  method,
  userId,
  premiumFeeAmount = null,
  expiresAt = null,
  transaction,
}) {
  const primary = bookings[0];
  const groupId = resolveGroupId(primary);
  const snapshot = await buildCheckoutSnapshot({
    bookings,
    checkoutKind,
    premiumFeeAmount,
  });

  const existing = await findActiveCheckout(groupId, checkoutKind, transaction);
  if (existing?.status === 'PAID') {
    throw new AppError('This checkout is already paid', 409);
  }
  if (existing?.status === 'PENDING') {
    if (existing.method === method) {
      return existing;
    }
    if (existing.method === 'PAY_AT_SHOP' && method === 'RAZORPAY') {
      throw new AppError('Pay at shop is already selected for this visit', 409);
    }
  }

  const payment = await Payment.create({
    booking_id: primary.id,
    booking_group_id: groupId,
    customer_id: primary.customer_id,
    salon_id: primary.salon_id,
    checkout_kind: checkoutKind,
    payment_type: mapLegacyPaymentType(checkoutKind),
    settings_version: snapshot.settings_version,
    service_commission_percent: snapshot.service_commission_percent,
    premium_fee_platform_percent: snapshot.premium_fee_platform_percent,
    premium_fee_salon_percent: snapshot.premium_fee_salon_percent,
    premium_fee_amount: snapshot.premium_fee_amount,
    premium_platform_amount: snapshot.premium_platform_amount,
    premium_salon_amount: snapshot.premium_salon_amount,
    commission_amount: snapshot.commission_amount,
    platform_amount: snapshot.platform_amount,
    salon_net_amount: snapshot.salon_net_amount,
    amount: snapshot.amount,
    currency: 'INR',
    method,
    status: 'PENDING',
    expires_at: expiresAt,
    is_legacy: false,
    created_by: userId,
    updated_by: userId,
  }, { transaction });

  for (const line of snapshot.line_items) {
    await PaymentLineItem.create({
      payment_id: payment.id,
      ...line,
      status: 'PENDING',
      settlement_status: 'PENDING',
    }, { transaction });
  }

  return Payment.findByPk(payment.id, {
    include: [{ model: PaymentLineItem, as: 'line_items' }],
    transaction,
  });
}

async function resolvePremiumFeeForGroup(bookings) {
  const premiumBooking = bookings.find((b) => b.booking_type === 'PREMIUM');
  if (!premiumBooking) return null;
  const amount = Number(premiumBooking.premium_amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

async function getCheckoutSummary(customerId, groupId) {
  const bookings = await loadBookingGroupById(groupId, customerId);
  assertGroupAccepted(bookings);

  const primary = bookings[0];
  const isPremium = bookings.some((b) => b.booking_type === 'PREMIUM');
  const premiumPaid = !isPremium || bookings.some(
    (b) => b.booking_type === 'PREMIUM' && b.premium_payment_status === 'PAID',
  );

  const premiumFee = await resolvePremiumFeeForGroup(bookings);
  const salon = await Salon.findByPk(primary.salon_id);

  let serviceTotal = 0;
  for (const b of bookings) {
    serviceTotal += round2(require('./paymentService').servicePayableAmount(b.service));
  }
  serviceTotal = round2(serviceTotal);

  const payments = await Payment.findAll({
    where: { booking_group_id: resolveGroupId(primary) },
    include: [{ model: PaymentLineItem, as: 'line_items' }],
    order: [['created_at', 'DESC']],
  });

  const premiumCheckout = payments.find((p) => p.checkout_kind === 'PREMIUM_ONLY');
  const combinedCheckout = payments.find((p) => p.checkout_kind === 'COMBINED');
  const salonCheckout = payments.find((p) => p.checkout_kind === 'SALON_FEE');

  return {
    booking_group_id: resolveGroupId(primary),
    booking_status: primary.booking_status,
    is_premium: isPremium,
    premium_paid: premiumPaid,
    premium_fee: premiumFee,
    service_total: serviceTotal,
    combined_total: premiumFee ? round2(serviceTotal + premiumFee) : serviceTotal,
    can_pay_premium_only: isPremium && !premiumPaid,
    can_pay_combined: isPremium && !premiumPaid && premiumFee > 0,
    can_pay_salon_fee: premiumPaid || !isPremium,
    payments: payments.map((p) => p.get({ plain: true })),
    active_premium_checkout: premiumCheckout || combinedCheckout || null,
    active_salon_checkout: salonCheckout || combinedCheckout || null,
  };
}

module.exports = {
  loadBookingGroupById,
  assertGroupAccepted,
  createCheckoutPayment,
  findActiveCheckout,
  resolveGroupId,
  resolvePremiumFeeForGroup,
  getCheckoutSummary,
  mapLegacyPaymentType,
  ACTIVE_CHECKOUT_STATUSES,
};
