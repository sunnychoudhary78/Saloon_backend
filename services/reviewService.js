const { Op, fn, col } = require('sequelize');
const { Review, Booking } = require('../models');

const REVIEWABLE_STATUSES = ['ACCEPTED', 'COMPLETED'];
const DEFAULT_SLOT_DURATION_MINUTES = 60;
const PUBLIC_REVIEW_WHERE = Object.freeze({ status: 'PUBLISHED', is_active: true });

function parseTimeParts(timeValue) {
  if (timeValue == null || timeValue === '') return { hours: 0, minutes: 0 };

  if (timeValue instanceof Date && !Number.isNaN(timeValue.getTime())) {
    return { hours: timeValue.getHours(), minutes: timeValue.getMinutes() };
  }

  const raw = String(timeValue).trim();
  // Prefer HH:MM from ISO-ish strings (e.g. 1970-01-01T10:30:00) over date fragments.
  const isoTime = raw.match(/T(\d{1,2}):(\d{2})/);
  if (isoTime) {
    return { hours: parseInt(isoTime[1], 10), minutes: parseInt(isoTime[2], 10) };
  }
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return { hours: 0, minutes: 0 };
  return { hours: parseInt(match[1], 10), minutes: parseInt(match[2], 10) };
}

/** Normalize DATEONLY / Date / ISO strings to YYYY-MM-DD. */
function normalizeBookingDate(dateValue) {
  if (dateValue == null || dateValue === '') return '';

  if (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())) {
    const y = dateValue.getFullYear();
    const m = String(dateValue.getMonth() + 1).padStart(2, '0');
    const d = String(dateValue.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const raw = String(dateValue).trim();
  const isoDate = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDate) return isoDate[1];

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return '';
}

function getServiceDurationMinutes(service) {
  const duration = service?.duration_minutes ?? service?.durationMinutes;
  const parsed = parseInt(duration, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SLOT_DURATION_MINUTES;
}

function getSlotEndDateTime(booking, service) {
  const dateStr = normalizeBookingDate(booking.booking_date || booking.bookingDate);
  const { hours, minutes } = parseTimeParts(booking.booking_time || booking.bookingTime);
  const durationMinutes = getServiceDurationMinutes(service);
  if (!dateStr) return new Date(NaN);
  const end = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(end.getTime())) return end;
  end.setHours(hours, minutes, 0, 0);
  end.setMinutes(end.getMinutes() + durationMinutes);
  return end;
}

function hasSlotEnded(booking, service, now = new Date()) {
  const end = getSlotEndDateTime(booking, service);
  if (Number.isNaN(end.getTime())) return false;
  return now >= end;
}

function isBookingReviewable(booking, service, existingReview) {
  const status = booking?.booking_status || booking?.bookingStatus;
  if (!booking || !REVIEWABLE_STATUSES.includes(status)) {
    return false;
  }
  if (existingReview) return false;
  // COMPLETED means the visit is done — allow review without slot-end math.
  if (status === 'COMPLETED') return true;
  return hasSlotEnded(booking, service);
}

function getRatingBand(averageRating, reviewCount) {
  if (!reviewCount || averageRating == null) return 'none';
  if (averageRating >= 4) return 'excellent';
  if (averageRating >= 3) return 'good';
  return 'poor';
}

function emptyStaffRatingSummary() {
  return {
    average_rating: null,
    review_count: 0,
    rating_band: 'none',
  };
}

function normalizeRatingSummary(averageRaw, reviewCount) {
  const count = parseInt(reviewCount, 10) || 0;
  const averageNum = averageRaw != null ? Number(averageRaw) : null;
  const averageRating = count > 0 && averageNum != null
    ? Math.round(averageNum * 10) / 10
    : null;
  return {
    average_rating: averageRating,
    review_count: count,
    rating_band: getRatingBand(averageRating, count),
  };
}

async function getSalonRatingSummary(salonId) {
  const [row] = await Review.findAll({
    where: { salon_id: salonId, ...PUBLIC_REVIEW_WHERE },
    attributes: [
      [fn('AVG', col('rating')), 'average_rating'],
      [fn('COUNT', col('id')), 'review_count'],
    ],
    raw: true,
  });

  return normalizeRatingSummary(row?.average_rating, row?.review_count);
}

