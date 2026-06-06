require('dotenv').config();
const { execSync } = require('child_process');
const { Sequelize } = require('sequelize');

const { envSuffix } = require('../config/envSuffix');

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';
const suffix = envSuffix(process.env.APP_ENV || 'development');

const dbName = process.env[`DB_NAME_${suffix}`] || process.env.DB_NAME || 'salon_booking_db';
const dbUser = process.env[`DB_USER_${suffix}`] || process.env.DB_USER || 'salonbookinguser';
const dbPassword = process.env[`DB_PASSWORD_${suffix}`] || process.env.DB_PASSWORD;
const dbHost = process.env[`DB_HOST_${suffix}`] || process.env.DB_HOST || '127.0.0.1';
const dbPort = process.env[`DB_PORT_${suffix}`] || process.env.DB_PORT || 5432;

async function resetSchema() {
  const sequelize = new Sequelize(dbName, dbUser, dbPassword, {
    host: dbHost,
    port: dbPort,
    dialect: 'postgres',
    logging: false,
  });

  try {
    console.log(`Dropping schema ${schema}...`);
    await sequelize.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    console.log(`Creating schema ${schema}...`);
    await sequelize.query(`CREATE SCHEMA ${schema} AUTHORIZATION ${dbUser}`);
    await sequelize.query(`GRANT USAGE ON SCHEMA ${schema} TO ${dbUser}`);
    await sequelize.query(`GRANT CREATE ON SCHEMA ${schema} TO ${dbUser}`);
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    console.log('Schema reset complete.');
  } finally {
    await sequelize.close();
  }
}

async function main() {
  const appEnv = (process.env.APP_ENV || 'development').toLowerCase();
  const cliEnv = { ...process.env, NODE_ENV: appEnv };

  await resetSchema();
  console.log('Running migrations...');
  execSync('npx sequelize-cli db:migrate', { stdio: 'inherit', cwd: __dirname + '/..', env: cliEnv });
  console.log('Running seeders...');
  execSync('npx sequelize-cli db:seed:all', { stdio: 'inherit', cwd: __dirname + '/..', env: cliEnv });
  console.log('Database reset complete.');
}

main().catch((err) => {
  console.error('Database reset failed:', err.message);
  process.exit(1);
});
