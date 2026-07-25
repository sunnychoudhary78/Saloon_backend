'use strict';

/** Shared services available for men and women (same name, gender-specific app icons). */
const SHARED_SERVICE_NAMES = Object.freeze([
  'Haircut',
  'Hair Color',
  'Hair Wash',
  'Hair Styling',
  'Hair Spa',
  'Hair Highlights',
  'Hair Smoothening',
  'Hair Straightening',
  'Hair Fall Treatment',
  'Keratin Treatment',
  'Scalp Treatment',
  'Dandruff Treatment',
  'Facial',
  'Cleanup',
  'Hydra Facial',
  'Face Scrub',
  'Face Massage',
  'De-Tan Treatment',
  'Eyebrow Grooming',
  'Threading',
  'Waxing',
  'Head Massage',
  'Body Massage',
  'Foot Spa',
  'Manicure',
  'Pedicure',
]);

/** Men-only catalog names. */
const MEN_ONLY_SERVICE_NAMES = Object.freeze([
  'Beard Trim',
  'Beard Color',
  'Beard Styling',
  'Shaving',
  'Groom Package',
  'Groom Makeup',
  'Signature Grooming Package',
]);

/** Women-only catalog names. */
const WOMEN_ONLY_SERVICE_NAMES = Object.freeze([
  'Bridal Makeup',
  'Bridal Beauty Package',
  'Pre Bridal Package',
  'Party Makeup',
  'Nail Art',
  'Nail Extensions',
  'Hair Extensions',
  'Hair Botox',
]);

const MEN_SERVICE_NAMES = Object.freeze([
  ...SHARED_SERVICE_NAMES,
  ...MEN_ONLY_SERVICE_NAMES,
]);

const WOMEN_SERVICE_NAMES = Object.freeze([
  ...SHARED_SERVICE_NAMES,
  ...WOMEN_ONLY_SERVICE_NAMES,
]);

/** Full combined catalog (unisex picker). Deduped, shared first then gender-unique. */
const SALON_SERVICE_NAMES = Object.freeze([
  ...SHARED_SERVICE_NAMES,
  ...MEN_ONLY_SERVICE_NAMES,
  ...WOMEN_ONLY_SERVICE_NAMES,
]);

const MEN_ONLY_SET = new Set(MEN_ONLY_SERVICE_NAMES.map((n) => n.toLowerCase()));
const WOMEN_ONLY_SET = new Set(WOMEN_ONLY_SERVICE_NAMES.map((n) => n.toLowerCase()));

/**
 * @param {'MEN'|'WOMEN'|'UNISEX'|string|null|undefined} salonType
 * @returns {readonly string[]}
 */
function serviceNamesForSalonType(salonType) {
  const type = String(salonType || 'UNISEX').toUpperCase();
  if (type === 'MEN') return MEN_SERVICE_NAMES;
  if (type === 'WOMEN') return WOMEN_SERVICE_NAMES;
  return SALON_SERVICE_NAMES;
}

/**
 * @param {string|null|undefined} serviceName
 * @param {'men'|'women'|string|null|undefined} audience
 * @returns {boolean}
 */
function isServiceVisibleForAudience(serviceName, audience) {
  const name = String(serviceName || '').trim().toLowerCase();
  if (!name) return false;
  const mode = String(audience || 'men').toLowerCase();
  if (mode === 'women') return !MEN_ONLY_SET.has(name);
  return !WOMEN_ONLY_SET.has(name);
}

module.exports = {
  SHARED_SERVICE_NAMES,
  MEN_ONLY_SERVICE_NAMES,
  WOMEN_ONLY_SERVICE_NAMES,
  MEN_SERVICE_NAMES,
  WOMEN_SERVICE_NAMES,
  SALON_SERVICE_NAMES,
  serviceNamesForSalonType,
  isServiceVisibleForAudience,
};
