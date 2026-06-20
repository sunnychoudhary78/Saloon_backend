'use strict';

const { v4: uuidv4 } = require('uuid');
const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

module.exports = {
  up: async (queryInterface) => {
    const existing = await queryInterface.sequelize.query(
      `SELECT id FROM ${schema}.platform_settings WHERE setting_key = 'sms_config' LIMIT 1`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    if (existing.length > 0) return;

    const now = new Date();
    const id = uuidv4();
    const settingValue = {
      enabled: false,
      sms_url: '',
      sms_username: '',
      sms_sendername: '',
      sms_smstype: 'TRANS',
      sms_apikey: '',
      sms_peid: '',
      sms_templateid: '',
      sms_message:
        '<#> Your OTP for Immortal HRMS is --. Valid for 5 minutes. Do not share this code.\n',
      sms_app_hash: '',
    };

    await queryInterface.sequelize.query(
      `INSERT INTO ${schema}.platform_settings
        (id, setting_key, setting_value, description, created_by, updated_by, is_active, created_at, updated_at)
       VALUES
        (:id, 'sms_config', :setting_value::jsonb, :description, NULL, NULL, true, :now, :now)`,
      {
        replacements: {
          id,
          setting_value: JSON.stringify(settingValue),
          description: 'SMS gateway configuration for customer OTP',
          now,
        },
      }
    );
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete(
      { schema, tableName: 'platform_settings' },
      { setting_key: 'sms_config' }
    );
  },
};
