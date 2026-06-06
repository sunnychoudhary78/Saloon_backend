// controllers/photoController.js
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { User, EmployeeDetail } = require('../models'); // adjust if needed

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// Keep these in sync with your multer settings
const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1 MB
const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/jpg']);

// helper to safely remove a file if it exists
async function safeUnlink(filePath) {
  try {
    await fsp.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // ignore file-not-found, but log other errors
      console.warn('safeUnlink error:', err);
    }
  }
}

// upload or update profile picture
exports.uploadPhoto = async (req, res) => {
  try {
    const { id } = req.params; // user id

    // multer should populate req.file; if not, return 400
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Defensive checks (multer usually does this already)
    if (!ALLOWED_MIMES.has(req.file.mimetype)) {
      // remove the uploaded file to avoid orphan files
      try { await safeUnlink(req.file.path); } catch (e) { /* ignore */ }
      return res.status(400).json({ message: 'Invalid file type. Only PNG and JPEG/JPG are allowed.' });
    }
    if (req.file.size > MAX_FILE_SIZE) {
      try { await safeUnlink(req.file.path); } catch (e) { /* ignore */ }
      return res.status(400).json({ message: `File too large. Max allowed size is ${MAX_FILE_SIZE} bytes.` });
    }

    const user = await User.findByPk(id);
    if (!user) {
      // cleanup uploaded file
      try { await safeUnlink(req.file.path); } catch (e) { /* ignore */ }
      return res.status(404).json({ message: 'User not found' });
    }

    const employee = await EmployeeDetail.findOne({ where: { user_id: user.id } });
    if (!employee) {
      try { await safeUnlink(req.file.path); } catch (e) { /* ignore */ }
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Ensure the uploads directory and file paths are safe
    const resolvedUploadDir = path.resolve(UPLOAD_DIR);
    const resolvedTempPath = path.resolve(req.file.path);
    if (!resolvedTempPath.startsWith(resolvedUploadDir)) {
      // suspicious path - remove and error
      try { await safeUnlink(req.file.path); } catch (e) { /* ignore */ }
      return res.status(400).json({ message: 'Invalid file path' });
    }

    // Delete old file if exists and is inside upload dir
    if (employee.profile_picture) {
      const oldPath = path.join(UPLOAD_DIR, employee.profile_picture);
      const resolvedOld = path.resolve(oldPath);
      if (resolvedOld.startsWith(resolvedUploadDir)) {
        try {
          await safeUnlink(resolvedOld);
        } catch (err) {
          // don't fail on delete error
          console.warn('Failed to delete old profile picture:', err);
        }
      } else {
        console.warn('Old profile picture path is outside uploads dir, skipping delete.');
      }
    }

    // Save filename to DB (multer already set filename)
    employee.profile_picture = req.file.filename;
    await employee.save();

    return res.status(200).json({
      message: 'Profile photo uploaded successfully',
      filename: req.file.filename,
    });
  } catch (error) {
    console.error('uploadPhoto error:', error);

    // cleanup temp file to avoid orphan files
    if (req && req.file && req.file.path) {
      try { await safeUnlink(req.file.path); } catch (e) { /* ignore */ }
    }

    return res.status(500).json({ message: 'Failed to upload photo', error: error.message });
  }
};

exports.uploadMyPhoto = async (req, res) => {

  try {
    const id = req.user && req.user.id;

    // multer should populate req.file; if not, return 400
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Defensive checks (multer usually does this already)
    if (!ALLOWED_MIMES.has(req.file.mimetype)) {
      // remove the uploaded file to avoid orphan files
      try { await safeUnlink(req.file.path); } catch (e) { /* ignore */ }
      return res.status(400).json({ message: 'Invalid file type. Only PNG and JPEG/JPG are allowed.' });
    }
    if (req.file.size > MAX_FILE_SIZE) {
      try { await safeUnlink(req.file.path); } catch (e) { /* ignore */ }
      return res.status(400).json({ message: `File too large. Max allowed size is ${MAX_FILE_SIZE} bytes.` });
    }

    const user = await User.findByPk(id);
    if (!user) {
      // cleanup uploaded file
      try { await safeUnlink(req.file.path); } catch (e) { /* ignore */ }
      return res.status(404).json({ message: 'User not found' });
    }

    const employee = await EmployeeDetail.findOne({ where: { user_id: user.id } });
    if (!employee) {
      try { await safeUnlink(req.file.path); } catch (e) { /* ignore */ }
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Ensure the uploads directory and file paths are safe
    const resolvedUploadDir = path.resolve(UPLOAD_DIR);
    const resolvedTempPath = path.resolve(req.file.path);
    if (!resolvedTempPath.startsWith(resolvedUploadDir)) {
      // suspicious path - remove and error
      try { await safeUnlink(req.file.path); } catch (e) { /* ignore */ }
      return res.status(400).json({ message: 'Invalid file path' });
    }

    // Delete old file if exists and is inside upload dir
    if (employee.profile_picture) {
      const oldPath = path.join(UPLOAD_DIR, employee.profile_picture);
      const resolvedOld = path.resolve(oldPath);
      if (resolvedOld.startsWith(resolvedUploadDir)) {
        try {
          await safeUnlink(resolvedOld);
        } catch (err) {
          // don't fail on delete error
          console.warn('Failed to delete old profile picture:', err);
        }
      } else {
        console.warn('Old profile picture path is outside uploads dir, skipping delete.');
      }
    }

    // Save filename to DB (multer already set filename)
    employee.profile_picture = req.file.filename;
    await employee.save();

    return res.status(200).json({
      message: 'Profile photo uploaded successfully',
      filename: req.file.filename,
    });
  } catch (error) {
    console.error('uploadPhoto error:', error);

    // cleanup temp file to avoid orphan files
    if (req && req.file && req.file.path) {
      try { await safeUnlink(req.file.path); } catch (e) { /* ignore */ }
    }

    return res.status(500).json({ message: 'Failed to upload photo', error: error.message });
  }

}

// get profile picture link/filename for authenticated user
exports.getPhoto = async (req, res) => {
  try {
    // assuming authMiddleware sets req.user
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ message: 'Not authenticated' });

    const employee = await EmployeeDetail.findOne({ where: { user_id: userId } });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    if (!employee.profile_picture) return res.status(404).json({ message: 'No profile picture found' });

    // return the filename (client can request /uploads/<filename> if you serve static)
    return res.status(200).json({ profile_picture: employee.profile_picture });
  } catch (error) {
    console.error('getPhoto error:', error);
    return res.status(500).json({ message: 'Failed to get profile picture', error: error.message });
  }
};


