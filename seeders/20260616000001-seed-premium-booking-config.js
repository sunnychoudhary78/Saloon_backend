'use strict';

const { v4: uuidv4 } = require('uuid');
const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

module.exports = {
  up: async (queryInterface) => {
    const existing = await queryInterface.sequelize.query(
      `SELECT id FROM ${schema}.platform_settings WHERE setting_key = 'premium_booking_config' LIMIT 1`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    if (existing.length > 0) return;

    const now = new Date();
    const settingValue = {
      enabled: true,
      fee: 199,
      currency: 'INR',
    };

    await queryInterface.sequelize.query(
      `INSERT INTO ${schema}.platform_settings
        (id, setting_key, setting_value, description, created_by, updated_by, is_active, created_at, updated_at)
       VALUES
        (:id, 'premium_booking_config', :setting_value::jsonb, :description, NULL, NULL, true, :now, :now)`,
      {
        replacements: {
          id: uuidv4(),
          setting_value: JSON.stringify(settingValue),
          description: 'Premium urgent booking fee configuration',
          now,
        },
      }
    );
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete(
      { schema, tableName: 'platform_settings' },
      { setting_key: 'premium_booking_config' }
    );
  },
};
