const { Op, QueryTypes } = require('sequelize');
const {
  PlatformSetting,
  PhoneOtpSession,
  OtpSendEvent,
  OtpPhoneBlock,
  sequelize,
} = require('../models');
const AppError = require('../middlewares/AppError');
const { logAudit } = require('./auditService');
const {
  normalizePhone,
  generateOtp,
  getOtpExpiryDate,
  checkRequestCooldown,
  markOtpRequested,
  sanitizeOtpDeliveryError,
} = require('../utils/otpHelpers');
const { sendOtpSms } = require('../utils/smsService');
const {
  DEFAULT_TIMEZONE,
  localDateString,
  addDaysToDateString,
  dayUtcBounds,
  periodBounds,
} = require('./ownerDashboard/dateWindow');
const {
  OTP_USAGE_CONFIG_KEY,
  DEFAULT_DAILY_CAP,
  DEFAULT_SMS_COST_PAISE,
  OTP_PURPOSE,
  OTP_EVENT_STATUS,
  BLOCKED_MESSAGE,
  CAPPED_MESSAGE,
  costRupees,
  normalizeOtpUsageConfig,
  evaluateOtpGate,
  extractProviderRequestId,
} = require('./otpUsageMath');

const SCHEMA = process.env.DB_SCHEMA || 'salon_booking_schema';

function parseOtpUsageConfigInput(body) {
  const cap = parseInt(body?.daily_cap_per_phone, 10);
  const paise = parseInt(body?.sms_cost_paise, 10);
  if (!Number.isFinite(cap) || cap < 1) {
    throw new AppError('daily_cap_per_phone must be an integer of at least 1', 400);
  }
  if (!Number.isFinite(paise) || paise < 0) {
    throw new AppError('sms_cost_paise must be an integer of 0 or more', 400);
  }
  return { daily_cap_per_phone: cap, sms_cost_paise: paise };
}

function istWindows(now = new Date()) {
  const today = localDateString(DEFAULT_TIMEZONE, now);
  const d7 = addDaysToDateString(today, -6);
  const d30 = addDaysToDateString(today, -29);
  const todayBounds = dayUtcBounds(today, DEFAULT_TIMEZONE);
  const weekBounds = periodBounds(d7, today, DEFAULT_TIMEZONE);
  const monthBounds = periodBounds(d30, today, DEFAULT_TIMEZONE);
  return {
    today,
    todayStart: todayBounds.start,
    todayEnd: todayBounds.end,
    weekStart: weekBounds.start,
    monthStart: monthBounds.start,
    periodEnd: todayBounds.end,
  };
}

async function getOtpUsageConfig() {
  const row = await PlatformSetting.findOne({
    where: { setting_key: OTP_USAGE_CONFIG_KEY, is_active: true },
  });
  return normalizeOtpUsageConfig(row?.setting_value);
}

async function isPhoneBlocked(phone) {
  const row = await OtpPhoneBlock.findOne({
    where: { phone, is_active: true },
    attributes: ['id'],
  });
  return Boolean(row);
}

async function countSentToday(phone, now = new Date()) {
  const { todayStart, todayEnd } = istWindows(now);
  return OtpSendEvent.count({
    where: {
      phone,
      status: OTP_EVENT_STATUS.SENT,
      created_at: { [Op.between]: [todayStart, todayEnd] },
    },
  });
}

async function logOtpEvent({ phone, purpose, status, providerRequestId = null, errorMessage = null }) {
  await OtpSendEvent.create({
    phone,
    purpose,
    status,
    provider_request_id: providerRequestId,
    error_message: errorMessage,
  });
}

