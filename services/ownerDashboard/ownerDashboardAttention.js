const { sequelize, SalonPayoutAccount } = require('../../models');
const { QueryTypes } = require('sequelize');
const { summarizeProfileCompleteness } = require('./ownerDashboardProfileCompleteness');

const SCHEMA = process.env.DB_SCHEMA || 'salon_booking_schema';

function emptyAttention() {
  return { total_count: 0, sections: [] };
}

async function fetchAttentionCounts(scope) {
  if (scope.salonIds.length === 0) {
    return { pending: 0, cash: 0, premium_unpaid: 0 };
  }

  const [row] = await sequelize.query(
    `
    SELECT
      (SELECT COUNT(DISTINCT COALESCE(booking_group_id, id))::int
        FROM "${SCHEMA}"."bookings"
        WHERE salon_id IN (:salonIds) AND booking_status = 'PENDING'
      ) AS pending,
      (SELECT COUNT(DISTINCT p.id)::int
        FROM "${SCHEMA}"."payments" p
        WHERE p.salon_id IN (:salonIds)
          AND p.method = 'PAY_AT_SHOP'
          AND p.status = 'PENDING'
          AND p.checkout_kind = 'SALON_FEE'
          AND EXISTS (
            SELECT 1 FROM "${SCHEMA}"."bookings" b
            WHERE b.booking_group_id = p.booking_group_id
              AND b.booking_status IN ('ACCEPTED', 'COMPLETED')
          )
      ) AS cash,
      (SELECT COUNT(DISTINCT COALESCE(booking_group_id, id))::int
        FROM "${SCHEMA}"."bookings"
        WHERE salon_id IN (:salonIds)
          AND booking_type = 'PREMIUM'
          AND premium_payment_status IN ('PENDING', 'FAILED')
          AND booking_status = 'ACCEPTED'
          AND premium_amount > 0
      ) AS premium_unpaid
    `,
    {
      replacements: { salonIds: scope.salonIds },
      type: QueryTypes.SELECT,
    },
  );

  return {
    pending: parseInt(row?.pending, 10) || 0,
    cash: parseInt(row?.cash, 10) || 0,
    premium_unpaid: parseInt(row?.premium_unpaid, 10) || 0,
  };
}

async function fetchPendingPreviews(scope, limit) {
  if (scope.salonIds.length === 0) return [];

  return sequelize.query(
    `
    SELECT DISTINCT ON (COALESCE(b.booking_group_id, b.id))
      b.id AS booking_id,
      b.booking_number,
      COALESCE(b.booking_group_id, b.id) AS visit_id,
      b.booking_date,
      b.booking_time,
      b.booking_type,
      b.created_at,
      u.name AS customer_name,
      sal.salon_name,
      (b.booking_type = 'PREMIUM') AS is_premium
    FROM "${SCHEMA}"."bookings" b
    JOIN "${SCHEMA}"."customers" c ON c.id = b.customer_id
    JOIN "${SCHEMA}"."users" u ON u.id = c.user_id
    JOIN "${SCHEMA}"."salons" sal ON sal.id = b.salon_id
    WHERE b.salon_id IN (:salonIds)
      AND b.booking_status = 'PENDING'
    ORDER BY COALESCE(b.booking_group_id, b.id), b.created_at ASC
    LIMIT :limit
    `,
    {
      replacements: { salonIds: scope.salonIds, limit },
      type: QueryTypes.SELECT,
    },
  );
}

async function fetchCashPreviews(scope, limit) {
  if (scope.salonIds.length === 0) return [];

  return sequelize.query(
    `
    SELECT p.id AS payment_id,
           p.booking_group_id AS visit_id,
           p.amount,
           u.name AS customer_name,
           sal.salon_name
    FROM "${SCHEMA}"."payments" p
    JOIN "${SCHEMA}"."customers" c ON c.id = p.customer_id
    JOIN "${SCHEMA}"."users" u ON u.id = c.user_id
    JOIN "${SCHEMA}"."salons" sal ON sal.id = p.salon_id
    WHERE p.salon_id IN (:salonIds)
      AND p.method = 'PAY_AT_SHOP'
      AND p.status = 'PENDING'
      AND p.checkout_kind = 'SALON_FEE'
      AND EXISTS (
        SELECT 1 FROM "${SCHEMA}"."bookings" b
        WHERE b.booking_group_id = p.booking_group_id
          AND b.booking_status IN ('ACCEPTED', 'COMPLETED')
      )
    ORDER BY p.created_at ASC
    LIMIT :limit
    `,
    {
      replacements: { salonIds: scope.salonIds, limit },
      type: QueryTypes.SELECT,
    },
  );
}

