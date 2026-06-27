const { Payment, Booking, Service, Customer, Salon } = require('../models');
const AppError = require('../middlewares/AppError');
const { verifyPaymentSignature, amountToPaise } = require('./razorpayService');
const { markExpired } = require('./paymentService');
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
    include: [paymentBookingInclude()],
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

/**
 * Marks a Razorpay payment as PAID. Used by client verify and payment.captured webhooks.
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

  if (payment.booking.booking_status !== 'ACCEPTED') {
    throw new AppError('This booking is no longer active for payment', 400);
  }

  if (requireSignature) {
    const valid = verifyPaymentSignature({ orderId, paymentId, signature });
    if (!valid) {
      payment.status = 'FAILED';
      payment.failure_reason = 'Razorpay signature verification failed';
      payment.updated_by = updatedByUserId;
      await payment.save({ transaction });
      if (payment.payment_type === 'PREMIUM_FEE') {
        payment.booking.premium_payment_status = 'FAILED';
        payment.booking.updated_by = updatedByUserId;
        await payment.booking.save({ transaction });
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

  payment.status = 'PAID';
  payment.razorpay_payment_id = paymentId;
  if (signature) payment.razorpay_signature = signature;
  payment.paid_at = new Date();
  payment.updated_by = updatedByUserId;
  await payment.save({ transaction });

  const notifications = { premiumBookingId: null, salonFee: null };

  if (payment.payment_type === 'PREMIUM_FEE') {
    payment.booking.premium_payment_status = 'PAID';
    payment.booking.updated_by = updatedByUserId;
    await payment.booking.save({ transaction });
    notifications.premiumBookingId = payment.booking_id;
  } else if (payment.payment_type === 'SALON_FEE') {
    notifications.salonFee = { bookingId: payment.booking_id, amount: payment.amount };
  }

  return { found: true, alreadyPaid: false, payment, notifications };
}

/**
 * Records a failed Razorpay attempt from payment.failed webhooks.
 */
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

  if (payment.payment_type === 'PREMIUM_FEE') {
    payment.booking.premium_payment_status = 'FAILED';
    await payment.booking.save({ transaction });
  }

  return { found: true, updated: true, payment };
}

module.exports = {
  dispatchPaymentNotifications,
  fulfillRazorpayPayment,
  loadPaymentForFulfillment,
  markRazorpayPaymentFailed,
};
