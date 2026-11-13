'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  validateCreateSession,
  validateAnalyzeFace,
  validateChatMessage,
  validateTryOn,
} = require('../validators/aiStylistValidator');
const { extractJsonObject } = require('../services/aiProviderService');
const { normalizeMatchedServiceNames } = require('../services/aiSalonMatcherService');

test('validateCreateSession accepts empty or titled body', () => {
  const req = { body: { title: 'Wedding Look' } };
  let nextCalled = false;
  validateCreateSession(req, {}, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(req.body.title, 'Wedding Look');
});

test('validateAnalyzeFace parses JSON string fields from multipart form-data', () => {
  const req = {
    body: {
      on_device_features: JSON.stringify({
        estimated_face_shape: 'oval',
        measurements: { face_length_to_width_ratio: 1.38 },
      }),
      preferences: JSON.stringify({
        gender: 'men',
        hair_length_goal: 'short',
        language: 'english',
      }),
      user_note: 'Looking for an office-friendly haircut',
    },
  };

  let nextCalled = false;
  validateAnalyzeFace(req, {}, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.body.on_device_features.estimated_face_shape, 'oval');
  assert.equal(req.body.preferences.gender, 'men');
  assert.equal(req.body.user_note, 'Looking for an office-friendly haircut');
});

test('validateAnalyzeFace rejects malformed JSON strings', () => {
  const req = {
    body: {
      on_device_features: '{bad json',
    },
  };
  let statusCode = 0;
  validateAnalyzeFace(
    req,
    {
      status: (s) => {
        statusCode = s;
        return { json: () => {} };
      },
    },
    () => {}
  );
  assert.equal(statusCode, 400);
});

test('validateChatMessage requires non-empty message', () => {
  const reqBad = { body: { message: '   ' } };
  let statusCode = 0;
  validateChatMessage(
    reqBad,
    {
      status: (s) => {
        statusCode = s;
        return { json: () => {} };
      },
    },
    () => {}
  );
  assert.equal(statusCode, 400);

  const reqOk = { body: { message: 'Would a beard suit my face shape?' } };
  let nextCalled = false;
  validateChatMessage(reqOk, {}, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

test('validateTryOn requires hairstyle_name', () => {
  const reqOk = { body: { hairstyle_name: 'Textured Crop' } };
  let nextCalled = false;
  validateTryOn(reqOk, {}, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

test('extractJsonObject parses fenced and raw JSON responses', () => {
  const fenced = '```json\n{"reply_message":"Hello","recommendations":[]}\n```';
  const parsed = extractJsonObject(fenced);
  assert.equal(parsed.reply_message, 'Hello');
  assert.deepEqual(parsed.recommendations, []);
});

test('normalizeMatchedServiceNames maps canonical CATCHY services and falls back safely', () => {
  const mapped = normalizeMatchedServiceNames(['haircut', 'beard styling', 'unknown']);
  assert.deepEqual(mapped, ['Haircut', 'Beard Styling']);

  const fallback = normalizeMatchedServiceNames(['completely_unknown']);
  assert.deepEqual(fallback, ['Haircut', 'Hair Styling']);
});
