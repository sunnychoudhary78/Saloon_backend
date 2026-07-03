const { sequelize } = require('../../models');
const { QueryTypes } = require('sequelize');
const { addDaysToDateString } = require('./dateWindow');

const SCHEMA = process.env.DB_SCHEMA || 'salon_booking_schema';
const CACHE_TTL_MS = parseInt(process.env.OWNER_DASHBOARD_PERFORMANCE_CACHE_TTL_MS, 10) || 60_000;

const performanceCache = new Map();

function cacheKey(scope, days) {
  const salonKey = scope.scopedSalonId || scope.salonIds.join(',') || 'none';
  return `${scope.owner.id}:${salonKey}:${days}:${scope.timezone}`;
}

function getCachedPerformance(scope, days) {
  const key = cacheKey(scope, days);
  const entry = performanceCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    performanceCache.delete(key);
    return null;
  }
  return { ...entry.value, cached: true };
}

function setCachedPerformance(scope, days, value) {
  const key = cacheKey(scope, days);
  performanceCache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function fillDateSeries(rows, fromDate, days, valueKey = 'count') {
  const byDate = new Map(rows.map((r) => [String(r.date).slice(0, 10), r]));
  const series = [];
  for (let i = 0; i < days; i += 1) {
    const date = addDaysToDateString(fromDate, i);
    const row = byDate.get(date);
    series.push({
      date,
      [valueKey]: valueKey === 'amount'
        ? round2(row?.amount || 0)
        : parseInt(row?.count, 10) || 0,
    });
  }
  return series;
}

async function fetchBookingTrend(scope, fromDate, toDate) {
  if (scope.salonIds.length === 0) return [];

  return sequelize.query(
    `
    WITH visits AS (
      SELECT COALESCE(booking_group_id, id) AS visit_key,
             booking_date
      FROM "${SCHEMA}"."bookings"
      WHERE salon_id = ANY(:salonIds)
        AND booking_date BETWEEN :fromDate AND :toDate
        AND booking_status NOT IN ('REJECTED', 'CANCELLED')
      GROUP BY 1, 2
    )
    SELECT booking_date AS date, COUNT(*)::int AS count
    FROM visits
    GROUP BY booking_date
    ORDER BY booking_date
    `,
    {
      replacements: {
        salonIds: scope.salonIds,
        fromDate,
        toDate,
      },
      type: QueryTypes.SELECT,
    },
  );
}

async function fetchRevenueTrend(scope, fromDate, toDate) {
  if (scope.salonIds.length === 0) return [];

  return sequelize.query(
    `
    SELECT (paid_at AT TIME ZONE :tz)::date AS date,
           COALESCE(SUM(amount), 0) AS amount
    FROM "${SCHEMA}"."payments"
    WHERE salon_id = ANY(:salonIds)
      AND status = 'PAID'
      AND (paid_at AT TIME ZONE :tz)::date BETWEEN :fromDate AND :toDate
    GROUP BY 1
    ORDER BY 1
    `,
    {
      replacements: {
        salonIds: scope.salonIds,
        fromDate,
        toDate,
        tz: scope.timezone,
      },
      type: QueryTypes.SELECT,
    },
  );
}

async function fetchTopServices(scope, fromDate, toDate) {
  if (scope.salonIds.length === 0) return [];

  const rows = await sequelize.query(
    `
    SELECT b.service_id,
           MAX(s.service_name) AS service_name,
           COUNT(DISTINCT COALESCE(b.booking_group_id, b.id))::int AS booking_count,
           COALESCE(SUM(pli.gross_amount) FILTER (WHERE p.status = 'PAID'), 0) AS revenue
    FROM "${SCHEMA}"."bookings" b
    JOIN "${SCHEMA}"."services" s ON s.id = b.service_id
    LEFT JOIN "${SCHEMA}"."payment_line_items" pli ON pli.booking_id = b.id
    LEFT JOIN "${SCHEMA}"."payments" p ON p.id = pli.payment_id AND p.status = 'PAID'
    WHERE b.salon_id = ANY(:salonIds)
      AND b.booking_date BETWEEN :fromDate AND :toDate
      AND b.booking_status NOT IN ('REJECTED', 'CANCELLED')
    GROUP BY b.service_id
    ORDER BY booking_count DESC, revenue DESC
    LIMIT 5
    `,
    {
      replacements: {
        salonIds: scope.salonIds,
        fromDate,
        toDate,
      },
      type: QueryTypes.SELECT,
    },
  );

  return rows.map((row, index) => ({
    service_id: row.service_id,
    service_name: row.service_name,
    booking_count: parseInt(row.booking_count, 10) || 0,
    revenue: round2(row.revenue),
    rank: index + 1,
  }));
}

async function fetchCustomerMix(scope, fromDate) {
  if (scope.salonIds.length === 0) {
    return { new: 0, returning: 0, total_active: 0, new_percent: 0 };
  }

  const [row] = await sequelize.query(
    `
    WITH first_visit AS (
      SELECT customer_id,
             MIN(booking_date) AS first_date
      FROM "${SCHEMA}"."bookings"
      WHERE salon_id = ANY(:salonIds)
        AND booking_status NOT IN ('REJECTED', 'CANCELLED')
      GROUP BY customer_id
    ),
    active_in_period AS (
      SELECT DISTINCT customer_id
      FROM "${SCHEMA}"."bookings"
      WHERE salon_id = ANY(:salonIds)
        AND booking_date >= :fromDate
        AND booking_date <= :toDate
        AND booking_status NOT IN ('REJECTED', 'CANCELLED')
    )
    SELECT
      COUNT(*) FILTER (WHERE fv.first_date >= :fromDate)::int AS new_customers,
      COUNT(*) FILTER (WHERE fv.first_date < :fromDate)::int AS returning_customers,
      COUNT(*)::int AS total_active
    FROM active_in_period ap
    JOIN first_visit fv ON fv.customer_id = ap.customer_id
    `,
    {
      replacements: {
        salonIds: scope.salonIds,
        fromDate,
        toDate: scope.date,
      },
      type: QueryTypes.SELECT,
    },
  );

  const newCustomers = parseInt(row?.new_customers, 10) || 0;
  const returning = parseInt(row?.returning_customers, 10) || 0;
  const totalActive = parseInt(row?.total_active, 10) || 0;

  return {
    new: newCustomers,
    returning,
    total_active: totalActive,
    new_percent: totalActive > 0 ? round2((newCustomers / totalActive) * 100) : 0,
  };
}

async function buildOwnerDashboardPerformance(scope, options = {}) {
  const days = options.days || 7;
  const cached = getCachedPerformance(scope, days);
  if (cached) return cached;

  const toDate = scope.date;
  const fromDate = addDaysToDateString(toDate, -(days - 1));

  if (scope.salonIds.length === 0) {
    const empty = {
      period: { days, from: fromDate, to: toDate },
      booking_trend: fillDateSeries([], fromDate, days, 'count'),
      revenue_trend: fillDateSeries([], fromDate, days, 'amount'),
      top_services: [],
      customers: { new: 0, returning: 0, total_active: 0, new_percent: 0 },
      cached: false,
    };
    return empty;
  }

  const [
    bookingRows,
    revenueRows,
    topServices,
    customers,
  ] = await Promise.all([
    fetchBookingTrend(scope, fromDate, toDate),
    fetchRevenueTrend(scope, fromDate, toDate),
    fetchTopServices(scope, fromDate, toDate),
    fetchCustomerMix(scope, fromDate),
  ]);

  const result = {
    period: { days, from: fromDate, to: toDate },
    booking_trend: fillDateSeries(bookingRows, fromDate, days, 'count'),
    revenue_trend: fillDateSeries(
      revenueRows.map((r) => ({ date: r.date, amount: r.amount })),
      fromDate,
      days,
      'amount',
    ),
    top_services: topServices,
    customers,
    cached: false,
  };

  setCachedPerformance(scope, days, result);
  return result;
}

function clearPerformanceCache() {
  performanceCache.clear();
}

module.exports = {
  buildOwnerDashboardPerformance,
  clearPerformanceCache,
};
