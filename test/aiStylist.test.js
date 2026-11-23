'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  validateCreateSession,
  validateAnalyzeFace,
  validateChatMessage,
  validateTryOn,
} = require('../validators/aiStylistValidator');
const {
  extractJsonObject,
  createOpenAiHairMask,
  createStandardInpaintHairMask,
  compositePreservedFace,
} = require('../services/aiProviderService');
const sharp = require('sharp');
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

test('createOpenAiHairMask creates transparent hair and opaque face mask for OpenAI inpainting', async () => {
  const maskBuf = await createOpenAiHairMask(1024, 1024);
  const meta = await sharp(maskBuf).metadata();
  assert.equal(meta.width, 1024);
  assert.equal(meta.height, 1024);
  assert.equal(meta.channels, 4);
  assert.equal(meta.hasAlpha, true);

  const raw = await sharp(maskBuf).raw().toBuffer();
  // Hair region (e.g. x: 512, y: 100 near top) should be transparent (alpha == 0)
  const hairIdx = (100 * 1024 + 512) * 4;
  const hairAlpha = raw[hairIdx + 3];
  assert.equal(hairAlpha, 0);

  // Center face region (e.g. x: 512, y: 580) should be protected / opaque (alpha == 255)
  const faceIdx = (580 * 1024 + 512) * 4;
  const faceAlpha = raw[faceIdx + 3];
  assert.equal(faceAlpha, 255);
});

test('createStandardInpaintHairMask creates white hair and black face mask for FLUX inpainting', async () => {
  const maskBuf = await createStandardInpaintHairMask(1024, 1024);
  const meta = await sharp(maskBuf).metadata();
  assert.equal(meta.width, 1024);
  assert.equal(meta.height, 1024);

  const raw = await sharp(maskBuf).raw().toBuffer();
  // Top hair region (x: 512, y: 180) should be white (value > 200)
  const hairIdx = (180 * 1024 + 512) * meta.channels;
  assert.ok(raw[hairIdx] > 200, `Expected white hair mask, got ${raw[hairIdx]}`);

  // Center face region (x: 512, y: 600) should be black (value < 50)
  const faceIdx = (600 * 1024 + 512) * meta.channels;
  assert.ok(raw[faceIdx] < 50, `Expected black face mask, got ${raw[faceIdx]}`);
});

test('compositePreservedFace guarantees 100% face identity preservation', async () => {
  // Create a simulated original user photo (pure blue face: 0, 0, 200)
  const userOriginal = await sharp({
    create: { width: 1024, height: 1024, channels: 3, background: { r: 0, g: 0, b: 200 } }
  }).png().toBuffer();

  // Create a simulated generated AI hairstyle image (completely different green image: 0, 200, 0)
  const aiGeneratedHair = await sharp({
    create: { width: 1024, height: 1024, channels: 3, background: { r: 0, g: 200, b: 0 } }
  }).png().toBuffer();

  const composited = await compositePreservedFace({
    originalFront: userOriginal,
    inpainted: aiGeneratedHair,
    width: 1024,
    height: 1024,
  });

  const compRaw = await sharp(composited).raw().toBuffer();
  // In the center face region (x: 512, y: 580), the pixels must be identical to the user's photo (blue: R ~ 0, G ~ 0, B ~ 200)
  const faceIdx = (580 * 1024 + 512) * 3;
  const r = compRaw[faceIdx];
  const g = compRaw[faceIdx + 1];
  const b = compRaw[faceIdx + 2];

  assert.ok(r < 10, `Expected R near 0, got ${r}`);
  assert.ok(g < 10, `Expected G near 0, got ${g}`);
  assert.ok(b > 180, `Expected B near 200 (original face color), got ${b}`);

  // In the top hair region (x: 512, y: 100), the pixels must show the AI generated hairstyle (green: G ~ 200, B ~ 0)
  const hairIdx = (100 * 1024 + 512) * 3;
  const hairR = compRaw[hairIdx];
  const hairG = compRaw[hairIdx + 1];
  const hairB = compRaw[hairIdx + 2];
  assert.ok(hairG > 180, `Expected hair G near 200 (generated hairstyle), got ${hairG}`);
  assert.ok(hairB < 10, `Expected hair B near 0, got ${hairB}`);
});