async function getBatchSalonRatingSummaries(salonIds) {
  if (!salonIds.length) return new Map();

  const rows = await Review.findAll({
    where: { salon_id: { [Op.in]: salonIds }, ...PUBLIC_REVIEW_WHERE },
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
    summaries.set(row.salon_id, normalizeRatingSummary(row.average_rating, row.review_count));
  }
  return summaries;
}

async function getStaffRatingSummary(staffId) {
  if (!staffId) return emptyStaffRatingSummary();

  const [row] = await Review.findAll({
    where: {
      ...PUBLIC_REVIEW_WHERE,
      staff_rating: { [Op.ne]: null },
    },
    include: [{
      model: Booking,
      as: 'booking',
      attributes: [],
      required: true,
      where: { staff_id: staffId },
    }],
    attributes: [
      [fn('AVG', col('Review.staff_rating')), 'average_rating'],
      [fn('COUNT', col('Review.id')), 'review_count'],
    ],
    raw: true,
  });

  return normalizeRatingSummary(row?.average_rating, row?.review_count);
}

async function getBatchStaffRatingSummaries(staffIds) {
  if (!staffIds.length) return new Map();

  const rows = await Review.findAll({
    where: {
      ...PUBLIC_REVIEW_WHERE,
      staff_rating: { [Op.ne]: null },
    },
    include: [{
      model: Booking,
      as: 'booking',
      attributes: [],
      required: true,
      where: { staff_id: { [Op.in]: staffIds } },
    }],
    attributes: [
      [col('booking.staff_id'), 'staff_id'],
      [fn('AVG', col('Review.staff_rating')), 'average_rating'],
      [fn('COUNT', col('Review.id')), 'review_count'],
    ],
    group: [col('booking.staff_id')],
    raw: true,
  });

  const summaries = new Map();
  for (const id of staffIds) {
    summaries.set(id, emptyStaffRatingSummary());
  }
  for (const row of rows) {
    summaries.set(row.staff_id, normalizeRatingSummary(row.average_rating, row.review_count));
  }
  return summaries;
}

async function attachStaffRatingSummaries(staffList) {
  if (!Array.isArray(staffList) || staffList.length === 0) return staffList || [];
  const ids = staffList.map((s) => s.id).filter(Boolean);
  const summaries = await getBatchStaffRatingSummaries(ids);
  return staffList.map((staff) => ({
    ...staff,
    ...(summaries.get(staff.id) || emptyStaffRatingSummary()),
  }));
}

/** Higher rating first; unrated last. Ties: review_count, sort_order, name. */
function sortStaffByRating(staffList) {
  if (!Array.isArray(staffList) || staffList.length <= 1) return staffList || [];
  return [...staffList].sort((a, b) => {
    const aRated = a.average_rating != null && (a.review_count || 0) > 0;
    const bRated = b.average_rating != null && (b.review_count || 0) > 0;
    if (aRated !== bRated) return aRated ? -1 : 1;
    if (aRated && bRated) {
      const ratingDiff = Number(b.average_rating) - Number(a.average_rating);
      if (ratingDiff !== 0) return ratingDiff;
      const countDiff = (b.review_count || 0) - (a.review_count || 0);
      if (countDiff !== 0) return countDiff;
    }
    const sortDiff = (a.sort_order || 0) - (b.sort_order || 0);
    if (sortDiff !== 0) return sortDiff;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

async function attachAndSortStaffByRating(staffList) {
  const withRatings = await attachStaffRatingSummaries(staffList);
  return sortStaffByRating(withRatings);
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
  const staffName = plain.booking?.staff?.name || null;
  return {
    id: plain.id,
    rating: plain.rating,
    staff_rating: plain.staff_rating ?? null,
    staff_name: staffName,
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

function visitReviewKey(row) {
  return row?.booking_group_id || row?.id;
}

/** Booking ids that share a visit with `booking` (legacy rows are themselves). */
function visitBookingIds(booking, groupRows) {
  if (!booking) return [];
  if (!booking.booking_group_id) return booking.id ? [booking.id] : [];
  const ids = new Set();
  if (booking.id) ids.add(booking.id);
  for (const row of groupRows || []) {
    if (row?.id) ids.add(row.id);
  }
  return [...ids];
}

/**
 * One review covers a multi-service visit. If any sibling has a review,
 * every row in that booking_group_id is marked reviewed and not rateable.
 */
function applyVisitReviewFlags(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows || [];

  const reviewedVisits = new Set();
  for (const row of rows) {
    if (row?.has_review) reviewedVisits.add(visitReviewKey(row));
  }

  return rows.map((row) => {
    if (!reviewedVisits.has(visitReviewKey(row))) return row;
    return { ...row, has_review: true, can_review: false };
  });
}

module.exports = {
  REVIEWABLE_STATUSES,
  DEFAULT_SLOT_DURATION_MINUTES,
  PUBLIC_REVIEW_WHERE,
  normalizeBookingDate,
  parseTimeParts,
  getSlotEndDateTime,
  hasSlotEnded,
  isBookingReviewable,
  getRatingBand,
  getSalonRatingSummary,
  getBatchSalonRatingSummaries,
  getStaffRatingSummary,
  getBatchStaffRatingSummaries,
  attachStaffRatingSummaries,
  sortStaffByRating,
  attachAndSortStaffByRating,
  emptyStaffRatingSummary,
  attachRatingSummary,
  shapePublicReview,
  shapeBookingReviewFlags,
  visitReviewKey,
  visitBookingIds,
  applyVisitReviewFlags,
  maskCustomerName,
};
