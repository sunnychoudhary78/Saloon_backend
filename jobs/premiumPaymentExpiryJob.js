const cron = require('node-cron');
const { processExpiredPremiumBookings } = require('../services/premiumPaymentExpiryService');
const { notifyPremiumPaymentWindowExpired } = require('../services/bookingNotificationHelper');

async function processPremiumPaymentExpiries() {
  const cancelledIds = await processExpiredPremiumBookings();
  for (const id of cancelledIds) {
    notifyPremiumPaymentWindowExpired(id);
  }
  return cancelledIds;
}

function startPremiumPaymentExpiryJob() {
  cron.schedule('* * * * *', () => {
    processPremiumPaymentExpiries().catch((err) => {
      console.error('[premium-expiry] job failed:', err.message);
    });
  });
  console.log('[premium-expiry] Payment window cron scheduled (every minute)');
}

module.exports = {
  startPremiumPaymentExpiryJob,
  processPremiumPaymentExpiries,
};
