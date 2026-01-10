// utils/fileUtils.js
const path = require('path');
const fs = require('fs').promises;


const safeUnlink = async (uploadDir, filename) => {
    if (!filename) return; // nothing to do
    const filePath = path.join(uploadDir, filename);
    // safety: ensure resolved path starts with uploadDir
    const normalized = path.resolve(filePath);
    if (!normalized.startsWith(path.resolve(uploadDir))) {
        throw new Error('Unsafe file path');
    }
    try {
        await fs.unlink(normalized);
    } catch (err) {
        // ignore if file doesn't exist, but bubble other errors
        if (err.code !== 'ENOENT') throw err;
    }
};


module.exports = { safeUnlink };