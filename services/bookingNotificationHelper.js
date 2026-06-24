const {
  Salon,
  SalonOwner,
  Customer,
  User,
  Service,
} = require('../models');
const { sendToUserAsync } = require('./pushNotificationService');
const templates = require('./pushNotificationTemplates');

async function loadBookingContext(bookingId) {
  const { Booking } = require('../models');
  return Booking.findByPk(bookingId, {
    include: [
      {
        model: Customer,
        as: 'customer',
        include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
      },
      {
        model: Salon,
        as: 'salon',
        attributes: ['id', 'salon_name', 'owner_id'],
        include: [
          {
            model: SalonOwner,
            as: 'owner',
            attributes: ['id', 'user_id'],
          },
        ],
      },
      { model: Service, as: 'service', attributes: ['service_name'] },
    ],
  });
}

function ownerUserId(booking) {
  return booking?.salon?.owner?.user_id || null;
}

function customerUserId(booking) {
  return booking?.customer?.user?.id || null;
}

function salonName(booking) {
  return booking?.salon?.salon_name || 'the salon';
}

function customerName(booking) {
  return booking?.customer?.user?.name || 'A customer';
}

function notifyNewBooking(bookingId) {
  loadBookingContext(bookingId).then((booking) => {
    if (!booking) return;
    const userId = ownerUserId(booking);
    if (!userId) return;
    sendToUserAsync(userId, templates.newBooking(booking, customerName(booking), salonName(booking)));
  }).catch((err) => console.error('[push] notifyNewBooking:', err.message));
}

function notifyBookingConfirmed(bookingId) {
  loadBookingContext(bookingId).then((booking) => {
    if (!booking) return;
    const userId = customerUserId(booking);
    if (!userId) return;
    sendToUserAsync(userId, templates.bookingConfirmed(booking, salonName(booking)));
  }).catch((err) => console.error('[push] notifyBookingConfirmed:', err.message));
}

function notifyBookingCancelledForOwner(bookingId) {
  loadBookingContext(bookingId).then((booking) => {
    if (!booking) return;
    const userId = ownerUserId(booking);
    if (!userId) return;
    sendToUserAsync(userId, templates.bookingCancelledOwner(booking, customerName(booking)));
  }).catch((err) => console.error('[push] notifyBookingCancelledForOwner:', err.message));
}

function notifyBookingCancelledForCustomer(bookingId) {
  loadBookingContext(bookingId).then((booking) => {
    if (!booking) return;
    const userId = customerUserId(booking);
    if (!userId) return;
    sendToUserAsync(userId, templates.bookingCancelledCustomer(booking, salonName(booking)));
  }).catch((err) => console.error('[push] notifyBookingCancelledForCustomer:', err.message));
}

function notifyBookingRejected(bookingId) {
  loadBookingContext(bookingId).then((booking) => {
    if (!booking) return;
    const userId = customerUserId(booking);
    if (!userId) return;
    sendToUserAsync(userId, templates.bookingRejected(booking, salonName(booking)));
  }).catch((err) => console.error('[push] notifyBookingRejected:', err.message));
}

function notifyBookingCompleted(bookingId) {
  loadBookingContext(bookingId).then((booking) => {
    if (!booking) return;
    const userId = customerUserId(booking);
    if (!userId) return;
    sendToUserAsync(userId, templates.bookingCompleted(booking, salonName(booking)));
  }).catch((err) => console.error('[push] notifyBookingCompleted:', err.message));
}

function notifyPremiumPayment(bookingId) {
  loadBookingContext(bookingId).then((booking) => {
    if (!booking) return;
    if (booking.premium_payment_status !== 'PAID') return;
    const amount = booking.premium_amount || '0';
    const customerId = customerUserId(booking);
    const ownerId = ownerUserId(booking);
    if (customerId) {
      sendToUserAsync(customerId, templates.paymentSuccessful(booking, salonName(booking), amount));
    }
    if (ownerId) {
      sendToUserAsync(ownerId, templates.paymentReceived(booking, customerName(booking), amount));
    }
  }).catch((err) => console.error('[push] notifyPremiumPayment:', err.message));
}

module.exports = {
  notifyNewBooking,
  notifyBookingConfirmed,
  notifyBookingCancelledForOwner,
  notifyBookingCancelledForCustomer,
  notifyBookingRejected,
  notifyBookingCompleted,
  notifyPremiumPayment,
};
