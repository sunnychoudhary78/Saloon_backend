const Joi = require('joi');

const loginSchema = Joi.object({
  email: Joi.string().required(),
  password: Joi.string().required(),
});

const bookingSchema = Joi.object({
  salon_id: Joi.string().uuid().required(),
  service_id: Joi.string().uuid().optional(),
  service_ids: Joi.array().items(Joi.string().uuid()).min(1).optional(),
  booking_date: Joi.date().iso().required(),
  booking_time: Joi.string().required(),
  notes: Joi.string().allow(null, '').optional(),
  is_premium: Joi.boolean().optional(),
  staff_id: Joi.string().uuid().allow(null).optional(),
}).or('service_id', 'service_ids');

const staffSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120).required(),
  profile_image: Joi.string().allow(null, '').optional(),
  status: Joi.valid('ACTIVE', 'INACTIVE').optional(),
  sort_order: Joi.number().integer().min(0).optional(),
});

const staffUpdateSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120).optional(),
  profile_image: Joi.string().allow(null, '').optional(),
  status: Joi.valid('ACTIVE', 'INACTIVE').optional(),
  sort_order: Joi.number().integer().min(0).optional(),
}).min(1);

const reviewSchema = Joi.object({
  booking_id: Joi.string().uuid().required(),
  rating: Joi.number().integer().min(1).max(5).required(),
  staff_rating: Joi.number().integer().min(1).max(5).allow(null).optional(),
  review: Joi.string().trim().max(2000).allow(null, '').optional(),
});

const slotBlockSchema = Joi.object({
  slot_date: Joi.date().iso().required(),
  slot_start: Joi.string().required(),
  is_blocked: Joi.boolean().required(),
  note: Joi.string().allow(null, '').optional(),
});

const premiumBookingFeeSchema = Joi.object({
  premium_booking_fee: Joi.number().min(1).max(10000).allow(null).required(),
});

const statusChangeTypes = Joi.valid('DEACTIVATE', 'ACTIVATE', 'CLOSE');
const timePattern = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function parseTimeToMinutes(value) {
  const parts = String(value).split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

const salonApplicationSchema = Joi.object({
  application_type: Joi.string()
    .valid('CREATE', 'UPDATE', 'DEACTIVATE', 'ACTIVATE', 'CLOSE')
    .default('CREATE'),
  salon_id: Joi.when('application_type', {
    is: Joi.valid('UPDATE', 'DEACTIVATE', 'ACTIVATE', 'CLOSE'),
    then: Joi.string().uuid().required(),
    otherwise: Joi.string().uuid().allow(null).optional(),
  }),
  salon_name: Joi.when('application_type', {
    is: statusChangeTypes,
    then: Joi.string().allow(null, '').optional(),
    otherwise: Joi.string().required(),
  }),
  salon_type: Joi.when('application_type', {
    is: statusChangeTypes,
    then: Joi.string().valid('MEN', 'WOMEN', 'UNISEX').optional(),
    otherwise: Joi.string().valid('MEN', 'WOMEN', 'UNISEX').required(),
  }),
  description: Joi.string().allow(null, '').optional(),
  address: Joi.string().allow(null, '').optional(),
  street: Joi.string().allow(null, '').optional(),
  formatted_address: Joi.string().allow(null, '').optional(),
  locality: Joi.string().allow(null, '').optional(),
  postal_code: Joi.string().allow(null, '').max(16).optional(),
  city: Joi.when('application_type', {
    is: statusChangeTypes,
    then: Joi.string().allow(null, '').optional(),
    otherwise: Joi.string().required(),
  }),
  state: Joi.when('application_type', {
    is: statusChangeTypes,
    then: Joi.string().allow(null, '').optional(),
    otherwise: Joi.string().required(),
  }),
  latitude: Joi.when('application_type', {
    is: statusChangeTypes,
    then: Joi.number().optional(),
    otherwise: Joi.number().min(-90).max(90).required(),
  }),
  longitude: Joi.when('application_type', {
    is: statusChangeTypes,
    then: Joi.number().optional(),
    otherwise: Joi.number().min(-180).max(180).required(),
  }),

  cover_image: Joi.string().allow(null, '').optional(),
  gallery_images: Joi.array().items(Joi.string().uri()).optional(),
  phone: Joi.when('application_type', {
    is: statusChangeTypes,
    then: Joi.string().allow(null, '').optional(),
    otherwise: Joi.string().pattern(/^[0-9]{10}$/).required().messages({
      'string.pattern.base': 'Phone must be exactly 10 digits',
    }),
  }),
  opening_time: Joi.when('application_type', {
    is: statusChangeTypes,
    then: Joi.string().allow(null, '').optional(),
    otherwise: Joi.string().pattern(timePattern).required(),
  }),
  closing_time: Joi.when('application_type', {
    is: statusChangeTypes,
    then: Joi.string().allow(null, '').optional(),
    otherwise: Joi.string().pattern(timePattern).required(),
  }),
  premium_booking_fee: Joi.number().min(1).max(10000).allow(null).optional(),
}).custom((value, helpers) => {
  const type = value.application_type || 'CREATE';
  const isStatusChange = !statusChangeTypes.validate(type).error;

  if (!isStatusChange) {
    const street = String(value.street || value.address || '').trim();
    if (!street) {
      return helpers.message('address is required');
    }
    value.address = street;
  } else if (value.street || value.address) {
    value.address = String(value.street || value.address || '').trim();
  }

  delete value.street;

  if (value.formatted_address != null) {
    value.formatted_address = String(value.formatted_address).trim() || null;
  }
  if (value.locality != null) {
    value.locality = String(value.locality).trim() || null;
  }
  if (value.postal_code != null) {
    value.postal_code = String(value.postal_code).trim() || null;
  }

  if (isStatusChange) return value;
  if (!value.opening_time || !value.closing_time) return value;
  if (parseTimeToMinutes(value.closing_time) <= parseTimeToMinutes(value.opening_time)) {
    return helpers.message('closing_time must be after opening_time');
  }
  return value;
});


function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json({
        message: 'Validation error',
        details: error.details.map((d) => d.message),
      });
    }
    req.body = value;
    next();
  };
}

module.exports = {
  validateLogin: validate(loginSchema),
  validateBooking: validate(bookingSchema),
  validateStaff: validate(staffSchema),
  validateStaffUpdate: validate(staffUpdateSchema),
  validateReview: validate(reviewSchema),
  validateSalonApplication: validate(salonApplicationSchema),
  validateSlotBlock: validate(slotBlockSchema),
  validatePremiumBookingFee: validate(premiumBookingFeeSchema),
};
