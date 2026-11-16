'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { Op } = require('sequelize');
const {
  AiStylistSession,
  AiFaceAnalysis,
  AiChatMessage,
  AiTryonResult,
} = require('../models');
const AppError = require('../middlewares/AppError');
const { SALON_SERVICE_NAMES } = require('../constants/salonServiceNames');
const { logger } = require('../utils/logger');
const {
  generateStructuredWithFallback,
  generateHairTryOn,
  generateHairstylePreviewImage,
} = require('./aiProviderService');
const {
  normalizeMatchedServiceNames,
  findRecommendedSalonsForStyles,
} = require('./aiSalonMatcherService');

const AI_SCAN_DIR = path.join(__dirname, '../uploads/ai-scans');

function urlToDiskPath(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') return null;
  const relative = fileUrl.replace(/^\/api\/uploads\//, '');
  return path.join(__dirname, '../uploads', relative);
}

function deleteDiskFile(fileUrl) {
  const filePath = urlToDiskPath(fileUrl);
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_) {}
}

async function optimizeScanImage(file) {
  if (!file) return null;
  const inputPath = file.path;
  const optimizedFilename = `opt-${path.parse(file.filename).name}.jpg`;
  const outputPath = path.join(AI_SCAN_DIR, optimizedFilename);

  const buffer = await sharp(inputPath)
    .rotate()
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();

  await fs.promises.writeFile(outputPath, buffer);
  if (inputPath !== outputPath && fs.existsSync(inputPath)) {
    try {
      fs.unlinkSync(inputPath);
    } catch (_) {}
  }

  return {
    url: `/api/uploads/ai-scans/${optimizedFilename}`,
    base64: buffer.toString('base64'),
    mimeType: 'image/jpeg',
  };
}

async function saveRawMask(file) {
  if (!file) return null;
  const inputPath = file.path;
  const maskFilename = `mask-${path.parse(file.filename).name}.png`;
  const outputPath = path.join(AI_SCAN_DIR, maskFilename);

  const buffer = await sharp(inputPath)
    .resize(1024, 1024, { fit: 'cover' })
    .png()
    .toBuffer();

  await fs.promises.writeFile(outputPath, buffer);
  if (inputPath !== outputPath && fs.existsSync(inputPath)) {
    try {
      fs.unlinkSync(inputPath);
    } catch (_) {}
  }

  return `/api/uploads/ai-scans/${maskFilename}`;
}

function startOfTodayUtc() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function assertDailyScanLimit(userId) {
  const limit = Number(process.env.AI_DAILY_SCAN_LIMIT || 10);
  if (!Number.isFinite(limit) || limit <= 0) return;
  const count = await AiFaceAnalysis.count({
    where: {
      user_id: userId,
      created_at: { [Op.gte]: startOfTodayUtc() },
    },
  });
  if (count >= limit) {
    throw new AppError(
      `Daily face scan limit (${limit}) reached. Please try again tomorrow.`,
      429,
      { code: 'AI_SCAN_LIMIT_REACHED' }
    );
  }
}

async function assertDailyChatLimit(userId) {
  const limit = Number(process.env.AI_DAILY_CHAT_LIMIT || 50);
  if (!Number.isFinite(limit) || limit <= 0) return;
  const count = await AiChatMessage.count({
    where: {
      user_id: userId,
      role: 'user',
      created_at: { [Op.gte]: startOfTodayUtc() },
    },
  });
  if (count >= limit) {
    throw new AppError(
      `Daily AI chat limit (${limit}) reached. Please try again tomorrow.`,
      429,
      { code: 'AI_CHAT_LIMIT_REACHED' }
    );
  }
}

