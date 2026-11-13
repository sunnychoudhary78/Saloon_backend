'use strict';

const Joi = require('joi');

function parseJsonField(val, fallback) {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'object') return val;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch (_) {
      return null;
    }
  }
  return null;
}

const createSessionSchema = Joi.object({
  title: Joi.string().trim().max(180).allow('', null).optional(),
});

const analyzeFaceSchema = Joi.object({
  on_device_features: Joi.object().unknown(true).default({}),
  preferences: Joi.object({
    gender: Joi.string().valid('men', 'women', 'unisex', 'MEN', 'WOMEN', 'UNISEX').optional(),
    hair_length_goal: Joi.string().valid('short', 'medium', 'long', 'any').optional(),
    maintenance_level: Joi.string().valid('low', 'medium', 'high', 'any').optional(),
    occasion: Joi.string().trim().max(60).optional(),
    beard_preference: Joi.string().trim().max(60).optional(),
    language: Joi.string().valid('english', 'hinglish', 'hindi').default('english'),
  })
    .unknown(true)
    .default({}),
  user_note: Joi.string().trim().max(1000).allow('', null).optional(),
  user_lat: Joi.number().min(-90).max(90).optional().allow(null, ''),
  user_lng: Joi.number().min(-180).max(180).optional().allow(null, ''),
  audience: Joi.string().valid('men', 'women', 'MEN', 'WOMEN').optional(),
});

const chatMessageSchema = Joi.object({
  message: Joi.string().trim().min(1).max(1500).required(),
  analysis_id: Joi.string().uuid().allow('', null).optional(),
  user_lat: Joi.number().min(-90).max(90).optional().allow(null, ''),
  user_lng: Joi.number().min(-180).max(180).optional().allow(null, ''),
  audience: Joi.string().valid('men', 'women', 'MEN', 'WOMEN').optional(),
  language: Joi.string().valid('english', 'hinglish', 'hindi').default('english').optional(),
});

const tryOnSchema = Joi.object({
  hairstyle_name: Joi.string().trim().min(2).max(150).required(),
  hairstyle_prompt: Joi.string().trim().max(600).allow('', null).optional(),
  hair_color: Joi.string().trim().max(80).allow('', null).optional(),
});

function validateCreateSession(req, res, next) {
  const { error, value } = createSessionSchema.validate(req.body || {}, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    return res.status(400).json({
      message: 'Validation error',
      details: error.details.map((d) => d.message),
    });
  }
  req.body = value;
  next();
}

function validateAnalyzeFace(req, res, next) {
  const rawBody = { ...(req.body || {}) };

  const parsedFeatures = parseJsonField(rawBody.on_device_features, {});
  if (parsedFeatures === null) {
    return res.status(400).json({
      message: 'Validation error',
      details: ['on_device_features must be valid JSON'],
    });
  }
  rawBody.on_device_features = parsedFeatures;

  const parsedPrefs = parseJsonField(rawBody.preferences, {});
  if (parsedPrefs === null) {
    return res.status(400).json({
      message: 'Validation error',
      details: ['preferences must be valid JSON'],
    });
  }
  rawBody.preferences = parsedPrefs;

  const { error, value } = analyzeFaceSchema.validate(rawBody, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    return res.status(400).json({
      message: 'Validation error',
      details: error.details.map((d) => d.message),
    });
  }
  req.body = value;
  next();
}

function validateChatMessage(req, res, next) {
  const { error, value } = chatMessageSchema.validate(req.body || {}, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    return res.status(400).json({
      message: 'Validation error',
      details: error.details.map((d) => d.message),
    });
  }
  req.body = value;
  next();
}

function validateTryOn(req, res, next) {
  const { error, value } = tryOnSchema.validate(req.body || {}, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    return res.status(400).json({
      message: 'Validation error',
      details: error.details.map((d) => d.message),
    });
  }
  req.body = value;
  next();
}

module.exports = {
  parseJsonField,
  validateCreateSession,
  validateAnalyzeFace,
  validateChatMessage,
  validateTryOn,
};
