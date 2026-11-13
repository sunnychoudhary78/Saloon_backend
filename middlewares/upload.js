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

const salonImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../uploads/salons");
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (_) {}
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const random = Math.random().toString(36).substring(2, 10);
    const timestamp = Date.now();
    cb(null, `salon-${timestamp}-${random}${ext}`);
  },
});

const uploadSalonImages = multer({
  storage: salonImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg"];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only PNG, JPEG, and JPG images are allowed"));
  },
});

module.exports.uploadSalonImages = uploadSalonImages;

const profileImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../uploads/profiles");
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (_) {}
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const random = Math.random().toString(36).substring(2, 10);
    const timestamp = Date.now();
    cb(null, `profile-${timestamp}-${random}${ext}`);
  },
});

const uploadProfileImage = multer({
  storage: profileImageStorage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only PNG, JPEG, JPG, and WEBP images are allowed"));
  },
});

module.exports.uploadProfileImage = uploadProfileImage;

const staffImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../uploads/staff");
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (_) {}
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const random = Math.random().toString(36).substring(2, 10);
    const timestamp = Date.now();
    cb(null, `staff-${timestamp}-${random}${ext}`);
  },
});

const uploadStaffImage = multer({
  storage: staffImageStorage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only PNG, JPEG, JPG, and WEBP images are allowed"));
  },
});

module.exports.uploadStaffImage = uploadStaffImage;

const galleryImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../uploads/gallery");
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (_) {}
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const prefix = file.fieldname === "before_image" ? "before" : "after";
    const random = Math.random().toString(36).substring(2, 10);
    const timestamp = Date.now();
    cb(null, `${prefix}-${timestamp}-${random}${ext}`);
  },
});

const uploadGalleryImages = multer({
  storage: galleryImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only PNG, JPEG, JPG, and WEBP images are allowed"));
  },
}).fields([
  { name: "before_image", maxCount: 1 },
  { name: "after_image", maxCount: 1 },
]);

module.exports.uploadGalleryImages = uploadGalleryImages;

const bannerImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../uploads/banners");
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (_) {}
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const random = Math.random().toString(36).substring(2, 10);
    const timestamp = Date.now();
    cb(null, `banner-${timestamp}-${random}${ext}`);
  },
});

const uploadBannerImage = multer({
  storage: bannerImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only PNG, JPEG, JPG, and WEBP images are allowed"));
  },
}).single("image");

module.exports.uploadBannerImage = uploadBannerImage;

const couponImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../uploads/coupons");
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (_) {}
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const random = Math.random().toString(36).substring(2, 10);
    const timestamp = Date.now();
    cb(null, `coupon-${timestamp}-${random}${ext}`);
  },
});

const uploadCouponImage = multer({
  storage: couponImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only PNG, JPEG, JPG, and WEBP images are allowed"));
  },
}).single("image");

module.exports.uploadCouponImage = uploadCouponImage;

const rewardImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../uploads/rewards");
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (_) {}
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const random = Math.random().toString(36).substring(2, 10);
    const timestamp = Date.now();
    cb(null, `reward-${timestamp}-${random}${ext}`);
  },
});

const uploadRewardImage = multer({
  storage: rewardImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only PNG, JPEG, JPG, and WEBP images are allowed"));
  },
}).single("image");

module.exports.uploadRewardImage = uploadRewardImage;

const aiScanStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../uploads/ai-scans");
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (_) {}
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const field = file.fieldname || "scan";
    const random = Math.random().toString(36).substring(2, 10);
    const timestamp = Date.now();
    cb(null, `ai-${field}-${timestamp}-${random}${ext}`);
  },
});

const uploadAiFaceImages = multer({
  storage: aiScanStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only PNG, JPEG, JPG, and WEBP images are allowed"));
  },
}).fields([
  { name: "front", maxCount: 1 },
  { name: "left", maxCount: 1 },
  { name: "right", maxCount: 1 },
  { name: "hair_mask", maxCount: 1 },
]);

module.exports.uploadAiFaceImages = uploadAiFaceImages;
