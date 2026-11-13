'use strict';

const https = require('https');
const axios = require('axios');
const sharp = require('sharp');
const AppError = require('../middlewares/AppError');
const { logger } = require('../utils/logger');

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const CLOUDFLARE_BASE_URL = 'https://api.cloudflare.com/client/v4/accounts';

// Force IPv4 to avoid Node/Linux IPv6 stall timeouts when contacting AI APIs.
const ipv4Agent = new https.Agent({ family: 4, keepAlive: true });

const DEFAULT_GEMINI_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.7-flash',
  'gemini-flash-latest',
];

const DEFAULT_GEMINI_IMAGE_MODELS = [
  'gemini-3.1-flash-image',
  'gemini-nano-banana-2.1',
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
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

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
 * Runs structured multimodal or text generation with Gemini model chain primary
 * and OpenAI fallback.
 */
async function generateStructuredWithFallback(params) {
  const errors = [];

  if (process.env.GEMINI_API_KEY) {
    try {
      return await callGeminiJson(params);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      errors.push(`Gemini: ${msg}`);
      logger.warn({ err: msg }, 'Gemini chain failed, attempting OpenAI fallback');
    }
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      return await callOpenAiJson(params);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      errors.push(`OpenAI: ${msg}`);
      logger.error({ err: msg }, 'OpenAI fallback call failed');
    }
  }

  throw new AppError(
    'AI stylist is currently busy or at its quota limit. Please try again in a moment.',
    503,
    {
      code: 'AI_PROVIDER_UNAVAILABLE',
      details: errors,
    }
  );
}

async function generateHairTryOnWithGemini({ frontPngBuffer, prompt }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const configured = (process.env.GEMINI_IMAGE_MODEL || '').trim();
  const models = Array.from(
    new Set([configured, ...DEFAULT_GEMINI_IMAGE_MODELS].filter(Boolean))
  );

  let lastErr = null;
  for (const model of models) {
    try {
      const url = `${GEMINI_BASE_URL}/${encodeURIComponent(model)}:generateContent`;
      const response = await axios.post(
        url,
        {
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: 'image/png',
                    data: frontPngBuffer.toString('base64'),
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ['IMAGE', 'TEXT'],
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          httpsAgent: ipv4Agent,
          timeout: 60000,
        }
      );

      const parts = response.data?.candidates?.[0]?.content?.parts || [];
      const imgPart = parts.find(
        (p) => p.inlineData?.data || p.inline_data?.data
      );
      const b64 = imgPart?.inlineData?.data || imgPart?.inline_data?.data;
      if (b64) {
        return {
          provider: 'gemini',
          model,
          buffer: Buffer.from(b64, 'base64'),
        };
      }
      lastErr = new Error(`${model}: No image returned`);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      lastErr = new Error(`${model}: ${msg}`);
    }
  }

  throw lastErr || new Error('Gemini image generation failed');
}

async function generateHairTryOnWithOpenAi({
  frontPngBuffer,
  maskPngBuffer = null,
  prompt,
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const imageModel = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
  const form = new FormData();
  form.append('model', imageModel);
  form.append('prompt', prompt);
  form.append('size', '1024x1024');
  form.append(
    'image',
    new Blob([frontPngBuffer], { type: 'image/png' }),
    'front.png'
  );
  if (maskPngBuffer) {
    form.append(
      'mask',
      new Blob([maskPngBuffer], { type: 'image/png' }),
      'mask.png'
    );
  }

  const response = await axios.post(`${OPENAI_BASE_URL}/images/edits`, form, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    httpsAgent: ipv4Agent,
    timeout: 90000,
    maxBodyLength: Infinity,
  });

  const item = response.data?.data?.[0];
  if (item?.b64_json) {
    return {
      provider: 'openai',
      model: imageModel,
      buffer: Buffer.from(item.b64_json, 'base64'),
    };
  }
  if (item?.url) {
    const imgResp = await axios.get(item.url, {
      responseType: 'arraybuffer',
      httpsAgent: ipv4Agent,
      timeout: 30000,
    });
    return {
      provider: 'openai',
      model: imageModel,
      buffer: Buffer.from(imgResp.data),
    };
  }

  throw new Error('Image edit API did not return an image');
}

