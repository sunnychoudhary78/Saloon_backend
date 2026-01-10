const multer = require("multer");
const path = require("path");
const fs = require("fs");

// set storage folder and filename
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../uploads"));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = req.body.associates_name || "employee";
    const random = Math.random().toString(36).substring(2, 8);
    cb(null, `${name}-${random}${ext}`);
  },
});

// file filter and limits
const upload = multer({
  storage,
  limits: { fileSize: 1 * 1024 * 1024 }, // 1MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg"];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only PNG, JPEG, and JPG images are allowed"));
  },
});

module.exports = upload;
const companyLogoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../uploads/company");
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (_) {}
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const nameRaw = req.body.name || "company";
    const name = String(nameRaw).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const random = Math.random().toString(36).substring(2, 8);
    cb(null, `${name}-${random}${ext}`);
  },
});

const uploadCompanyLogo = multer({
  storage: companyLogoStorage,
  limits: { fileSize: 1 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg"];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only PNG, JPEG, and JPG images are allowed"));
  },
});

module.exports.uploadCompanyLogo = uploadCompanyLogo;
