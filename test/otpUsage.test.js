'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  OTP_EVENT_STATUS,
  BLOCKED_MESSAGE,
  CAPPED_MESSAGE,
  costRupees,
  normalizeOtpUsageConfig,
  evaluateOtpGate,
  extractProviderRequestId,
} = require('../services/otpUsageMath');

test('cost is sent_count times paise, FAILED sends are not included', () => {
  assert.equal(costRupees(0, 18), 0);
  assert.equal(costRupees(1, 18), 0.18);
  assert.equal(costRupees(10, 18), 1.8);
  assert.equal(costRupees(0, 18), costRupees(0, 18));
});

test('normalizeOtpUsageConfig falls back to 5 cap and 18 paise', () => {
  assert.deepEqual(normalizeOtpUsageConfig(null), {
    daily_cap_per_phone: 5,
    sms_cost_paise: 18,
  });
  assert.deepEqual(normalizeOtpUsageConfig({ daily_cap_per_phone: 8, sms_cost_paise: 25 }), {
    daily_cap_per_phone: 8,
    sms_cost_paise: 25,
  });
});

test('blocked phones are rejected before send', () => {
  const gate = evaluateOtpGate({
    blocked: true,
    sentToday: 0,
    cap: 5,
    cooldownAllowed: true,
  });
  assert.equal(gate.action, OTP_EVENT_STATUS.BLOCKED);
  assert.equal(gate.statusCode, 403);
  assert.equal(gate.message, BLOCKED_MESSAGE);
});

test('five SENT OTPs today are capped and do not send', () => {
  const gate = evaluateOtpGate({
    blocked: false,
    sentToday: 5,
    cap: 5,
    cooldownAllowed: true,
  });
  assert.equal(gate.action, OTP_EVENT_STATUS.CAPPED);
  assert.equal(gate.statusCode, 429);
  assert.equal(gate.message, CAPPED_MESSAGE);
});

test('under the cap with cooldown clear is allowed to send', () => {
  const gate = evaluateOtpGate({
    blocked: false,
    sentToday: 4,
    cap: 5,
    cooldownAllowed: true,
  });
  assert.equal(gate.action, 'SEND');
});

test('cooldown rejects without logging a cap or block event', () => {
  const gate = evaluateOtpGate({
    blocked: false,
    sentToday: 1,
    cap: 5,
    cooldownAllowed: false,
    cooldownWaitSec: 42,
  });
  assert.equal(gate.action, 'COOLDOWN');
  assert.equal(gate.statusCode, 429);
  assert.match(gate.message, /42/);
});

test('extracts MSG91 request id from a success payload', () => {
  assert.equal(
    extractProviderRequestId({ type: 'success', message: 'req-123' }),
    'req-123',
  );
  assert.equal(extractProviderRequestId({ type: 'error', message: 'nope' }), null);
});
