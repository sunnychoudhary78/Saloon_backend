const PHONE_DIGIT_LENGTH = 10;

function normalizePhoneDigits(raw) {
  if (raw == null || raw === '') return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length !== PHONE_DIGIT_LENGTH) return null;
  return digits;
}

function isValidPhoneDigits(raw) {
  return normalizePhoneDigits(raw) != null;
}

module.exports = {
  PHONE_DIGIT_LENGTH,
  normalizePhoneDigits,
  isValidPhoneDigits,
};
