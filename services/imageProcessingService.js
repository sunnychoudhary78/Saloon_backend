'use strict';

const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const SALON_UPLOAD_DIR = path.join(__dirname, '../uploads/salons');

function parseImageEntry(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{')) {
      try {
        return parseImageEntry(JSON.parse(trimmed));
      } catch (_) {
        return { thumb: trimmed, medium: trimmed, full: trimmed };
      }
    }
    return deriveVariantsFromLegacyUrl(trimmed);
  }
  if (typeof entry === 'object') {
    const thumb = entry.thumb || entry.medium || entry.full || null;
    const medium = entry.medium || entry.full || entry.thumb || null;
    const full = entry.full || entry.medium || entry.thumb || null;
    if (!thumb && !medium && !full) return null;
    return { thumb, medium, full };
  }
  return null;
}

function deriveVariantsFromLegacyUrl(url) {
  if (!url) return null;
  if (url.includes('/thumb_')) {
    return {
      thumb: url,
      medium: url.replace('/thumb_', '/medium_'),
      full: url.replace('/thumb_', '/full_'),
    };
  }
  if (url.includes('/medium_')) {
    return {
      thumb: url.replace('/medium_', '/thumb_'),
      medium: url,
      full: url.replace('/medium_', '/full_'),
    };
  }
  if (url.includes('/full_')) {
    return {
      thumb: url.replace('/full_', '/thumb_'),
      medium: url.replace('/full_', '/medium_'),
      full: url,
    };
  }
  return { thumb: url, medium: url, full: url };
}

function extractThumbUrl(entry) {
  return parseImageEntry(entry)?.thumb || null;
}

function extractMediumUrl(entry) {
  return parseImageEntry(entry)?.medium || null;
}

function extractFullUrl(entry) {
  return parseImageEntry(entry)?.full || null;
}

function collectImageEntries(coverImage, galleryImages = []) {
  const entries = [];
  const cover = parseImageEntry(coverImage);
  if (cover) entries.push(cover);

  for (const item of galleryImages || []) {
    const parsed = parseImageEntry(item);
    if (parsed) entries.push(parsed);
  }

  const seen = new Set();
  return entries.filter((entry) => {
    const key = entry.thumb || entry.medium || entry.full;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildPreviewImages(coverImage, galleryImages, limit = 3) {
  const thumbs = collectImageEntries(coverImage, galleryImages)
    .map((entry) => entry.thumb)
    .filter(Boolean);

  if (thumbs.length === 0) return [];

  const preview = thumbs.slice(0, limit);
  while (preview.length < limit) {
    preview.push(preview[preview.length - 1]);
  }
  return preview;
}

function shapeGalleryForDetail(galleryImages = []) {
  return (galleryImages || [])
    .map((item) => extractMediumUrl(item) || extractFullUrl(item))
    .filter(Boolean);
}

function shapeCoverForDetail(coverImage, galleryImages = []) {
  return (
    extractMediumUrl(coverImage)
    || extractFullUrl(coverImage)
    || buildPreviewImages(coverImage, galleryImages, 1)[0]
    || null
  );
}

async function generateSalonImageVariants(sourcePath, baseUrl) {
  const baseName = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  const thumbName = `thumb_${baseName}.jpg`;
  const mediumName = `medium_${baseName}.jpg`;
  const fullName = `full_${baseName}.jpg`;

  fs.mkdirSync(SALON_UPLOAD_DIR, { recursive: true });

  const thumbPath = path.join(SALON_UPLOAD_DIR, thumbName);
  const mediumPath = path.join(SALON_UPLOAD_DIR, mediumName);
  const fullPath = path.join(SALON_UPLOAD_DIR, fullName);

  const pipeline = sharp(sourcePath).rotate();

  await Promise.all([
    pipeline
      .clone()
      .resize({ width: 400, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(thumbPath),
    pipeline
      .clone()
      .resize({ width: 800, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(mediumPath),
    pipeline
      .clone()
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(fullPath),
  ]);

  try {
    fs.unlinkSync(sourcePath);
  } catch (_) {}

  const prefix = `${baseUrl}/api/uploads/salons`;
  return {
    thumb: `${prefix}/${thumbName}`,
    medium: `${prefix}/${mediumName}`,
    full: `${prefix}/${fullName}`,
  };
}

module.exports = {
  parseImageEntry,
  extractThumbUrl,
  extractMediumUrl,
  extractFullUrl,
  collectImageEntries,
  buildPreviewImages,
  shapeGalleryForDetail,
  shapeCoverForDetail,
  generateSalonImageVariants,
};