function buildAnalysisSystemPrompt() {
  const langInstruction =
    'Respond strictly in clear, warm, natural English. Never use Hindi or Hinglish.';

  return `You are CATCHY AI Master Hair & Grooming Stylist.
You analyze multi-angle customer face photos (Front, Left, Right) together with on-device facial geometry metrics extracted by the mobile app.
${langInstruction}

Your job:
1. Combine the visual cues (hair texture, hair density, hairline, beard, skin tone, forehead proportion) with the provided on_device_features JSON ratios.
2. Recommend 4 distinct, flattering, practical hairstyles tailored to the user's face shape, hair type, maintenance level, and occasion.
3. Give exact, actionable barber/stylist instructions so the customer can show this directly at a salon.
4. Map each recommendation to canonical CATCHY salon service names ONLY from this allowed list:
${SALON_SERVICE_NAMES.join(', ')}

Return ONLY valid JSON matching this exact schema:
{
  "reply_message": "string (warm summary + advice)",
  "face_profile": {
    "face_shape": "Oval | Round | Square | Heart | Diamond | Oblong",
    "confidence": 85,
    "hair_type": "Straight | Wavy | Curly | Coily",
    "hair_density": "Thick | Medium | Fine | Thinning",
    "skin_undertone": "Warm | Cool | Neutral",
    "key_observations": ["string", "string", "string"]
  },
  "recommendations": [
    {
      "name": "string",
      "match_score": 94,
      "why_it_suits": "string",
      "barber_instructions": "string (exact fade/guard/layer instructions)",
      "maintenance_level": "Low | Medium | High",
      "styling_tip": "string",
      "beard_pairing": "string",
      "matched_service_names": ["Haircut"],
      "tryon_prompt": "string (short visual description for AI try-on)"
    }
  ],
  "avoid_styles": ["string", "string"],
  "follow_up_questions": ["string", "string", "string"]
}`;
}

function buildChatSystemPrompt() {
  const langInstruction =
    'Respond strictly in clear, concise, natural English. Never use Hindi or Hinglish.';

  return `You are CATCHY AI Master Hair & Grooming Stylist continuing a consultation with a customer.
${langInstruction}
Always ground your advice in the customer's face analysis context (face shape, hair type, density, preferences) when present.
If the user asks for new style variations or services, include canonical CATCHY service names from:
${SALON_SERVICE_NAMES.join(', ')}

Return ONLY valid JSON matching this schema:
{
  "reply_message": "string",
  "quick_tips": ["string"],
  "matched_service_names": ["Haircut"],
  "follow_up_questions": ["string", "string"]
}`;
}

async function createSession(userId, title) {
  return AiStylistSession.create({
    user_id: userId,
    title: title && title.trim() ? title.trim() : 'New Style Consultation',
    status: 'ACTIVE',
    created_by: userId,
    updated_by: userId,
  });
}

async function listSessions(userId, { limit = 20, offset = 0 } = {}) {
  return AiStylistSession.findAndCountAll({
    where: { user_id: userId, is_active: true },
    order: [['updated_at', 'DESC']],
    limit: Math.min(Number(limit) || 20, 50),
    offset: Math.max(Number(offset) || 0, 0),
    include: [
      {
        model: AiFaceAnalysis,
        as: 'analyses',
        attributes: ['id', 'detected_face_shape', 'front_image_url', 'created_at'],
        separate: true,
        limit: 1,
        order: [['created_at', 'DESC']],
      },
    ],
  });
}

async function getSessionOrThrow(userId, sessionId) {
  const session = await AiStylistSession.findOne({
    where: { id: sessionId, user_id: userId, is_active: true },
  });
  if (!session) {
    throw new AppError('AI consultation session not found', 404);
  }
  return session;
}

async function getSessionMessages(userId, sessionId) {
  const session = await getSessionOrThrow(userId, sessionId);
  const messages = await AiChatMessage.findAll({
    where: { session_id: session.id, is_active: true },
    order: [['created_at', 'ASC']],
  });
  const activeAnalysis = session.active_analysis_id
    ? await AiFaceAnalysis.findByPk(session.active_analysis_id)
    : null;

  return { session, activeAnalysis, messages };
}

