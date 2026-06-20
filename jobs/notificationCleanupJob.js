const cron = require('node-cron');
const { Op } = require('sequelize');
const { UserNotification } = require('../models');

const RETENTION_DAYS = 30;

async function cleanupOldNotifications() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  const deleted = await UserNotification.destroy({
    where: {
      created_at: { [Op.lt]: cutoff },
    },
  });

  if (deleted > 0) {
    console.log(`[notifications] Cleaned up ${deleted} notification(s) older than ${RETENTION_DAYS} days`);
  }
}

function startNotificationCleanupJob() {
  cron.schedule('0 3 * * *', () => {
    cleanupOldNotifications().catch((err) => {
      console.error('[notifications] Cleanup job failed:', err.message);
    });
  });
  console.log('[notifications] Cleanup cron scheduled (daily at 03:00)');
}

module.exports = {
  startNotificationCleanupJob,
  cleanupOldNotifications,
};
