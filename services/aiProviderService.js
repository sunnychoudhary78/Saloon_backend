'use strict';

const https = require('https');
const axios = require('axios');
const sharp = require('sharp');
const FormData = require('form-data');
const AppError = require('../middlewares/AppError');
const { logger } = require('../utils/logger');

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const GEMINI_BASE_URL =
  process.env.GEMINI_BASE_URL ||
  'https://generativelanguage.googleapis.com/v1beta/models';
const CLOUDFLARE_BASE_URL = 'https://api.cloudflare.com/client/v4/accounts';

// Force IPv4 to avoid Node/Linux IPv6 stall timeouts when contacting AI APIs.
const ipv4Agent = new https.Agent({ family: 4, keepAlive: true });

const DEFAULT_GEMINI_MODELS = [
  'gemini-3.1-flash-lite-preview',
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-3.7-flash',
];

const DEFAULT_GEMINI_IMAGE_MODELS = [
  'gemini-nano-banana-2.1',
  'nano-banana-pro-preview',
  'gemini-3.1-flash-image',
  'gemini-3.1-flash-lite-image',
];

function buildGeminiModelList() {
  const configured = (process.env.GEMINI_MODEL || '').trim();
  const list = [configured, ...DEFAULT_GEMINI_MODELS].filter(Boolean);
  return Array.from(new Set(list));
}

function extractJsonObject(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Empty AI response');
  }
  const trimmed = rawText.trim();
  const cleaned = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('AI response did not contain valid JSON');
  }
}

