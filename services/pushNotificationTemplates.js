const NOTIFICATION_TYPES = {
  BOOKING_CONFIRMED: 'booking_confirmed',
  APPOINTMENT_REMINDER: 'appointment_reminder',
  BOOKING_CANCELLED: 'booking_cancelled',
  PAYMENT_SUCCESSFUL: 'payment_successful',
  PROMOTIONAL_OFFER: 'promotional_offer',
  NEW_BOOKING: 'new_booking',
  PAYMENT_RECEIVED: 'payment_received',
};

const SCREENS = {
  BOOKING_DETAILS: 'booking_details',
  PROMOTIONS: 'promotions',
  OWNER_BOOKING_DETAILS: 'owner_booking_details',
  OWNER_EARNINGS: 'owner_earnings',
};

function buildPayload({ type, title, body, bookingId, screen, userRole }) {
  const data = {
    type,
    screen,
    userRole,
  };
  if (bookingId) {
    data.bookingId = String(bookingId);
  }
  return {
    notification: { title, body },
    data,
  };
}

function bookingConfirmed(booking, salonName) {
  return buildPayload({
    type: NOTIFICATION_TYPES.BOOKING_CONFIRMED,
    title: 'Booking Confirmed',
    body: `Your appointment at ${salonName} has been confirmed.`,
    bookingId: booking.id,
    screen: SCREENS.BOOKING_DETAILS,
    userRole: 'customer',
  });
}

function appointmentReminder(booking, salonName) {
  return buildPayload({
    type: NOTIFICATION_TYPES.APPOINTMENT_REMINDER,
    title: 'Appointment Reminder',
    body: `Your appointment at ${salonName} starts in about 1 hour.`,
    bookingId: booking.id,
    screen: SCREENS.BOOKING_DETAILS,
    userRole: 'customer',
  });
}

function bookingCancelledCustomer(booking, salonName) {
  return buildPayload({
    type: NOTIFICATION_TYPES.BOOKING_CANCELLED,
    title: 'Booking Cancelled',
    body: `Your appointment at ${salonName} was cancelled.`,
    bookingId: booking.id,
    screen: SCREENS.BOOKING_DETAILS,
    userRole: 'customer',
  });
}

function bookingCancelledOwner(booking, customerName) {
  return buildPayload({
    type: NOTIFICATION_TYPES.BOOKING_CANCELLED,
    title: 'Booking Cancelled',
    body: `${customerName} cancelled their booking.`,
    bookingId: booking.id,
    screen: SCREENS.OWNER_BOOKING_DETAILS,
    userRole: 'salon_owner',
  });
}

function paymentSuccessful(booking, salonName, amount) {
  return buildPayload({
    type: NOTIFICATION_TYPES.PAYMENT_SUCCESSFUL,
    title: 'Payment Successful',
    body: `Payment of ₹${amount} for ${salonName} was successful.`,
    bookingId: booking.id,
    screen: SCREENS.BOOKING_DETAILS,
    userRole: 'customer',
  });
}

function promotionalOffer(title, body) {
  return buildPayload({
    type: NOTIFICATION_TYPES.PROMOTIONAL_OFFER,
    title,
    body,
    screen: SCREENS.PROMOTIONS,
    userRole: 'customer',
  });
}

function newBooking(booking, customerName, salonName) {
  return buildPayload({
    type: NOTIFICATION_TYPES.NEW_BOOKING,
    title: 'New Booking Request',
    body: `${customerName} requested an appointment at ${salonName}.`,
    bookingId: booking.id,
    screen: SCREENS.OWNER_BOOKING_DETAILS,
    userRole: 'salon_owner',
  });
}

function paymentReceived(booking, customerName, amount) {
  return buildPayload({
    type: NOTIFICATION_TYPES.PAYMENT_RECEIVED,
    title: 'Payment Received',
    body: `Received ₹${amount} from ${customerName}.`,
    bookingId: booking.id,
    screen: SCREENS.OWNER_EARNINGS,
    userRole: 'salon_owner',
  });
}

module.exports = {
  NOTIFICATION_TYPES,
  SCREENS,
  bookingConfirmed,
  appointmentReminder,
  bookingCancelledCustomer,
  bookingCancelledOwner,
  paymentSuccessful,
  promotionalOffer,
  newBooking,
  paymentReceived,
};
