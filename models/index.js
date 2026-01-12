// models/index.js
'use strict';

// Ensure environment variables from .env are loaded before reading config
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const basename = path.basename(__filename);
// Allow a single boolean toggle to select production vs testing
// If IS_PRODUCTION is set, prefer it over NODE_ENV.
const env = (process.env.APP_ENV || process.env.NODE_ENV || 'development');

// Load config which may be either:
// 1) an env-keyed object: { development: {...}, production: {...} }
// 2) a flat config object: { DB_NAME, DB_USER, DB_PASSWORD, ... }
const rawConfig = require('../config/config');

const config = rawConfig._selected || rawConfig[env] || rawConfig; // prefer selected flat, else env, else flat

// Resolve DB connection values (support multiple naming styles)
const dbName = config.database || config.DB_NAME || process.env.DB_NAME;
const dbUser = config.username || config.DB_USER || process.env.DB_USER;
const dbPassword = config.password || config.DB_PASSWORD || process.env.DB_PASSWORD;
const dbHost = config.host || config.DB_HOST || process.env.DB_HOST || '127.0.0.1';
const dbPort = config.port || config.DB_PORT || process.env.DB_PORT || 5432;
const dbDialect = config.dialect || 'postgres';

if (typeof dbPassword !== 'string') {
  // defensive check with helpful error
  throw new Error(`Database password must be a string. Got type: ${typeof dbPassword}`);
}

const sequelize = new Sequelize(dbName, dbUser, dbPassword, {
  host: dbHost,
  port: dbPort,
  dialect: dbDialect,
  logging: false,
  define: config.define || {},
  searchPath: config.searchPath || process.env.DB_SCHEMA || 'template_schema',
});

const db = {};

// Dynamically import all model files in this directory
fs.readdirSync(__dirname)
  .filter(file => {
    return (
      file.indexOf('.') !== 0 &&
      file !== basename &&
      file.slice(-3) === '.js'
    );
  })
  .forEach(file => {
    // require model factory and call with (sequelize, DataTypes)
    const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
    db[model.name] = model;
  });

// Call associate() on each model, if present
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

// async function logTables(sequelize) {
//   const [results] = await sequelize.query(`
//     SELECT table_name
//     FROM information_schema.tables
//     WHERE table_schema = 'template_schema'
//     ORDER BY table_name;
//   `);

//   console.log('📌 Tables in schema template_schema:');
//   results.forEach(t => console.log(t.table_name));
// }

// logTables(sequelize);

module.exports = db;