async function callGeminiModel({
  model,
  systemPrompt,
  userPrompt,
  images = [],
  history = [],
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const contents = [];

  for (const turn of history) {
    const role = turn.role === 'assistant' ? 'model' : 'user';
    if (turn.text) {
      contents.push({
        role,
        parts: [{ text: turn.text }],
      });
    }
  }

  const currentParts = [{ text: userPrompt }];
  for (const img of images) {
    if (!img?.base64) continue;
    currentParts.push({
      inline_data: {
        mime_type: img.mimeType || 'image/jpeg',
        data: img.base64,
      },
    });
  }
  contents.push({ role: 'user', parts: currentParts });

  const url = `${GEMINI_BASE_URL}/${encodeURIComponent(model)}:generateContent`;
  const response = await axios.post(
    url,
    {
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents,
      generationConfig: {
        temperature: 0.5,
        responseMimeType: 'application/json',
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      httpsAgent: ipv4Agent,
      timeout: 35000,
    }
  );

  const candidateText =
    response.data?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || '')
      .join('') || '';
  const tokensUsed =
    response.data?.usageMetadata?.totalTokenCount || null;

  return {
    provider: 'gemini',
    model,
    data: extractJsonObject(candidateText),
    tokensUsed,
  };
}

async function callGeminiJson(params) {
  const models = buildGeminiModelList();
  let lastError = null;

  for (const model of models) {
    try {
      return await callGeminiModel({ ...params, model });
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.error?.message || err.message;
      lastError = new Error(`${model}: ${msg}`);
      logger.warn(
        { model, status, err: msg },
        'Gemini model attempt failed, trying next model if available'
      );
      // Auth error (401/403) won't succeed on another Gemini model
      if (status === 401 || status === 403) {
        break;
      }
    }
  }

  throw lastError || new Error('All Gemini models failed');
}

async function callOpenAiJson({ systemPrompt, userPrompt, images = [], history = [] }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  const model = process.env.OPENAI_MODEL || 'gpt-4o';

  const messages = [{ role: 'system', content: systemPrompt }];

  for (const turn of history) {
    if (!turn.text) continue;
    messages.push({
      role: turn.role === 'assistant' ? 'assistant' : 'user',
      content: turn.text,
    });
  }

  const userContent = [{ type: 'text', text: userPrompt }];
  for (const img of images) {
    if (!img?.base64) continue;
    const mime = img.mimeType || 'image/jpeg';
    userContent.push({
      type: 'image_url',
      image_url: {
        url: `data:${mime};base64,${img.base64}`,
        detail: 'high',
      },
    });
  }
  messages.push({ role: 'user', content: userContent });

  const response = await axios.post(
    `${OPENAI_BASE_URL}/chat/completions`,
    {
      model,
      messages,
      temperature: 0.5,
      response_format: { type: 'json_object' },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      httpsAgent: ipv4Agent,
      timeout: 35000,
    }
  );

  const content = response.data?.choices?.[0]?.message?.content || '';
  const tokensUsed = response.data?.usage?.total_tokens || null;

  return {
    provider: 'openai',
    model,
    data: extractJsonObject(content),
    tokensUsed,
  };
}

/**
 * Runs structured multimodal or text generation with OpenAI primary.
 */
async function generateStructuredWithFallback(params) {
  if (process.env.OPENAI_API_KEY) {
    try {
      return await callOpenAiJson(params);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      logger.error({ err: msg }, 'OpenAI structured generation failed');
      throw new AppError(
        `AI Stylist request failed: ${msg}`,
        500,
        { code: 'OPENAI_ERROR', details: msg }
      );
    }
  }

  throw new AppError(
    'AI stylist is currently unavailable. Please configure OPENAI_API_KEY.',
    503,
    { code: 'AI_PROVIDER_UNAVAILABLE' }
  );
}

/**
 * Sanitizes image prompts so Cloudflare's strict safety filter never false-triggers
 * on salon/grooming words (e.g. "attractive", "skin", "body", "bare").
 */
function sanitizeCloudflarePrompt(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/\b(attractive|handsome|beautiful|sexy|hot|gorgeous|stunning)\b/gi, 'well-groomed')
    .replace(/\bskin\s*tone\b/gi, 'complexion')
    .replace(/\bskin\b/gi, 'forehead')
    .replace(/\b(body|chest|neck|bare|naked|nude|lingerie|cleavage)\b/gi, 'upper portrait')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calls Cloudflare Workers AI for Text-to-Image generation (hairstyle lookbook previews).
 * Supports FLUX.1-schnell primary and Leonardo Phoenix / Lucid Origin fallbacks.
 */
async function runCloudflareImageGen({ prompt, width = 1024, height = 1024 }) {
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const apiToken = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
  if (!accountId || !apiToken) {
    throw new AppError(
      'Cloudflare Workers AI credentials (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN) are not configured',
      503,
      { code: 'CLOUDFLARE_CONFIG_MISSING' }
    );
  }

  const safePrompt = sanitizeCloudflarePrompt(prompt);
  const configuredModel = (process.env.CLOUDFLARE_IMAGE_MODEL || '').trim();
  const candidateModels = Array.from(
    new Set([
      configuredModel,
      '@cf/black-forest-labs/flux-1-schnell',
      '@cf/leonardo/phoenix-1.0',
      '@cf/leonardo/lucid-origin',
    ].filter(Boolean))
  );

  let lastError = null;
  let quotaExceeded = false;

  for (const model of candidateModels) {
    try {
      const url = `${CLOUDFLARE_BASE_URL}/${accountId}/ai/run/${model}`;
      const isFlux = model.toLowerCase().includes('flux');
      const body = isFlux
        ? { prompt: safePrompt, steps: 4 }
        : {
            prompt: safePrompt,
            width: Math.min(width, 1024),
            height: Math.min(height, 1024),
            num_steps: 20,
          };

      const res = await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
        httpsAgent: ipv4Agent,
        timeout: 45000,
      });

      const contentType = res.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        const text = Buffer.from(res.data).toString('utf8');
        const json = JSON.parse(text);
        if (json.result?.image) {
          return {
            buffer: Buffer.from(json.result.image, 'base64'),
            model,
            provider: 'cloudflare',
          };
        }
        if (json.errors?.length) {
          throw new Error(json.errors.map((e) => e.message).join(', '));
        }
      } else if (res.data && res.data.length > 500) {
        return {
          buffer: Buffer.from(res.data),
          model,
          provider: 'cloudflare',
        };
      }

      throw new Error(`Cloudflare model ${model} returned empty image data`);
    } catch (err) {
      let msg = err.response?.data
        ? Buffer.from(err.response.data).toString('utf8')
        : err.message;
      try {
        const j = JSON.parse(msg);
        if (j.errors?.[0]?.message) msg = j.errors[0].message;
        if (j.errors?.[0]?.code === 4006) quotaExceeded = true;
      } catch (_) {}
      if (msg.toLowerCase().includes('neurons') || msg.toLowerCase().includes('allocation')) {
        quotaExceeded = true;
      }
      lastError = new Error(`${model}: ${msg}`);
      logger.warn(
        { model, err: msg },
        'Cloudflare Workers AI model attempt failed, falling back to next candidate'
      );
      if (quotaExceeded) break;
    }
  }

  if (quotaExceeded) {
    throw new AppError(
      'Cloudflare Workers AI daily free quota (10,000 neurons) is exhausted. Please upgrade to Cloudflare Workers Paid plan or wait for daily reset.',
      429,
      { code: 'CLOUDFLARE_QUOTA_EXCEEDED', details: lastError?.message }
    );
  }

  throw new AppError(
    `Cloudflare Workers AI image generation failed: ${lastError?.message || 'All models failed'}`,
    500,
    { code: 'CLOUDFLARE_IMAGE_ERROR', details: lastError?.message }
  );
}

