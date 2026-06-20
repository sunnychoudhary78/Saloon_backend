const crypto = require('crypto');
const Razorpay = require('razorpay');
const AppError = require('../middlewares/AppError');

function getKeyId() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId) throw new AppError('Razorpay key id is not configured', 500);
  return keyId;
}

function getKeySecret() {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) throw new AppError('Razorpay key secret is not configured', 500);
  return keySecret;
}

function getClient() {
  return new Razorpay({
    key_id: getKeyId(),
    key_secret: getKeySecret(),
  });
}

function amountToPaise(amount) {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AppError('Payment amount must be greater than zero', 400);
  }
  return Math.round(parsed * 100);
}

async function createOrder({ amount, currency = 'INR', receipt, notes = {} }) {
  return getClient().orders.create({
    amount: amountToPaise(amount),
    currency,
    receipt,
    notes,
    payment_capture: 1,
  });
}

function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (!orderId || !paymentId || !signature) {
    throw new AppError('Razorpay order id, payment id, and signature are required', 400);
  }

  const expected = crypto
    .createHmac('sha256', getKeySecret())
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  return expected === signature;
}

module.exports = {
  amountToPaise,
  createOrder,
  getKeyId,
  verifyPaymentSignature,
};
