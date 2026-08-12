const NOTIFICATION_TYPES = {
  BOOKING_CONFIRMED: 'booking_confirmed',
  BOOKING_REJECTED: 'booking_rejected',
  BOOKING_COMPLETED: 'booking_completed',
  APPOINTMENT_REMINDER: 'appointment_reminder',
  BOOKING_CANCELLED: 'booking_cancelled',
  PAYMENT_SUCCESSFUL: 'payment_successful',
  PROMOTIONAL_OFFER: 'promotional_offer',
  NEW_BOOKING: 'new_booking',
  PAYMENT_RECEIVED: 'payment_received',
  PAY_AT_SHOP_SELECTED: 'pay_at_shop_selected',
  SALON_APPLICATION_SUBMITTED: 'salon_application_submitted',
  SALON_APPLICATION_APPROVED: 'salon_application_approved',
  SALON_APPLICATION_REJECTED: 'salon_application_rejected',
  NEW_REVIEW: 'new_review',
};

const SCREENS = {
  BOOKING_DETAILS: 'booking_details',
  PROMOTIONS: 'promotions',
  OWNER_BOOKING_DETAILS: 'owner_booking_details',
  OWNER_EARNINGS: 'owner_earnings',
  OWNER_DASHBOARD: 'owner_dashboard',
  OWNER_REVIEWS: 'owner_reviews',
};

function buildPayload({
  type,
  title,
  body,
  bookingId,
  applicationId,
  salonId,
  screen,
  userRole,
  extraData = {},
}) {
  const data = {
    type,
    screen,
    userRole,
    ...extraData,
  };
  if (bookingId) {
    data.bookingId = String(bookingId);
  }
  if (applicationId) {
    data.applicationId = String(applicationId);
  }
  if (salonId) {
    data.salonId = String(salonId);
  }
  return {
    notification: { title, body },
    data,
  };
}

function normalizeApplicationType(type) {
  if (type === 'CLOSE') return 'DEACTIVATE';
  return type || 'CREATE';
}

