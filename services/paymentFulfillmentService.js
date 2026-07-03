const {
  Payment,
  PaymentLineItem,
  Booking,
  Service,
  Customer,
  Salon,
} = require('../models');
const AppError = require('../middlewares/AppError');
const { verifyPaymentSignature, amountToPaise } = require('./razorpayService');
const { markExpired } = require('./paymentService');
const { createFromPayment } = require('./settlementLedgerService');
const {
  notifyPremiumPayment,
  notifyBookingPayment,
} = require('./bookingNotificationHelper');

const CUSTOMER_SALON_ATTRS = ['id', 'salon_name', 'city', 'phone'];

function paymentBookingInclude() {
  return {
    model: Booking,
    as: 'booking',
    include: [
      { model: Salon, as: 'salon', attributes: CUSTOMER_SALON_ATTRS },
      {
        model: Service,
        as: 'service',
        attributes: ['id', 'service_name', 'price', 'discount_price'],
      },
    ],
  };
}

async function loadPaymentForFulfillment(orderId, transaction) {
  if (!orderId) return null;
  return Payment.findOne({
    where: { razorpay_order_id: orderId },
    include: [
      paymentBookingInclude(),
      { model: PaymentLineItem, as: 'line_items' },
    ],
    transaction,
    lock: transaction ? { level: transaction.LOCK.UPDATE, of: Payment } : undefined,
  });
}

async function loadPaymentById(paymentId, transaction) {
  return Payment.findByPk(paymentId, {
    include: [
      paymentBookingInclude(),
      { model: PaymentLineItem, as: 'line_items' },
    ],
    transaction,
    lock: transaction ? { level: transaction.LOCK.UPDATE, of: Payment } : undefined,
  });
}

function dispatchPaymentNotifications(notifications) {
  if (!notifications) return;
  if (notifications.premiumBookingId) {
    notifyPremiumPayment(notifications.premiumBookingId);
  }
  if (notifications.salonFee) {
    notifyBookingPayment(notifications.salonFee.bookingId, notifications.salonFee.amount);
  }
}

async function updatePremiumStatusForGroup(payment, status, userId, transaction) {
  const includesPremium = payment.checkout_kind === 'PREMIUM_ONLY'
    || payment.checkout_kind === 'COMBINED';
  if (!includesPremium) return null;

  const groupId = payment.booking_group_id || payment.booking_id;
  const bookings = await Booking.findAll({
    where: groupId === payment.booking_id
      ? { id: payment.booking_id }
      : { booking_group_id: groupId },
    transaction,
  });

  for (const booking of bookings) {
    if (booking.booking_type === 'PREMIUM') {
      booking.premium_payment_status = status;
      booking.updated_by = userId;
      await booking.save({ transaction });
    }
  }

  const premiumBooking = bookings.find((b) => b.booking_type === 'PREMIUM');
  return premiumBooking?.id || payment.booking_id;
}

async function fulfillPaidPayment(payment, {
  updatedByUserId = null,
  paymentId = null,
  signature = null,
  transaction,
}) {
  payment.status = 'PAID';
  if (paymentId) payment.razorpay_payment_id = paymentId;
  if (signature) payment.razorpay_signature = signature;
  payment.paid_at = new Date();
  payment.updated_by = updatedByUserId;
  await payment.save({ transaction });

  const lineItems = payment.line_items || [];
  for (const line of lineItems) {
    line.status = 'PAID';
    await line.save({ transaction });
  }

  const notifications = { premiumBookingId: null, salonFee: null };

  if (payment.checkout_kind === 'PREMIUM_ONLY' || payment.checkout_kind === 'COMBINED') {
    notifications.premiumBookingId = await updatePremiumStatusForGroup(
      payment,
      'PAID',
      updatedByUserId,
      transaction,
    );
  }

  if (payment.checkout_kind === 'SALON_FEE' || payment.checkout_kind === 'COMBINED') {
    notifications.salonFee = {
      bookingId: payment.booking_id,
      amount: payment.amount,
    };
  } else if (payment.checkout_kind === 'PREMIUM_ONLY') {
    notifications.premiumBookingId = notifications.premiumBookingId || payment.booking_id;
  }

  await createFromPayment(payment, transaction);

  return notifications;
}

/**
 * Marks a Razorpay payment as PAID. Uses snapshot values only — never reads finance settings.
 */
