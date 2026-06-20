const { Payment } = require('../models');
const AppError = require('../middlewares/AppError');
const razorpayService = require('./razorpayService');

const PREMIUM_PAYMENT_WINDOW_MINUTES =
  parseInt(process.env.PREMIUM_PAYMENT_WINDOW_MINUTES, 10) || 15;

function deadlineFromNow(minutes = PREMIUM_PAYMENT_WINDOW_MINUTES) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function isExpired(payment) {
  return Boolean(payment?.expires_at && new Date(payment.expires_at).getTime() <= Date.now());
}

function servicePayableAmount(service) {
  const price = Number(service?.price);
  const discount = Number(service?.discount_price);
  if (Number.isFinite(discount) && discount > 0 && discount < price) return discount;
  if (Number.isFinite(price) && price > 0) return price;
  throw new AppError('Service payment amount is invalid', 400);
}

function premiumPayableAmount(booking) {
  const amount = Number(booking?.premium_amount);
  if (Number.isFinite(amount) && amount > 0) return amount;
  throw new AppError('Premium fee is not available for this booking', 400);
}

async function markExpired(payment, transaction = null) {
  if (!payment || payment.status !== 'PENDING' || !isExpired(payment)) return payment;
  payment.status = 'EXPIRED';
  payment.failure_reason = 'Payment window expired';
  await payment.save({ transaction });
  return payment;
}

async function findLatestPayment(bookingId, paymentType, transaction = null) {
  const payment = await Payment.findOne({
    where: { booking_id: bookingId, payment_type: paymentType },
    order: [['created_at', 'DESC']],
    transaction,
  });
  await markExpired(payment, transaction);
  return payment;
}

async function createPremiumPaymentWindow(booking, userId, transaction = null) {
  if (booking.booking_type !== 'PREMIUM') return null;
  if (booking.premium_payment_status === 'PAID') return null;

  const existing = await findLatestPayment(booking.id, 'PREMIUM_FEE', transaction);
  if (existing?.status === 'PENDING') return existing;

  return Payment.create({
    booking_id: booking.id,
    customer_id: booking.customer_id,
    salon_id: booking.salon_id,
    payment_type: 'PREMIUM_FEE',
    amount: premiumPayableAmount(booking),
    currency: 'INR',
    method: 'RAZORPAY',
    status: 'PENDING',
    expires_at: deadlineFromNow(),
    created_by: userId,
    updated_by: userId,
  }, { transaction });
}

async function createOrReuseRazorpayOrder(payment, userId, transaction = null) {
  await markExpired(payment, transaction);
  if (payment.status !== 'PENDING') {
    throw new AppError(`Payment is ${payment.status.toLowerCase()}`, 400);
  }

  if (!payment.razorpay_order_id) {
    const order = await razorpayService.createOrder({
      amount: payment.amount,
      currency: payment.currency,
      receipt: `pay_${payment.id.replace(/-/g, '').slice(0, 32)}`,
      notes: {
        booking_id: payment.booking_id,
        payment_id: payment.id,
        payment_type: payment.payment_type,
      },
    });

    payment.razorpay_order_id = order.id;
    payment.updated_by = userId;
    await payment.save({ transaction });
  }

  return payment;
}

function shapePayment(payment, { includeRazorpayKey = false } = {}) {
  if (!payment) return null;
  const plain = typeof payment.get === 'function' ? payment.get({ plain: true }) : payment;
  const shaped = {
    ...plain,
    amount: Number(plain.amount),
    amount_paise: razorpayService.amountToPaise(plain.amount),
  };
  if (shaped.status === 'PENDING' && isExpired(shaped)) {
    shaped.status = 'EXPIRED';
  }
  if (includeRazorpayKey) shaped.razorpay_key_id = razorpayService.getKeyId();
  return shaped;
}

function splitPayments(payments = []) {
  const sorted = [...payments].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return {
    premium_payment: sorted.find((p) => p.payment_type === 'PREMIUM_FEE') || null,
    salon_fee_payment: sorted.find((p) => p.payment_type === 'SALON_FEE') || null,
  };
}

module.exports = {
  createOrReuseRazorpayOrder,
  createPremiumPaymentWindow,
  deadlineFromNow,
  findLatestPayment,
  isExpired,
  markExpired,
  premiumPayableAmount,
  servicePayableAmount,
  shapePayment,
  splitPayments,
};
