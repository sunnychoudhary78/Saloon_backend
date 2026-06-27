const Joi = require('joi');

const createRazorpayOrderSchema = Joi.object({
  booking_id: Joi.string().uuid().required(),
  payment_type: Joi.string().valid('SALON_FEE', 'PREMIUM_FEE').default('SALON_FEE'),
});

const verifyRazorpayPaymentSchema = Joi.object({
  razorpay_order_id: Joi.string().trim().min(1).required(),
  razorpay_payment_id: Joi.string().trim().min(1).required(),
  razorpay_signature: Joi.string().trim().min(1).required(),
});

const payAtShopSchema = Joi.object({
  booking_id: Joi.string().uuid().required(),
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
  validateCreateRazorpayOrder: validate(createRazorpayOrderSchema),
  validatePayAtShop: validate(payAtShopSchema),
  validateVerifyRazorpayPayment: validate(verifyRazorpayPaymentSchema),
};
