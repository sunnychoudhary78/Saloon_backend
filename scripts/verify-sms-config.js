'use strict';

require('dotenv').config();

const { PlatformSetting, sequelize } = require('../models');

async function main() {
  await sequelize.authenticate();

  const row = await PlatformSetting.findOne({ where: { setting_key: 'sms_config' } });
  if (!row) {
    console.log('sms_config row: NOT FOUND (run: npm run db:seed or seed 20260612000002-seed-sms-config.js)');
    process.exit(0);
  }

  const config = row.setting_value;
  console.log('sms_config row: FOUND');
  console.log('  enabled:', config?.enabled);
  console.log('  sms_url:', config?.sms_url || '(empty)');
  console.log('  has apikey:', Boolean(config?.sms_apikey));
  console.log('  message has -- placeholder:', String(config?.sms_message || '').includes('--'));

  const required = ['sms_url', 'sms_username', 'sms_sendername', 'sms_smstype', 'sms_apikey'];
  const missing = required.filter((f) => !config?.[f]);
  if (config?.enabled && missing.length) {
    console.log('  WARNING: enabled but missing fields:', missing.join(', '));
  } else if (config?.enabled) {
    console.log('  STATUS: ready to send OTP SMS');
  } else {
    console.log('  STATUS: disabled until admin enables in Platform Settings');
  }

  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
