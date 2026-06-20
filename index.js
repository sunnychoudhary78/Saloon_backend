const os = require('os');
const app = require('./app');
const { sequelize } = require('./models');
const { initFirebaseAdmin } = require('./services/pushNotificationService');
const { startAppointmentReminderJob } = require('./jobs/appointmentReminderJob');
const { startNotificationCleanupJob } = require('./jobs/notificationCleanupJob');

function getLanIPv4Addresses() {
  const addresses = [];
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const addr of iface || []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        addresses.push(addr.address);
      }
    }
  }
  return addresses;
}

const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected!');
    initFirebaseAdmin();
    startAppointmentReminderJob();
    startNotificationCleanupJob();
    const env = (process.env.APP_ENV || process.env.NODE_ENV || 'development').toLowerCase();
    const { envSuffix } = require('./config/envSuffix');
    const suffix = envSuffix(env);
    const port = parseInt(process.env[`PORT_${suffix}`] || process.env.PORT || 3004, 10);
    const host = process.env.HOST || '0.0.0.0';

    app.listen(port, host, () => {
      console.log(`Salon Marketplace API running on ${env} at ${host}:${port}`);
      console.log(`  Local:   http://localhost:${port}/api`);
      for (const ip of getLanIPv4Addresses()) {
        console.log(`  Network: http://${ip}:${port}/api`);
      }
    });
  } catch (error) {
    console.error('Unable to connect to DB:', error);
  }
};

startServer();
