const Joi = require('joi');

const registerSchema = Joi.object({
  token: Joi.string().min(1).max(512).required(),
  platform: Joi.string().valid('android').default('android'),
});

const unregisterSchema = Joi.object({
  token: Joi.string().min(1).max(512).required(),
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
  validateRegisterDeviceToken: validate(registerSchema),
  validateUnregisterDeviceToken: validate(unregisterSchema),
};
