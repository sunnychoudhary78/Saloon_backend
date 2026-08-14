'use strict';

const { Op } = require('sequelize');
const {
  Salon,
  Booking,
  SalonSlotOverride,
  PlatformSetting,
  Customer,
  User,
  Service,
  sequelize,
} = require('../models');
const AppError = require('../middlewares/AppError');

const PREMIUM_CONFIG_KEY = 'premium_booking_config';
const DEFAULT_PAYMENT_WINDOW_MINUTES = 15;
const MIN_PAYMENT_WINDOW_MINUTES = 1;
const MAX_PAYMENT_WINDOW_MINUTES = 120;
const ACTIVE_BOOKING_STATUSES = ['PENDING', 'ACCEPTED'];
const ACCEPTED_BOOKING_STATUS = 'ACCEPTED';
const PREMIUM_ALREADY_ACCEPTED_MESSAGE = 'Premium booking is already accepted for this slot';
const SLOT_ALREADY_BOOKED_MESSAGE = 'This slot is already booked';
const PREMIUM_ONLY_OCCUPIED_MESSAGE = 'Premium booking is only for occupied or blocked slots';
const CUSTOMER_DUPLICATE_SERVICE_MESSAGE = 'You already booked this service for the selected slot';
const OWN_SLOT_BOOKED_MESSAGE = 'You already have a booking for this time.';
const UPGRADE_AVAILABLE_MESSAGE = 'You already have a pending request for this time.';
const SLOT_CONFLICT_CODES = {
  DUPLICATE_SERVICE: 'DUPLICATE_SERVICE',
  OWN_SLOT_BOOKED: 'OWN_SLOT_BOOKED',
  UPGRADE_AVAILABLE: 'UPGRADE_AVAILABLE',
};
/** Bookable calendar grid step (opening → closing). */
const SLOT_DURATION_MINUTES = 30;

