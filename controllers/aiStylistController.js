'use strict';

const aiStylistService = require('../services/aiStylistService');

exports.createSession = async (req, res) => {
  const session = await aiStylistService.createSession(
    req.user.id,
    req.body?.title
  );
  res.status(201).json({ data: session });
};

exports.listSessions = async (req, res) => {
  const { limit, offset } = req.query;
  const result = await aiStylistService.listSessions(req.user.id, {
    limit,
    offset,
  });
  res.json({
    data: result.rows,
    total: result.count,
  });
};

exports.getSessionMessages = async (req, res) => {
  const { sessionId } = req.params;
  const result = await aiStylistService.getSessionMessages(
    req.user.id,
    sessionId
  );
  res.json({ data: result });
};

exports.deleteSession = async (req, res) => {
  const { sessionId } = req.params;
  const result = await aiStylistService.deleteSession(req.user.id, sessionId);
  res.json({ data: result });
};

exports.analyzeFace = async (req, res) => {
  const { sessionId } = req.params;
  const {
    on_device_features,
    preferences,
    user_note,
    user_lat,
    user_lng,
    audience,
  } = req.body;

  const result = await aiStylistService.analyzeFaceAndSuggest({
    userId: req.user.id,
    sessionId,
    files: req.files,
    onDeviceFeatures: on_device_features,
    preferences,
    userNote: user_note,
    userLat: user_lat,
    userLng: user_lng,
    audience,
  });

  res.status(201).json({ data: result });
};

exports.sendChatMessage = async (req, res) => {
  const { sessionId } = req.params;
  const {
    message,
    analysis_id,
    user_lat,
    user_lng,
    audience,
    language,
  } = req.body;

  const result = await aiStylistService.sendChatMessage({
    userId: req.user.id,
    sessionId,
    message,
    analysisId: analysis_id || null,
    userLat: user_lat,
    userLng: user_lng,
    audience,
    language,
  });

  res.status(201).json({ data: result });
};

exports.getRecommendedSalons = async (req, res) => {
  const { analysisId } = req.params;
  const { hairstyle_tag, user_lat, user_lng, audience } = req.query;

  const salons = await aiStylistService.getRecommendedSalonsForAnalysis({
    userId: req.user.id,
    analysisId,
    hairstyleTag: hairstyle_tag || null,
    userLat: user_lat,
    userLng: user_lng,
    audience,
  });

  res.json({ data: salons });
};

exports.generateTryOn = async (req, res) => {
  const { analysisId } = req.params;
  const { hairstyle_name, hairstyle_prompt, hair_color } = req.body;

  const tryon = await aiStylistService.generateVirtualTryOn({
    userId: req.user.id,
    analysisId,
    hairstyleName: hairstyle_name,
    hairstylePrompt: hairstyle_prompt,
    hairColor: hair_color,
  });

  res.status(201).json({ data: tryon });
};
