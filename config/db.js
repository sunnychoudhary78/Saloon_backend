const { Sequelize } = require('sequelize');
require('dotenv').config();

const { envSuffix } = require('./envSuffix');
const suffix = envSuffix(process.env.APP_ENV || 'development');

const pick = (key, def) => process.env[`${key}_${suffix}`] ?? def;

const DB_NAME = pick('DB_NAME', process.env.DB_NAME || 'template_db');
const DB_USER = pick('DB_USER', process.env.DB_USER || 'postgres');
const DB_PASSWORD = pick('DB_PASSWORD', process.env.DB_PASSWORD || '123');
const DB_HOST = pick('DB_HOST', process.env.DB_HOST || 'localhost');
const DB_PORT = parseInt(pick('DB_PORT', process.env.DB_PORT || 5432), 10);

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  port: DB_PORT,
  dialect: 'postgres',
  logging: false,
  define: { schema: process.env.DB_SCHEMA || 'salon_booking_schema' },
  searchPath: process.env.DB_SCHEMA || 'salon_booking_schema',
});

module.exports = sequelize;