async function requestOtpSms({ phone: rawPhone, purpose }) {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new AppError('Invalid phone number. Enter exactly 10 digits.', 400);
  if (!Object.values(OTP_PURPOSE).includes(purpose)) {
    throw new AppError('Invalid OTP purpose', 400);
  }

  const [blocked, config] = await Promise.all([
    isPhoneBlocked(phone),
    getOtpUsageConfig(),
  ]);
  const sentToday = blocked ? 0 : await countSentToday(phone);
  const cooldown = checkRequestCooldown(phone);
  const gate = evaluateOtpGate({
    blocked,
    sentToday,
    cap: config.daily_cap_per_phone,
    cooldownAllowed: cooldown.allowed,
    cooldownWaitSec: cooldown.waitSec || 0,
  });

  if (gate.action === OTP_EVENT_STATUS.BLOCKED || gate.action === OTP_EVENT_STATUS.CAPPED) {
    await logOtpEvent({ phone, purpose, status: gate.action });
    throw new AppError(gate.message, gate.statusCode);
  }
  if (gate.action === 'COOLDOWN') {
    throw new AppError(gate.message, gate.statusCode);
  }

  const otp = generateOtp();
  const otpExpiresAt = getOtpExpiryDate();

  await PhoneOtpSession.upsert({
    phone,
    otp,
    otp_expires_at: otpExpiresAt,
    attempt_count: 0,
    updated_at: new Date(),
  });

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[OTP ${purpose}] phone=${phone} otp=${otp} expires=${otpExpiresAt.toISOString()}`);
  }

  try {
    const data = await sendOtpSms(phone, otp);
    await logOtpEvent({
      phone,
      purpose,
      status: OTP_EVENT_STATUS.SENT,
      providerRequestId: extractProviderRequestId(data),
    });
    markOtpRequested(phone);
    return { phone };
  } catch (smsErr) {
    await PhoneOtpSession.destroy({ where: { phone } });
    const errorMessage = sanitizeOtpDeliveryError(smsErr);
    await logOtpEvent({
      phone,
      purpose,
      status: OTP_EVENT_STATUS.FAILED,
      errorMessage,
    });
    throw new AppError(errorMessage, 500);
  }
}

async function windowStats({ start, end, smsCostPaise }) {
  const [row] = await sequelize.query(
    `SELECT
        COUNT(*) FILTER (WHERE status = 'SENT')::int AS sent,
        COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
        COUNT(DISTINCT phone) FILTER (WHERE status = 'SENT')::int AS unique_phones
     FROM "${SCHEMA}"."otp_send_events"
     WHERE created_at >= :start AND created_at <= :end`,
    {
      replacements: { start, end },
      type: QueryTypes.SELECT,
    },
  );
  const sent = row?.sent || 0;
  return {
    sent,
    failed: row?.failed || 0,
    unique_phones: row?.unique_phones || 0,
    cost_rupees: costRupees(sent, smsCostPaise),
  };
}

async function getInsights() {
  const config = await getOtpUsageConfig();
  const { todayStart, weekStart, monthStart, periodEnd } = istWindows();
  const [today, last7d, last30d] = await Promise.all([
    windowStats({ start: todayStart, end: periodEnd, smsCostPaise: config.sms_cost_paise }),
    windowStats({ start: weekStart, end: periodEnd, smsCostPaise: config.sms_cost_paise }),
    windowStats({ start: monthStart, end: periodEnd, smsCostPaise: config.sms_cost_paise }),
  ]);
  return {
    config,
    windows: {
      today,
      '7d': last7d,
      '30d': last30d,
    },
  };
}

async function queryConsumers({ page = 1, limit = 20, search } = {}) {
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const offset = (safePage - 1) * safeLimit;
  const config = await getOtpUsageConfig();
  const { todayStart, weekStart, monthStart, periodEnd } = istWindows();
  const phoneSearch = search ? String(search).replace(/\D/g, '') : '';

  const replacements = {
    todayStart,
    weekStart,
    monthStart,
    periodEnd,
    limit: safeLimit,
    offset,
    phoneSearch: phoneSearch ? `%${phoneSearch}%` : null,
  };

  const searchClause = phoneSearch ? 'AND p.phone ILIKE :phoneSearch' : '';

  const countSql = `
    SELECT COUNT(*)::int AS total FROM (
      SELECT phone FROM "${SCHEMA}"."otp_send_events"
      WHERE status = 'SENT' AND created_at >= :monthStart AND created_at <= :periodEnd
      UNION
      SELECT phone FROM "${SCHEMA}"."otp_phone_blocks" WHERE is_active = true
    ) p
    WHERE 1=1 ${searchClause}
  `;

  const rowsSql = `
    WITH phones AS (
      SELECT phone FROM "${SCHEMA}"."otp_send_events"
      WHERE status = 'SENT' AND created_at >= :monthStart AND created_at <= :periodEnd
      UNION
      SELECT phone FROM "${SCHEMA}"."otp_phone_blocks" WHERE is_active = true
    ),
    sent AS (
      SELECT
        phone,
        COUNT(*) FILTER (WHERE created_at >= :todayStart AND created_at <= :periodEnd)::int AS sent_today,
        COUNT(*) FILTER (WHERE created_at >= :weekStart AND created_at <= :periodEnd)::int AS sent_7d,
        COUNT(*) FILTER (WHERE created_at >= :monthStart AND created_at <= :periodEnd)::int AS sent_30d,
        MAX(created_at) FILTER (WHERE created_at >= :monthStart AND created_at <= :periodEnd) AS last_sent
      FROM "${SCHEMA}"."otp_send_events"
      WHERE status = 'SENT'
        AND created_at >= :monthStart
        AND created_at <= :periodEnd
      GROUP BY phone
    )
    SELECT
      p.phone,
      u.name AS user_name,
      COALESCE(s.sent_today, 0) AS sent_today,
      COALESCE(s.sent_7d, 0) AS sent_7d,
      COALESCE(s.sent_30d, 0) AS sent_30d,
      s.last_sent,
      COALESCE(b.is_active, false) AS is_blocked
    FROM phones p
    LEFT JOIN sent s ON s.phone = p.phone
    LEFT JOIN "${SCHEMA}"."users" u ON u.phone = p.phone
    LEFT JOIN "${SCHEMA}"."otp_phone_blocks" b ON b.phone = p.phone
    WHERE 1=1 ${searchClause}
    ORDER BY COALESCE(s.sent_30d, 0) DESC, s.last_sent DESC NULLS LAST, p.phone ASC
    LIMIT :limit OFFSET :offset
  `;

  const [countRow] = await sequelize.query(countSql, {
    replacements,
    type: QueryTypes.SELECT,
  });
  const rows = await sequelize.query(rowsSql, {
    replacements,
    type: QueryTypes.SELECT,
  });
  const total = countRow?.total || 0;

  return {
    rows: rows.map((row) => ({
      phone: row.phone,
      user_name: row.user_name || null,
      sent_today: Number(row.sent_today) || 0,
      sent_7d: Number(row.sent_7d) || 0,
      sent_30d: Number(row.sent_30d) || 0,
      cost_30d_rupees: costRupees(row.sent_30d, config.sms_cost_paise),
      last_sent: row.last_sent || null,
      is_blocked: Boolean(row.is_blocked),
    })),
    meta: {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit) || 0,
    },
  };
}

async function updateOtpUsageConfig({ daily_cap_per_phone, sms_cost_paise }, { userId, req } = {}) {
  const next = parseOtpUsageConfigInput({ daily_cap_per_phone, sms_cost_paise });
  let row = await PlatformSetting.findOne({ where: { setting_key: OTP_USAGE_CONFIG_KEY } });
  const previous = row ? normalizeOtpUsageConfig(row.setting_value) : null;

  if (!row) {
    row = await PlatformSetting.create({
      setting_key: OTP_USAGE_CONFIG_KEY,
      setting_value: next,
      description: 'OTP SMS daily cap per phone and per-SMS cost in paise',
      created_by: userId || null,
      updated_by: userId || null,
    });
  } else {
    row.setting_value = next;
    row.updated_by = userId || null;
    await row.save();
  }

  await logAudit({
    userId,
    action: 'otpUsage.config.update',
    entityType: 'PlatformSetting',
    entityId: row.id,
    oldValues: previous,
    newValues: next,
    req,
  });

  return next;
}

async function blockPhone({ phone: rawPhone, reason, userId, req }) {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new AppError('Invalid phone number. Enter exactly 10 digits.', 400);

  let row = await OtpPhoneBlock.findOne({ where: { phone } });
  if (!row) {
    row = await OtpPhoneBlock.create({
      phone,
      reason: reason || null,
      is_active: true,
      created_by: userId || null,
      updated_by: userId || null,
    });
  } else {
    row.is_active = true;
    if (reason !== undefined) row.reason = reason || null;
    row.updated_by = userId || null;
    await row.save();
  }

  await logAudit({
    userId,
    action: 'otpUsage.block',
    entityType: 'OtpPhoneBlock',
    entityId: row.id,
    newValues: { phone, reason: row.reason, is_active: true },
    req,
  });

  return { phone, is_blocked: true, reason: row.reason };
}

async function unblockPhone({ phone: rawPhone, userId, req }) {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new AppError('Invalid phone number. Enter exactly 10 digits.', 400);

  const row = await OtpPhoneBlock.findOne({ where: { phone } });
  if (!row || !row.is_active) {
    return { phone, is_blocked: false };
  }

  row.is_active = false;
  row.updated_by = userId || null;
  await row.save();

  await logAudit({
    userId,
    action: 'otpUsage.unblock',
    entityType: 'OtpPhoneBlock',
    entityId: row.id,
    newValues: { phone, is_active: false },
    req,
  });

  return { phone, is_blocked: false };
}

module.exports = {
  OTP_USAGE_CONFIG_KEY,
  DEFAULT_DAILY_CAP,
  DEFAULT_SMS_COST_PAISE,
  OTP_PURPOSE,
  OTP_EVENT_STATUS,
  BLOCKED_MESSAGE,
  CAPPED_MESSAGE,
  costRupees,
  normalizeOtpUsageConfig,
  parseOtpUsageConfigInput,
  evaluateOtpGate,
  extractProviderRequestId,
  getOtpUsageConfig,
  requestOtpSms,
  getInsights,
  queryConsumers,
  updateOtpUsageConfig,
  blockPhone,
  unblockPhone,
};
