require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');

const SEEDERS = [
  { label: 'Seeding roles...', file: '20260607000001-seed-roles.js' },
  { label: 'Seeding permissions...', file: '20260607000002-seed-permissions.js' },
  { label: 'Seeding role-permissions...', file: '20260607000003-seed-role-permissions.js' },
  { label: 'Seeding superadmin...', file: '20260607000004-seed-superadmin.js' },
  { label: 'Seeding sms-config...', file: '20260612000002-seed-sms-config.js' },
  { label: 'Seeding premium-booking-config...', file: '20260616000001-seed-premium-booking-config.js' },
];

function requireProduction() {
  const appEnv = (process.env.APP_ENV || '').toLowerCase();
  const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();

  if (appEnv !== 'production' || nodeEnv !== 'production') {
    console.error(
      'PROD bootstrap seeding refused: NODE_ENV and APP_ENV must both be "production". '
      + `Got NODE_ENV=${process.env.NODE_ENV || '(unset)'} APP_ENV=${process.env.APP_ENV || '(unset)'}.`
    );
    process.exit(1);
  }
}

function main() {
  requireProduction();

  const cwd = path.join(__dirname, '..');
  const cliEnv = { ...process.env, NODE_ENV: 'production', APP_ENV: 'production' };

  for (const { label, file } of SEEDERS) {
    console.log(label);
    execSync(
      `npx sequelize-cli db:seed --config config/config.js --seed ${file}`,
      { stdio: 'inherit', cwd, env: cliEnv }
    );
  }

  console.log('PROD bootstrap seeding completed successfully.');
}

try {
  main();
} catch (err) {
  console.error('PROD bootstrap seeding failed:', err.message);
  process.exit(1);
}
