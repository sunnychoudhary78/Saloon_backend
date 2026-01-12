const app = require('./app');
const { sequelize } = require('./models');

const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected!');
    const env = (process.env.APP_ENV || process.env.NODE_ENV || 'development').toLowerCase();
    const suffix = env === 'production' ? 'PROD' : env === 'test' ? 'TEST' : 'DEV';
    const port = parseInt(process.env[`PORT_${suffix}`] || process.env.PORT || 3004, 10);
    app.listen(port, () => console.log(`LMS API running on ${env} at PORT ${port}`));
  } catch (error) {
    console.error('Unable to connect to DB:', error);
  }
};

startServer();
