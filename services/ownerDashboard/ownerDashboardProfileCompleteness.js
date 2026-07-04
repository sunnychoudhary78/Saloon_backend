const PROFILE_FIELDS = [
  'cover_image',
  'description',
  'gallery_images',
  'phone',
  'hours',
  'active_services',
];

function hasText(value) {
  return value != null && String(value).trim().length > 0;
}

function hasGallery(value) {
  return Array.isArray(value) && value.length > 0;
}

function pickFirst(...values) {
  for (const value of values) {
    if (value != null && value !== '') return value;
  }
  return null;
}

/**
 * Prefer live salon values; fall back to pending UPDATE application fields
 * so submitted-but-unapproved profile details count toward completion.
 */
function effectiveSalonRow(salonRow) {
  const pending = salonRow.pending_update || null;
  if (!pending) return salonRow;

  const liveGallery = Array.isArray(salonRow.gallery_images)
    ? salonRow.gallery_images
    : [];
  const pendingGallery = Array.isArray(pending.gallery_images)
    ? pending.gallery_images
    : [];

  return {
    ...salonRow,
    cover_image: pickFirst(salonRow.cover_image, pending.cover_image),
    description: hasText(salonRow.description)
      ? salonRow.description
      : pending.description,
    gallery_images: liveGallery.length > 0 ? liveGallery : pendingGallery,
    phone: pickFirst(salonRow.phone, pending.phone),
    opening_time: pickFirst(salonRow.opening_time, pending.opening_time),
    closing_time: pickFirst(salonRow.closing_time, pending.closing_time),
  };
}

function scoreSalonProfile(salonRow) {
  const row = effectiveSalonRow(salonRow);
  const missing = [];
  let score = 0;
  const total = PROFILE_FIELDS.length;

  if (row.cover_image) score += 1;
  else missing.push('cover_image');

  if (hasText(row.description)) score += 1;
  else missing.push('description');

  if (hasGallery(row.gallery_images)) score += 1;
  else missing.push('gallery_images');

  if (row.phone) score += 1;
  else missing.push('phone');

  if (row.opening_time && row.closing_time) score += 1;
  else missing.push('hours');

  const activeServices = parseInt(row.active_services, 10) || 0;
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
  PROFILE_FIELDS,
  scoreSalonProfile,
  summarizeProfileCompleteness,
  effectiveSalonRow,
};
