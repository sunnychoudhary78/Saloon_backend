const Joi = require('joi');
const fs = require('fs');
const path = require('path');

function deleteDiskFile(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') return;
  const relativePath = fileUrl.replace(/^\/api\/uploads\//, '');
  const filePath = path.join(__dirname, '../uploads', relativePath);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_) {
    // ignore
  }
}

const createGalleryPostSchema = Joi.object({
  title: Joi.string().max(255).allow('', null).optional(),
  description: Joi.string().max(2000).allow('', null).optional(),
  staff_id: Joi.string().uuid().allow('', null).optional(),
  service_id: Joi.string().uuid().allow('', null).optional(),
  booking_id: Joi.string().uuid().allow('', null).optional(),
  customer_id: Joi.string().uuid().allow('', null).optional(),
  customer_phone: Joi.string()
    .pattern(/^[0-9]{10}$/)
    .required()
    .messages({
      'string.pattern.base': 'Customer phone must be a valid 10-digit phone number',
      'string.empty': 'Customer phone number is required',
      'any.required': 'Customer phone number is required',
    }),
  is_public: Joi.alternatives().try(Joi.boolean(), Joi.string().valid('true', 'false')).optional().default(true),
  sort_order: Joi.number().integer().min(0).optional().default(0),
});

const updateGalleryPostSchema = Joi.object({
  title: Joi.string().max(255).allow('', null).optional(),
  description: Joi.string().max(2000).allow('', null).optional(),
  staff_id: Joi.string().uuid().allow('', null).optional(),
  service_id: Joi.string().uuid().allow('', null).optional(),
  is_public: Joi.boolean().optional(),
  is_featured: Joi.boolean().optional(),
  sort_order: Joi.number().integer().min(0).optional(),
});

const consentSchema = Joi.object({
  consent: Joi.string().valid('APPROVED', 'REJECTED').required(),
});

function validateCreateGalleryPost(req, res, next) {
  const { error, value } = createGalleryPostSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    if (req.files?.before_image?.[0]) {
      deleteDiskFile(`/api/uploads/gallery/${req.files.before_image[0].filename}`);
    }
    if (req.files?.after_image?.[0]) {
      deleteDiskFile(`/api/uploads/gallery/${req.files.after_image[0].filename}`);
    }
    return res.status(400).json({
      message: 'Validation error',
      details: error.details.map((d) => d.message),
    });
  }
  // Coerce string boolean if passed via form-data
  if (typeof value.is_public === 'string') {
    value.is_public = value.is_public === 'true';
  }
  req.body = value;
  next();
}

function validateUpdateGalleryPost(req, res, next) {
  const { error, value } = updateGalleryPostSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    return res.status(400).json({
      message: 'Validation error',
      details: error.details.map((d) => d.message),
    });
  }
  req.body = value;
  next();
}

function validateConsent(req, res, next) {
  const { error, value } = consentSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    return res.status(400).json({
      message: 'Validation error',
      details: error.details.map((d) => d.message),
    });
  }
  req.body = value;
  next();
}

module.exports = {
  validateCreateGalleryPost,
  validateUpdateGalleryPost,
  validateConsent,
};

