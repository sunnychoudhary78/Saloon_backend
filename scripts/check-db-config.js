require('dotenv').config();
const allConfig = require('../config/config');
const env = process.env.NODE_ENV || 'development';
const cfg = allConfig[env] || allConfig;

console.log('cfg.database:', cfg.database || cfg.DB_NAME || process.env.DB_NAME);
console.log('cfg.username:', cfg.username || cfg.DB_USER || process.env.DB_USER);
console.log('cfg.password type:', typeof (cfg.password || cfg.DB_PASSWORD || process.env.DB_PASSWORD));
