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

function getWebhookSecret() {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    throw new AppError('Razorpay webhook secret is not configured', 500);
  }
  return secret;
}

/**
 * Verifies X-Razorpay-Signature against the raw webhook request body.
 * @param {Buffer|string} rawBody
 * @param {string|undefined} signature
 */
function verifyWebhookSignature(rawBody, signature) {
  if (!signature) return false;

  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody));
  const expected = crypto
    .createHmac('sha256', getWebhookSecret())
    .update(body)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'utf8'),
      Buffer.from(signature, 'utf8'),
    );
  } catch {
    return false;
  }
}

module.exports = {
  amountToPaise,
  createOrder,
  getKeyId,
  getWebhookSecret,
  verifyPaymentSignature,
  verifyWebhookSignature,
};