function parseTimeToMinutes(timeValue) {
  if (!timeValue) return null;
  const str = String(timeValue);
  const match = str.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

function minutesToTimeString(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

function normalizeSlotStart(bookingTime) {
  const minutes = parseTimeToMinutes(bookingTime);
  if (minutes === null) return null;
  if (minutes % SLOT_DURATION_MINUTES !== 0) return null;
  return minutesToTimeString(minutes);
}

function formatDateOnly(date) {
  if (typeof date === 'string') return date.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function todayDateString() {
  return formatDateOnly(new Date());
}

function generateSlots(openingTime, closingTime) {
  const openMin = parseTimeToMinutes(openingTime);
  const closeMin = parseTimeToMinutes(closingTime);
  if (openMin === null || closeMin === null || closeMin <= openMin) return [];

  const slots = [];
  for (
    let start = openMin;
    start + SLOT_DURATION_MINUTES <= closeMin;
    start += SLOT_DURATION_MINUTES
  ) {
    slots.push({
      slot_start: minutesToTimeString(start),
      slot_end: minutesToTimeString(start + SLOT_DURATION_MINUTES),
    });
  }
  return slots;
}

/** @deprecated Use generateSlots — kept for callers expecting the old name. */
const generateHourlySlots = generateSlots;

function isSlotInPast(slotDate, slotStart) {
  const today = todayDateString();
  const dateStr = formatDateOnly(slotDate);
  if (dateStr < today) return true;
  if (dateStr > today) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const slotMinutes = parseTimeToMinutes(slotStart);
  return slotMinutes !== null && slotMinutes < currentMinutes;
}

function normalizePaymentWindowMinutes(value) {
  const parsed = parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed >= MIN_PAYMENT_WINDOW_MINUTES) {
    return Math.min(MAX_PAYMENT_WINDOW_MINUTES, parsed);
  }
  const fromEnv = parseInt(process.env.PREMIUM_PAYMENT_WINDOW_MINUTES, 10);
  if (Number.isFinite(fromEnv) && fromEnv >= MIN_PAYMENT_WINDOW_MINUTES) {
    return Math.min(MAX_PAYMENT_WINDOW_MINUTES, fromEnv);
  }
  return DEFAULT_PAYMENT_WINDOW_MINUTES;
}

function defaultPremiumConfig() {
  return {
    enabled: true,
    fee: 199,
    currency: 'INR',
    payment_window_minutes: normalizePaymentWindowMinutes(),
  };
}

function shapePremiumConfig(raw) {
  const config = !raw
    ? {}
    : (typeof raw === 'string' ? JSON.parse(raw) : raw);
  return {
    enabled: config.enabled !== false,
    fee: Number(config.fee) || 199,
    currency: config.currency || 'INR',
    payment_window_minutes: normalizePaymentWindowMinutes(config.payment_window_minutes),
  };
}

async function loadPremiumConfig() {
  const now = Date.now();
  if (
    loadPremiumConfig._cache
    && loadPremiumConfig._cache.expiresAt > now
  ) {
    return loadPremiumConfig._cache.value;
  }

  const row = await PlatformSetting.findOne({
    where: { setting_key: PREMIUM_CONFIG_KEY, is_active: true },
  });
  const value = !row?.setting_value
    ? defaultPremiumConfig()
    : shapePremiumConfig(row.setting_value);

  loadPremiumConfig._cache = {
    value,
    expiresAt: now + 5 * 60 * 1000,
  };
  return value;
}

function invalidatePremiumConfigCache() {
  loadPremiumConfig._cache = null;
}

async function resolvePremiumConfigForSalon(salon) {
  const platform = await loadPremiumConfig();
  const salonFee = salon?.premium_booking_fee;
  const hasCustomFee = salonFee != null && Number(salonFee) > 0;
  return {
    enabled: platform.enabled,
    fee: hasCustomFee ? Number(salonFee) : platform.fee,
    currency: platform.currency,
    payment_window_minutes: platform.payment_window_minutes,
    is_custom_fee: hasCustomFee,
  };
}

async function getOccupiedBookings(salonId, date, { attributes, transaction } = {}) {
  return Booking.findAll({
    where: {
      salon_id: salonId,
      booking_date: formatDateOnly(date),
      booking_status: ACCEPTED_BOOKING_STATUS,
    },
    attributes: attributes || undefined,
    include: attributes
      ? undefined
      : [
        {
          model: Customer,
          as: 'customer',
          include: [{ model: User, as: 'user', attributes: ['id', 'name', 'phone'] }],
        },
        { model: Service, as: 'service', attributes: ['id', 'service_name'] },
      ],
    transaction,
  });
}

async function getBlockedOverrides(salonId, date) {
  return SalonSlotOverride.findAll({
    where: {
      salon_id: salonId,
      slot_date: formatDateOnly(date),
      is_blocked: true,
      is_active: true,
    },
  });
}

function bookingTimeKey(bookingTime) {
  const normalized = normalizeSlotStart(bookingTime);
  return normalized || String(bookingTime).slice(0, 8);
}

function slotGroupKey(booking) {
  return booking.booking_group_id || `single:${booking.id}`;
}

function isPremiumBookingGroup(rows) {
  return (rows || []).some((row) => row.booking_type === 'PREMIUM');
}

function groupBookingsByGroupId(bookings) {
  const groups = new Map();
  for (const booking of bookings || []) {
    const key = slotGroupKey(booking);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(booking);
  }
  return groups;
}

function classifyAcceptedSlotGroups(bookings, { excludeGroupKey } = {}) {
  const groups = groupBookingsByGroupId(bookings);
  let hasAcceptedStandard = false;
  let hasAcceptedPremium = false;
  for (const [key, rows] of groups) {
    if (excludeGroupKey && key === excludeGroupKey) continue;
    const acceptedRows = rows.filter((row) => row.booking_status === ACCEPTED_BOOKING_STATUS);
    if (acceptedRows.length === 0) continue;
    if (isPremiumBookingGroup(acceptedRows) || isPremiumBookingGroup(rows)) {
      hasAcceptedPremium = true;
    } else {
      hasAcceptedStandard = true;
    }
  }
  return { hasAcceptedStandard, hasAcceptedPremium };
}

function buildAcceptedOccupancyBySlot(bookings) {
  const occupancy = new Map();
  const groupsBySlot = new Map();
  for (const booking of bookings || []) {
    const slotKey = bookingTimeKey(booking.booking_time);
    if (!groupsBySlot.has(slotKey)) groupsBySlot.set(slotKey, new Map());
    const groups = groupsBySlot.get(slotKey);
    const groupKey = slotGroupKey(booking);
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(booking);
  }

  for (const [slotKey, groups] of groupsBySlot) {
    let hasAcceptedPremium = false;
    let hasAcceptedStandard = false;
    let standardRep = null;
    let premiumRep = null;
    for (const rows of groups.values()) {
      if (isPremiumBookingGroup(rows)) {
        hasAcceptedPremium = true;
        premiumRep = premiumRep
          || rows.find((row) => row.booking_type === 'PREMIUM')
          || rows[0];
      } else {
        hasAcceptedStandard = true;
        standardRep = standardRep || rows[0];
      }
    }
    occupancy.set(slotKey, {
      representative: standardRep || premiumRep,
      hasAcceptedPremium,
      hasAcceptedStandard,
    });
  }
  return occupancy;
}

function lockOptions(transaction) {
  return transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {};
}

async function lockSlotForUpdate(salonId, dateStr, normalizedTime, transaction) {
  if (!transaction) return;
  const slotKey = `${salonId}:${dateStr}:${normalizedTime}`;
  await sequelize.query(
    'SELECT pg_advisory_xact_lock(hashtext(:slotKey))',
    { replacements: { slotKey }, transaction },
  );
}

async function loadSlotBookingsForUpdate(salonId, dateStr, normalizedTime, transaction) {
  return Booking.findAll({
    where: {
      salon_id: salonId,
      booking_date: dateStr,
      booking_time: normalizedTime,
      booking_status: { [Op.in]: ACTIVE_BOOKING_STATUSES },
    },
    ...lockOptions(transaction),
  });
}

async function findBlockedOverride(salonId, dateStr, normalizedTime, transaction) {
  return SalonSlotOverride.findOne({
    where: {
      salon_id: salonId,
      slot_date: dateStr,
      slot_start: normalizedTime,
      is_blocked: true,
      is_active: true,
    },
    ...lockOptions(transaction),
  });
}

async function buildSlotList(salon, date, { includeBookingDetails = false } = {}) {
  const dateStr = formatDateOnly(date);
  const baseSlots = generateHourlySlots(salon.opening_time, salon.closing_time);
  const [bookings, overrides] = await Promise.all([
    getOccupiedBookings(salon.id, dateStr),
    getBlockedOverrides(salon.id, dateStr),
  ]);

  const occupancyBySlot = buildAcceptedOccupancyBySlot(bookings);

  const blockedBySlot = new Map();
  for (const o of overrides) {
    blockedBySlot.set(bookingTimeKey(o.slot_start), o);
  }

  const premiumConfig = await resolvePremiumConfigForSalon(salon);
  const inPast = (slotStart) => isSlotInPast(dateStr, slotStart);

  const allHourSlots = [];
  for (let start = 0; start < 24 * 60; start += SLOT_DURATION_MINUTES) {
    const slotStart = minutesToTimeString(start);
    const slotEnd = minutesToTimeString(start + SLOT_DURATION_MINUTES);
    const inHours = baseSlots.some((s) => s.slot_start === slotStart);
    const occupancy = occupancyBySlot.get(slotStart);
    const booking = occupancy?.representative;
    const override = blockedBySlot.get(slotStart);
    const past = inPast(slotStart);

    let status;
    if (!inHours) {
      status = 'closed';
    } else if (past) {
      status = 'past';
    } else if (occupancy) {
      status = 'booked';
    } else if (override) {
      status = 'blocked';
    } else {
      status = 'available';
    }

    const slot = {
      slot_start: slotStart,
      slot_end: slotEnd,
      status,
      premium_eligible: Boolean(
        premiumConfig.enabled
        && (status === 'booked' || status === 'blocked')
        && !occupancy?.hasAcceptedPremium
      ),
    };

    if (includeBookingDetails && booking) {
      slot.booking = {
        id: booking.id,
        booking_number: booking.booking_number,
        booking_type: booking.booking_type,
        booking_status: booking.booking_status,
        customer_name: booking.customer?.user?.name || null,
        customer_phone: booking.customer?.user?.phone || null,
        service_name: booking.service?.service_name || null,
      };
    }

    if (includeBookingDetails && override) {
      slot.block_note = override.note || null;
    }

    allHourSlots.push(slot);
  }

  const operatingSlots = allHourSlots.filter((s) => {
    return baseSlots.some((b) => b.slot_start === s.slot_start);
  });

  return {
    date: dateStr,
    opening_time: salon.opening_time,
    closing_time: salon.closing_time,
    slots: operatingSlots,
    premium_config: premiumConfig,
  };
}

async function getSlotsForSalon(salonId, date) {
  const salon = await Salon.findByPk(salonId);
  if (!salon) throw new AppError('Salon not found', 404);
  if (!salon.opening_time || !salon.closing_time) {
    return {
      date: formatDateOnly(date),
      opening_time: null,
      closing_time: null,
      slots: [],
      premium_config: await loadPremiumConfig(),
    };
  }
  return buildSlotList(salon, date, { includeBookingDetails: false });
}

async function getOwnerSlotsForSalon(salonId, date) {
  const salon = await Salon.findByPk(salonId);
  if (!salon) throw new AppError('Salon not found', 404);
  if (!salon.opening_time || !salon.closing_time) {
    return {
      date: formatDateOnly(date),
      opening_time: null,
      closing_time: null,
      slots: [],
      premium_config: await loadPremiumConfig(),
    };
  }
  return buildSlotList(salon, date, { includeBookingDetails: true });
}

async function getTodayAvailabilitySummary(salonId, salonRecord = null) {
  const salon = salonRecord || await Salon.findByPk(salonId);
  if (!salon || !salon.opening_time || !salon.closing_time) {
    return { total: 0, available: 0, status: 'unknown' };
  }

  const data = await buildSlotList(salon, todayDateString());
  const futureSlots = data.slots.filter((s) => s.status !== 'past');
  const total = futureSlots.length;
  const available = futureSlots.filter((s) => s.status === 'available').length;

  if (total === 0) return { total: 0, available: 0, status: 'unknown' };

  let status;
  if (available === 0) status = 'full';
  else if (available / total < 0.3) status = 'limited';
  else status = 'open';

  return { total, available, status };
}

function summarizeSlotsForSalon(salon, bookings, overrides, dateStr) {
  if (!salon.opening_time || !salon.closing_time) {
    return { total: 0, available: 0, status: 'unknown' };
  }

  const baseSlots = generateHourlySlots(salon.opening_time, salon.closing_time);
  const bookingBySlot = new Map();
  for (const booking of bookings) {
    bookingBySlot.set(bookingTimeKey(booking.booking_time), true);
  }
  const blockedBySlot = new Map();
  for (const override of overrides) {
    blockedBySlot.set(bookingTimeKey(override.slot_start), true);
  }

  let total = 0;
  let available = 0;
  for (const slot of baseSlots) {
    if (isSlotInPast(dateStr, slot.slot_start)) continue;
    total += 1;
    const slotKey = slot.slot_start;
    if (!bookingBySlot.has(slotKey) && !blockedBySlot.has(slotKey)) {
      available += 1;
    }
  }

  if (total === 0) return { total: 0, available: 0, status: 'unknown' };

  let status;
  if (available === 0) status = 'full';
  else if (available / total < 0.3) status = 'limited';
  else status = 'open';

  return { total, available, status };
}

async function getBatchAvailabilitySummariesForDate(salons, dateStr) {
  if (!salons.length) return new Map();

  const salonIds = salons.map((salon) => salon.id);
  const normalizedDate = formatDateOnly(dateStr);

  const [bookings, overrides] = await Promise.all([
    Booking.findAll({
      where: {
        salon_id: { [Op.in]: salonIds },
        booking_date: normalizedDate,
        booking_status: ACCEPTED_BOOKING_STATUS,
      },
      attributes: ['salon_id', 'booking_time'],
      raw: true,
    }),
    SalonSlotOverride.findAll({
      where: {
        salon_id: { [Op.in]: salonIds },
        slot_date: normalizedDate,
        is_blocked: true,
        is_active: true,
      },
      attributes: ['salon_id', 'slot_start'],
      raw: true,
    }),
  ]);

  const bookingsBySalon = new Map();
  for (const booking of bookings) {
    if (!bookingsBySalon.has(booking.salon_id)) {
      bookingsBySalon.set(booking.salon_id, []);
    }
    bookingsBySalon.get(booking.salon_id).push(booking);
  }

  const overridesBySalon = new Map();
  for (const override of overrides) {
    if (!overridesBySalon.has(override.salon_id)) {
      overridesBySalon.set(override.salon_id, []);
    }
    overridesBySalon.get(override.salon_id).push(override);
  }

  const summaries = new Map();
  for (const salon of salons) {
    summaries.set(
      salon.id,
      summarizeSlotsForSalon(
        salon,
        bookingsBySalon.get(salon.id) || [],
        overridesBySalon.get(salon.id) || [],
        normalizedDate,
      ),
    );
  }
  return summaries;
}

async function getBatchTodayAvailabilitySummaries(salons) {
  return getBatchAvailabilitySummariesForDate(salons, todayDateString());
}

async function assertSlotBookable(salonId, date, slotStart, { isPremium = false, transaction } = {}) {
  const salon = await Salon.findByPk(salonId, transaction ? { transaction } : undefined);
  if (!salon) throw new AppError('Salon not found', 404);
  if (salon.status !== 'ACTIVE' || !salon.is_active) {
    throw new AppError('Salon is not available for booking', 400);
  }
  if (!salon.opening_time || !salon.closing_time) {
    throw new AppError('Salon has no operating hours configured', 400);
  }

  const normalized = normalizeSlotStart(slotStart);
  if (!normalized) {
    throw new AppError('booking_time must be on a 30-minute slot (e.g. 10:00 or 10:30)', 400);
  }

  const dateStr = formatDateOnly(date);
  if (dateStr < todayDateString()) {
    throw new AppError('Cannot book a slot in the past', 400);
  }

  const baseSlots = generateHourlySlots(salon.opening_time, salon.closing_time);
  if (!baseSlots.some((s) => s.slot_start === normalized)) {
    throw new AppError('Invalid slot for this salon', 400);
  }

  if (isSlotInPast(dateStr, normalized)) {
    throw new AppError('Cannot book a slot in the past', 400);
  }

  await lockSlotForUpdate(salonId, dateStr, normalized, transaction);

  const [slotBookings, override] = await Promise.all([
    loadSlotBookingsForUpdate(salonId, dateStr, normalized, transaction),
    findBlockedOverride(salonId, dateStr, normalized, transaction),
  ]);

  const { hasAcceptedStandard, hasAcceptedPremium } = classifyAcceptedSlotGroups(slotBookings);
  const isBlocked = Boolean(override);
  const isBooked = hasAcceptedStandard || hasAcceptedPremium;

  if (!isPremium) {
    if (isBooked) throw new AppError(SLOT_ALREADY_BOOKED_MESSAGE, 409);
    if (isBlocked) throw new AppError('This slot is blocked by the salon', 409);
    return { salon, slotStart: normalized, bookingType: 'STANDARD' };
  }

  if (!isBooked && !isBlocked) {
    throw new AppError(PREMIUM_ONLY_OCCUPIED_MESSAGE, 400);
  }
  if (hasAcceptedPremium) {
    throw new AppError(PREMIUM_ALREADY_ACCEPTED_MESSAGE, 409);
  }

  const premiumConfig = await resolvePremiumConfigForSalon(salon);
  if (!premiumConfig.enabled) {
    throw new AppError('Premium booking is not available', 400);
  }

  return {
    salon,
    slotStart: normalized,
    bookingType: 'PREMIUM',
    premiumAmount: premiumConfig.fee,
  };
}

async function assertSlotGroupAcceptable(group, { transaction } = {}) {
  if (!group || group.length === 0) {
    throw new AppError('Booking not found', 404);
  }

  const primary = group[0];
  const dateStr = formatDateOnly(primary.booking_date);
  const normalized = normalizeSlotStart(primary.booking_time) || String(primary.booking_time).slice(0, 8);
  const currentKey = slotGroupKey(primary);
  const currentIsPremium = isPremiumBookingGroup(group);

  await lockSlotForUpdate(primary.salon_id, dateStr, normalized, transaction);

  const [slotBookings, override] = await Promise.all([
    loadSlotBookingsForUpdate(primary.salon_id, dateStr, normalized, transaction),
    findBlockedOverride(primary.salon_id, dateStr, normalized, transaction),
  ]);

  const { hasAcceptedStandard, hasAcceptedPremium } = classifyAcceptedSlotGroups(slotBookings, {
    excludeGroupKey: currentKey,
  });

  if (!currentIsPremium) {
    if (hasAcceptedStandard) {
      throw new AppError(SLOT_ALREADY_BOOKED_MESSAGE, 409);
    }
    return { currentIsPremium };
  }

  if (hasAcceptedPremium) {
    throw new AppError(PREMIUM_ALREADY_ACCEPTED_MESSAGE, 409);
  }
  if (!hasAcceptedStandard && !override) {
    throw new AppError(PREMIUM_ONLY_OCCUPIED_MESSAGE, 400);
  }

  return { currentIsPremium };
}

async function autoRejectCompetingPendingGroups({
  salonId,
  bookingDate,
  bookingTime,
  currentGroup,
  userId,
  transaction,
  rejectionReason = 'Another booking was accepted for this slot',
} = {}) {
  if (!currentGroup || currentGroup.length === 0) return [];

  const dateStr = formatDateOnly(bookingDate);
  const normalized = normalizeSlotStart(bookingTime) || String(bookingTime).slice(0, 8);
  const currentKey = slotGroupKey(currentGroup[0]);
  const currentIsPremium = isPremiumBookingGroup(currentGroup);

  const pending = await Booking.findAll({
    where: {
      salon_id: salonId,
      booking_date: dateStr,
      booking_time: normalized,
      booking_status: 'PENDING',
    },
    ...lockOptions(transaction),
  });

  const groups = groupBookingsByGroupId(pending);
  const rejectedRepresentatives = [];

  for (const [key, rows] of groups) {
    if (key === currentKey) continue;
    if (isPremiumBookingGroup(rows) !== currentIsPremium) continue;

    for (const item of rows) {
      item.booking_status = 'REJECTED';
      item.rejection_reason = rejectionReason;
      item.responded_by = userId;
      item.responded_at = new Date();
      item.updated_by = userId;
      await item.save({ transaction });
    }
    rejectedRepresentatives.push(rows[0].id);
  }

  return rejectedRepresentatives;
}

async function assertCustomerServiceSlotFree(salonId, date, slotStart, serviceId, customerId, options = {}) {
  const normalized = normalizeSlotStart(slotStart);
  if (!normalized) throw new AppError('booking_time must be on a 30-minute slot (e.g. 10:00 or 10:30)', 400);

  const existing = await Booking.findOne({
    where: {
      salon_id: salonId,
      booking_date: formatDateOnly(date),
      booking_time: normalized,
      service_id: serviceId,
      customer_id: customerId,
      booking_status: { [Op.in]: ACTIVE_BOOKING_STATUSES },
    },
    transaction: options.transaction,
  });

  if (existing) {
    throw new AppError(CUSTOMER_DUPLICATE_SERVICE_MESSAGE, 409, {
      code: SLOT_CONFLICT_CODES.DUPLICATE_SERVICE,
    });
  }
}

function evaluateCustomerSlotRequest(activeBookings, requestedServiceIds) {
  const requested = [...new Set((requestedServiceIds || []).filter(Boolean).map(String))];
  const activeServiceIds = new Set((activeBookings || []).map((row) => String(row.service_id)));
  const newServiceIds = requested.filter((id) => !activeServiceIds.has(id));

  if (requested.length > 0 && newServiceIds.length === 0) {
    return { type: SLOT_CONFLICT_CODES.DUPLICATE_SERVICE };
  }

  const groups = groupBookingsByGroupId(activeBookings);
  let hasAccepted = false;
  const pendingGroups = [];
  for (const [, rows] of groups) {
    if (rows.some((row) => row.booking_status === 'ACCEPTED')) {
      hasAccepted = true;
    } else if (rows.some((row) => row.booking_status === 'PENDING')) {
      pendingGroups.push(rows);
    }
  }

  if (hasAccepted) {
    return { type: SLOT_CONFLICT_CODES.OWN_SLOT_BOOKED };
  }

  if (pendingGroups.length > 0 && newServiceIds.length > 0) {
    pendingGroups.sort((a, b) => {
      const aTime = new Date(a[0].created_at || 0).getTime();
      const bTime = new Date(b[0].created_at || 0).getTime();
      return bTime - aTime;
    });
    const rows = pendingGroups[0];
    return {
      type: SLOT_CONFLICT_CODES.UPGRADE_AVAILABLE,
      groupId: rows[0].booking_group_id || rows[0].id,
      existingRows: rows,
      newServiceIds,
    };
  }

  return { type: 'CLEAR' };
}

async function findCustomerActiveSlotBookings(salonId, date, slotStart, customerId, { transaction } = {}) {
  const normalized = normalizeSlotStart(slotStart);
  if (!normalized) {
    throw new AppError('booking_time must be on a 30-minute slot (e.g. 10:00 or 10:30)', 400);
  }

  return Booking.findAll({
    where: {
      salon_id: salonId,
      booking_date: formatDateOnly(date),
      booking_time: normalized,
      customer_id: customerId,
      booking_status: { [Op.in]: ACTIVE_BOOKING_STATUSES },
    },
    include: [{ model: Service, as: 'service', attributes: ['id', 'service_name'] }],
    order: [['created_at', 'DESC']],
    transaction,
    lock: transaction
      ? { level: transaction.LOCK.UPDATE, of: Booking }
      : undefined,
  });
}

const assertAdditionalServiceBookable = assertCustomerServiceSlotFree;

async function setSlotBlocked(salonId, slotDate, slotStart, isBlocked, note, userId) {
  const normalized = normalizeSlotStart(slotStart);
  if (!normalized) throw new AppError('slot_start must be on a 30-minute slot (e.g. 10:00 or 10:30)', 400);

  const salon = await Salon.findByPk(salonId);
  if (!salon) throw new AppError('Salon not found', 404);

  const baseSlots = generateHourlySlots(salon.opening_time, salon.closing_time);
  if (!baseSlots.some((s) => s.slot_start === normalized)) {
    throw new AppError('Slot is outside salon operating hours', 400);
  }

  const dateStr = formatDateOnly(slotDate);
  const existingBooking = await Booking.findOne({
    where: {
      salon_id: salonId,
      booking_date: dateStr,
      booking_time: normalized,
      booking_status: { [Op.in]: ACTIVE_BOOKING_STATUSES },
    },
  });
  if (existingBooking && isBlocked) {
    throw new AppError('Cannot block a slot that has an active booking', 400);
  }

  const [override] = await SalonSlotOverride.findOrCreate({
    where: {
      salon_id: salonId,
      slot_date: dateStr,
      slot_start: normalized,
    },
    defaults: {
      is_blocked: isBlocked,
      note: note || null,
      created_by: userId,
      updated_by: userId,
    },
  });

  if (override) {
    override.is_blocked = isBlocked;
    override.note = isBlocked ? (note || override.note || null) : null;
    override.updated_by = userId;
    await override.save();
  }

  if (!isBlocked) {
    await override.destroy();
  }

  return getOwnerSlotsForSalon(salonId, dateStr);
}

module.exports = {
  PREMIUM_CONFIG_KEY,
  DEFAULT_PAYMENT_WINDOW_MINUTES,
  MIN_PAYMENT_WINDOW_MINUTES,
  MAX_PAYMENT_WINDOW_MINUTES,
  normalizePaymentWindowMinutes,
  shapePremiumConfig,
  PREMIUM_ALREADY_ACCEPTED_MESSAGE,
  SLOT_ALREADY_BOOKED_MESSAGE,
  PREMIUM_ONLY_OCCUPIED_MESSAGE,
  CUSTOMER_DUPLICATE_SERVICE_MESSAGE,
  OWN_SLOT_BOOKED_MESSAGE,
  UPGRADE_AVAILABLE_MESSAGE,
  SLOT_CONFLICT_CODES,
  SLOT_DURATION_MINUTES,
  generateSlots,
  generateHourlySlots,
  normalizeSlotStart,
  formatDateOnly,
  loadPremiumConfig,
  invalidatePremiumConfigCache,
  resolvePremiumConfigForSalon,
  summarizeSlotsForSalon,
  getSlotsForSalon,
  getOwnerSlotsForSalon,
  getTodayAvailabilitySummary,
  getBatchTodayAvailabilitySummaries,
  getBatchAvailabilitySummariesForDate,
  slotGroupKey,
  isPremiumBookingGroup,
  classifyAcceptedSlotGroups,
  assertSlotBookable,
  assertSlotGroupAcceptable,
  autoRejectCompetingPendingGroups,
  lockSlotForUpdate,
  assertCustomerServiceSlotFree,
  evaluateCustomerSlotRequest,
  findCustomerActiveSlotBookings,
  assertAdditionalServiceBookable,
  setSlotBlocked,
};