async function fetchPremiumUnpaidPreviews(scope, limit) {
  if (scope.salonIds.length === 0) return [];

  return sequelize.query(
    `
    SELECT DISTINCT ON (COALESCE(b.booking_group_id, b.id))
      b.id AS booking_id,
      b.booking_number,
      COALESCE(b.booking_group_id, b.id) AS visit_id,
      b.booking_date,
      b.booking_time,
      b.premium_amount,
      b.premium_payment_status,
      u.name AS customer_name,
      sal.salon_name
    FROM "${SCHEMA}"."bookings" b
    JOIN "${SCHEMA}"."customers" c ON c.id = b.customer_id
    JOIN "${SCHEMA}"."users" u ON u.id = c.user_id
    JOIN "${SCHEMA}"."salons" sal ON sal.id = b.salon_id
    WHERE b.salon_id IN (:salonIds)
      AND b.booking_type = 'PREMIUM'
      AND b.premium_payment_status IN ('PENDING', 'FAILED')
      AND b.booking_status = 'ACCEPTED'
      AND b.premium_amount > 0
    ORDER BY COALESCE(b.booking_group_id, b.id), b.booking_time ASC
    LIMIT :limit
    `,
    {
      replacements: { salonIds: scope.salonIds, limit },
      type: QueryTypes.SELECT,
    },
  );
}

async function fetchPayoutIssues(scope) {
  const account = await SalonPayoutAccount.findOne({
    where: { salon_owner_id: scope.owner.id, is_primary: true },
  });

  if (!account) {
    return {
      count: 1,
      items: [{
        issue: 'missing',
        message: 'Add a payout account to receive settlements',
      }],
    };
  }

  if (account.verification_status === 'REJECTED') {
    return {
      count: 1,
      items: [{
        issue: 'rejected',
        message: 'Payout account verification was rejected — please update your details',
        verification_status: account.verification_status,
      }],
    };
  }

  if (account.verification_status === 'PENDING') {
    return {
      count: 1,
      items: [{
        issue: 'pending_verification',
        message: 'Payout account is pending verification',
        verification_status: account.verification_status,
      }],
    };
  }

  return { count: 0, items: [] };
}

async function buildOwnerDashboardAttention(scope, options = {}) {
  const previewLimit = options.previewLimit || 5;

  if (scope.salonIds.length === 0) {
    const payout = await fetchPayoutIssues(scope);
    if (payout.count === 0) {
      return emptyAttention();
    }
    const sections = [
      {
        type: 'payout_account',
        count: payout.count,
        severity: 'medium',
        items: payout.items,
      },
    ];
    return {
      total_count: payout.count,
      sections,
    };
  }

  const [
    counts,
    pendingItems,
    cashItems,
    premiumItems,
    payout,
    profileSummary,
  ] = await Promise.all([
    fetchAttentionCounts(scope),
    fetchPendingPreviews(scope, previewLimit),
    fetchCashPreviews(scope, previewLimit),
    fetchPremiumUnpaidPreviews(scope, previewLimit),
    fetchPayoutIssues(scope),
    Promise.resolve(summarizeProfileCompleteness(scope.salons)),
  ]);

  const profileItems = profileSummary.salons.slice(0, previewLimit).map((s) => ({
    salon_id: s.salon_id,
    salon_name: s.salon_name,
    missing: s.missing,
    completeness_percent: s.completeness_percent,
  }));

  const sections = [
    {
      type: 'pending_bookings',
      count: counts.pending,
      severity: 'high',
      items: pendingItems.map((row) => ({
        visit_id: row.visit_id,
        booking_id: row.booking_id,
        booking_number: row.booking_number,
        customer_name: row.customer_name,
        salon_name: row.salon_name,
        booking_date: row.booking_date,
        booking_time: row.booking_time,
        created_at: row.created_at,
        is_premium: Boolean(row.is_premium),
      })),
    },
    {
      type: 'cash_confirmations_pending',
      count: counts.cash,
      severity: 'high',
      items: cashItems.map((row) => ({
        visit_id: row.visit_id,
        payment_id: row.payment_id,
        customer_name: row.customer_name,
        salon_name: row.salon_name,
        amount: Number(row.amount),
      })),
    },
    {
      type: 'premium_unpaid',
      count: counts.premium_unpaid,
      severity: 'medium',
      items: premiumItems.map((row) => ({
        visit_id: row.visit_id,
        booking_id: row.booking_id,
        booking_number: row.booking_number,
        customer_name: row.customer_name,
        salon_name: row.salon_name,
        booking_date: row.booking_date,
        booking_time: row.booking_time,
        premium_amount: Number(row.premium_amount),
        premium_payment_status: row.premium_payment_status,
      })),
    },
    {
      type: 'payout_account',
      count: payout.count,
      severity: 'medium',
      items: payout.items,
    },
    {
      type: 'profile_completeness',
      count: profileSummary.incomplete_count,
      severity: 'low',
      items: profileItems,
    },
  ];

  const totalCount = sections.reduce((sum, section) => sum + section.count, 0);

  return {
    total_count: totalCount,
    sections,
  };
}

module.exports = {
  buildOwnerDashboardAttention,
};
