const { SalonApplication, SalonOwner } = require('../models');
const { sendToUserAsync } = require('./pushNotificationService');
const templates = require('./pushNotificationTemplates');

async function loadApplicationContext(applicationId) {
  return SalonApplication.findByPk(applicationId, {
    include: [
      {
        model: SalonOwner,
        as: 'owner',
        attributes: ['id', 'user_id'],
      },
    ],
  });
}

function ownerUserId(application) {
  return application?.owner?.user_id || null;
}

function notifySalonApplicationSubmitted(applicationId) {
  loadApplicationContext(applicationId).then((application) => {
    if (!application) return;
    const userId = ownerUserId(application);
    if (!userId) return;
    sendToUserAsync(userId, templates.salonApplicationSubmitted(application));
  }).catch((err) => console.error('[push] notifySalonApplicationSubmitted:', err.message));
}

function notifySalonApplicationApproved(applicationId) {
  loadApplicationContext(applicationId).then((application) => {
    if (!application) return;
    const userId = ownerUserId(application);
    if (!userId) return;
    sendToUserAsync(userId, templates.salonApplicationApproved(application));
  }).catch((err) => console.error('[push] notifySalonApplicationApproved:', err.message));
}

function notifySalonApplicationRejected(applicationId) {
  loadApplicationContext(applicationId).then((application) => {
    if (!application) return;
    const userId = ownerUserId(application);
    if (!userId) return;
    sendToUserAsync(userId, templates.salonApplicationRejected(application));
  }).catch((err) => console.error('[push] notifySalonApplicationRejected:', err.message));
}

module.exports = {
  notifySalonApplicationSubmitted,
  notifySalonApplicationApproved,
  notifySalonApplicationRejected,
};
