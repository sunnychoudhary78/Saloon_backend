const { Sequelize } = require('sequelize');
require('dotenv').config();

const env = (process.env.APP_ENV || 'development').toLowerCase();
const suffix = env === 'production' ? 'PROD' : env === 'test' ? 'TEST' : 'DEV';

const pick = (key, def) => process.env[`${key}_${suffix}`] ?? def;

const DB_NAME = pick('DB_NAME', process.env.DB_NAME || 'lms_db');
const DB_USER = pick('DB_USER', process.env.DB_USER || 'postgres');
const DB_PASSWORD = pick('DB_PASSWORD', process.env.DB_PASSWORD || '123');
const DB_HOST = pick('DB_HOST', process.env.DB_HOST || 'localhost');
const DB_PORT = parseInt(pick('DB_PORT', process.env.DB_PORT || 5432), 10);

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  port: DB_PORT,
  dialect: 'postgres',
  logging: false,
  define: { schema: process.env.DB_SCHEMA || 'lms_api' },
  searchPath: process.env.DB_SCHEMA || 'lms_api',
});

module.exports = sequelize;