async function deleteSession(userId, sessionId) {
  const session = await getSessionOrThrow(userId, sessionId);
  const analyses = await AiFaceAnalysis.findAll({
    where: { session_id: session.id },
  });

  for (const a of analyses) {
    deleteDiskFile(a.front_image_url);
    deleteDiskFile(a.left_image_url);
    deleteDiskFile(a.right_image_url);
    deleteDiskFile(a.hair_mask_url);
    const tryons = await AiTryonResult.findAll({ where: { analysis_id: a.id } });
    for (const t of tryons) {
      deleteDiskFile(t.result_image_url);
    }
  }

  await session.update({ is_active: false, status: 'DELETED', updated_by: userId });
  return { deleted: true };
}

async function analyzeFaceAndSuggest({
  userId,
  sessionId,
  files,
  onDeviceFeatures = {},
  preferences = {},
  userNote = '',
  userLat = null,
  userLng = null,
  audience = null,
}) {
  const session = await getSessionOrThrow(userId, sessionId);
  await assertDailyScanLimit(userId);

  const frontFile = files?.front?.[0];
  if (!frontFile) {
    throw new AppError('Front face photo is required', 400);
  }

  const leftFile = files?.left?.[0] || null;
  const rightFile = files?.right?.[0] || null;
  const maskFile = files?.hair_mask?.[0] || null;

  const [frontOpt, leftOpt, rightOpt, hairMaskUrl] = await Promise.all([
    optimizeScanImage(frontFile),
    optimizeScanImage(leftFile),
    optimizeScanImage(rightFile),
    saveRawMask(maskFile),
  ]);

  const imagesForAi = [{ label: 'front', ...frontOpt }];
  if (leftOpt) imagesForAi.push({ label: 'left', ...leftOpt });
  if (rightOpt) imagesForAi.push({ label: 'right', ...rightOpt });

  const effectiveAudience = audience || preferences.gender || null;
  const normalizedPreferences = {
    ...preferences,
    language: 'english',
  };

  const userPrompt = [
    `Analyze the customer's attached face photos (Angles provided: ${imagesForAi.map((i) => i.label).join(', ')}).`,
    `On-device extracted facial geometry & quality metrics: ${JSON.stringify(onDeviceFeatures)}`,
    `Customer styling preferences: ${JSON.stringify(normalizedPreferences)}`,
    userNote ? `Customer note: ${userNote}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const aiResult = await generateStructuredWithFallback({
    systemPrompt: buildAnalysisSystemPrompt(),
    userPrompt,
    images: imagesForAi,
  });

  const payload = aiResult.data || {};
  const faceProfile = payload.face_profile || {};
  const rawRecs = Array.isArray(payload.recommendations)
    ? payload.recommendations
    : [];

  const recommendations = rawRecs.slice(0, 5).map((rec) => ({
    name: rec.name || 'Classic Layered Cut',
    match_score: Math.min(100, Math.max(50, Number(rec.match_score) || 88)),
    why_it_suits: rec.why_it_suits || '',
    barber_instructions: rec.barber_instructions || '',
    maintenance_level: rec.maintenance_level || 'Medium',
    styling_tip: rec.styling_tip || '',
    beard_pairing: rec.beard_pairing || '',
    matched_service_names: normalizeMatchedServiceNames(rec.matched_service_names),
    tryon_prompt: rec.tryon_prompt || rec.name || 'Natural modern haircut',
    image_url: null,
  }));

  const detectedFaceShape =
    faceProfile.face_shape || onDeviceFeatures.estimated_face_shape || 'Oval';
  const detectedGender = effectiveAudience || 'men';
  const detectedHairType = faceProfile.hair_type || preferences.hair_type || 'natural';

  // Generate visual lookbook preview photos for the top recommended hairstyles tailored to user's face shape
  try {
    const previewCount = Math.min(4, recommendations.length);
    const previewOutcomes = await Promise.allSettled(
      recommendations.slice(0, previewCount).map(async (rec, idx) => {
        if (idx > 0) {
          await new Promise((r) => setTimeout(r, idx * 150));
        }
        return generateHairstylePreviewImage({
          hairstyleName: rec.name,
          faceShape: detectedFaceShape,
          gender: detectedGender,
          hairType: detectedHairType,
        });
      })
    );

    for (let i = 0; i < previewCount; i++) {
      const outcome = previewOutcomes[i];
      if (outcome && outcome.status === 'fulfilled' && outcome.value?.buffer) {
        try {
          const outFilename = `style-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}.jpg`;
          const outDiskPath = path.join(AI_SCAN_DIR, outFilename);
          await fs.promises.writeFile(outDiskPath, outcome.value.buffer);
          recommendations[i].image_url = `/api/uploads/ai-scans/${outFilename}`;
        } catch (saveErr) {
          logger.warn(
            { err: saveErr.message },
            'Failed to write generated hairstyle image to disk'
          );
        }
      }
    }
  } catch (genErr) {
    logger.warn({ err: genErr.message }, 'Hairstyle preview image generation batch failed');
  }

  const allServiceNames = normalizeMatchedServiceNames(
    recommendations.flatMap((r) => r.matched_service_names)
  );

  const analysis = await AiFaceAnalysis.create({
    session_id: session.id,
    user_id: userId,
    front_image_url: frontOpt.url,
    left_image_url: leftOpt ? leftOpt.url : null,
    right_image_url: rightOpt ? rightOpt.url : null,
    hair_mask_url: hairMaskUrl,
    on_device_features: onDeviceFeatures,
    preferences: normalizedPreferences,
    detected_face_shape: detectedFaceShape,
    face_shape_confidence: Number(faceProfile.confidence) || 85,
    hair_type: faceProfile.hair_type || null,
    hair_density: faceProfile.hair_density || null,
    skin_undertone: faceProfile.skin_undertone || null,
    analysis_summary: payload.reply_message || '',
    recommendations,
    matched_service_names: allServiceNames,
    ai_provider: aiResult.provider,
    ai_model: aiResult.model,
    tokens_used: aiResult.tokensUsed,
    created_by: userId,
    updated_by: userId,
  });

  const recommendedSalons = await findRecommendedSalonsForStyles({
    serviceNames: allServiceNames,
    userId,
    userLat,
    userLng,
    audience: effectiveAudience,
    limit: 6,
  });

  const uploadedUrls = [frontOpt.url, leftOpt?.url, rightOpt?.url].filter(Boolean);

  await AiChatMessage.create({
    session_id: session.id,
    user_id: userId,
    analysis_id: analysis.id,
    role: 'user',
    content_text:
      userNote ||
      `Uploaded ${uploadedUrls.length} face angle photo(s) for hairstyle consultation.`,
    image_urls: uploadedUrls,
    created_by: userId,
    updated_by: userId,
  });

  const cardPayload = {
    type: 'face_analysis_result',
    analysis_id: analysis.id,
    face_profile: {
      face_shape: analysis.detected_face_shape,
      confidence: analysis.face_shape_confidence,
      hair_type: analysis.hair_type,
      hair_density: analysis.hair_density,
      skin_undertone: analysis.skin_undertone,
      key_observations: Array.isArray(faceProfile.key_observations)
        ? faceProfile.key_observations
        : [],
      avoid_styles: Array.isArray(payload.avoid_styles)
        ? payload.avoid_styles
        : [],
    },
    recommendations,
    recommended_salons: recommendedSalons,
    follow_up_questions: Array.isArray(payload.follow_up_questions)
      ? payload.follow_up_questions
      : [],
  };

  const assistantMsg = await AiChatMessage.create({
    session_id: session.id,
    user_id: userId,
    analysis_id: analysis.id,
    role: 'assistant',
    content_text:
      payload.reply_message ||
      `Based on your ${analysis.detected_face_shape} face shape, here are my top hairstyle recommendations for you.`,
    card_payload: cardPayload,
    ai_provider: aiResult.provider,
    tokens_used: aiResult.tokensUsed,
    created_by: userId,
    updated_by: userId,
  });

  const nextTitle =
    session.title === 'New Style Consultation'
      ? `${analysis.detected_face_shape} Face Look`
      : session.title;

  await session.update({
    active_analysis_id: analysis.id,
    title: nextTitle,
    updated_by: userId,
  });

  return {
    session: await AiStylistSession.findByPk(session.id),
    analysis,
    message: assistantMsg,
    recommended_salons: recommendedSalons,
  };
}

async function sendChatMessage({
  userId,
  sessionId,
  message,
  analysisId = null,
  userLat = null,
  userLng = null,
  audience = null,
  language = 'english',
}) {
  const session = await getSessionOrThrow(userId, sessionId);
  await assertDailyChatLimit(userId);

  const targetAnalysisId = analysisId || session.active_analysis_id;
  const activeAnalysis = targetAnalysisId
    ? await AiFaceAnalysis.findByPk(targetAnalysisId)
    : null;

  const recentMessages = await AiChatMessage.findAll({
    where: { session_id: session.id, is_active: true },
    order: [['created_at', 'DESC']],
    limit: 12,
  });
  const history = recentMessages
    .reverse()
    .map((m) => ({ role: m.role, text: m.content_text }));

  const contextBlock = activeAnalysis
    ? `Customer Face Analysis Context:
- Face Shape: ${activeAnalysis.detected_face_shape} (${activeAnalysis.face_shape_confidence || 85}%)
- Hair Type: ${activeAnalysis.hair_type || 'Unknown'}, Density: ${activeAnalysis.hair_density || 'Unknown'}
- Skin Undertone: ${activeAnalysis.skin_undertone || 'Unknown'}
- On-device measurements: ${JSON.stringify(activeAnalysis.on_device_features)}
- Preferences: ${JSON.stringify(activeAnalysis.preferences)}
- Previously suggested styles: ${(activeAnalysis.recommendations || []).map((r) => r.name).join(', ')}`
    : 'No face photo has been scanned yet in this session. You can still give helpful salon/hairstyle advice and politely remind them they can upload Front/Left/Right photos anytime for personalized facial recommendations.';

  const userPrompt = `${contextBlock}\n\nCustomer question: ${message}`;

  const aiResult = await generateStructuredWithFallback({
    systemPrompt: buildChatSystemPrompt(),
    userPrompt,
    history,
  });

  const payload = aiResult.data || {};
  const matchedServices = Array.isArray(payload.matched_service_names) && payload.matched_service_names.length
    ? normalizeMatchedServiceNames(payload.matched_service_names)
    : [];

  let recommendedSalons = [];
  if (matchedServices.length) {
    recommendedSalons = await findRecommendedSalonsForStyles({
      serviceNames: matchedServices,
      userId,
      userLat,
      userLng,
      audience: audience || activeAnalysis?.preferences?.gender || null,
      limit: 4,
    });
  }

  await AiChatMessage.create({
    session_id: session.id,
    user_id: userId,
    analysis_id: activeAnalysis?.id || null,
    role: 'user',
    content_text: message,
    created_by: userId,
    updated_by: userId,
  });

  const cardPayload =
    recommendedSalons.length ||
    (Array.isArray(payload.quick_tips) && payload.quick_tips.length) ||
    (Array.isArray(payload.follow_up_questions) && payload.follow_up_questions.length)
      ? {
          type: 'chat_advice',
          quick_tips: Array.isArray(payload.quick_tips) ? payload.quick_tips : [],
          matched_service_names: matchedServices,
          recommended_salons: recommendedSalons,
          follow_up_questions: Array.isArray(payload.follow_up_questions)
            ? payload.follow_up_questions
            : [],
        }
      : null;

  const assistantMsg = await AiChatMessage.create({
    session_id: session.id,
    user_id: userId,
    analysis_id: activeAnalysis?.id || null,
    role: 'assistant',
    content_text:
      payload.reply_message ||
      'I am ready to help you with your hairstyle and grooming questions!',
    card_payload: cardPayload,
    ai_provider: aiResult.provider,
    tokens_used: aiResult.tokensUsed,
    created_by: userId,
    updated_by: userId,
  });

  if (session.title === 'New Style Consultation' && message.length > 3) {
    await session.update({
      title: message.slice(0, 60),
      updated_by: userId,
    });
  } else {
    await session.update({ updated_by: userId });
  }

  return {
    message: assistantMsg,
    recommended_salons: recommendedSalons,
  };
}

async function getRecommendedSalonsForAnalysis({
  userId,
  analysisId,
  hairstyleTag = null,
  userLat = null,
  userLng = null,
  audience = null,
}) {
  const analysis = await AiFaceAnalysis.findOne({
    where: { id: analysisId, user_id: userId, is_active: true },
  });
  if (!analysis) {
    throw new AppError('Face analysis not found', 404);
  }

  let targetServices = analysis.matched_service_names || ['Haircut'];
  if (hairstyleTag) {
    const rec = (analysis.recommendations || []).find(
      (r) => String(r.name).toLowerCase() === String(hairstyleTag).toLowerCase()
    );
    if (rec?.matched_service_names?.length) {
      targetServices = rec.matched_service_names;
    }
  }

  return findRecommendedSalonsForStyles({
    serviceNames: targetServices,
    userId,
    userLat,
    userLng,
    audience: audience || analysis.preferences?.gender || null,
    limit: 10,
  });
}

async function generateVirtualTryOn({
  userId,
  analysisId,
  hairstyleName,
  hairstylePrompt = '',
  hairColor = '',
}) {
  const analysis = await AiFaceAnalysis.findOne({
    where: { id: analysisId, user_id: userId, is_active: true },
  });
  if (!analysis) {
    throw new AppError('Face analysis not found', 404);
  }

  const frontDiskPath = urlToDiskPath(analysis.front_image_url);
  if (!frontDiskPath || !fs.existsSync(frontDiskPath)) {
    throw new AppError('Original front scan image not found on disk', 404);
  }

  const frontPngBuffer = await sharp(frontDiskPath)
    .resize(1024, 1024, { fit: 'contain', background: { r: 20, g: 20, b: 20, alpha: 1 } })
    .ensureAlpha()
    .png()
    .toBuffer();

  let maskPngBuffer = null;
  const maskDiskPath = urlToDiskPath(analysis.hair_mask_url);
  if (maskDiskPath && fs.existsSync(maskDiskPath)) {
    maskPngBuffer = await sharp(maskDiskPath)
      .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
      .ensureAlpha()
      .png()
      .toBuffer();
  }

  const colorClause = hairColor ? ` with natural ${hairColor} hair color` : '';
  const detailClause = hairstylePrompt ? ` (${hairstylePrompt})` : '';
  const prompt = `Change ONLY the person's hairstyle to a stylish, clearly visible, well-defined "${hairstyleName}" haircut${detailClause}${colorClause}. Keep the person's face, eyes, eyebrows, nose, mouth, facial features, skin tone, and clothing unchanged and identical to the original photo. Professional salon haircut details, clean hairline, photorealistic texture.`;

  const generated = await generateHairTryOn({
    frontPngBuffer,
    maskPngBuffer,
    prompt,
  });

  const outFilename = `tryon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  const outPath = path.join(AI_SCAN_DIR, outFilename);
  await fs.promises.writeFile(outPath, generated.buffer);
  const resultUrl = `/api/uploads/ai-scans/${outFilename}`;

  return AiTryonResult.create({
    analysis_id: analysis.id,
    user_id: userId,
    hairstyle_name: hairstyleName,
    hair_color: hairColor || null,
    prompt_used: prompt,
    result_image_url: resultUrl,
    provider: generated.provider,
    created_by: userId,
    updated_by: userId,
  });
}

module.exports = {
  createSession,
  listSessions,
  getSessionMessages,
  deleteSession,
  analyzeFaceAndSuggest,
  sendChatMessage,
  getRecommendedSalonsForAnalysis,
  generateVirtualTryOn,
};
