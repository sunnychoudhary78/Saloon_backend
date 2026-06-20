const { Op, fn, col } = require('sequelize');
const { Review } = require('../models');

const REVIEWABLE_STATUSES = ['ACCEPTED', 'COMPLETED'];
const DEFAULT_SLOT_DURATION_MINUTES = 60;

function parseTimeParts(timeValue) {
  if (!timeValue) return { hours: 0, minutes: 0 };
  const raw = String(timeValue);
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (!match) return { hours: 0, minutes: 0 };
  return { hours: parseInt(match[1], 10), minutes: parseInt(match[2], 10) };
}

function getServiceDurationMinutes(service) {
  const duration = service?.duration_minutes ?? service?.durationMinutes;
  const parsed = parseInt(duration, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SLOT_DURATION_MINUTES;
}

function getSlotEndDateTime(booking, service) {
  const dateStr = String(booking.booking_date || booking.bookingDate || '').slice(0, 10);
  const { hours, minutes } = parseTimeParts(booking.booking_time || booking.bookingTime);
  const durationMinutes = getServiceDurationMinutes(service);
  const end = new Date(`${dateStr}T00:00:00`);
  end.setHours(hours, minutes, 0, 0);
  end.setMinutes(end.getMinutes() + durationMinutes);
  return end;
}

function hasSlotEnded(booking, service, now = new Date()) {
  return now >= getSlotEndDateTime(booking, service);
}

function isBookingReviewable(booking, service, existingReview) {
  if (!booking || !REVIEWABLE_STATUSES.includes(booking.booking_status)) {
    return false;
  }
  if (existingReview) return false;
  return hasSlotEnded(booking, service);
}

function getRatingBand(averageRating, reviewCount) {
  if (!reviewCount || averageRating == null) return 'none';
  if (averageRating >= 4) return 'excellent';
  if (averageRating >= 3) return 'good';
  return 'poor';
}

async function getSalonRatingSummary(salonId) {
  const [row] = await Review.findAll({
    where: { salon_id: salonId, status: 'PUBLISHED' },
    attributes: [
      [fn('AVG', col('rating')), 'average_rating'],
      [fn('COUNT', col('id')), 'review_count'],
    ],
    raw: true,
  });

  const reviewCount = parseInt(row?.review_count, 10) || 0;
  const averageRaw = row?.average_rating != null ? Number(row.average_rating) : null;
  const averageRating = reviewCount > 0 && averageRaw != null
    ? Math.round(averageRaw * 10) / 10
    : null;

  return {
    average_rating: averageRating,
    review_count: reviewCount,
    rating_band: getRatingBand(averageRating, reviewCount),
  };
}

async function getBatchSalonRatingSummaries(salonIds) {
  if (!salonIds.length) return new Map();

  const rows = await Review.findAll({
    where: { salon_id: { [Op.in]: salonIds }, status: 'PUBLISHED' },
    attributes: [
      'salon_id',
      [fn('AVG', col('rating')), 'average_rating'],
      [fn('COUNT', col('id')), 'review_count'],
    ],
    group: ['salon_id'],
    raw: true,
  });

  const summaries = new Map();
  for (const row of rows) {
    const reviewCount = parseInt(row.review_count, 10) || 0;
    const averageRaw = row.average_rating != null ? Number(row.average_rating) : null;
    const averageRating = reviewCount > 0 && averageRaw != null
      ? Math.round(averageRaw * 10) / 10
      : null;
    summaries.set(row.salon_id, {
      average_rating: averageRating,
      review_count: reviewCount,
      rating_band: getRatingBand(averageRating, reviewCount),
    });
  }
  return summaries;
}

async function attachRatingSummary(salonJson) {
  const summary = await getSalonRatingSummary(salonJson.id);
  return { ...salonJson, ...summary };
}

function maskCustomerName(fullName) {
  if (!fullName || typeof fullName !== 'string') return 'Customer';
  const parts = fullName.trim().split(/\s+/);
  return parts[0] || 'Customer';
}

function shapePublicReview(review) {
  const plain = typeof review.get === 'function' ? review.get({ plain: true }) : review;
  const customerName = maskCustomerName(plain.customer?.user?.name);
  return {
    id: plain.id,
    rating: plain.rating,
    review: plain.review,
    created_at: plain.created_at,
    customer_name: customerName,
  };
}

function shapeBookingReviewFlags(booking, service, review) {
  const slotEnded = hasSlotEnded(booking, service);
  const hasReview = Boolean(review);
  const canReview = isBookingReviewable(booking, service, review);

  return {
    has_review: hasReview,
    slot_ended: slotEnded,
    can_review: canReview,
  };
}

module.exports = {
  REVIEWABLE_STATUSES,
  DEFAULT_SLOT_DURATION_MINUTES,
  getSlotEndDateTime,
  hasSlotEnded,
  isBookingReviewable,
  getRatingBand,
  getSalonRatingSummary,
  getBatchSalonRatingSummaries,
  attachRatingSummary,
  shapePublicReview,
  shapeBookingReviewFlags,
  maskCustomerName,
};
