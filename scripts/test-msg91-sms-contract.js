'use strict';

/**
 * Validates MSG91 Flow integration contract:
 * - sendOtpSms always POSTs to /api/v5/flow with flow_id, sender, recipients
 * - OTP is passed as the configured flow variable (default OTP)
 * - No MSG91 OTP verify/resend / legacy OTP send endpoints are called
 */

const axios = require('axios');

const FORBIDDEN_URL_PATTERNS = [
  /\/otp\/verify/i,
  /\/otp\/retry/i,
  /\/api\/v5\/otp$/i,
  /sendotp\.php/i,
  /messageindia/i,
  /sendsms/i,
];
const EXPECTED_URL = 'https://control.msg91.com/api/v5/flow';

async function run() {
  const captured = { posts: [] };
  const originalPost = axios.post;

  axios.post = async (url, body, opts) => {
    captured.posts.push({ url, body, headers: opts?.headers || {} });
    return { status: 200, data: { type: 'success', message: 'mock-request-id-abc' } };
  };

  const { PlatformSetting } = require('../models');
  const originalFindOne = PlatformSetting.findOne;
  PlatformSetting.findOne = async () => ({
    setting_value: {
      provider: 'msg91',
      enabled: true,
      auth_key: 'test-auth-key-redacted',
      sender_id: 'TESTID',
      flow_id: 'test-flow-id',
      template_id: 'legacy-should-not-be-used-when-flow_id-set',
      otp_var_name: 'OTP',
      message_template: 'Your OTP is --',
    },
  });

  try {
    // Clear require cache so smsService picks up mocked axios if needed after edits
    delete require.cache[require.resolve('../utils/smsService')];
    const { sendOtpSms, MSG91_FLOW_URL } = require('../utils/smsService');

    if (MSG91_FLOW_URL !== EXPECTED_URL) {
      throw new Error(`Expected MSG91_FLOW_URL ${EXPECTED_URL}, got ${MSG91_FLOW_URL}`);
    }

    await sendOtpSms('9876543210', '654321');

    if (captured.posts.length !== 1) {
      throw new Error(`Expected 1 POST call, got ${captured.posts.length}`);
    }

    const call = captured.posts[0];

    if (call.url !== EXPECTED_URL) {
      throw new Error(`Expected URL ${EXPECTED_URL}, got ${call.url}`);
    }

    for (const pattern of FORBIDDEN_URL_PATTERNS) {
      if (pattern.test(call.url)) {
        throw new Error(`Forbidden URL pattern matched: ${call.url}`);
      }
    }

    if (call.body.flow_id !== 'test-flow-id') {
      throw new Error(`Expected flow_id test-flow-id, got ${call.body.flow_id}`);
    }

    if (call.body.sender !== 'TESTID') {
      throw new Error(`Expected sender TESTID, got ${call.body.sender}`);
    }

    if (!Array.isArray(call.body.recipients) || call.body.recipients.length !== 1) {
      throw new Error('Expected recipients array with one entry');
    }

    const recipient = call.body.recipients[0];
    if (recipient.mobiles !== '919876543210') {
      throw new Error(`Expected mobiles 919876543210, got ${recipient.mobiles}`);
    }

    if (recipient.OTP !== '654321') {
      throw new Error(`Expected recipient.OTP 654321, got ${recipient.OTP}`);
    }

    if (call.body.otp !== undefined || call.body.template_id !== undefined) {
      throw new Error('OTP API fields (otp / template_id) must not be present on Flow body');
    }

    if (!call.headers.authkey) {
      throw new Error('authkey header missing');
    }

    // Legacy template_id-only config must still resolve to flow_id
    captured.posts = [];
    PlatformSetting.findOne = async () => ({
      setting_value: {
        provider: 'msg91',
        enabled: true,
        auth_key: 'test-auth-key-redacted',
        sender_id: 'CATCHY',
        template_id: 'legacy-template-as-flow',
        message_template: 'Your OTP is --',
      },
    });
    delete require.cache[require.resolve('../utils/smsService')];
    const { sendOtpSms: sendAgain } = require('../utils/smsService');
    await sendAgain('9123456780', '111222');

    const legacyCall = captured.posts[0];
    if (legacyCall.body.flow_id !== 'legacy-template-as-flow') {
      throw new Error('Legacy template_id was not mapped to flow_id');
    }
    if (legacyCall.body.recipients[0].OTP !== '111222') {
      throw new Error('Default otp_var_name OTP was not applied for legacy config');
    }

    console.log('MSG91 Flow contract test: PASS');
    console.log('  endpoint:', call.url);
    console.log('  flow_id + sender in body: yes');
    console.log('  otp via recipients variable: yes');
    console.log('  legacy template_id → flow_id: yes');
    console.log('  OTP verify/resend/send endpoints called: no');
  } finally {
    axios.post = originalPost;
    PlatformSetting.findOne = originalFindOne;
  }
}

run().catch((err) => {
  console.error('MSG91 Flow contract test: FAIL');
  console.error(err.message);
  process.exit(1);
});
