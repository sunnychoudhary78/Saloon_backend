const { buildOwnerDashboardMeta } = require('./ownerDashboardMeta');
const { buildOwnerDashboardSummary } = require('./ownerDashboardSummary');
const { buildOwnerDashboardAttention } = require('./ownerDashboardAttention');
const { buildOwnerDashboardSchedule } = require('./ownerDashboardSchedule');
const { buildOwnerDashboardPerformance } = require('./ownerDashboardPerformance');

async function buildOwnerDashboardComposite(scope, options = {}) {
  const scheduleOptions = {
    limit: options.scheduleLimit || 20,
    fromNow: options.scheduleFromNow !== false,
  };
  const performanceOptions = {
    days: options.performanceDays || 7,
  };
  const attentionOptions = {
    previewLimit: options.previewLimit || 5,
  };

  const [summary, attention, schedule, performance] = await Promise.all([
    buildOwnerDashboardSummary(scope),
    buildOwnerDashboardAttention(scope, attentionOptions),
    buildOwnerDashboardSchedule(scope, scheduleOptions),
    buildOwnerDashboardPerformance(scope, performanceOptions),
  ]);

  return {
    meta: buildOwnerDashboardMeta(scope),
    data: {
      summary,
      attention,
      schedule,
      performance,
    },
  };
}

module.exports = {
  buildOwnerDashboardComposite,
};