function applicationLabel(applicationType) {
  switch (normalizeApplicationType(applicationType)) {
    case 'UPDATE':
      return 'salon update';
    case 'DEACTIVATE':
      return 'salon deactivation';
    case 'ACTIVATE':
      return 'salon activation';
    default:
      return 'salon application';
  }
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

function bookingRejected(booking, salonName) {
  return buildPayload({
    type: NOTIFICATION_TYPES.BOOKING_REJECTED,
    title: 'Booking Declined',
    body: `Your appointment request at ${salonName} was declined.`,
    bookingId: booking.id,
    screen: SCREENS.BOOKING_DETAILS,
    userRole: 'customer',
  });
}

function bookingCompleted(booking, salonName) {
  return buildPayload({
    type: NOTIFICATION_TYPES.BOOKING_COMPLETED,
    title: 'Appointment Completed',
    body: `Your appointment at ${salonName} is complete. We hope you enjoyed it!`,
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

function newBooking(booking, details = {}) {
  const customerName = details.customerName || 'A customer';
  const serviceName = details.serviceName || 'Service';
  const bookingDate = details.bookingDate || booking.booking_date || '';
  const bookingTime = details.bookingTime || booking.booking_time || '';
  const amount = details.amount != null ? String(details.amount) : '';
  const when = [bookingDate, bookingTime].filter(Boolean).join(' ');
  const amountPart = amount ? ` · ₹${amount}` : '';
  const body = `${customerName} · ${serviceName}${when ? ` · ${when}` : ''}${amountPart}`;

  return buildPayload({
    type: NOTIFICATION_TYPES.NEW_BOOKING,
    title: 'New Booking Request',
    body,
    bookingId: booking.id,
    salonId: details.salonId || booking.salon_id || booking.salon?.id,
    screen: SCREENS.OWNER_BOOKING_DETAILS,
    userRole: 'salon_owner',
    extraData: {
      customerName,
      serviceName,
      bookingDate: String(bookingDate || ''),
      bookingTime: String(bookingTime || ''),
      amount,
      bookingGroupId: String(details.bookingGroupId || booking.booking_group_id || booking.id),
      actions: 'accept,reject',
      channelId: 'catchy_urgent_bookings_v5',
      sound: 'booking_urgent',
      priority: 'max',
    },
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

function payAtShopSelected(booking, customerName, amount) {
  const amountPart = amount ? ` · ₹${amount}` : '';
  return buildPayload({
    type: NOTIFICATION_TYPES.PAY_AT_SHOP_SELECTED,
    title: 'Pay at salon selected',
    body: `${customerName} will pay at the salon${amountPart}. Confirm cash when received.`,
    bookingId: booking.id,
    salonId: booking.salon_id || booking.salon?.id,
    screen: SCREENS.OWNER_BOOKING_DETAILS,
    userRole: 'salon_owner',
    extraData: {
      bookingGroupId: String(booking.booking_group_id || booking.id),
    },
  });
}

function salonApplicationSubmitted(application) {
  const name = application.salon_name || 'your salon';
  const label = applicationLabel(application.application_type);
  return buildPayload({
    type: NOTIFICATION_TYPES.SALON_APPLICATION_SUBMITTED,
    title: 'Application Submitted',
    body: `Your ${label} for ${name} is pending admin approval.`,
    applicationId: application.id,
    salonId: application.salon_id,
    screen: SCREENS.OWNER_DASHBOARD,
    userRole: 'salon_owner',
  });
}

function salonApplicationApproved(application) {
  const name = application.salon_name || 'your salon';
  const type = normalizeApplicationType(application.application_type);
  let title = 'Salon Approved';
  let body = `Your salon '${name}' has been approved. You can start accepting bookings.`;

  if (type === 'UPDATE') {
    title = 'Salon Update Approved';
    body = `Your changes to '${name}' have been approved.`;
  } else if (type === 'DEACTIVATE') {
    title = 'Salon Deactivated';
    body = `Your salon '${name}' has been deactivated.`;
  } else if (type === 'ACTIVATE') {
    title = 'Salon Activated';
    body = `Your salon '${name}' has been reactivated.`;
  }

  return buildPayload({
    type: NOTIFICATION_TYPES.SALON_APPLICATION_APPROVED,
    title,
    body,
    applicationId: application.id,
    salonId: application.salon_id,
    screen: SCREENS.OWNER_DASHBOARD,
    userRole: 'salon_owner',
  });
}

function salonApplicationRejected(application) {
  const name = application.salon_name || 'your salon';
  const label = applicationLabel(application.application_type);
  const reason = application.rejection_reason
    ? ` Reason: ${application.rejection_reason}`
    : '';
  return buildPayload({
    type: NOTIFICATION_TYPES.SALON_APPLICATION_REJECTED,
    title: 'Application Rejected',
    body: `Your ${label} for ${name} was not approved.${reason}`,
    applicationId: application.id,
    salonId: application.salon_id,
    screen: SCREENS.OWNER_DASHBOARD,
    userRole: 'salon_owner',
  });
}

function newReview(review, customerName, salonName) {
  const rating = review.rating != null ? review.rating : '';
  return buildPayload({
    type: NOTIFICATION_TYPES.NEW_REVIEW,
    title: 'New Review',
    body: `${customerName} left a ${rating}-star review for ${salonName}.`,
    salonId: review.salon_id,
    screen: SCREENS.OWNER_REVIEWS,
    userRole: 'salon_owner',
  });
}

module.exports = {
  NOTIFICATION_TYPES,
  SCREENS,
  bookingConfirmed,
  bookingRejected,
  bookingCompleted,
  appointmentReminder,
  bookingCancelledCustomer,
  bookingCancelledOwner,
  paymentSuccessful,
  promotionalOffer,
  newBooking,
  paymentReceived,
  payAtShopSelected,
  salonApplicationSubmitted,
  salonApplicationApproved,
  salonApplicationRejected,
  newReview,
};
