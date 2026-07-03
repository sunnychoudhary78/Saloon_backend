const AppError = require('../middlewares/AppError');
const appController = require('./appController');
const { resolveOwnerDashboardScope } = require('../services/ownerDashboard/ownerDashboardScope');
const { buildOwnerDashboardMeta } = require('../services/ownerDashboard/ownerDashboardMeta');
const { buildOwnerDashboardSummary } = require('../services/ownerDashboard/ownerDashboardSummary');
const { buildOwnerDashboardAttention } = require('../services/ownerDashboard/ownerDashboardAttention');
const { buildOwnerDashboardSchedule } = require('../services/ownerDashboard/ownerDashboardSchedule');
const { buildOwnerDashboardPerformance } = require('../services/ownerDashboard/ownerDashboardPerformance');
const { buildOwnerDashboardComposite } = require('../services/ownerDashboard/ownerDashboardComposite');

function dashboardOptions(query) {
  return {
    salonId: query.salon_id,
    date: query.date,
    timezone: query.timezone,
  };
}

exports.getDashboard = async (req, res, next) => {
  try {
    const version = Number(req.dashboardQuery?.v);
    if (version === 2) {
      const scope = await resolveOwnerDashboardScope(req.user.id, dashboardOptions(req.dashboardQuery || req.query));
      const period = req.dashboardQuery?.period || '7d';
      const payload = await buildOwnerDashboardComposite(scope, {
        scheduleLimit: 20,
        period,
        previewLimit: 5,
      });
      return res.json(payload);
    }
    return appController.getOwnerDashboard(req, res, next);
  } catch (err) {
    next(err);
  }
};

exports.getSummary = async (req, res, next) => {
  try {
    const scope = await resolveOwnerDashboardScope(req.user.id, dashboardOptions(req.dashboardQuery));
    const data = await buildOwnerDashboardSummary(scope);
    res.json({ meta: buildOwnerDashboardMeta(scope), data });
  } catch (err) {
    next(err);
  }
};

exports.getAttention = async (req, res, next) => {
  try {
    const scope = await resolveOwnerDashboardScope(req.user.id, dashboardOptions(req.dashboardQuery));
    const data = await buildOwnerDashboardAttention(scope, {
      previewLimit: req.dashboardQuery.preview_limit,
    });
    res.json({ meta: buildOwnerDashboardMeta(scope), data });
  } catch (err) {
    next(err);
  }
};

exports.getSchedule = async (req, res, next) => {
  try {
    const scope = await resolveOwnerDashboardScope(req.user.id, dashboardOptions(req.dashboardQuery));
    const data = await buildOwnerDashboardSchedule(scope, {
      limit: req.dashboardQuery.limit,
      fromNow: req.dashboardQuery.from_now,
    });
    res.json({ meta: buildOwnerDashboardMeta(scope), data });
  } catch (err) {
    next(err);
  }
};

exports.getPerformance = async (req, res, next) => {
  try {
    const scope = await resolveOwnerDashboardScope(req.user.id, dashboardOptions(req.dashboardQuery));
    const data = await buildOwnerDashboardPerformance(scope, {
      days: req.dashboardQuery.days,
    });
    res.json({ meta: buildOwnerDashboardMeta(scope), data });
  } catch (err) {
    if (err.message === 'date must be YYYY-MM-DD') {
      return next(new AppError(err.message, 400));
    }
    next(err);
  }
};