async function createAutoHairMask(width = 512, height = 512) {
  const svg = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="feather" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      <rect width="${width}" height="${height}" fill="black" />
      <g filter="url(#feather)">
        <path d="M 0,0 L ${width},0 L ${width},${Math.round(height * 0.44)} 
                 C ${Math.round(width * 0.85)},${Math.round(height * 0.44)} ${Math.round(width * 0.75)},${Math.round(height * 0.34)} ${Math.round(width * 0.5)},${Math.round(height * 0.30)}
                 C ${Math.round(width * 0.25)},${Math.round(height * 0.30)} ${Math.round(width * 0.15)},${Math.round(height * 0.44)} 0,${Math.round(height * 0.44)} Z" 
                 fill="white" />
        <ellipse cx="${Math.round(width * 0.5)}" cy="${Math.round(height * 0.18)}" 
                 rx="${Math.round(width * 0.46)}" ry="${Math.round(height * 0.22)}" fill="white" />
      </g>
      <g filter="url(#feather)">
        <ellipse cx="${Math.round(width * 0.5)}" cy="${Math.round(height * 0.60)}" 
                 rx="${Math.round(width * 0.26)}" ry="${Math.round(height * 0.28)}" fill="black" />
      </g>
    </svg>
  `);
  return sharp(svg).resize(width, height).png().toBuffer();
}

async function compositePreservedFace({ originalFront512, inpainted512 }) {
  try {
    const faceProtectMaskSvg = Buffer.from(`
      <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>
        <rect width="512" height="512" fill="black" />
        <g filter="url(#blur)">
          <ellipse cx="256" cy="305" rx="142" ry="165" fill="white" />
        </g>
      </svg>
    `);

    const faceMaskBuf = await sharp(faceProtectMaskSvg)
      .resize(512, 512)
      .png()
      .toBuffer();

    const originalFaceCutout = await sharp(originalFront512)
      .composite([{ input: faceMaskBuf, blend: 'dest-in' }])
      .png()
      .toBuffer();

    return await sharp(inpainted512)
      .composite([{ input: originalFaceCutout, blend: 'over' }])
      .jpeg({ quality: 92 })
      .toBuffer();
  } catch (err) {
    logger.warn({ err: err.message }, 'Face composite refinement failed, using inpaint raw output');
    return inpainted512;
  }
}

async function generateHairTryOnWithCloudflare({
  frontPngBuffer,
  maskPngBuffer = null,
  prompt,
}) {
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const apiToken = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
  if (!accountId || !apiToken) {
    throw new Error('Cloudflare account ID or API token is not configured');
  }

  // Always perform inpainting on the user's actual photo so their face is preserved!
  try {
    const inpaintModel =
      (process.env.CLOUDFLARE_INPAINT_MODEL || '').trim() ||
      '@cf/runwayml/stable-diffusion-v1-5-inpainting';

    const [scaledFront, effectiveMask] = await Promise.all([
      sharp(frontPngBuffer)
        .resize(512, 512, { fit: 'cover' })
        .png()
        .toBuffer(),
      maskPngBuffer
        ? sharp(maskPngBuffer)
            .resize(512, 512, { fit: 'cover' })
            .png()
            .toBuffer()
        : createAutoHairMask(512, 512),
    ]);

    const url = `${CLOUDFLARE_BASE_URL}/${accountId}/ai/run/${inpaintModel}`;
    const cleanPrompt = `${prompt}, photorealistic natural haircut, realistic salon hair texture, clean hairline, professional studio lighting`;
    const response = await axios.post(
      url,
      {
        prompt: cleanPrompt,
        negative_prompt:
          'distorted face, deformed eyes, extra ears, bad face, disfigured, cartoon, blurry, low resolution',
        image_b64: scaledFront.toString('base64'),
        mask: Array.from(effectiveMask),
        num_steps: 20,
        strength: 0.85,
        guidance: 8.0,
      },
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
        httpsAgent: ipv4Agent,
        timeout: 45000,
      }
    );

    if (response.data && response.data.length > 500) {
      // Seamlessly composite the user's real eyes, nose, mouth and skin tone onto the result
      const refinedBuffer = await compositePreservedFace({
        originalFront512: scaledFront,
        inpainted512: Buffer.from(response.data),
      });

      return {
        provider: 'cloudflare',
        model: inpaintModel,
        buffer: refinedBuffer,
      };
    }
  } catch (inpaintErr) {
    const msg = inpaintErr.response?.data?.toString() || inpaintErr.message;
    logger.warn({ err: msg }, 'Cloudflare inpainting failed on user photo');
  }

  throw new Error('Cloudflare inpainting failed to apply haircut to user photo');
}

/**
 * Generates a virtual hairstyle try-on image.
 * Uses Cloudflare Workers AI primary (fast, free daily neurons),
 * with Gemini and OpenAI image generation as fallbacks.
 */
async function generateHairTryOn({
  frontPngBuffer,
  maskPngBuffer = null,
  prompt,
}) {
  const errors = [];

  if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) {
    try {
      return await generateHairTryOnWithCloudflare({
        frontPngBuffer,
        maskPngBuffer,
        prompt,
      });
    } catch (err) {
      const msg = err.response?.data?.toString() || err.message;
      errors.push(`Cloudflare Workers AI: ${msg}`);
      logger.warn({ err: msg }, 'Cloudflare Try-On failed, trying Gemini');
    }
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      return await generateHairTryOnWithGemini({ frontPngBuffer, prompt });
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      errors.push(`Gemini Image: ${msg}`);
      logger.warn({ err: msg }, 'Gemini try-on failed, trying OpenAI fallback');
    }
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      return await generateHairTryOnWithOpenAi({
        frontPngBuffer,
        maskPngBuffer,
        prompt,
      });
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      errors.push(`OpenAI Image: ${msg}`);
      logger.error({ err: msg }, 'OpenAI try-on failed');
    }
  }

  throw new AppError(
    'Virtual Try-On is currently unavailable across all AI providers. Please try again later.',
    503,
    {
      code: 'TRYON_QUOTA_UNAVAILABLE',
      details: errors,
    }
  );
}

/**
 * Generates a photorealistic preview image for a recommended hairstyle
 * tailored to the person's face shape, gender, and hair type.
 * Uses Cloudflare Workers AI Flux-1-schnell model with fallbacks.
 */
async function generateHairstylePreviewImage({
  hairstyleName,
  faceShape,
  gender = 'men',
  hairType = 'straight',
}) {
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const apiToken = (process.env.CLOUDFLARE_API_TOKEN || '').trim();

  const promptGender = gender === 'women' ? 'woman' : 'man';
  const promptFace = faceShape ? `with a flattering ${faceShape} face shape` : '';
  const promptHair = hairType ? `${hairType} hair texture` : 'natural hair texture';

  const prompt = `Close-up studio lookbook portrait of an attractive ${promptGender} ${promptFace}, featuring a stylish "${hairstyleName}" hairstyle, ${promptHair}, sharp focus on the haircut details, clean hairline, professional salon lighting, 8k resolution, photorealistic salon portfolio photo, neutral blurred background`;

  // 1. Cloudflare Workers AI Flux
  if (accountId && apiToken) {
    try {
      const fluxModel =
        (process.env.CLOUDFLARE_FLUX_MODEL || '').trim() ||
        '@cf/black-forest-labs/flux-1-schnell';
      const url = `${CLOUDFLARE_BASE_URL}/${accountId}/ai/run/${fluxModel}`;

      const response = await axios.post(
        url,
        { prompt },
        {
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          httpsAgent: ipv4Agent,
          timeout: 25000,
        }
      );

      let imageBuffer = null;
      if (response.data?.result?.image) {
        imageBuffer = Buffer.from(response.data.result.image, 'base64');
      } else if (Buffer.isBuffer(response.data)) {
        imageBuffer = response.data;
      }

      if (imageBuffer && imageBuffer.length > 1000) {
        const optimized = await sharp(imageBuffer)
          .resize(512, 512, { fit: 'cover', position: 'center' })
          .jpeg({ quality: 85, mozjpeg: true })
          .toBuffer();

        return {
          buffer: optimized,
          provider: 'cloudflare',
          model: fluxModel,
        };
      }
    } catch (err) {
      const msg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      logger.warn(
        { err: msg, hairstyleName },
        'Cloudflare hairstyle preview generation failed'
      );
    }
  }

  // 2. Gemini Image fallback
  if (process.env.GEMINI_API_KEY) {
    try {
      const geminiModel =
        (process.env.GEMINI_IMAGE_MODEL || '').trim() || 'gemini-3.1-flash-image';
      const url = `${GEMINI_BASE_URL}/${encodeURIComponent(geminiModel)}:generateImages`;
      const res = await axios.post(
        url,
        {
          prompt,
          number_of_images: 1,
          output_mime_type: 'image/jpeg',
          aspect_ratio: '1:1',
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': process.env.GEMINI_API_KEY,
          },
          httpsAgent: ipv4Agent,
          timeout: 25000,
        }
      );
      const b64 = res.data?.generated_images?.[0]?.image?.image_bytes;
      if (b64) {
        const rawBuf = Buffer.from(b64, 'base64');
        const optimized = await sharp(rawBuf)
          .resize(512, 512, { fit: 'cover' })
          .jpeg({ quality: 85 })
          .toBuffer();
        return { buffer: optimized, provider: 'gemini', model: geminiModel };
      }
    } catch (gErr) {
      logger.warn({ err: gErr.message }, 'Gemini preview image fallback failed');
    }
  }

  return null;
}

module.exports = {
  extractJsonObject,
  callGeminiJson,
  callOpenAiJson,
  generateStructuredWithFallback,
  generateHairTryOn,
  generateHairstylePreviewImage,
};
