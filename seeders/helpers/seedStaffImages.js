'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SEED_SOURCE_DIR = path.join(__dirname, '../../uploads/seed-staff');
const STAFF_OUTPUT_DIR = path.join(__dirname, '../../uploads/staff');

const API_BASE =
  process.env.SEED_API_BASE || 'http://192.168.1.26:3011/api';

/** Matches staff_1.png, staff_2.jpg, etc. */
function parseImageNumber(filename) {
  const match = /^staff_(\d+)\.[a-z0-9]+$/i.exec(filename);
  if (!match) return null;
  return parseInt(match[1], 10);
}

function parseSeedOutputNumber(filename) {
  const match = /^seed-(\d+)\.jpg$/i.exec(filename);
  if (!match) return null;
  return parseInt(match[1], 10);
}

/**
 * Converts seed-staff/staff_{N}.* to uploads/staff/seed-{N}.jpg
 * Also picks up any existing seed-{N}.jpg in the output folder.
 * Returns a map: { 1: 'http://.../seed-1.jpg', 2: '...', ... }
 */
async function prepareSeedStaffImages() {
  fs.mkdirSync(STAFF_OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(SEED_SOURCE_DIR, { recursive: true });

  const urlMap = {};

  const sourceFiles = fs
    .readdirSync(SEED_SOURCE_DIR)
    .filter((f) => parseImageNumber(f) !== null)
    .sort((a, b) => parseImageNumber(a) - parseImageNumber(b));

  for (const file of sourceFiles) {
    const num = parseImageNumber(file);
    const sourcePath = path.join(SEED_SOURCE_DIR, file);
    const outputName = `seed-${num}.jpg`;
    const outputPath = path.join(STAFF_OUTPUT_DIR, outputName);

    if (!fs.existsSync(outputPath)) {
      await sharp(sourcePath)
        .rotate()
        .resize({ width: 800, height: 800, fit: 'cover' })
        .jpeg({ quality: 85 })
        .toFile(outputPath);
    }

    urlMap[num] = `${API_BASE}/uploads/staff/${outputName}`;
  }

  // Include already-processed outputs even when source files are absent (VPS).
  const outputFiles = fs
    .readdirSync(STAFF_OUTPUT_DIR)
    .filter((f) => parseSeedOutputNumber(f) !== null);

  for (const file of outputFiles) {
    const num = parseSeedOutputNumber(file);
    if (!urlMap[num]) {
      urlMap[num] = `${API_BASE}/uploads/staff/${file}`;
    }
  }

  return urlMap;
}

function staffImageUrl(urlMap, id) {
  if (id == null) return null;
  return urlMap[id] || null;
}

module.exports = { prepareSeedStaffImages, staffImageUrl, API_BASE };