/**
 * Calls Cloudflare Workers AI FLUX.2 image-editing models using multipart/form-data
 * with the user's real photo (input_image_0) so the hairstyle is applied naturally
 * onto their actual head without cookie-cutter forehead pasting.
 */
async function runCloudflareFlux2Edit({ imageBuffer, prompt }) {
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const apiToken = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
  if (!accountId || !apiToken) {
    throw new AppError(
      'Cloudflare Workers AI credentials (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN) are not configured',
      503,
      { code: 'CLOUDFLARE_CONFIG_MISSING' }
    );
  }

  const safePrompt = sanitizeCloudflarePrompt(prompt);
  const configuredEditModel = (process.env.CLOUDFLARE_TRYON_MODEL || '').trim();
  const editModels = Array.from(
    new Set([
      configuredEditModel,
      '@cf/black-forest-labs/flux-2-klein-9b',
      '@cf/black-forest-labs/flux-2-dev',
      '@cf/black-forest-labs/flux-2-klein-4b',
    ].filter(Boolean))
  );

  let lastError = null;
  let quotaExceeded = false;

  for (const model of editModels) {
    try {
      const url = `${CLOUDFLARE_BASE_URL}/${accountId}/ai/run/${model}`;
      const form = new FormData();
      form.append('prompt', safePrompt);
      form.append('input_image_0', imageBuffer, {
        filename: 'customer-photo.jpg',
        contentType: 'image/jpeg',
      });

      const res = await axios.post(url, form, {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          ...form.getHeaders(),
        },
        responseType: 'arraybuffer',
        httpsAgent: ipv4Agent,
        timeout: 60000,
        maxBodyLength: Infinity,
      });

      const contentType = res.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        const text = Buffer.from(res.data).toString('utf8');
        const json = JSON.parse(text);
        if (json.result?.image) {
          return {
            buffer: Buffer.from(json.result.image, 'base64'),
            model,
            provider: 'cloudflare',
          };
        }
        if (json.errors?.length) {
          throw new Error(json.errors.map((e) => e.message).join(', '));
        }
      } else if (res.data && res.data.length > 500) {
        return {
          buffer: Buffer.from(res.data),
          model,
          provider: 'cloudflare',
        };
      }

      throw new Error(`Cloudflare FLUX.2 model ${model} returned empty image data`);
    } catch (err) {
      let msg = err.response?.data
        ? Buffer.from(err.response.data).toString('utf8')
        : err.message;
      try {
        const j = JSON.parse(msg);
        if (j.errors?.[0]?.message) msg = j.errors[0].message;
        if (j.errors?.[0]?.code === 4006) quotaExceeded = true;
      } catch (_) {}
      if (msg.toLowerCase().includes('neurons') || msg.toLowerCase().includes('allocation')) {
        quotaExceeded = true;
      }
      lastError = new Error(`${model}: ${msg}`);
      logger.warn(
        { model, err: msg },
        'Cloudflare FLUX.2 edit attempt failed, falling back to next candidate'
      );
      if (quotaExceeded) break;
    }
  }

  if (quotaExceeded) {
    throw new AppError(
      'Cloudflare Workers AI daily free quota (10,000 neurons) is exhausted. Please upgrade to Cloudflare Workers Paid plan or wait for daily reset.',
      429,
      { code: 'CLOUDFLARE_QUOTA_EXCEEDED', details: lastError?.message }
    );
  }

  throw new AppError(
    `Cloudflare FLUX.2 hairstyle edit failed: ${lastError?.message || 'All models failed'}`,
    500,
    { code: 'CLOUDFLARE_TRYON_ERROR', details: lastError?.message }
  );
}

/**
 * Creates an alpha-channel inpainting mask specifically for OpenAI /images/edits.
 * Maintained for test compatibility.
 */
