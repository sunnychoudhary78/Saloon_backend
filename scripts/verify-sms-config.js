'use strict';

require('dotenv').config();

const { PlatformSetting, sequelize } = require('../models');
const { normalizeLegacyConfig } = require('../utils/smsService');

async function main() {
  await sequelize.authenticate();

  const row = await PlatformSetting.findOne({ where: { setting_key: 'sms_config' } });
  if (!row) {
    console.log('sms_config row: NOT FOUND (run: npm run db:seed or seed 20260612000002-seed-sms-config.js)');
    process.exit(0);
  }

  const config = normalizeLegacyConfig(row.setting_value);
  console.log('sms_config row: FOUND');
  console.log('  provider:', config?.provider || '(missing)');
  console.log('  enabled:', config?.enabled);
  console.log('  has auth_key:', Boolean(config?.auth_key));
  console.log('  sender_id:', config?.sender_id || '(empty)');
  console.log('  flow_id:', config?.flow_id || '(empty)');
  console.log('  otp_var_name:', config?.otp_var_name || '(empty)');
  console.log('  message has -- placeholder:', String(config?.message_template || '').includes('--'));

  const required = [
    'provider',
    'auth_key',
    'sender_id',
    'flow_id',
    'otp_var_name',
    'message_template',
  ];
  const missing = required.filter((f) => !String(config?.[f] || '').trim());
  if (config?.enabled && missing.length) {
    console.log('  WARNING: enabled but missing fields:', missing.join(', '));
  } else if (config?.enabled) {
    console.log('  STATUS: ready to send OTP SMS via MSG91 Flow/OneAPI');
  } else {
    console.log('  STATUS: disabled until admin enables in Platform Settings');
  }

  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
