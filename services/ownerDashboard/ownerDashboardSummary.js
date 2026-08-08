const { sequelize, UserNotification } = require('../../models');
const { QueryTypes } = require('sequelize');
const { getBatchAvailabilitySummariesForDate } = require('../slotService');
const { summarizeProfileCompleteness } = require('./ownerDashboardProfileCompleteness');
const { addDaysToDateString, periodBounds } = require('./dateWindow');
const { buildPeriodMeta } = require('./ownerDashboardPeriod');

const SCHEMA = process.env.DB_SCHEMA || 'salon_booking_schema';

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function emptySummary(periodOpts = null) {
  const periodMeta = periodOpts ? buildPeriodMeta(periodOpts) : {
    key: '7d',
    from: null,
    to: null,
    label: 'Last 7 days',
    granularity: 'day',
  };
  return {
    bookings: { pending: 0, upcoming: 0, today: 0, completed_in_period: 0 },
    revenue: {
      today_gross: 0,
      period_gross: 0,
      period: periodMeta,
    },
    earnings: {
      pending: 0,
      in_batch: 0,
      pending_total: 0,
      settled: 0,
      collected_at_salon: 0,
      platform_fee_owed: 0,
    },
    reputation: { average_rating: null, review_count: 0 },
    premium_bookings_count: 0,
    utilization: {
      percent: 0,
      occupied_slots: 0,
      total_slots: 0,
      available_slots: 0,
      status: 'unknown',
    },
    profile_completeness: {
      average_percent: 100,
      incomplete_count: 0,
      salons: [],
    },
    notifications: { unread_count: 0 },
    by_salon: [],
  };
}

function buildUtilizationAggregate(salons, slotsMap) {
  let totalSlots = 0;
  let availableSlots = 0;
  const bySalon = [];

  for (const salon of salons) {
    const summary = slotsMap.get(salon.id) || { total: 0, available: 0, status: 'unknown' };
    const occupied = summary.total - summary.available;
    totalSlots += summary.total;
    availableSlots += summary.available;

    const todayBookings = 0;
    bySalon.push({
      salon_id: salon.id,
      salon_name: salon.salon_name,
      today_bookings: todayBookings,
      utilization_percent: summary.total > 0
        ? round2((occupied / summary.total) * 100)
        : 0,
      total_slots: summary.total,
      available_slots: summary.available,
      status: summary.status,
    });
  }

  const occupiedSlots = totalSlots - availableSlots;
  let status = 'unknown';
  if (totalSlots > 0) {
    if (availableSlots === 0) status = 'full';
    else if (availableSlots / totalSlots < 0.3) status = 'limited';
    else status = 'open';
  }

  return {
    percent: totalSlots > 0 ? round2((occupiedSlots / totalSlots) * 100) : 0,
    occupied_slots: occupiedSlots,
    total_slots: totalSlots,
    available_slots: availableSlots,
    status,
    by_salon: bySalon,
  };
}

async function fetchBookingAggregates(scope) {
  if (scope.salonIds.length === 0) {
    return { pending: 0, upcoming: 0, today: 0, premium_active: 0, today_by_salon: new Map() };
  }

  const [row] = await sequelize.query(
    `
    WITH scoped AS (
      SELECT id, salon_id, booking_group_id, booking_status, booking_type,
             booking_date, booking_time,
             COALESCE(booking_group_id, id) AS visit_key
      FROM "${SCHEMA}"."bookings"
      WHERE salon_id IN (:salonIds)
    ),
    visit_status AS (
      SELECT visit_key,
             salon_id,
             MAX(CASE booking_status
               WHEN 'PENDING' THEN 1
               WHEN 'ACCEPTED' THEN 2
               WHEN 'COMPLETED' THEN 3
               WHEN 'CANCELLED' THEN 4
               WHEN 'REJECTED' THEN 5
               ELSE 0
             END) AS status_rank,
             BOOL_OR(booking_type = 'PREMIUM') AS is_premium,
             MIN(booking_date) AS booking_date,
             MIN(booking_time) AS booking_time
      FROM scoped
      GROUP BY visit_key, salon_id
    ),
    today_visits AS (
      SELECT salon_id, COUNT(*)::int AS cnt
      FROM visit_status
      WHERE booking_date = :date
        AND status_rank NOT IN (4, 5)
      GROUP BY salon_id
    )
    SELECT
      (SELECT COUNT(*)::int FROM visit_status WHERE status_rank = 1) AS pending,
      (SELECT COUNT(*)::int FROM visit_status
        WHERE status_rank IN (1, 2)
          AND (booking_date > :date OR (booking_date = :date AND booking_time >= :nowTime))
      ) AS upcoming,
      (SELECT COUNT(*)::int FROM visit_status
        WHERE booking_date = :date AND status_rank NOT IN (4, 5)
      ) AS today,
      (SELECT COUNT(*)::int FROM visit_status
        WHERE is_premium AND status_rank IN (1, 2)
          AND (booking_date > :date OR (booking_date = :date AND booking_time >= :nowTime))
      ) AS premium_active,
      COALESCE((SELECT json_agg(json_build_object('salon_id', salon_id, 'cnt', cnt)) FROM today_visits), '[]'::json) AS today_by_salon
    `,
    {
      replacements: {
        salonIds: scope.salonIds,
        date: scope.date,
        nowTime: scope.nowTime,
      },
      type: QueryTypes.SELECT,
    },
  );

  const todayBySalon = new Map();
  const todayRows = row?.today_by_salon || [];
  if (Array.isArray(todayRows)) {
    for (const entry of todayRows) {
      todayBySalon.set(entry.salon_id, entry.cnt);
    }
  }

  return {
    pending: parseInt(row?.pending, 10) || 0,
    upcoming: parseInt(row?.upcoming, 10) || 0,
    today: parseInt(row?.today, 10) || 0,
    premium_active: parseInt(row?.premium_active, 10) || 0,
    today_by_salon: todayBySalon,
  };
}

