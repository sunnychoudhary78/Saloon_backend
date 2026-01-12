require('dotenv').config();

const schema = process.env.DB_SCHEMA || 'template_schema';
const appEnv = (process.env.APP_ENV || 'development').toLowerCase();
const suffixFor = (e) => e === 'production' ? 'PROD' : e === 'test' ? 'TEST' : 'DEV';
const defFor = (e) => e === 'test' ? 'template_db' : 'template_db';
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
  production: build('production'),
};

cfg._selected = build(appEnv);

module.exports = cfg;