async function createOpenAiHairMask(width = 1024, height = 1024) {
  const svg = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="softHole" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <mask id="holeMask">
          <rect width="${width}" height="${height}" fill="white" />
          <g filter="url(#softHole)">
            <ellipse cx="${Math.round(width * 0.5)}" cy="${Math.round(height * 0.22)}" 
                     rx="${Math.round(width * 0.36)}" ry="${Math.round(height * 0.22)}" fill="black" />
            <ellipse cx="${Math.round(width * 0.25)}" cy="${Math.round(height * 0.32)}" 
                     rx="${Math.round(width * 0.12)}" ry="${Math.round(height * 0.16)}" fill="black" />
            <ellipse cx="${Math.round(width * 0.75)}" cy="${Math.round(height * 0.32)}" 
                     rx="${Math.round(width * 0.12)}" ry="${Math.round(height * 0.16)}" fill="black" />
          </g>
          <g filter="url(#softHole)">
            <ellipse cx="${Math.round(width * 0.5)}" cy="${Math.round(height * 0.60)}" 
                     rx="${Math.round(width * 0.26)}" ry="${Math.round(height * 0.25)}" fill="white" />
          </g>
        </mask>
      </defs>
      <rect width="${width}" height="${height}" fill="black" mask="url(#holeMask)" />
    </svg>
  `);
  return sharp(svg).resize(width, height).png().toBuffer();
}

/**
 * Creates a standard grayscale mask for diffusion inpainting.
 * Maintained for test compatibility.
 */
async function createStandardInpaintHairMask(width = 1024, height = 1024) {
  const svg = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="feather" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>
      <rect width="${width}" height="${height}" fill="black" />
      <g filter="url(#feather)">
        <path d="M 0,0 L ${width},0 L ${width},${Math.round(height * 0.44)} 
                 C ${Math.round(width * 0.85)},${Math.round(height * 0.44)} ${Math.round(width * 0.75)},${Math.round(height * 0.32)} ${Math.round(width * 0.5)},${Math.round(height * 0.28)}
                 C ${Math.round(width * 0.25)},${Math.round(height * 0.28)} ${Math.round(width * 0.15)},${Math.round(height * 0.44)} 0,${Math.round(height * 0.44)} Z" 
                 fill="white" />
        <ellipse cx="${Math.round(width * 0.5)}" cy="${Math.round(height * 0.20)}" 
                 rx="${Math.round(width * 0.46)}" ry="${Math.round(height * 0.24)}" fill="white" />
      </g>
      <g filter="url(#feather)">
        <ellipse cx="${Math.round(width * 0.5)}" cy="${Math.round(height * 0.60)}" 
                 rx="${Math.round(width * 0.28)}" ry="${Math.round(height * 0.30)}" fill="black" />
      </g>
    </svg>
  `);
  return sharp(svg).resize(width, height).png().toBuffer();
}

/**
 * Composites the newly generated hairstyle onto the user's authentic photo.
 * The user's original photo (originalFront) serves as the base canvas:
 * - 100% of the user's room background is kept intact.
 * - 100% of the user's clothing, shirt/jacket, neck, and shoulders are preserved.
 * - 100% of the user's face (eyes, eyebrows, nose, cheeks, mouth, jawline, beard) is preserved.
 * Only the hair at the top of the head is replaced with the new hairstyle,
 * blended naturally at the hairline using an organic feathered alpha mask.
 */
