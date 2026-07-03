const { buildOwnerDashboardMeta } = require('./ownerDashboardMeta');
const { buildOwnerDashboardSummary } = require('./ownerDashboardSummary');
const { buildOwnerDashboardAttention } = require('./ownerDashboardAttention');
const { buildOwnerDashboardSchedule } = require('./ownerDashboardSchedule');
const { buildOwnerDashboardPerformance } = require('./ownerDashboardPerformance');
const { resolvePeriod } = require('./ownerDashboardPeriod');

async function buildOwnerDashboardComposite(scope, options = {}) {
  const periodKey = options.period || '7d';
  const periodOpts = resolvePeriod(periodKey, scope.date);

  const scheduleOptions = {
    limit: options.scheduleLimit || 20,
    fromNow: options.scheduleFromNow !== false,
  };
  const attentionOptions = {
    previewLimit: options.previewLimit || 5,
  };

  const [summary, attention, schedule, performance] = await Promise.all([
    buildOwnerDashboardSummary(scope, { periodOpts }),
    buildOwnerDashboardAttention(scope, attentionOptions),
    buildOwnerDashboardSchedule(scope, scheduleOptions),
    buildOwnerDashboardPerformance(scope, { periodOpts }),
  ]);

  return {
    meta: buildOwnerDashboardMeta(scope, periodOpts),
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
