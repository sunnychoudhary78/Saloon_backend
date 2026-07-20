const axios = require('axios');
const { PlatformSetting } = require('../models');
const { OTP_EXPIRY_MINUTES, OTP_LENGTH } = require('./otpHelpers');
const { normalizePhoneDigits } = require('./phoneUtils');

const SMS_CONFIG_KEY = 'sms_config';
// Delivery-only: backend generates/stores/verifies OTP; MSG91 verify/resend APIs are never called.
const MSG91_OTP_URL = 'https://control.msg91.com/api/v5/otp';
const MSG91_PROVIDER = 'msg91';

const REQUIRED_FIELDS = [
  'provider',
  'auth_key',
  'sender_id',
  'template_id',
  'message_template',
];

function normalizeLegacyConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;

  if (raw.provider === MSG91_PROVIDER) {
    return {
      provider: MSG91_PROVIDER,
      enabled: raw.enabled !== false,
      auth_key: raw.auth_key || '',
      sender_id: raw.sender_id || '',
      template_id: raw.template_id || '',
      message_template: raw.message_template || '',
    };
  }

  return {
    provider: MSG91_PROVIDER,
    enabled: raw.enabled !== false,
    auth_key: raw.auth_key || raw.sms_apikey || '',
    sender_id: raw.sender_id || raw.sms_sendername || '',
    template_id: raw.template_id || raw.sms_templateid || '',
    message_template: raw.message_template || raw.sms_message || '',
  };
}

async function loadSmsConfig() {
  const row = await PlatformSetting.findOne({
    where: { setting_key: SMS_CONFIG_KEY, is_active: true },
  });
  if (!row?.setting_value) return null;

  const raw = typeof row.setting_value === 'string'
    ? JSON.parse(row.setting_value)
    : row.setting_value;

  const config = normalizeLegacyConfig(raw);
  if (!config || config.enabled === false) return null;
  return config;
}

function buildMessage(template, otp, appHash) {
  if (!template || typeof template !== 'string') return otp;
  let message = template.includes('--')
    ? template.replace(/--/g, otp)
    : `${template} ${otp}`;
  if (appHash && typeof appHash === 'string' && appHash.trim()) {
    message = `${message.trim()}\n${appHash.trim()}`;
  }
  return message;
}

function formatMobileForMsg91(mobile) {
  const digits = normalizePhoneDigits(mobile);
  if (!digits) {
    throw new Error('Failed to send OTP SMS: invalid mobile number');
  }
  return `91${digits}`;
}

function validateConfig(config) {
  if (!config) {
    throw new Error('Failed to send OTP SMS: SMS configuration is incomplete');
  }

  if (config.provider !== MSG91_PROVIDER) {
    throw new Error(`Failed to send OTP SMS: unsupported SMS provider "${config.provider || 'unknown'}"`);
  }

  const missing = REQUIRED_FIELDS.filter((f) => !String(config[f] || '').trim());
  if (missing.length) {
    throw new Error(`Failed to send OTP SMS: SMS configuration is incomplete (missing: ${missing.join(', ')})`);
  }

  if (!String(config.message_template).includes('--')) {
    throw new Error('Failed to send OTP SMS: message_template must include -- as the OTP placeholder');
  }
}

function parseMsg91Error(data) {
  if (!data) return 'Unknown MSG91 error';
  if (typeof data === 'string') return data;
  return data.message || data.error || JSON.stringify(data);
}

async function sendOtpSms(mobile, otp) {
  const config = await loadSmsConfig();
  if (!config) {
    throw new Error('Failed to send OTP SMS: SMS configuration is incomplete');
  }

  validateConfig(config);

  const mobileIntl = formatMobileForMsg91(mobile);

  if (process.env.NODE_ENV !== 'production') {
    const preview = buildMessage(config.message_template, otp);
    console.log(`[OTP SMS] MSG91 preview for ${mobileIntl}: ${preview}`);
  }

  const response = await axios.post(
    MSG91_OTP_URL,
    {
      template_id: config.template_id.trim(),
      mobile: mobileIntl,
      otp: String(otp),
      otp_expiry: OTP_EXPIRY_MINUTES,
      otp_length: OTP_LENGTH,
    },
    {
      headers: {
        authkey: config.auth_key.trim(),
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );

  const data = response.data;
  const type = typeof data === 'object' && data ? data.type : null;

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`MSG91 SMS failed: ${parseMsg91Error(data)}`);
  }

  if (type && type !== 'success') {
    throw new Error(`MSG91 SMS failed: ${parseMsg91Error(data)}`);
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[OTP SMS] MSG91 sent to ${mobileIntl}, status=${response.status}`);
  }

  return data;
}

module.exports = {
  SMS_CONFIG_KEY,
  MSG91_PROVIDER,
  loadSmsConfig,
  sendOtpSms,
  buildMessage,
  normalizeLegacyConfig,
  formatMobileForMsg91,
};
