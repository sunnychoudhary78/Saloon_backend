'use strict';

/** Maps APP_ENV / NODE_ENV to the DB_* / PORT_* suffix used in .env */
function envSuffix(appEnv) {
  const e = (appEnv || process.env.APP_ENV || process.env.NODE_ENV || 'development').toLowerCase();
  if (e === 'production') return 'PROD';
  if (e === 'uat') return 'UAT';
  if (e === 'test') return 'TEST';
  return 'DEV';
}

module.exports = { envSuffix };
