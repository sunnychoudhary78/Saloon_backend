'use strict';

/**
 * Validates MSG91 integration contract:
 * - sendOtpSms always POSTs to v5/otp with explicit otp param
 * - No MSG91 verify/resend endpoints are called
 */

const axios = require('axios');

const FORBIDDEN_URL_PATTERNS = [/verify/i, /resend/i, /sendotp\.php/i, /messageindia/i];
const EXPECTED_URL = 'https://control.msg91.com/api/v5/otp';

async function run() {
  const captured = { posts: [] };
  const originalPost = axios.post;

  axios.post = async (url, body, opts) => {
    captured.posts.push({ url, body, headers: opts?.headers || {} });
    return { status: 200, data: { type: 'success', message: 'mock-ok' } };
  };

  const { PlatformSetting } = require('../models');
  const originalFindOne = PlatformSetting.findOne;
  PlatformSetting.findOne = async () => ({
    setting_value: {
      provider: 'msg91',
      enabled: true,
      auth_key: 'test-auth-key-redacted',
      sender_id: 'TESTID',
      template_id: 'test-template-id',
      message_template: 'Your OTP is --',
    },
  });

  try {
    const { sendOtpSms } = require('../utils/smsService');
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

    if (call.body.otp !== '654321') {
      throw new Error(`Expected otp in body, got ${call.body.otp}`);
    }

    if (call.body.mobile !== '919876543210') {
      throw new Error(`Expected mobile 919876543210, got ${call.body.mobile}`);
    }

    if (!call.body.template_id) {
      throw new Error('template_id missing from request body');
    }

    if (call.body.otp_expiry !== 5 || call.body.otp_length !== 6) {
      throw new Error('otp_expiry/otp_length must match backend OTP settings');
    }

    if (!call.headers.authkey) {
      throw new Error('authkey header missing');
    }

    console.log('MSG91 contract test: PASS');
    console.log('  endpoint:', call.url);
    console.log('  sends explicit otp: yes');
    console.log('  mobile format: 91XXXXXXXXXX');
    console.log('  verify/resend endpoints called: no');
  } finally {
    axios.post = originalPost;
    PlatformSetting.findOne = originalFindOne;
  }
}

run().catch((err) => {
  console.error('MSG91 contract test: FAIL');
  console.error(err.message);
  process.exit(1);
});
