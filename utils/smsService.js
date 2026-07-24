const axios = require('axios');
const { PlatformSetting } = require('../models');
const { normalizePhoneDigits } = require('./phoneUtils');

const SMS_CONFIG_KEY = 'sms_config';
// Delivery-only via MSG91 Flow/OneAPI (matches DLT SMS templates / Test DLT).
// Backend generates/stores/verifies OTP; MSG91 OTP verify/resend APIs are never called.
// Use the MSG91 SMS Template / Flow ID here — NOT the DLT TE ID and NOT an OTP-section template ID.
const MSG91_FLOW_URL = 'https://control.msg91.com/api/v5/flow';
const MSG91_PROVIDER = 'msg91';
const DEFAULT_OTP_VAR_NAME = 'OTP';

const REQUIRED_FIELDS = [
  'provider',
  'auth_key',
  'sender_id',
  'flow_id',
  'otp_var_name',
  'message_template',
];

function resolveFlowId(raw) {
  return String(raw?.flow_id || raw?.template_id || raw?.sms_templateid || '').trim();
}

function normalizeLegacyConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const flowId = resolveFlowId(raw);
  const otpVarName = String(raw.otp_var_name || DEFAULT_OTP_VAR_NAME).trim() || DEFAULT_OTP_VAR_NAME;

  if (raw.provider === MSG91_PROVIDER) {
    return {
      provider: MSG91_PROVIDER,
      enabled: raw.enabled !== false,
      auth_key: raw.auth_key || '',
      sender_id: raw.sender_id || '',
      flow_id: flowId,
      // Keep legacy key populated for callers that still read template_id
      template_id: flowId,
      otp_var_name: otpVarName,
      message_template: raw.message_template || '',
    };
  }

  return {
    provider: MSG91_PROVIDER,
    enabled: raw.enabled !== false,
    auth_key: raw.auth_key || raw.sms_apikey || '',
    sender_id: raw.sender_id || raw.sms_sendername || '',
    flow_id: flowId,
    template_id: flowId,
    otp_var_name: otpVarName,
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

function maskOtpForLog(otp) {
  if (process.env.NODE_ENV !== 'production') return String(otp);
  return '******';
}

function buildFlowBody(config, mobileIntl, otp) {
  const varName = config.otp_var_name.trim();
  return {
    flow_id: config.flow_id.trim(),
    sender: config.sender_id.trim(),
    recipients: [
      {
        mobiles: mobileIntl,
        [varName]: String(otp),
      },
    ],
  };
}

async function sendOtpSms(mobile, otp) {
  const config = await loadSmsConfig();
  if (!config) {
    throw new Error('Failed to send OTP SMS: SMS configuration is incomplete');
  }

  validateConfig(config);

  const mobileIntl = formatMobileForMsg91(mobile);
  const body = buildFlowBody(config, mobileIntl, otp);
  const varName = config.otp_var_name.trim();

  if (process.env.NODE_ENV !== 'production') {
    const preview = buildMessage(config.message_template, otp);
    console.log(`[OTP SMS] MSG91 Flow preview for ${mobileIntl}: ${preview}`);
  }

  const logBody = {
    flow_id: body.flow_id,
    sender: body.sender,
    recipients: [
      {
        mobiles: mobileIntl,
        [varName]: maskOtpForLog(otp),
      },
    ],
  };

  console.log('[MSG91 REQUEST]', {
    url: MSG91_FLOW_URL,
    body: logBody,
    headers: { authkey: '[REDACTED]', 'Content-Type': 'application/json' },
  });

  const response = await axios.post(MSG91_FLOW_URL, body, {
    headers: {
      authkey: config.auth_key.trim(),
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });

  const data = response.data;
  const type = typeof data === 'object' && data ? data.type : null;
  const requestId =
    type === 'success' && typeof data?.message === 'string' ? data.message : null;

  console.log('[MSG91 RESPONSE]', {
    url: MSG91_FLOW_URL,
    status: response.status,
    body: data,
    requestId,
    deliveryNote:
      'API success means accepted for processing. Check MSG91 SMS Logs with requestId for handset delivery / DLT status.',
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`MSG91 SMS failed: ${parseMsg91Error(data)}`);
  }

  if (type && type !== 'success') {
    throw new Error(`MSG91 SMS failed: ${parseMsg91Error(data)}`);
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[OTP SMS] MSG91 Flow sent to ${mobileIntl}, status=${response.status}, requestId=${requestId || 'n/a'}`
    );
  }

  return data;
}

module.exports = {
  SMS_CONFIG_KEY,
  MSG91_PROVIDER,
  MSG91_FLOW_URL,
  DEFAULT_OTP_VAR_NAME,
  loadSmsConfig,
  sendOtpSms,
  buildMessage,
  buildFlowBody,
  normalizeLegacyConfig,
  formatMobileForMsg91,
};
