function buildOwnerDashboardMeta(scope) {
  return {
    salon_ids: scope.salonIds,
    salon_count: scope.salonIds.length,
    scoped_salon_id: scope.scopedSalonId || null,
    date: scope.date,
    timezone: scope.timezone,
    currency: 'INR',
    generated_at: new Date().toISOString(),
  };
}

module.exports = {
  buildOwnerDashboardMeta,
};
