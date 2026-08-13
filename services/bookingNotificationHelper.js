const {
  Salon,
  SalonOwner,
  Customer,
  User,
  Service,
  Booking,
} = require('../models');
const { sendToUserAsync } = require('./pushNotificationService');
const templates = require('./pushNotificationTemplates');

async function loadBookingContext(bookingId) {
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
      { model: Service, as: 'service', attributes: ['service_name', 'price', 'discount_price'] },
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

function serviceEffectivePrice(service) {
  if (!service) return 0;
  const price = Number(service.price) || 0;
  const discount = service.discount_price != null ? Number(service.discount_price) : null;
  if (discount != null && discount > 0 && discount < price) return discount;
  return price;
}

function formatMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
}

async function buildNewBookingDetails(booking) {
  const groupId = booking.booking_group_id || booking.id;
  const groupRows = await Booking.findAll({
    where: { booking_group_id: groupId },
    include: [
      { model: Service, as: 'service', attributes: ['service_name', 'price', 'discount_price'] },
    ],
    order: [['created_at', 'ASC']],
  });
  const rows = groupRows.length ? groupRows : [booking];
  const serviceNames = rows
    .map((row) => row.service?.service_name)
    .filter(Boolean);
  const amount = rows.reduce((sum, row) => sum + serviceEffectivePrice(row.service), 0);
  const premium = rows.reduce((sum, row) => sum + (Number(row.premium_amount) || 0), 0)
    || Number(booking.premium_amount) || 0;
  const isPremium = rows.some((row) => row.booking_type === 'PREMIUM')
    || booking.booking_type === 'PREMIUM';

  return {
    customerName: customerName(booking),
    salonName: salonName(booking),
    serviceName: serviceNames.length ? serviceNames.join(', ') : 'Service',
    bookingDate: booking.booking_date,
    bookingTime: booking.booking_time,
    amount: formatMoney(amount + premium),
    bookingGroupId: groupId,
    salonId: booking.salon_id || booking.salon?.id,
    isPremium,
  };
}

function notifyNewBooking(bookingId) {
  loadBookingContext(bookingId)
    .then(async (booking) => {
      if (!booking) return;
      const userId = ownerUserId(booking);
      if (!userId) return;
      const details = await buildNewBookingDetails(booking);
      sendToUserAsync(userId, templates.newBooking(booking, details));
    })
    .catch((err) => console.error('[push] notifyNewBooking:', err.message));
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

function notifyBookingPayment(bookingId, amount) {
  loadBookingContext(bookingId).then((booking) => {
    if (!booking) return;
    const paid = amount || '0';
    const customerId = customerUserId(booking);
    const ownerId = ownerUserId(booking);
    if (customerId) {
      sendToUserAsync(customerId, templates.paymentSuccessful(booking, salonName(booking), paid));
    }
    if (ownerId) {
      sendToUserAsync(ownerId, templates.paymentReceived(booking, customerName(booking), paid));
    }
  }).catch((err) => console.error('[push] notifyBookingPayment:', err.message));
}

function notifyCashConfirmed({
  bookingId,
  bookedAmount,
  confirmedAmount,
  extraAmount = 0,
  notifyOwner = true,
} = {}) {
  loadBookingContext(bookingId)
    .then((booking) => {
      if (!booking) return;
      const customerId = customerUserId(booking);
      const ownerId = ownerUserId(booking);
      const confirmed = formatMoney(
        confirmedAmount != null && confirmedAmount !== ''
          ? confirmedAmount
          : bookedAmount,
      );
      if (customerId) {
        sendToUserAsync(
          customerId,
          templates.cashConfirmed(booking, salonName(booking), {
            bookedAmount,
            confirmedAmount,
            extraAmount,
          }),
        );
      }
      if (notifyOwner && ownerId) {
        sendToUserAsync(
          ownerId,
          templates.paymentReceived(booking, customerName(booking), confirmed),
        );
      }
    })
    .catch((err) => console.error('[push] notifyCashConfirmed:', err.message));
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

function notifyPayAtShopSelected(bookingId, amount) {
  loadBookingContext(bookingId).then((booking) => {
    if (!booking) return;
    const userId = ownerUserId(booking);
    if (!userId) return;
    sendToUserAsync(
      userId,
      templates.payAtShopSelected(booking, customerName(booking), amount || '0'),
    );
  }).catch((err) => console.error('[push] notifyPayAtShopSelected:', err.message));
}

module.exports = {
  notifyNewBooking,
  notifyBookingConfirmed,
  notifyBookingCancelledForOwner,
  notifyBookingCancelledForCustomer,
  notifyBookingRejected,
  notifyBookingCompleted,
  notifyPremiumPayment,
  notifyBookingPayment,
  notifyCashConfirmed,
  notifyPayAtShopSelected,
};