async function fetchTodayRevenue(scope) {
  if (scope.salonIds.length === 0) return 0;

  const [row] = await sequelize.query(
    `
    SELECT COALESCE(SUM(amount), 0) AS today_gross
    FROM "${SCHEMA}"."payments"
    WHERE salon_id IN (:salonIds)
      AND status = 'PAID'
      AND paid_at >= :dayStart
      AND paid_at <= :dayEnd
    `,
    {
      replacements: {
        salonIds: scope.salonIds,
        dayStart: scope.dayBounds.start,
        dayEnd: scope.dayBounds.end,
      },
      type: QueryTypes.SELECT,
    },
  );

  return round2(row?.today_gross || 0);
}

async function fetchPeriodRevenue(scope, periodOpts) {
  if (scope.salonIds.length === 0) return 0;

  if (periodOpts.key === 'lifetime') {
    const [row] = await sequelize.query(
      `
      SELECT COALESCE(SUM(amount), 0) AS period_gross
      FROM "${SCHEMA}"."payments"
      WHERE salon_id IN (:salonIds)
        AND status = 'PAID'
        AND (paid_at AT TIME ZONE :tz)::date <= :toDate
      `,
      {
        replacements: {
          salonIds: scope.salonIds,
          toDate: periodOpts.toDate,
          tz: scope.timezone,
        },
        type: QueryTypes.SELECT,
      },
    );
    return round2(row?.period_gross || 0);
  }

  const bounds = periodBounds(periodOpts.fromDate, periodOpts.toDate, scope.timezone);
  const [row] = await sequelize.query(
    `
    SELECT COALESCE(SUM(amount), 0) AS period_gross
    FROM "${SCHEMA}"."payments"
    WHERE salon_id IN (:salonIds)
      AND status = 'PAID'
      AND paid_at >= :periodStart
      AND paid_at <= :periodEnd
    `,
    {
      replacements: {
        salonIds: scope.salonIds,
        periodStart: bounds.start,
        periodEnd: bounds.end,
      },
      type: QueryTypes.SELECT,
    },
  );

  return round2(row?.period_gross || 0);
}

async function fetchCompletedBookingsInPeriod(scope, periodOpts) {
  if (scope.salonIds.length === 0) return 0;

  const replacements = {
    salonIds: scope.salonIds,
    toDate: periodOpts.toDate,
  };

  let dateFilter = 'AND booking_date <= :toDate';
  if (periodOpts.fromDate) {
    dateFilter = 'AND booking_date BETWEEN :fromDate AND :toDate';
    replacements.fromDate = periodOpts.fromDate;
  }

  const [row] = await sequelize.query(
    `
    WITH visits AS (
      SELECT COALESCE(booking_group_id, id) AS visit_key,
             MAX(CASE booking_status
               WHEN 'COMPLETED' THEN 1
               ELSE 0
             END) AS is_completed
      FROM "${SCHEMA}"."bookings"
      WHERE salon_id IN (:salonIds)
        ${dateFilter}
      GROUP BY 1
    )
    SELECT COUNT(*)::int AS completed_count
    FROM visits
    WHERE is_completed = 1
    `,
    {
      replacements,
      type: QueryTypes.SELECT,
    },
  );

  return parseInt(row?.completed_count, 10) || 0;
}

