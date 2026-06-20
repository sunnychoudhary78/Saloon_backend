'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SEED_SOURCE_DIR = path.join(__dirname, '../../uploads/seed-salons');
const SALON_OUTPUT_DIR = path.join(__dirname, '../../uploads/salons');

const API_BASE =
  process.env.SEED_API_BASE || 'http://192.168.1.26:3011/api';

function parseImageNumber(filename) {
  const match = /^(\d+)\.[a-z0-9]+$/i.exec(filename);
  if (!match) return null;
  return parseInt(match[1], 10);
}

/**
 * Converts seed-salons/{N}.* to uploads/salons/seed-{N}.jpg
 * Returns a map: { 1: 'http://.../seed-1.jpg', 2: '...', ... }
 */
async function prepareSeedSalonImages() {
  fs.mkdirSync(SALON_OUTPUT_DIR, { recursive: true });

  const files = fs
    .readdirSync(SEED_SOURCE_DIR)
    .filter((f) => parseImageNumber(f) !== null)
    .sort((a, b) => parseImageNumber(a) - parseImageNumber(b));

  const urlMap = {};

  for (const file of files) {
    const num = parseImageNumber(file);
    const sourcePath = path.join(SEED_SOURCE_DIR, file);
    const outputName = `seed-${num}.jpg`;
    const outputPath = path.join(SALON_OUTPUT_DIR, outputName);

    if (!fs.existsSync(outputPath)) {
      await sharp(sourcePath)
        .rotate()
        .resize({ width: 1600, withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(outputPath);
    }

    urlMap[num] = `${API_BASE}/uploads/salons/${outputName}`;
  }

  return urlMap;
}

function imageUrls(urlMap, ids) {
  return ids.map((id) => {
    const url = urlMap[id];
    if (!url) throw new Error(`Missing seed image for id ${id}`);
    return url;
  });
}

module.exports = { prepareSeedSalonImages, imageUrls, API_BASE };
