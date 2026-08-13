const OTP_USAGE_CONFIG_KEY = 'otp_usage_config';
const DEFAULT_DAILY_CAP = 5;
const DEFAULT_SMS_COST_PAISE = 18;

const OTP_PURPOSE = Object.freeze({
  LOGIN: 'LOGIN',
  PHONE_CHANGE: 'PHONE_CHANGE',
});

const OTP_EVENT_STATUS = Object.freeze({
  SENT: 'SENT',
  FAILED: 'FAILED',
  BLOCKED: 'BLOCKED',
  CAPPED: 'CAPPED',
});

const BLOCKED_MESSAGE =
  'OTP requests for this number are temporarily disabled. Contact support.';
const CAPPED_MESSAGE = 'Daily OTP limit reached. Try again tomorrow.';

function costRupees(sentCount, smsCostPaise) {
  const count = Number(sentCount) || 0;
  const paise = Number(smsCostPaise) || 0;
  return Math.round(count * paise) / 100;
}

function normalizeOtpUsageConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const cap = parseInt(source.daily_cap_per_phone, 10);
  const paise = parseInt(source.sms_cost_paise, 10);
  return {
    daily_cap_per_phone: Number.isFinite(cap) && cap >= 1 ? cap : DEFAULT_DAILY_CAP,
    sms_cost_paise: Number.isFinite(paise) && paise >= 0 ? paise : DEFAULT_SMS_COST_PAISE,
  };
}

function evaluateOtpGate({ blocked, sentToday, cap, cooldownAllowed, cooldownWaitSec = 0 }) {
  if (blocked) {
    return {
      action: OTP_EVENT_STATUS.BLOCKED,
      statusCode: 403,
      message: BLOCKED_MESSAGE,
    };
  }
  if ((Number(sentToday) || 0) >= (Number(cap) || DEFAULT_DAILY_CAP)) {
    return {
      action: OTP_EVENT_STATUS.CAPPED,
      statusCode: 429,
      message: CAPPED_MESSAGE,
    };
  }
  if (!cooldownAllowed) {
    return {
      action: 'COOLDOWN',
      statusCode: 429,
      message: `Please wait ${cooldownWaitSec} seconds before requesting another OTP`,
    };
  }
  return { action: 'SEND' };
}

function extractProviderRequestId(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.type === 'success' && typeof data.message === 'string') return data.message;
  return null;
}

module.exports = {
  OTP_USAGE_CONFIG_KEY,
  DEFAULT_DAILY_CAP,
  DEFAULT_SMS_COST_PAISE,
  OTP_PURPOSE,
  OTP_EVENT_STATUS,
  BLOCKED_MESSAGE,
  CAPPED_MESSAGE,
  costRupees,
  normalizeOtpUsageConfig,
  evaluateOtpGate,
  extractProviderRequestId,
};
