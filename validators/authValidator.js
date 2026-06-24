const Joi = require('joi');

const registerSchema = Joi.object({
  name: Joi.string().min(2).required(),
  email: Joi.string().email().allow(null, '').optional(),
  phone: Joi.string().pattern(/^[0-9]{10}$/).allow(null, '').optional().messages({
    'string.pattern.base': 'Phone must be exactly 10 digits',
  }),
  password: Joi.string().min(8).required(),
});

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
}).or('service_id', 'service_ids');

const slotBlockSchema = Joi.object({
  slot_date: Joi.date().iso().required(),
  slot_start: Joi.string().required(),
  is_blocked: Joi.boolean().required(),
  note: Joi.string().allow(null, '').optional(),
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
  description: Joi.string().allow(null, '').optional(),
  address: Joi.when('application_type', {
    is: statusChangeTypes,
    then: Joi.string().allow(null, '').optional(),
    otherwise: Joi.string().required(),
  }),
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
}).custom((value, helpers) => {
  const type = value.application_type || 'CREATE';
  if (statusChangeTypes.validate(type).error) return value;
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
  validateRegister: validate(registerSchema),
  validateLogin: validate(loginSchema),
  validateBooking: validate(bookingSchema),
  validateSalonApplication: validate(salonApplicationSchema),
  validateSlotBlock: validate(slotBlockSchema),
};
