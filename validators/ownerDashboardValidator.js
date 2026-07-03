const Joi = require('joi');

const baseDashboardQuerySchema = Joi.object({
  salon_id: Joi.string().uuid().optional(),
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timezone: Joi.string().default('Asia/Kolkata'),
  v: Joi.number().integer().valid(1, 2).optional(),
});

const scheduleQuerySchema = baseDashboardQuerySchema.keys({
  limit: Joi.number().integer().min(1).max(50).default(20),
  from_now: Joi.boolean().truthy('true').falsy('false').default(true),
});

const performanceQuerySchema = baseDashboardQuerySchema.keys({
  days: Joi.number().integer().min(1).max(90).default(7),
});

const attentionQuerySchema = baseDashboardQuerySchema.keys({
  preview_limit: Joi.number().integer().min(1).max(20).default(5),
});

function validateQuery(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json({
        message: 'Validation error',
        details: error.details.map((d) => d.message),
      });
    }
    req.dashboardQuery = value;
    next();
  };
}

module.exports = {
  validateOwnerDashboardQuery: validateQuery(baseDashboardQuerySchema),
  validateOwnerDashboardScheduleQuery: validateQuery(scheduleQuerySchema),
  validateOwnerDashboardPerformanceQuery: validateQuery(performanceQuerySchema),
  validateOwnerDashboardAttentionQuery: validateQuery(attentionQuerySchema),
};
