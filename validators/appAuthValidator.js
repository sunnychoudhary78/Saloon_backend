const Joi = require('joi');

const phoneSchema = Joi.string().pattern(/^[0-9]{10}$/).messages({
  'string.pattern.base': 'Phone must be exactly 10 digits',
});

const otpRequestSchema = Joi.object({
  phone: phoneSchema.required(),
});

const otpVerifySchema = Joi.object({
  phone: phoneSchema.required(),
  otp: Joi.string().length(6).pattern(/^\d+$/).required(),
});

const completeProfileSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().allow(null, '').optional(),
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
  validateOtpRequest: validate(otpRequestSchema),
  validateOtpVerify: validate(otpVerifySchema),
  validateCompleteProfile: validate(completeProfileSchema),
};
