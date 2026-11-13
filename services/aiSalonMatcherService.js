'use strict';

const { Op } = require('sequelize');
const { Salon, Service, sequelize } = require('../models');
const { buildBrowseSalonCards } = require('./salonBrowseService');
const { parseUserCoordinates, distanceKmSqlLiteral } = require('./locationService');
const { listFavoriteSalonIds } = require('./favoriteService');
const { SALON_SERVICE_NAMES } = require('../constants/salonServiceNames');

const CANONICAL_SERVICE_MAP = new Map(
  SALON_SERVICE_NAMES.map((name) => [name.toLowerCase(), name])
);

function normalizeMatchedServiceNames(rawNames = []) {
  const out = [];
  const seen = new Set();

  for (const item of Array.isArray(rawNames) ? rawNames : []) {
    const clean = String(item || '').trim().toLowerCase();
    if (!clean) continue;
    const canonical = CANONICAL_SERVICE_MAP.get(clean);
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical);
      out.push(canonical);
      continue;
    }
    // Partial keyword fallback
    for (const [key, val] of CANONICAL_SERVICE_MAP.entries()) {
      if ((key.includes(clean) || clean.includes(key)) && !seen.has(val)) {
        seen.add(val);
        out.push(val);
        break;
      }
    }
  }

  if (!out.length) {
    out.push('Haircut', 'Hair Styling');
  }
  return out;
}

/**
 * Finds active nearby salons offering at least one of the matched CATCHY services,
 * and attaches the matching services (with ids & prices) for direct one-tap booking.
 */
async function findRecommendedSalonsForStyles({
  serviceNames = [],
  userId = null,
  userLat = null,
  userLng = null,
  audience = null,
  limit = 6,
}) {
  const canonicalNames = normalizeMatchedServiceNames(serviceNames);

  const serviceWhere = {
    status: 'ACTIVE',
    is_active: true,
    service_name: { [Op.in]: canonicalNames },
  };

  if (audience) {
    const mode = String(audience).toUpperCase();
    if (mode === 'MEN' || mode === 'WOMEN') {
      serviceWhere.service_for = { [Op.in]: [mode, 'UNISEX'] };
    }
  }

  const matchingServices = await Service.findAll({
    where: serviceWhere,
    attributes: [
      'id',
      'salon_id',
      'service_name',
      'price',
      'discount_price',
      'duration_minutes',
      'service_for',
    ],
    raw: true,
  });

  if (!matchingServices.length) {
    return [];
  }

  const servicesBySalon = new Map();
  for (const svc of matchingServices) {
    if (!servicesBySalon.has(svc.salon_id)) {
      servicesBySalon.set(svc.salon_id, []);
    }
    servicesBySalon.get(svc.salon_id).push({
      id: svc.id,
      service_name: svc.service_name,
      price: Number(svc.price),
      discount_price: svc.discount_price != null ? Number(svc.discount_price) : null,
      duration_minutes: svc.duration_minutes,
    });
  }

  const candidateSalonIds = Array.from(servicesBySalon.keys());
  const salonWhere = {
    id: { [Op.in]: candidateSalonIds },
    status: 'ACTIVE',
    is_active: true,
  };

  if (audience) {
    const mode = String(audience).toUpperCase();
    if (mode === 'MEN' || mode === 'WOMEN') {
      salonWhere.salon_type = { [Op.in]: [mode, 'UNISEX'] };
    }
  }

  const userCoords = parseUserCoordinates({
    user_lat: userLat,
    user_lng: userLng,
  });

  const distanceLiteral = userCoords
    ? distanceKmSqlLiteral(sequelize, userCoords.userLat, userCoords.userLng)
    : null;

  const baseAttributes = [
    'id',
    'salon_name',
    'salon_type',
    'city',
    'address',
    'formatted_address',
    'locality',
    'postal_code',
    'cover_image',
    'gallery_images',
    'latitude',
    'longitude',
    'opening_time',
    'closing_time',
    'is_featured',
  ];

  const salons = await Salon.findAll({
    where: salonWhere,
    attributes: distanceLiteral
      ? [...baseAttributes, [distanceLiteral, 'distance_km']]
      : baseAttributes,
    order: distanceLiteral
      ? [[distanceLiteral, 'ASC NULLS LAST'], ['is_featured', 'DESC']]
      : [['is_featured', 'DESC'], ['salon_name', 'ASC']],
    limit,
  });

  if (!salons.length) return [];

  const favoriteIds = userId
    ? new Set(await listFavoriteSalonIds(userId))
    : new Set();

  const plainSalons = salons.map((s) => s.get({ plain: true }));
  const cards = await buildBrowseSalonCards(plainSalons, {
    userCoords,
    favoriteIds,
  });

  return cards.map((card) => ({
    ...card,
    matched_services: (servicesBySalon.get(card.id) || []).slice(0, 4),
  }));
}

module.exports = {
  normalizeMatchedServiceNames,
  findRecommendedSalonsForStyles,
};
