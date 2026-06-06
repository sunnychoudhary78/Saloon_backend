require('dotenv').config();

const { envSuffix } = require('./envSuffix');

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';
const appEnv = (process.env.APP_ENV || 'development').toLowerCase();
const suffixFor = (e) => envSuffix(e);
const defFor = (e) => {
  const env = e.toLowerCase();
  if (env === 'uat') return 'salon_booking_uat_db';
  if (env === 'production') return 'salon_booking_prod_db';
  return 'salon_booking_db';
};
const build = (e) => {
  const s = suffixFor(e);
  return {
    username: process.env[`DB_USER_${s}`] || process.env.DB_USER || 'postgres',
    password: process.env[`DB_PASSWORD_${s}`] || process.env.DB_PASSWORD || 'your_password',
    database: process.env[`DB_NAME_${s}`] || process.env.DB_NAME || defFor(e),
    host: process.env[`DB_HOST_${s}`] || process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env[`DB_PORT_${s}`] || process.env.DB_PORT || 5432, 10),
    dialect: 'postgres',
    define: { schema },
    migrationStorageTableSchema: schema,
    searchPath: schema,
  };
};

const cfg = {
  development: build('development'),
  test: build('test'),
  uat: build('uat'),
  production: build('production'),
};

cfg._selected = build(appEnv);

module.exports = cfg;
