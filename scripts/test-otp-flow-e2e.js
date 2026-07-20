'use strict';

/**
 * End-to-end OTP flow test (backend only, SMS mocked):
 * otp-request -> phone_otp_sessions -> otp-verify -> JWT/signupToken
 */

require('dotenv').config();

const path = require('path');

const TEST_PHONE = '9999900001';

function mockReqRes(body, headers = {}) {
  const req = { body, headers };
  let statusCode = 200;
  let jsonBody = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      jsonBody = data;
      return this;
    },
  };
  const next = (err) => {
    if (err) throw err;
  };
  return {
    req,
    res,
    next,
    get statusCode() {
      return statusCode;
    },
    get jsonBody() {
      return jsonBody;
    },
  };
}

function loadControllerWithMockedSms() {
  const smsPath = require.resolve('../utils/smsService');
  const controllerPath = require.resolve('../controllers/appAuthController');

  delete require.cache[controllerPath];
  delete require.cache[smsPath];

  const smsService = require('../utils/smsService');
  smsService.sendOtpSms = async () => ({ type: 'success', message: 'mock' });

  return {
    appAuthController: require('../controllers/appAuthController'),
    smsService,
  };
}

async function run() {
  const { sequelize, PhoneOtpSession, User } = require('../models');
  const { appAuthController, smsService } = loadControllerWithMockedSms();
  const originalSend = smsService.sendOtpSms;

  await sequelize.authenticate();

  async function cleanup() {
    await PhoneOtpSession.destroy({ where: { phone: TEST_PHONE } });
    const user = await User.findOne({ where: { phone: TEST_PHONE } });
    if (user) await user.destroy();
  }

  try {
    smsService.sendOtpSms = async () => ({ type: 'success', message: 'mock' });
    await cleanup();

    const requestCtx = mockReqRes({ phone: TEST_PHONE });
    await appAuthController.otpRequest(requestCtx.req, requestCtx.res, requestCtx.next);

    if (requestCtx.statusCode !== 200) {
      throw new Error(`otp-request failed: ${JSON.stringify(requestCtx.jsonBody)}`);
    }

    const session = await PhoneOtpSession.findOne({ where: { phone: TEST_PHONE } });
    if (!session?.otp) {
      throw new Error('OTP session not stored in phone_otp_sessions');
    }

    console.log('otp-request: PASS (session stored)');

    const verifyCtx = mockReqRes({ phone: TEST_PHONE, otp: session.otp });
    await appAuthController.otpVerify(verifyCtx.req, verifyCtx.res, verifyCtx.next);

    if (verifyCtx.statusCode !== 200) {
      throw new Error(`otp-verify failed: ${JSON.stringify(verifyCtx.jsonBody)}`);
    }

    const result = verifyCtx.jsonBody;
    if (typeof result.isNewUser !== 'boolean') {
      throw new Error('otp-verify response missing isNewUser');
    }

    if (result.isNewUser) {
      if (!result.signupToken || !result.phone) {
        throw new Error('New user response missing signupToken or phone');
      }
      console.log('otp-verify: PASS (new user signupToken issued)');
    } else {
      if (!result.token || !result.user) {
        throw new Error('Existing user response missing token or user');
      }
      console.log('otp-verify: PASS (existing user JWT issued)');
    }

    const sessionAfter = await PhoneOtpSession.findOne({ where: { phone: TEST_PHONE } });
    if (sessionAfter) {
      throw new Error('OTP session should be destroyed after verify');
    }
    console.log('session cleanup: PASS');

    console.log('\nOTP flow e2e test: PASS');
  } finally {
    smsService.sendOtpSms = originalSend;
    await cleanup();
    await sequelize.close();
  }
}

run().catch((err) => {
  console.error('OTP flow e2e test: FAIL');
  console.error(err.message);
  process.exit(1);
});
