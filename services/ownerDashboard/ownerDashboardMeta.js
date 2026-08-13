const { buildPeriodMeta } = require('./ownerDashboardPeriod');

function buildOwnerDashboardMeta(scope, periodOpts = null) {
  return {
    salon_ids: scope.salonIds,
    salon_count: scope.salonIds.length,
    scoped_salon_id: scope.scopedSalonId || null,
    available_salons: scope.availableSalons || [],
    date: scope.date,
    timezone: scope.timezone,
    currency: 'INR',
    generated_at: new Date().toISOString(),
    period: periodOpts ? buildPeriodMeta(periodOpts) : null,
  };
}

module.exports = {
  buildOwnerDashboardMeta,
};
