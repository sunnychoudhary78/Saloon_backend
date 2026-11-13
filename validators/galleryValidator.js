const Joi = require('joi');

const createGalleryPostSchema = Joi.object({
  title: Joi.string().max(255).allow('', null).optional(),
  description: Joi.string().max(2000).allow('', null).optional(),
  staff_id: Joi.string().uuid().allow('', null).optional(),
  service_id: Joi.string().uuid().allow('', null).optional(),
  booking_id: Joi.string().uuid().allow('', null).optional(),
  customer_id: Joi.string().uuid().allow('', null).optional(),
  customer_phone: Joi.string().pattern(/^[0-9]{10}$/).allow('', null).optional(),
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

