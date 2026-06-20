const axios = require('axios');
const { PlatformSetting } = require('../models');

const SMS_CONFIG_KEY = 'sms_config';

const REQUIRED_FIELDS = [
  'sms_url',
  'sms_username',
  'sms_sendername',
  'sms_smstype',
  'sms_apikey',
];

async function loadSmsConfig() {
  const row = await PlatformSetting.findOne({
    where: { setting_key: SMS_CONFIG_KEY, is_active: true },
  });
  if (!row?.setting_value) return null;

  const config = typeof row.setting_value === 'string'
    ? JSON.parse(row.setting_value)
    : row.setting_value;

  if (config.enabled === false) return null;
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

function validateConfig(config) {
  const missing = REQUIRED_FIELDS.filter((f) => !config[f]);
  if (missing.length) {
    throw new Error(`Failed to send OTP SMS: SMS configuration is incomplete (missing: ${missing.join(', ')})`);
  }
}

async function sendOtpSms(mobile, otp) {
  const config = await loadSmsConfig();
  if (!config) {
    throw new Error('Failed to send OTP SMS: SMS configuration is incomplete');
  }

  validateConfig(config);

  const baseUrl = String(config.sms_url).split('?')[0];
  const message = buildMessage(config.sms_message, otp, config.sms_app_hash);

  const params = new URLSearchParams({
    username: config.sms_username,
    message,
    sendername: config.sms_sendername,
    smstype: config.sms_smstype,
    numbers: mobile,
    apikey: config.sms_apikey,
  });

  if (config.sms_peid) params.set('peid', config.sms_peid);
  if (config.sms_templateid) params.set('templateid', config.sms_templateid);

  const url = `${baseUrl}?${params.toString()}`;
  const response = await axios.get(url, { timeout: 15000 });

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[OTP SMS] sent to ${mobile}, status=${response.status}`);
  }

  return response.data;
}

module.exports = {
  SMS_CONFIG_KEY,
  loadSmsConfig,
  sendOtpSms,
  buildMessage,
};
