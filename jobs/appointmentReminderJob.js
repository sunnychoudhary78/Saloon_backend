const cron = require('node-cron');
const { Op } = require('sequelize');
const { Booking, Customer, Salon, User } = require('../models');
const { sendToUserAsync } = require('../services/pushNotificationService');
const { appointmentReminder } = require('../services/pushNotificationTemplates');

const REMINDER_WINDOW_MINUTES = 60;
const REMINDER_TOLERANCE_MINUTES = 5;

function parseBookingDateTime(bookingDate, bookingTime) {
  const dateStr = typeof bookingDate === 'string'
    ? bookingDate
    : bookingDate.toISOString().slice(0, 10);
  const timeStr = typeof bookingTime === 'string'
    ? bookingTime.slice(0, 8)
    : bookingTime;
  return new Date(`${dateStr}T${timeStr}`);
}

async function processAppointmentReminders() {
  const now = new Date();
  const windowStart = new Date(now.getTime() + (REMINDER_WINDOW_MINUTES - REMINDER_TOLERANCE_MINUTES) * 60 * 1000);
  const windowEnd = new Date(now.getTime() + (REMINDER_WINDOW_MINUTES + REMINDER_TOLERANCE_MINUTES) * 60 * 1000);

  const bookings = await Booking.findAll({
    where: {
      booking_status: 'ACCEPTED',
      reminder_sent_at: null,
    },
    include: [
      {
        model: Customer,
        as: 'customer',
        include: [{ model: User, as: 'user', attributes: ['id'] }],
      },
      { model: Salon, as: 'salon', attributes: ['salon_name'] },
    ],
  });

  for (const booking of bookings) {
    const appointmentAt = parseBookingDateTime(booking.booking_date, booking.booking_time);
    if (appointmentAt < windowStart || appointmentAt > windowEnd) continue;

    const userId = booking.customer?.user?.id;
    if (!userId) continue;

    const salonName = booking.salon?.salon_name || 'the salon';
    sendToUserAsync(userId, appointmentReminder(booking, salonName));
    await booking.update({ reminder_sent_at: new Date() });
  }
}

function startAppointmentReminderJob() {
  cron.schedule('*/5 * * * *', () => {
    processAppointmentReminders().catch((err) => {
      console.error('[push] appointment reminder job failed:', err.message);
    });
  });
  console.log('[push] Appointment reminder cron scheduled (every 5 minutes)');
}

module.exports = {
  startAppointmentReminderJob,
  processAppointmentReminders,
};
