const { Booking, sequelize } = require('../models');
const { Op } = require('sequelize');

async function generateBookingNumber(transaction = null) {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `BK-${dateStr}-`;

  const last = await Booking.findOne({
    where: { booking_number: { [Op.like]: `${prefix}%` } },
    order: [['booking_number', 'DESC']],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  let seq = 1;
  if (last) {
    const parts = last.booking_number.split('-');
    seq = parseInt(parts[parts.length - 1], 10) + 1;
  }

  return `${prefix}${String(seq).padStart(4, '0')}`;
}

const VALID_TRANSITIONS = {
  PENDING: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['COMPLETED', 'CANCELLED'],
  REJECTED: [],
  CANCELLED: [],
  COMPLETED: [],
};

function canTransition(from, to) {
  return (VALID_TRANSITIONS[from] || []).includes(to);
}

module.exports = { generateBookingNumber, canTransition, VALID_TRANSITIONS };