async function fetchEarnings(scope) {
  if (scope.salonIds.length === 0) {
    return {
      pending: 0,
      in_batch: 0,
      pending_total: 0,
      settled: 0,
      collected_at_salon: 0,
      platform_fee_owed: 0,
    };
  }

  const [row] = await sequelize.query(
    `
    SELECT
      COALESCE(SUM(sl.amount) FILTER (
        WHERE sl.status = 'PENDING'
          AND sl.entry_type IN ('SERVICE_SALON_NET', 'PREMIUM_SALON')
      ), 0) AS pending,
      COALESCE(SUM(sl.amount) FILTER (
        WHERE sl.status = 'IN_BATCH'
          AND sl.entry_type IN ('SERVICE_SALON_NET', 'PREMIUM_SALON')
      ), 0) AS in_batch,
      COALESCE(SUM(sl.amount) FILTER (
        WHERE sl.status = 'SETTLED'
          AND sl.entry_type IN ('SERVICE_SALON_NET', 'PREMIUM_SALON')
      ), 0) AS settled,
      COALESCE(SUM(sl.amount) FILTER (
        WHERE sl.status = 'COLLECTED'
          AND sl.entry_type IN ('SERVICE_SALON_NET', 'PREMIUM_SALON')
      ), 0) AS collected_at_salon,
      COALESCE(SUM(sl.amount) FILTER (
        WHERE sl.status = 'PENDING'
          AND sl.entry_type IN ('SERVICE_COMMISSION', 'PREMIUM_PLATFORM')
          AND p.method = 'PAY_AT_SHOP'
      ), 0) AS platform_fee_owed
    FROM "${SCHEMA}"."settlement_ledger" sl
    LEFT JOIN "${SCHEMA}"."payments" p ON p.id = sl.payment_id
    WHERE sl.salon_id IN (:salonIds)
    `,
    {
      replacements: { salonIds: scope.salonIds },
      type: QueryTypes.SELECT,
    },
  );

  const pending = round2(row?.pending || 0);
  const inBatch = round2(row?.in_batch || 0);
  const platformFeeOwed = round2(row?.platform_fee_owed || 0);
  const grossPending = round2(pending + inBatch);
  return {
    pending,
    in_batch: inBatch,
    pending_total: round2(Math.max(0, grossPending - platformFeeOwed)),
    settled: round2(row?.settled || 0),
    collected_at_salon: round2(row?.collected_at_salon || 0),
    platform_fee_owed: platformFeeOwed,
  };
}

async function fetchReputation(scope) {
  if (scope.salonIds.length === 0) {
    return { average_rating: null, review_count: 0 };
  }

  const [row] = await sequelize.query(
    `
    SELECT COUNT(*)::int AS review_count,
           ROUND(AVG(rating)::numeric, 1) AS average_rating
    FROM "${SCHEMA}"."reviews"
    WHERE salon_id IN (:salonIds)
      AND status = 'PUBLISHED'
      AND is_active = true
    `,
    {
      replacements: { salonIds: scope.salonIds },
      type: QueryTypes.SELECT,
    },
  );

  const reviewCount = parseInt(row?.review_count, 10) || 0;
  const averageRaw = row?.average_rating != null ? Number(row.average_rating) : null;
  return {
    average_rating: reviewCount > 0 && averageRaw != null ? averageRaw : null,
    review_count: reviewCount,
  };
}

async function fetchUnreadCount(userId) {
  return UserNotification.count({
    where: { user_id: userId, read_at: null },
  });
}

async function buildOwnerDashboardSummary(scope, options = {}) {
  const periodOpts = options.periodOpts || null;
  if (scope.salonIds.length === 0) {
    return emptySummary(periodOpts);
  }

  const [
    bookingAgg,
    todayGross,
    periodGross,
    completedInPeriod,
    earnings,
    reputation,
    unreadCount,
    slotsMap,
  ] = await Promise.all([
    fetchBookingAggregates(scope),
    fetchTodayRevenue(scope),
    periodOpts ? fetchPeriodRevenue(scope, periodOpts) : fetchTodayRevenue(scope),
    periodOpts ? fetchCompletedBookingsInPeriod(scope, periodOpts) : Promise.resolve(0),
    fetchEarnings(scope),
    fetchReputation(scope),
    fetchUnreadCount(scope.userId),
    getBatchAvailabilitySummariesForDate(scope.salons, scope.date),
  ]);

  const utilization = buildUtilizationAggregate(scope.salons, slotsMap);
  if (utilization.by_salon.length > 0) {
    utilization.by_salon = utilization.by_salon.map((row) => ({
      ...row,
      today_bookings: bookingAgg.today_by_salon.get(row.salon_id) || 0,
    }));
  }

  const profileCompleteness = summarizeProfileCompleteness(scope.salons);

  return {
    bookings: {
      pending: bookingAgg.pending,
      upcoming: bookingAgg.upcoming,
      today: bookingAgg.today,
      completed_in_period: completedInPeriod,
    },
    revenue: {
      today_gross: todayGross,
      period_gross: periodGross,
      period: periodOpts ? buildPeriodMeta(periodOpts) : {
        key: '7d',
        from: addDaysToDateString(scope.date, -6),
        to: scope.date,
        label: 'Last 7 days',
        granularity: 'day',
      },
    },
    earnings,
    reputation,
    premium_bookings_count: bookingAgg.premium_active,
    utilization: {
      percent: utilization.percent,
      occupied_slots: utilization.occupied_slots,
      total_slots: utilization.total_slots,
      available_slots: utilization.available_slots,
      status: utilization.status,
    },
    profile_completeness: profileCompleteness,
    notifications: { unread_count: unreadCount },
    by_salon: scope.salonIds.length > 1
      ? utilization.by_salon.map((s) => ({
        salon_id: s.salon_id,
        salon_name: s.salon_name,
        today_bookings: s.today_bookings,
        utilization_percent: s.utilization_percent,
      }))
      : [],
  };
}

module.exports = {
  buildOwnerDashboardSummary,
};
