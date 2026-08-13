const AppError = require('../middlewares/AppError');
const {
  getInsights,
  queryConsumers,
  updateOtpUsageConfig,
  blockPhone,
  unblockPhone,
} = require('../services/otpUsageService');

exports.getInsights = async (req, res, next) => {
  try {
    const data = await getInsights();
    res.json({ data });
  } catch (err) {
    next(err);
  }
};

exports.queryConsumers = async (req, res, next) => {
  try {
    const data = await queryConsumers({
      page: req.body.page,
      limit: req.body.limit,
      search: req.body.search,
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
};

exports.updateConfig = async (req, res, next) => {
  try {
    const data = await updateOtpUsageConfig(
      {
        daily_cap_per_phone: req.body.daily_cap_per_phone,
        sms_cost_paise: req.body.sms_cost_paise,
      },
      { userId: req.user.id, req },
    );
    res.json({ data });
  } catch (err) {
    next(err);
  }
};

exports.blockPhone = async (req, res, next) => {
  try {
    const data = await blockPhone({
      phone: req.body.phone,
      reason: req.body.reason,
      userId: req.user.id,
      req,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
};

exports.unblockPhone = async (req, res, next) => {
  try {
    const phone = req.params.phone;
    if (!phone) throw new AppError('Phone is required', 400);
    const data = await unblockPhone({
      phone,
      userId: req.user.id,
      req,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
};
