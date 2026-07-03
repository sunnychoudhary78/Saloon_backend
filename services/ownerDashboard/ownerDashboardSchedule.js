const { Op } = require('sequelize');
const {
  Booking,
  Customer,
  User,
  Service,
  Salon,
  Payment,
} = require('../../models');
const { splitPayments } = require('../paymentService');
const { visitKeyFromRow } = require('./visitKey');

function mergeVisitStatus(current, next) {
  const priority = { PENDING: 1, ACCEPTED: 2, COMPLETED: 3 };
  if (!current) return next;
  const currentP = priority[current] || 99;
  const nextP = priority[next] || 99;
  return nextP < currentP ? next : current;
}

function mapPaymentStatus(payment) {
  if (!payment) return null;
  return payment.status === 'PENDING' && payment.expires_at
    && new Date(payment.expires_at).getTime() <= Date.now()
    ? 'EXPIRED'
    : payment.status;
}

function buildPaymentSummary(payments, visitId) {
  const visitPayments = payments.filter(
    (p) => p.booking_group_id === visitId || p.booking_id === visitId,
  );
  const { premium_payment: premiumPayment, salon_fee_payment: salonFeePayment } = splitPayments(
    visitPayments.map((p) => (typeof p.get === 'function' ? p.get({ plain: true }) : p)),
  );

  const method = salonFeePayment?.method || premiumPayment?.method || null;
  const requiresCashConfirmation = salonFeePayment?.method === 'PAY_AT_SHOP'
    && salonFeePayment?.status === 'PENDING';

  return {
    premium_status: mapPaymentStatus(premiumPayment),
    salon_fee_status: mapPaymentStatus(salonFeePayment),
    method,
    requires_cash_confirmation: requiresCashConfirmation,
    checkout_group_id: visitId,
  };
}

async function buildOwnerDashboardSchedule(scope, options = {}) {
  const limit = options.limit || 20;
  const fromNow = options.fromNow !== false;

  if (scope.salonIds.length === 0) {
    return {
      appointments: [],
      next: null,
      pagination: { limit, has_more: false, next_cursor: null },
    };
  }

  const where = {
    salon_id: { [Op.in]: scope.salonIds },
    booking_date: scope.date,
    booking_status: { [Op.notIn]: ['REJECTED', 'CANCELLED'] },
  };

  if (fromNow && scope.isToday) {
    where.booking_time = { [Op.gte]: scope.nowTime };
  }

  const rowLimit = limit * 5;
  const bookings = await Booking.findAll({
    where,
    include: [
      {
        model: Customer,
        as: 'customer',
        include: [{ model: User, as: 'user', attributes: ['name', 'phone'] }],
      },
      { model: Service, as: 'service', attributes: ['id', 'service_name'] },
      { model: Salon, as: 'salon', attributes: ['id', 'salon_name'] },
    ],
    order: [['booking_time', 'ASC'], ['created_at', 'ASC']],
    limit: rowLimit,
  });

  if (bookings.length === 0) {
    return {
      appointments: [],
      next: null,
      pagination: { limit, has_more: false, next_cursor: null },
    };
  }

  const visitKeys = [...new Set(bookings.map((b) => visitKeyFromRow(b)))];
  const bookingIds = bookings.map((b) => b.id);

  const payments = await Payment.findAll({
    where: {
      salon_id: { [Op.in]: scope.salonIds },
      status: { [Op.in]: ['PENDING', 'PAID'] },
      [Op.or]: [
        { booking_group_id: { [Op.in]: visitKeys } },
        { booking_id: { [Op.in]: bookingIds } },
      ],
    },
  });

  const visitsMap = new Map();
  for (const booking of bookings) {
    const plain = booking.get({ plain: true });
    const visitId = visitKeyFromRow(plain);
    if (!visitsMap.has(visitId)) {
      visitsMap.set(visitId, {
        visit_id: visitId,
        booking_date: plain.booking_date,
        booking_time: plain.booking_time,
        booking_status: plain.booking_status,
        salon: plain.salon,
        customer: {
          id: plain.customer?.id,
          name: plain.customer?.user?.name,
          phone: plain.customer?.user?.phone,
        },
        services: [],
        payment_summary: buildPaymentSummary(payments, visitId),
      });
    }

    const visit = visitsMap.get(visitId);
    visit.services.push({
      booking_id: plain.id,
      booking_number: plain.booking_number,
      service_id: plain.service?.id,
      service_name: plain.service?.service_name,
      booking_type: plain.booking_type,
      premium_amount: plain.premium_amount != null ? Number(plain.premium_amount) : null,
      premium_payment_status: plain.premium_payment_status,
    });

    if (plain.booking_status) {
      visit.booking_status = mergeVisitStatus(visit.booking_status, plain.booking_status);
    }
  }

  const appointments = [...visitsMap.values()].slice(0, limit);
  const hasMore = visitsMap.size > limit;

  const first = appointments[0];
  const next = first
    ? {
      visit_id: first.visit_id,
      starts_at: `${first.booking_date}T${String(first.booking_time).slice(0, 8)}`,
    }
    : null;

  return {
    appointments,
    next,
    pagination: {
      limit,
      has_more: hasMore,
      next_cursor: hasMore ? appointments[appointments.length - 1]?.visit_id : null,
    },
  };
}

module.exports = {
  buildOwnerDashboardSchedule,
};
