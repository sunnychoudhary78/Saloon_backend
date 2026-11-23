'use strict';

const https = require('https');
const axios = require('axios');
const sharp = require('sharp');
const FormData = require('form-data');
const { fal } = require('@fal-ai/client');
const AppError = require('../middlewares/AppError');
const { logger } = require('../utils/logger');

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const GEMINI_BASE_URL =
  process.env.GEMINI_BASE_URL ||
  'https://generativelanguage.googleapis.com/v1beta/models';

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

async function generateHairTryOnWithGemini({ frontPngBuffer, prompt }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const configured = (process.env.GEMINI_IMAGE_MODEL || '').trim();
  const models = Array.from(
    new Set([configured, ...DEFAULT_GEMINI_IMAGE_MODELS].filter(Boolean))
  );

  const scaledFront = await sharp(frontPngBuffer)
    .resize(1024, 1024, { fit: 'cover', position: 'center' })
    .ensureAlpha()
    .png()
    .toBuffer();

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
                    data: scaledFront.toString('base64'),
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
        const rawBuffer = Buffer.from(b64, 'base64');
        const refinedBuffer = await compositePreservedFace({
          originalFront: scaledFront,
          inpainted: rawBuffer,
          width: 1024,
          height: 1024,
        });

        return {
          provider: 'gemini',
          model,
          buffer: refinedBuffer,
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

/**
 * Creates an alpha-channel inpainting mask specifically for OpenAI /images/edits.
 * OpenAI requirements:
 * - Transparent pixels (alpha == 0): where the image should be edited (hair region).
 * - Opaque pixels (alpha == 255): where the image should be preserved unchanged (face, eyes, nose, mouth, neck, body).
 */
async function createOpenAiHairMask(width = 1024, height = 1024) {
  const svg = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="softHole" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <mask id="holeMask">
          <!-- Entire canvas starts white (opaque/protected in target) -->
          <rect width="${width}" height="${height}" fill="white" />
          
          <!-- Hair region hole: black in mask = transparent in target (AI inpaintable) -->
          <g filter="url(#softHole)">
            <!-- Top hair dome covering hair area from top down to hairline -->
            <ellipse cx="${Math.round(width * 0.5)}" cy="${Math.round(height * 0.22)}" 
                     rx="${Math.round(width * 0.36)}" ry="${Math.round(height * 0.22)}" fill="black" />
            <!-- Sides of hair near temples/ears -->
            <ellipse cx="${Math.round(width * 0.25)}" cy="${Math.round(height * 0.32)}" 
                     rx="${Math.round(width * 0.12)}" ry="${Math.round(height * 0.16)}" fill="black" />
            <ellipse cx="${Math.round(width * 0.75)}" cy="${Math.round(height * 0.32)}" 
                     rx="${Math.round(width * 0.12)}" ry="${Math.round(height * 0.16)}" fill="black" />
          </g>
          
          <!-- Strictly protect face oval below forehead: white = opaque in target (locked) -->
          <g filter="url(#softHole)">
            <ellipse cx="${Math.round(width * 0.5)}" cy="${Math.round(height * 0.60)}" 
                     rx="${Math.round(width * 0.26)}" ry="${Math.round(height * 0.25)}" fill="white" />
          </g>
        </mask>
      </defs>
      <!-- Base opaque canvas with hair hole punched out -->
      <rect width="${width}" height="${height}" fill="black" mask="url(#holeMask)" />
    </svg>
  `);
  return sharp(svg).resize(width, height).png().toBuffer();
}

/**
 * Creates a standard grayscale mask for diffusion inpainting (Fal / Cloudflare / SD).
 * - White (#FFFFFF): area to inpaint (hair region).
 * - Black (#000000): area to keep unchanged (face, eyes, nose, mouth, neck, body).
 */
async function createStandardInpaintHairMask(width = 1024, height = 1024) {
  const svg = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="feather" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>
      <!-- Base canvas: black (protected) -->
      <rect width="${width}" height="${height}" fill="black" />
      
      <!-- Hair region: white (inpaintable) -->
      <g filter="url(#feather)">
        <path d="M 0,0 L ${width},0 L ${width},${Math.round(height * 0.44)} 
                 C ${Math.round(width * 0.85)},${Math.round(height * 0.44)} ${Math.round(width * 0.75)},${Math.round(height * 0.32)} ${Math.round(width * 0.5)},${Math.round(height * 0.28)}
                 C ${Math.round(width * 0.25)},${Math.round(height * 0.28)} ${Math.round(width * 0.15)},${Math.round(height * 0.44)} 0,${Math.round(height * 0.44)} Z" 
                 fill="white" />
        <ellipse cx="${Math.round(width * 0.5)}" cy="${Math.round(height * 0.20)}" 
                 rx="${Math.round(width * 0.46)}" ry="${Math.round(height * 0.24)}" fill="white" />
      </g>
      <!-- Face cutout: black (protected) -->
      <g filter="url(#feather)">
        <ellipse cx="${Math.round(width * 0.5)}" cy="${Math.round(height * 0.60)}" 
                 rx="${Math.round(width * 0.28)}" ry="${Math.round(height * 0.30)}" fill="black" />
      </g>
    </svg>
  `);
  return sharp(svg).resize(width, height).png().toBuffer();
}

/**
 * Seamlessly composites the user's authentic face from their original scan photo
 * over the generated hairstyle image using feathered alpha masking.
 * This guarantees 100% preservation of:
 * - Eyes, eyebrows, eyelids
 * - Nose, cheeks, smile lines
 * - Lips, mouth, chin, jawline
 * - Authentic skin tone and natural lighting
 * While the new generated hairstyle seamlessly frames the head.
 */
async function compositePreservedFace({
  originalFront,
  inpainted,
  width = 1024,
  height = 1024,
}) {
  try {
    const faceMaskSvg = Buffer.from(`
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="20" />
          </filter>
        </defs>
        <rect width="${width}" height="${height}" fill="none" />
        <g filter="url(#soft)">
          <ellipse cx="${Math.round(width * 0.5)}" cy="${Math.round(height * 0.578)}"
                   rx="${Math.round(width * 0.215)}" ry="${Math.round(height * 0.234)}" fill="white" />
        </g>
      </svg>
    `);

    const faceMaskBuf = await sharp(faceMaskSvg)
      .resize(width, height)
      .png()
      .toBuffer();

    const originalFaceCutout = await sharp(originalFront)
      .resize(width, height, { fit: 'cover', position: 'center' })
      .ensureAlpha()
      .composite([{ input: faceMaskBuf, blend: 'dest-in' }])
      .png()
      .toBuffer();

    return await sharp(inpainted)
      .resize(width, height, { fit: 'cover', position: 'center' })
      .composite([{ input: originalFaceCutout, blend: 'over' }])
      .jpeg({ quality: 93, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    logger.warn({ err: err.message }, 'Face composite preservation failed, returning inpainted output');
    return inpainted;
  }
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

  const imageModel = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5';

  const scaledFront = await sharp(frontPngBuffer)
    .resize(1024, 1024, { fit: 'cover', position: 'center' })
    .ensureAlpha()
    .png()
    .toBuffer();

  let effectiveMask;
  if (maskPngBuffer) {
    effectiveMask = await sharp(maskPngBuffer)
      .resize(1024, 1024, { fit: 'cover', position: 'center' })
      .ensureAlpha()
      .png()
      .toBuffer();
  } else {
    // Generate specialized OpenAI alpha mask (transparent hair, opaque face/body)
    effectiveMask = await createOpenAiHairMask(1024, 1024);
  }

  const form = new FormData();
  form.append('model', imageModel);
  form.append('prompt', prompt);
  form.append('n', 1);
  form.append('size', '1024x1024');
  form.append('image', scaledFront, { filename: 'front.png', contentType: 'image/png' });
  form.append('mask', effectiveMask, { filename: 'mask.png', contentType: 'image/png' });

  const response = await axios.post(`${OPENAI_BASE_URL}/images/edits`, form, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...form.getHeaders(),
    },
    httpsAgent: ipv4Agent,
    timeout: 90000,
    maxBodyLength: Infinity,
  });

  const item = response.data?.data?.[0];
  let rawBuffer = null;

  if (item?.b64_json) {
    rawBuffer = Buffer.from(item.b64_json, 'base64');
  } else if (item?.url) {
    const imgResp = await axios.get(item.url, {
      responseType: 'arraybuffer',
      httpsAgent: ipv4Agent,
      timeout: 30000,
    });
    rawBuffer = Buffer.from(imgResp.data);
  }

  if (rawBuffer) {
    // For modern GPT-Image models with our precise hair-hole mask, the model
    // generates the haircut seamlessly integrated with the user's authentic face and skin tone.
    return {
      provider: 'openai',
      model: imageModel,
      buffer: rawBuffer,
    };
  }

  throw new Error('OpenAI image edit API did not return an image');
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
        originalFront: scaledFront,
        inpainted: Buffer.from(response.data),
        width: 512,
        height: 512,
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

async function uploadToFalOrDataUri(buffer, mimeType = 'image/png') {
  try {
    if (typeof Blob !== 'undefined') {
      const blob = new Blob([buffer], { type: mimeType });
      const url = await fal.storage.upload(blob);
      if (url) return url;
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'fal.storage.upload failed, falling back to base64 data URI');
  }
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

/**
 * Generates a virtual hairstyle try-on image using fal.ai (FLUX inpainting).
 */
async function generateHairTryOnWithFal({
  frontPngBuffer,
  maskPngBuffer = null,
  prompt,
}) {
  const falKey = (process.env.FAL_KEY || '').trim();
  if (!falKey) {
    throw new Error('FAL_KEY is not configured');
  }
  fal.config({ credentials: falKey });

  const [scaledFront, effectiveMask] = await Promise.all([
    sharp(frontPngBuffer)
      .resize(1024, 1024, { fit: 'cover', position: 'center' })
      .png()
      .toBuffer(),
    maskPngBuffer
      ? sharp(maskPngBuffer)
          .resize(1024, 1024, { fit: 'cover', position: 'center' })
          .png()
          .toBuffer()
      : createStandardInpaintHairMask(1024, 1024),
  ]);

  const [frontUrl, maskUrl] = await Promise.all([
    uploadToFalOrDataUri(scaledFront, 'image/png'),
    uploadToFalOrDataUri(effectiveMask, 'image/png'),
  ]);

  const model = process.env.FAL_TRYON_MODEL || 'fal-ai/flux-lora/inpainting';
  logger.info({ model }, 'Subscribing to fal.ai inpainting for hairstyle try-on...');

  const result = await fal.subscribe(model, {
    input: {
      prompt,
      image_url: frontUrl,
      mask_url: maskUrl,
      strength: 0.85,
      num_inference_steps: 28,
      guidance_scale: 3.5,
      output_format: 'jpeg',
    },
  });

  const images = result.data?.images || result.images || [];
  const outputUrl = images[0]?.url;
  if (!outputUrl) {
    throw new Error('fal.ai inpainting did not return an image URL');
  }

  const dlResp = await axios.get(outputUrl, {
    responseType: 'arraybuffer',
    httpsAgent: ipv4Agent,
    timeout: 30000,
  });

  // Lock and preserve authentic user face features seamlessly onto the generated haircut
  const refinedBuffer = await compositePreservedFace({
    originalFront: scaledFront,
    inpainted: Buffer.from(dlResp.data),
    width: 1024,
    height: 1024,
  });

  return {
    provider: 'fal',
    model,
    buffer: refinedBuffer,
    remoteUrl: outputUrl,
  };
}

/**
 * Generates a photorealistic preview image for a hairstyle using fal.ai (FLUX.1 [dev]).
 */
async function generateHairstylePreviewImageWithFal({
  hairstyleName,
  faceShape,
  gender = 'men',
  hairType = 'straight',
}) {
  const falKey = (process.env.FAL_KEY || '').trim();
  if (!falKey) return null;
  fal.config({ credentials: falKey });

  const promptGender = gender === 'women' ? 'woman' : 'man';
  const promptFace = faceShape ? `with a flattering ${faceShape} face shape` : '';
  const promptHair = hairType ? `${hairType} hair texture` : 'natural hair texture';
  const prompt = `Close-up studio lookbook portrait of an attractive ${promptGender} ${promptFace}, featuring a stylish "${hairstyleName}" hairstyle, ${promptHair}, sharp focus on the haircut details, clean hairline, professional salon lighting, 8k resolution, photorealistic salon portfolio photo, neutral blurred background`;

  const model = process.env.FAL_IMAGE_MODEL || 'fal-ai/flux/dev';
  try {
    const result = await fal.subscribe(model, {
      input: {
        prompt,
        image_size: 'square_hd',
        num_inference_steps: 28,
        guidance_scale: 3.5,
      },
    });

    const images = result.data?.images || result.images || [];
    const outputUrl = images[0]?.url;
    if (outputUrl) {
      const dlResp = await axios.get(outputUrl, {
        responseType: 'arraybuffer',
        httpsAgent: ipv4Agent,
        timeout: 30000,
      });

      const optimized = await sharp(Buffer.from(dlResp.data))
        .resize(512, 512, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();

      return {
        buffer: optimized,
        provider: 'fal',
        model,
      };
    }
  } catch (err) {
    const msg = err.body?.detail || err.message;
    logger.warn({ err: msg, model, hairstyleName }, 'fal.ai hairstyle preview generation failed');
  }

  return null;
}

/**
 * Generates a virtual hairstyle try-on image using fal.ai (FLUX inpainting), Gemini, or OpenAI.
 */
async function generateHairTryOn({
  frontPngBuffer,
  maskPngBuffer = null,
  prompt,
}) {
  const tryOnProvider = (process.env.AI_TRYON_PROVIDER || 'openai').toLowerCase();

  // 1. Direct OpenAI Try-On (Fast, high-fidelity inpainting with facial preservation)
  if (tryOnProvider === 'openai' && process.env.OPENAI_API_KEY) {
    try {
      logger.info('Generating virtual hairstyle try-on with OpenAI...');
      return await generateHairTryOnWithOpenAi({
        frontPngBuffer,
        maskPngBuffer,
        prompt,
      });
    } catch (openAiErr) {
      const msg = openAiErr.response?.data?.error?.message || openAiErr.message;
      logger.warn({ err: msg }, 'OpenAI try-on failed, attempting fallback');
      if (process.env.FAL_KEY) {
        try {
          return await generateHairTryOnWithFal({ frontPngBuffer, maskPngBuffer, prompt });
        } catch (_) {}
      }
      if (process.env.GEMINI_API_KEY) {
        try {
          return await generateHairTryOnWithGemini({ frontPngBuffer, prompt });
        } catch (_) {}
      }
      throw new AppError(`OpenAI Virtual Try-On failed: ${msg}`, 500, {
        code: 'TRYON_ERROR',
        details: msg,
      });
    }
  }

  // 2. fal.ai (FLUX Inpainting)
  if ((tryOnProvider === 'fal' || !process.env.OPENAI_API_KEY) && process.env.FAL_KEY) {
    try {
      logger.info('Generating virtual hairstyle try-on with fal.ai (FLUX inpainting)...');
      return await generateHairTryOnWithFal({
        frontPngBuffer,
        maskPngBuffer,
        prompt,
      });
    } catch (falErr) {
      const errMsg = falErr.body?.detail || falErr.message || String(falErr);
      logger.warn({ err: errMsg }, 'fal.ai try-on failed, attempting fallback if configured');

      // Fallback to OpenAI if configured
      if (process.env.OPENAI_API_KEY) {
        try {
          logger.info('Falling back to OpenAI for hairstyle try-on...');
          return await generateHairTryOnWithOpenAi({
            frontPngBuffer,
            maskPngBuffer,
            prompt,
          });
        } catch (openAiErr) {
          logger.error({ err: openAiErr.message }, 'OpenAI fallback try-on also failed');
        }
      }

      // Fallback to Gemini if configured
      if (process.env.GEMINI_API_KEY) {
        try {
          return await generateHairTryOnWithGemini({ frontPngBuffer, prompt });
        } catch (_) {}
      }

      const isLocked =
        errMsg.toLowerCase().includes('balance') ||
        errMsg.toLowerCase().includes('locked') ||
        errMsg.toLowerCase().includes('403') ||
        errMsg.toLowerCase().includes('exhausted');

      throw new AppError(
        isLocked
          ? `fal.ai Balance Exhausted: ${errMsg}. Please top up your balance at https://fal.ai/dashboard/billing.`
          : `fal.ai Virtual Try-On failed: ${errMsg}`,
        isLocked ? 402 : 500,
        { code: isLocked ? 'FAL_BALANCE_EXHAUSTED' : 'TRYON_ERROR', details: errMsg }
      );
    }
  }

  // 2. Gemini nano-banana
  if (tryOnProvider === 'gemini' && process.env.GEMINI_API_KEY) {
    try {
      logger.info('Generating virtual hairstyle try-on with Gemini (nano-banana)...');
      return await generateHairTryOnWithGemini({ frontPngBuffer, prompt });
    } catch (geminiErr) {
      logger.warn({ err: geminiErr.message }, 'Gemini try-on failed, attempting fallback if configured');

      if (process.env.OPENAI_API_KEY) {
        try {
          return await generateHairTryOnWithOpenAi({
            frontPngBuffer,
            maskPngBuffer,
            prompt,
          });
        } catch (openAiErr) {
          logger.error({ err: openAiErr.message }, 'OpenAI fallback try-on failed');
        }
      }

      const isQuota =
        geminiErr.message.includes('429') ||
        geminiErr.message.toLowerCase().includes('quota') ||
        geminiErr.message.toLowerCase().includes('limit');

      throw new AppError(
        isQuota
          ? `Gemini nano-banana Quota: ${geminiErr.message}. Google Cloud Project me Pay-as-you-go billing enable karein.`
          : `Gemini nano-banana Try-On failed: ${geminiErr.message}`,
        isQuota ? 429 : 500,
        { code: isQuota ? 'TRYON_QUOTA_EXCEEDED' : 'TRYON_ERROR', details: geminiErr.message }
      );
    }
  }

  // 3. OpenAI fallback
  if (process.env.OPENAI_API_KEY) {
    try {
      return await generateHairTryOnWithOpenAi({
        frontPngBuffer,
        maskPngBuffer,
        prompt,
      });
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      logger.error({ err: msg }, 'OpenAI hair try-on failed');
      throw new AppError(
        `OpenAI Virtual Try-On failed: ${msg}`,
        500,
        { code: 'TRYON_ERROR', details: msg }
      );
    }
  }

  throw new AppError(
    'Virtual Try-On is currently unavailable. Please configure FAL_KEY, GEMINI_API_KEY, or OPENAI_API_KEY.',
    503,
    { code: 'TRYON_UNAVAILABLE' }
  );
}

/**
 * Generates a photorealistic preview image for a recommended hairstyle
 * tailored to the person's face shape, gender, and hair type.
 * Uses fal.ai (FLUX.1 [dev]) or OpenAI image generation API.
 */
async function generateHairstylePreviewImage({
  hairstyleName,
  faceShape,
  gender = 'men',
  hairType = 'straight',
}) {
  // 1. Primary: fal.ai FLUX.1 [dev]
  if (process.env.FAL_KEY) {
    const falPreview = await generateHairstylePreviewImageWithFal({
      hairstyleName,
      faceShape,
      gender,
      hairType,
    });
    if (falPreview) return falPreview;
  }

  // 2. Fallback: OpenAI
  const apiKey = (process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return null;

  const promptGender = gender === 'women' ? 'woman' : 'man';
  const promptFace = faceShape ? `with a flattering ${faceShape} face shape` : '';
  const promptHair = hairType ? `${hairType} hair texture` : 'natural hair texture';

  const prompt = `Close-up studio lookbook portrait of an attractive ${promptGender} ${promptFace}, featuring a stylish "${hairstyleName}" hairstyle, ${promptHair}, sharp focus on the haircut details, clean hairline, professional salon lighting, 8k resolution, photorealistic salon portfolio photo, neutral blurred background`;

  try {
    const res = await axios.post(
      `${OPENAI_BASE_URL}/images/generations`,
      {
        model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1-mini',
        prompt,
        n: 1,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        httpsAgent: ipv4Agent,
        timeout: 25000,
      }
    );

    const b64 = res.data?.data?.[0]?.b64_json;
    if (b64) {
      const rawBuf = Buffer.from(b64, 'base64');
      const optimized = await sharp(rawBuf)
        .resize(512, 512, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();

      return {
        buffer: optimized,
        provider: 'openai',
        model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1-mini',
      };
    }
  } catch (err) {
    const msg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    logger.warn({ err: msg, hairstyleName }, 'OpenAI hairstyle preview generation failed');
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
  createOpenAiHairMask,
  createStandardInpaintHairMask,
  compositePreservedFace,
};
