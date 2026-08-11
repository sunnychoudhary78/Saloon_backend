const Joi = require('joi');

const createSchema = Joi.object({
  salon_id: Joi.string().uuid().required(),
});

function validateCreateFavorite(req, res, next) {
  const { error, value } = createSchema.validate(req.body, {
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
  validateCreateFavorite,
};
