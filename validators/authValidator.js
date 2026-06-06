const Joi = require('joi');

const registerSchema = Joi.object({
  name: Joi.string().min(2).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().allow(null, '').optional(),
  password: Joi.string().min(8).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().required(),
  password: Joi.string().required(),
});

const bookingSchema = Joi.object({
  salon_id: Joi.string().uuid().required(),
  service_id: Joi.string().uuid().required(),
  booking_date: Joi.date().iso().required(),
  booking_time: Joi.string().required(),
  notes: Joi.string().allow(null, '').optional(),
});

const salonApplicationSchema = Joi.object({
  salon_name: Joi.string().required(),
  description: Joi.string().allow(null, '').optional(),
  address: Joi.string().required(),
  city: Joi.string().required(),
  state: Joi.string().required(),
  latitude: Joi.number().optional(),
  longitude: Joi.number().optional(),
  cover_image: Joi.string().allow(null, '').optional(),
  gallery_images: Joi.array().optional(),
  opening_time: Joi.string().allow(null, '').optional(),
  closing_time: Joi.string().allow(null, '').optional(),
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
};
