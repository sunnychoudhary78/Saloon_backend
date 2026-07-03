const { getCurrentSettings, updateSettings, listHistory } = require('../services/financeSettingsService');

exports.getSettings = async (req, res, next) => {
  try {
    const data = await getCurrentSettings();
    res.json({ data });
  } catch (err) {
    next(err);
  }
};

exports.updateSettings = async (req, res, next) => {
  try {
    const data = await updateSettings(req.user.id, req.body, req);
    res.json({ data });
  } catch (err) {
    next(err);
  }
};

exports.getHistory = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const result = await listHistory({ page, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
};
