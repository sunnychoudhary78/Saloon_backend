const PROFILE_FIELDS = [
  'cover_image',
  'description',
  'gallery_images',
  'phone',
  'opening_time',
  'closing_time',
  'active_services',
];

function scoreSalonProfile(salonRow) {
  const missing = [];
  let score = 0;
  const total = PROFILE_FIELDS.length;

  if (salonRow.cover_image) score += 1;
  else missing.push('cover_image');

  const description = salonRow.description ? String(salonRow.description).trim() : '';
  if (description.length >= 20) score += 1;
  else missing.push('description');

  const gallery = Array.isArray(salonRow.gallery_images) ? salonRow.gallery_images : [];
  if (gallery.length > 0) score += 1;
  else missing.push('gallery_images');

  if (salonRow.phone) score += 1;
  else missing.push('phone');

  if (salonRow.opening_time && salonRow.closing_time) score += 1;
  else missing.push('opening_time');

  const activeServices = parseInt(salonRow.active_services, 10) || 0;
  if (activeServices > 0) score += 1;
  else missing.push('active_services');

  return {
    salon_id: salonRow.id,
    salon_name: salonRow.salon_name,
    missing,
    completeness_percent: Math.round((score / total) * 100),
  };
}

function summarizeProfileCompleteness(salonRows) {
  const salons = salonRows.map(scoreSalonProfile);
  const incomplete = salons.filter((s) => s.completeness_percent < 100);
  const averagePercent = salons.length === 0
    ? 100
    : Math.round(
      salons.reduce((sum, s) => sum + s.completeness_percent, 0) / salons.length,
    );

  return {
    average_percent: averagePercent,
    incomplete_count: incomplete.length,
    salons: incomplete,
  };
}

module.exports = {
  scoreSalonProfile,
  summarizeProfileCompleteness,
};
