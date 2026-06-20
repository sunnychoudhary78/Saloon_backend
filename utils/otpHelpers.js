const crypto = require('crypto');

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 5;
const MAX_VERIFY_ATTEMPTS = 5;
const OTP_REQUEST_COOLDOWN_MS = 60 * 1000;

const requestCooldowns = new Map();

function normalizePhone(raw) {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

function generateOtp() {
  const max = 10 ** OTP_LENGTH;
  const value = crypto.randomInt(0, max);
  return String(value).padStart(OTP_LENGTH, '0');
}

function getOtpExpiryDate() {
  return new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
}

function isOtpExpired(expiresAt) {
  return !expiresAt || new Date(expiresAt).getTime() <= Date.now();
}

function checkRequestCooldown(phone) {
  const last = requestCooldowns.get(phone);
  if (last && Date.now() - last < OTP_REQUEST_COOLDOWN_MS) {
    const waitSec = Math.ceil((OTP_REQUEST_COOLDOWN_MS - (Date.now() - last)) / 1000);
    return { allowed: false, waitSec };
  }
  return { allowed: true };
}

function markOtpRequested(phone) {
  requestCooldowns.set(phone, Date.now());
}

function sanitizeOtpDeliveryError(err) {
  const msg = err?.message || String(err);
  if (/smtp|mail|email/i.test(msg)) {
    return 'We could not send the OTP email. Please try again or contact support.';
  }
  if (/sms|gateway|message india/i.test(msg)) {
    return 'We could not send SMS. Please check your number and try again.';
  }
  if (/incomplete|configuration/i.test(msg)) {
    return msg;
  }
  return 'Failed to send OTP. Please try again later.';
}

module.exports = {
  OTP_LENGTH,
  OTP_EXPIRY_MINUTES,
  MAX_VERIFY_ATTEMPTS,
  normalizePhone,
  generateOtp,
  getOtpExpiryDate,
  isOtpExpired,
  checkRequestCooldown,
  markOtpRequested,
  sanitizeOtpDeliveryError,
};
