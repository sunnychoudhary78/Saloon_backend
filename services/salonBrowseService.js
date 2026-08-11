'use strict';

const { Op } = require('sequelize');
const { Service } = require('../models');
const {
  buildPreviewImages,
} = require('./imageProcessingService');

async function getBatchDiscountFlags(salonIds) {
  const flags = new Map();
  for (const id of salonIds) {
    flags.set(id, {
      has_discount: false,
      discounted_services_count: 0,
      max_savings_percent: 0,
    });
  }
  if (!salonIds.length) return flags;

  const services = await Service.findAll({
    where: {
      salon_id: { [Op.in]: salonIds },
      status: 'ACTIVE',
      discount_price: { [Op.ne]: null, [Op.gt]: 0 },
    },
    attributes: ['salon_id', 'price', 'discount_price'],
    raw: true,
  });

  for (const service of services) {
    const price = Number(service.price);
    const discountPrice = Number(service.discount_price);
    if (
      !Number.isFinite(price)
      || !Number.isFinite(discountPrice)
      || discountPrice <= 0
      || discountPrice >= price
    ) {
      continue;
    }

    const current = flags.get(service.salon_id);
    if (!current) continue;
    current.has_discount = true;
    current.discounted_services_count += 1;
    const savings = price > 0
      ? Math.round(((price - discountPrice) / price) * 100)
      : 0;
    current.max_savings_percent = Math.max(current.max_savings_percent, savings);
  }

  return flags;
}

async function getSalonIdsWithActiveServices(salonIds) {
  if (!salonIds.length) return new Set();

  const rows = await Service.findAll({
    where: {
      salon_id: { [Op.in]: salonIds },
      status: 'ACTIVE',
    },
    attributes: ['salon_id'],
    group: ['salon_id'],
    raw: true,
  });

  return new Set(rows.map((row) => row.salon_id));
}

function emptyRatingSummary() {
  return {
    average_rating: null,
    review_count: 0,
    rating_band: 'none',
  };
}

function shapeBrowseSalonDto(
  salonJson,
  {
    ratingSummary,
    slotsToday,
    discountFlags,
    hasServices,
    userCoords,
    isFavorite = false,
  },
) {
  const distanceJson = userCoords
    ? salonJson
    : { ...salonJson, distance_km: null };

  const distanceKm = distanceJson.distance_km != null
    ? Math.round(Number(distanceJson.distance_km) * 10) / 10
    : null;

  return {
    id: salonJson.id,
    salon_name: salonJson.salon_name,
    salon_type: salonJson.salon_type || 'UNISEX',
    city: salonJson.city,
    address: salonJson.address,
    street: salonJson.address,
    formatted_address: salonJson.formatted_address || null,
    locality: salonJson.locality || null,
    postal_code: salonJson.postal_code || null,
    average_rating: ratingSummary.average_rating,
    review_count: ratingSummary.review_count,
    distance_km: distanceKm,
    slots_today: slotsToday,
    has_discount: discountFlags.has_discount,
    discounted_services_count: discountFlags.discounted_services_count,
    max_savings_percent: discountFlags.max_savings_percent,
    has_services: hasServices,
    is_featured: Boolean(salonJson.is_featured),
    is_favorite: Boolean(isFavorite),
    preview_images: buildPreviewImages(
      salonJson.cover_image,
      salonJson.gallery_images,
      3,
    ),
  };
}

function discountedSalonExistsLiteral(sequelize) {
  return sequelize.literal(`(
    SELECT DISTINCT salon_id
    FROM services
    WHERE status = 'ACTIVE'
      AND discount_price IS NOT NULL
      AND discount_price > 0
      AND discount_price < price
  )`);
}

function minRatingSalonExistsLiteral(sequelize, minRating) {
  return sequelize.literal(`(
    SELECT salon_id
    FROM reviews
    WHERE status = 'PUBLISHED'
      AND is_active = true
    GROUP BY salon_id
    HAVING AVG(rating) >= ${sequelize.escape(minRating)}
  )`);
}

/**
 * Filters out fully booked salons and sorts by most open slots today.
 * Used when has_available_slots is enabled — loads all matching salons in memory.
 */
function filterAndSortSalonsByAvailability(salons, slotsMap, { userCoords } = {}) {
  const filtered = salons.filter((salon) => {
    const summary = slotsMap.get(salon.id) || { available: 0, status: 'unknown' };
    return summary.available > 0 && summary.status !== 'full';
  });

  filtered.sort((a, b) => {
    const slotsA = slotsMap.get(a.id) || { available: 0 };
    const slotsB = slotsMap.get(b.id) || { available: 0 };
    if (slotsB.available !== slotsA.available) {
      return slotsB.available - slotsA.available;
    }
    if (userCoords) {
      const distA = a.distance_km != null ? Number(a.distance_km) : Infinity;
      const distB = b.distance_km != null ? Number(b.distance_km) : Infinity;
      if (distA !== distB) return distA - distB;
    }
    return String(a.salon_name).localeCompare(String(b.salon_name));
  });

  return filtered;
}

module.exports = {
  getBatchDiscountFlags,
  getSalonIdsWithActiveServices,
  shapeBrowseSalonDto,
  emptyRatingSummary,
  discountedSalonExistsLiteral,
  minRatingSalonExistsLiteral,
  filterAndSortSalonsByAvailability,
};