async function fulfillRazorpayPayment({
  orderId,
  paymentId,
  signature = null,
  updatedByUserId = null,
  customerUserId = null,
  transaction,
  requireSignature = true,
  allowExpiredFulfillment = false,
  razorpayAmountPaise = null,
}) {
  const payment = await loadPaymentForFulfillment(orderId, transaction);
  if (!payment) {
    return { found: false, alreadyPaid: false, payment: null, notifications: null };
  }

  if (customerUserId) {
    const customer = await Customer.findOne({
      where: { user_id: customerUserId },
      transaction,
    });
    if (!customer || payment.customer_id !== customer.id) {
      throw new AppError('Payment order not found', 404);
    }
  }

  await markExpired(payment, transaction);

  if (payment.status === 'PAID') {
    return { found: true, alreadyPaid: true, payment, notifications: null };
  }

  if (payment.status === 'EXPIRED' && !allowExpiredFulfillment) {
    throw new AppError('Payment window has expired', 400);
  }

  if (payment.status !== 'PENDING' && payment.status !== 'EXPIRED') {
    throw new AppError(`Payment is ${payment.status.toLowerCase()}`, 400);
  }

  if (payment.booking?.booking_status !== 'ACCEPTED') {
    throw new AppError('This booking is no longer active for payment', 400);
  }

  if (requireSignature) {
    const valid = verifyPaymentSignature({ orderId, paymentId, signature });
    if (!valid) {
      payment.status = 'FAILED';
      payment.failure_reason = 'Razorpay signature verification failed';
      payment.updated_by = updatedByUserId;
      await payment.save({ transaction });
      if (payment.checkout_kind === 'PREMIUM_ONLY' || payment.payment_type === 'PREMIUM_FEE') {
        await updatePremiumStatusForGroup(payment, 'FAILED', updatedByUserId, transaction);
      }
      throw new AppError('Payment verification failed', 400);
    }
  }

  if (razorpayAmountPaise != null) {
    const expectedPaise = amountToPaise(payment.amount);
    if (Number(razorpayAmountPaise) !== expectedPaise) {
      throw new AppError('Payment amount mismatch', 400);
    }
  }

  const notifications = await fulfillPaidPayment(payment, {
    updatedByUserId,
    paymentId,
    signature,
    transaction,
  });

  return { found: true, alreadyPaid: false, payment, notifications };
}

async function fulfillCashPayment(paymentId, ownerUserId, { confirmedAmount }, transaction) {
  const payment = await loadPaymentById(paymentId, transaction);
  if (!payment) throw new AppError('Payment not found', 404);
  if (payment.method !== 'PAY_AT_SHOP') {
    throw new AppError('This payment is not a pay-at-shop checkout', 400);
  }
  if (payment.status === 'PAID') {
    return { alreadyPaid: true, payment, notifications: null };
  }
  if (payment.status !== 'PENDING') {
    throw new AppError(`Payment is ${payment.status.toLowerCase()}`, 400);
  }

  payment.status = 'PAID';
  payment.cash_confirmed = true;
  payment.cash_confirmed_amount = confirmedAmount != null
    ? Number(confirmedAmount)
    : Number(payment.amount);
  payment.cash_confirmed_at = new Date();
  payment.cash_confirmed_by = ownerUserId;
  payment.paid_at = new Date();
  payment.updated_by = ownerUserId;
  await payment.save({ transaction });

  const notifications = await fulfillPaidPayment(payment, {
    updatedByUserId: ownerUserId,
    transaction,
  });

  return { alreadyPaid: false, payment, notifications };
}

async function markRazorpayPaymentFailed({
  orderId,
  paymentId = null,
  failureReason = 'Razorpay payment failed',
  transaction,
}) {
  const payment = await loadPaymentForFulfillment(orderId, transaction);
  if (!payment || payment.status !== 'PENDING') {
    return { found: Boolean(payment), updated: false, payment };
  }

  payment.status = 'FAILED';
  if (paymentId) payment.razorpay_payment_id = paymentId;
  payment.failure_reason = failureReason;
  await payment.save({ transaction });

  if (payment.checkout_kind === 'PREMIUM_ONLY' || payment.payment_type === 'PREMIUM_FEE') {
    await updatePremiumStatusForGroup(payment, 'FAILED', null, transaction);
  }

  return { found: true, updated: true, payment };
}

module.exports = {
  dispatchPaymentNotifications,
  fulfillRazorpayPayment,
  fulfillCashPayment,
  loadPaymentForFulfillment,
  markRazorpayPaymentFailed,
};
