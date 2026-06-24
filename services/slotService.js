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
} = require('../models');
const AppError = require('../middlewares/AppError');

const PREMIUM_CONFIG_KEY = 'premium_booking_config';
const ACTIVE_BOOKING_STATUSES = ['PENDING', 'ACCEPTED'];

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
  if (minutes % 60 !== 0) return null;
  return minutesToTimeString(minutes);
}

function formatDateOnly(date) {
  if (typeof date === 'string') return date.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function todayDateString() {
  return formatDateOnly(new Date());
}

function generateHourlySlots(openingTime, closingTime) {
  const openMin = parseTimeToMinutes(openingTime);
  const closeMin = parseTimeToMinutes(closingTime);
  if (openMin === null || closeMin === null || closeMin <= openMin) return [];

  const slots = [];
  for (let start = openMin; start + 60 <= closeMin; start += 60) {
    slots.push({
      slot_start: minutesToTimeString(start),
      slot_end: minutesToTimeString(start + 60),
    });
  }
  return slots;
}

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
    ? { enabled: true, fee: 199, currency: 'INR' }
    : (() => {
      const config = typeof row.setting_value === 'string'
        ? JSON.parse(row.setting_value)
        : row.setting_value;
      return {
        enabled: config.enabled !== false,
        fee: Number(config.fee) || 199,
        currency: config.currency || 'INR',
      };
    })();

  loadPremiumConfig._cache = {
    value,
    expiresAt: now + 5 * 60 * 1000,
  };
  return value;
}

function invalidatePremiumConfigCache() {
  loadPremiumConfig._cache = null;
}

async function getOccupiedBookings(salonId, date, { attributes, transaction } = {}) {
  return Booking.findAll({
    where: {
      salon_id: salonId,
      booking_date: formatDateOnly(date),
      booking_status: { [Op.in]: ACTIVE_BOOKING_STATUSES },
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

async function buildSlotList(salon, date, { includeBookingDetails = false } = {}) {
  const dateStr = formatDateOnly(date);
  const baseSlots = generateHourlySlots(salon.opening_time, salon.closing_time);
  const [bookings, overrides] = await Promise.all([
    getOccupiedBookings(salon.id, dateStr),
    getBlockedOverrides(salon.id, dateStr),
  ]);

  const bookingBySlot = new Map();
  for (const b of bookings) {
    bookingBySlot.set(bookingTimeKey(b.booking_time), b);
  }

  const blockedBySlot = new Map();
  for (const o of overrides) {
    blockedBySlot.set(bookingTimeKey(o.slot_start), o);
  }

  const premiumConfig = await loadPremiumConfig();
  const inPast = (slotStart) => isSlotInPast(dateStr, slotStart);

  const allHourSlots = [];
  for (let hour = 0; hour < 24; hour += 1) {
    const slotStart = minutesToTimeString(hour * 60);
    const slotEnd = minutesToTimeString((hour + 1) * 60);
    const inHours = baseSlots.some((s) => s.slot_start === slotStart);
    const booking = bookingBySlot.get(slotStart);
    const override = blockedBySlot.get(slotStart);
    const past = inPast(slotStart);

    let status;
    if (!inHours) {
      status = 'closed';
    } else if (past) {
      status = 'past';
    } else if (booking) {
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
      premium_eligible: premiumConfig.enabled
        && status !== 'available'
        && status !== 'past',
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

async function getBatchTodayAvailabilitySummaries(salons) {
  if (!salons.length) return new Map();

  const dateStr = todayDateString();
  const salonIds = salons.map((salon) => salon.id);

  const [bookings, overrides] = await Promise.all([
    Booking.findAll({
      where: {
        salon_id: { [Op.in]: salonIds },
        booking_date: dateStr,
        booking_status: { [Op.in]: ACTIVE_BOOKING_STATUSES },
      },
      attributes: ['salon_id', 'booking_time'],
      raw: true,
    }),
    SalonSlotOverride.findAll({
      where: {
        salon_id: { [Op.in]: salonIds },
        slot_date: dateStr,
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
        dateStr,
      ),
    );
  }
  return summaries;
}

async function assertSlotBookable(salonId, date, slotStart, { isPremium = false } = {}) {
  const salon = await Salon.findByPk(salonId);
  if (!salon) throw new AppError('Salon not found', 404);
  if (salon.status !== 'ACTIVE' || !salon.is_active) {
    throw new AppError('Salon is not available for booking', 400);
  }
  if (!salon.opening_time || !salon.closing_time) {
    throw new AppError('Salon has no operating hours configured', 400);
  }

  const normalized = normalizeSlotStart(slotStart);
  if (!normalized) {
    throw new AppError('booking_time must be on the hour (e.g. 10:00)', 400);
  }

  const dateStr = formatDateOnly(date);
  if (dateStr < todayDateString()) {
    throw new AppError('Cannot book a slot in the past', 400);
  }

  const slotData = await buildSlotList(salon, dateStr);
  const slot = slotData.slots.find((s) => s.slot_start === normalized);
  if (!slot) {
    throw new AppError('Invalid slot for this salon', 400);
  }

  if (slot.status === 'past') {
    throw new AppError('Cannot book a slot in the past', 400);
  }

  if (slot.status === 'available') {
    const existingStandard = await Booking.findOne({
      where: {
        salon_id: salonId,
        booking_date: dateStr,
        booking_time: normalized,
        booking_status: { [Op.in]: ACTIVE_BOOKING_STATUSES },
        booking_type: 'STANDARD',
      },
    });
    if (existingStandard) {
      throw new AppError('This slot is already booked', 409);
    }
    if (isPremium) {
      throw new AppError('Premium booking is only for occupied or blocked slots', 400);
    }
    return { salon, slotStart: normalized, bookingType: 'STANDARD' };
  }

  if (!isPremium) {
    if (slot.status === 'booked') throw new AppError('This slot is already booked', 409);
    if (slot.status === 'blocked') throw new AppError('This slot is blocked by the salon', 409);
    throw new AppError('This slot is not available', 400);
  }

  const premiumConfig = await loadPremiumConfig();
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

async function assertAdditionalServiceBookable(salonId, date, slotStart, serviceId, customerId, options = {}) {
  const normalized = normalizeSlotStart(slotStart);
  if (!normalized) throw new AppError('booking_time must be on the hour (e.g. 10:00)', 400);

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
    throw new AppError('You already booked this service for the selected slot', 409);
  }
}

async function setSlotBlocked(salonId, slotDate, slotStart, isBlocked, note, userId) {
  const normalized = normalizeSlotStart(slotStart);
  if (!normalized) throw new AppError('slot_start must be on the hour (e.g. 10:00)', 400);

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
  generateHourlySlots,
  normalizeSlotStart,
  formatDateOnly,
  loadPremiumConfig,
  invalidatePremiumConfigCache,
  getSlotsForSalon,
  getOwnerSlotsForSalon,
  getTodayAvailabilitySummary,
  getBatchTodayAvailabilitySummaries,
  assertSlotBookable,
  assertAdditionalServiceBookable,
  setSlotBlocked,
};
