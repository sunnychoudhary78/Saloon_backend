const { Review, Salon, SalonOwner, Customer, User } = require('../models');
const { sendToUserAsync } = require('./pushNotificationService');
const templates = require('./pushNotificationTemplates');

async function loadReviewContext(reviewId) {
  return Review.findByPk(reviewId, {
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
    ],
  });
}

function notifyNewReview(reviewId) {
  loadReviewContext(reviewId).then((review) => {
    if (!review) return;
    const userId = review?.salon?.owner?.user_id || null;
    if (!userId) return;
    const customerName = review?.customer?.user?.name || 'A customer';
    const salonName = review?.salon?.salon_name || 'your salon';
    sendToUserAsync(userId, templates.newReview(review, customerName, salonName));
  }).catch((err) => console.error('[push] notifyNewReview:', err.message));
}

module.exports = {
  notifyNewReview,
};