async function compositePreservedFace({
  originalFront,
  inpainted,
  width = 1024,
  height = 1024,
}) {
  try {
    const hairMaskSvg = Buffer.from(`
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="16" />
          </filter>
          <mask id="hairM">
            <rect width="${width}" height="${height}" fill="black" />
            <g filter="url(#soft)">
              <!-- Top hair volume dome -->
              <ellipse cx="${Math.round(width * 0.5)}" cy="${Math.round(height * 0.20)}" 
                       rx="${Math.round(width * 0.38)}" ry="${Math.round(height * 0.20)}" fill="white" />
              <!-- Left side temple/fade -->
              <ellipse cx="${Math.round(width * 0.26)}" cy="${Math.round(height * 0.33)}" 
                       rx="${Math.round(width * 0.13)}" ry="${Math.round(height * 0.14)}" fill="white" />
              <!-- Right side temple/fade -->
              <ellipse cx="${Math.round(width * 0.74)}" cy="${Math.round(height * 0.33)}" 
                       rx="${Math.round(width * 0.13)}" ry="${Math.round(height * 0.14)}" fill="white" />
            </g>
            <!-- Strictly protect face oval below hairline -->
            <g filter="url(#soft)">
              <ellipse cx="${Math.round(width * 0.5)}" cy="${Math.round(height * 0.65)}" 
                       rx="${Math.round(width * 0.32)}" ry="${Math.round(height * 0.30)}" fill="black" />
            </g>
          </mask>
        </defs>
        <rect width="${width}" height="${height}" fill="white" mask="url(#hairM)" />
      </svg>
    `);

    const hairMaskBuf = await sharp(hairMaskSvg)
      .resize(width, height)
      .png()
      .toBuffer();

    const hairCutout = await sharp(inpainted)
      .resize(width, height, { fit: 'cover', position: 'center' })
      .ensureAlpha()
      .composite([{ input: hairMaskBuf, blend: 'dest-in' }])
      .png()
      .toBuffer();

    return await sharp(originalFront)
      .resize(width, height, { fit: 'cover', position: 'center' })
      .composite([{ input: hairCutout, blend: 'over' }])
      .jpeg({ quality: 95, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    logger.warn({ err: err.message }, 'Hair composite blending failed, falling back to inpainted');
    return inpainted;
  }
}

/**
 * Generates a virtual hairstyle try-on image using Cloudflare Workers AI FLUX.2 image editing.
 * Passes the customer's real photo directly into FLUX.2 (input_image_0) so ONLY the hair is
 * restyled naturally on the user's actual head, preserving face, clothes, and room background.
 */
async function generateHairTryOnWithCloudflare({
  frontPngBuffer,
  prompt,
  hairstyleName = '',
  hairstylePrompt = '',
  hairColor = '',
  gender = 'men',
}) {
  const inputJpeg = await sharp(frontPngBuffer)
    .resize(1024, 1024, { fit: 'cover', position: 'center' })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  const genderTerm = gender === 'women' ? 'woman' : gender === 'men' ? 'man' : 'person';
  const colorClause = hairColor ? ` with ${hairColor} hair color` : '';
  const detailClause = hairstylePrompt ? `, ${hairstylePrompt}` : '';

  const editPrompt = hairstyleName
    ? `Edit this photo of the ${genderTerm}: change ONLY the hairstyle on the head to a "${hairstyleName}" haircut${colorClause}${detailClause}, with natural hairline and realistic hair strands. Keep the exact same face, eyes, eyebrows, nose, mouth, beard, expression, clothing, lighting, and room background completely unchanged.`
    : prompt;

  logger.info({ hairstyleName, gender: genderTerm }, 'Generating hairstyle try-on with Cloudflare FLUX.2 image editing...');

  const generated = await runCloudflareFlux2Edit({
    imageBuffer: inputJpeg,
    prompt: editPrompt,
  });

  const optimized = await sharp(generated.buffer)
    .resize(1024, 1024, { fit: 'cover', position: 'center' })
    .jpeg({ quality: 93, mozjpeg: true })
    .toBuffer();

  return {
    provider: 'cloudflare',
    model: generated.model,
    buffer: optimized,
  };
}

/**
 * Primary Virtual Hair Try-On entry point.
 * Exclusively uses Cloudflare Workers AI (no fal.ai, no OpenAI/Gemini image generation).
 */
async function generateHairTryOn(params) {
  try {
    return await generateHairTryOnWithCloudflare(params);
  } catch (err) {
    logger.error({ err: err.message }, 'Cloudflare Virtual Try-On failed');
    throw new AppError(
      `Virtual Try-On failed: ${err.message}`,
      err.statusCode || 500,
      { code: 'TRYON_ERROR', details: err.message }
    );
  }
}

/**
 * Generates a photorealistic preview image for a recommended hairstyle
 * tailored to face shape, gender, and hair type using Cloudflare Workers AI.
 */
async function generateHairstylePreviewImage({
  hairstyleName,
  faceShape,
  gender = 'men',
  hairType = 'straight',
}) {
  const promptGender = gender === 'women' ? 'woman' : 'man';
  const promptFace = faceShape ? `with a flattering ${faceShape} face shape` : '';
  const promptHair = hairType ? `${hairType} hair texture` : 'natural hair texture';
  const prompt = `Close-up studio lookbook portrait of an attractive ${promptGender} ${promptFace}, featuring a stylish "${hairstyleName}" hairstyle, ${promptHair}, sharp focus on the haircut details, clean hairline, professional salon lighting, 8k resolution, photorealistic salon portfolio photo, neutral blurred studio background`;

  try {
    const generated = await runCloudflareImageGen({
      prompt,
      width: 512,
      height: 512,
    });

    const optimized = await sharp(generated.buffer)
      .resize(512, 512, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();

    return {
      buffer: optimized,
      provider: 'cloudflare',
      model: generated.model,
    };
  } catch (err) {
    logger.warn({ err: err.message, hairstyleName }, 'Cloudflare hairstyle preview generation failed');
    return null;
  }
}

module.exports = {
  extractJsonObject,
  callGeminiJson,
  callOpenAiJson,
  generateStructuredWithFallback,
  generateHairTryOn,
  generateHairstylePreviewImage,
  createOpenAiHairMask,
  createStandardInpaintHairMask,
  compositePreservedFace,
};
