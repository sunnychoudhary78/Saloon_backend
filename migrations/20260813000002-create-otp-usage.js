'use strict';

const { v4: uuidv4 } = require('uuid');

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

const OTP_USAGE_CONFIG_KEY = 'otp_usage_config';
const DEFAULT_CONFIG = {
  daily_cap_per_phone: 5,
  sms_cost_paise: 18,
};

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { schema, tableName: 'otp_send_events' },
      {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },
        phone: { type: Sequelize.STRING, allowNull: false },
        purpose: { type: Sequelize.STRING(20), allowNull: false },
        status: { type: Sequelize.STRING(20), allowNull: false },
        provider_request_id: { type: Sequelize.STRING(120), allowNull: true },
        error_message: { type: Sequelize.TEXT, allowNull: true },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('NOW()'),
        },
      },
    );

    await queryInterface.addIndex(
      { schema, tableName: 'otp_send_events' },
      ['created_at'],
      { name: 'otp_send_events_created_at_idx' },
    );
    await queryInterface.addIndex(
      { schema, tableName: 'otp_send_events' },
      ['phone', 'created_at'],
      { name: 'otp_send_events_phone_created_at_idx' },
    );

    await queryInterface.createTable(
      { schema, tableName: 'otp_phone_blocks' },
      {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },
        phone: { type: Sequelize.STRING, allowNull: false, unique: true },
        reason: { type: Sequelize.TEXT, allowNull: true },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_by: { type: Sequelize.UUID, allowNull: true },
        updated_by: { type: Sequelize.UUID, allowNull: true },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('NOW()'),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('NOW()'),
        },
      },
    );

    await queryInterface.addIndex(
      { schema, tableName: 'otp_phone_blocks' },
      ['phone'],
      { unique: true, name: 'otp_phone_blocks_phone_uq' },
    );

    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM "${schema}"."platform_settings" WHERE setting_key = :key LIMIT 1`,
      { replacements: { key: OTP_USAGE_CONFIG_KEY } },
    );
    if (!existing.length) {
      const now = new Date();
      await queryInterface.sequelize.query(
        `INSERT INTO "${schema}"."platform_settings"
          (id, setting_key, setting_value, description, created_by, updated_by, is_active, created_at, updated_at)
         VALUES
          (:id, :key, :setting_value::jsonb, :description, NULL, NULL, true, :now, :now)`,
        {
          replacements: {
            id: uuidv4(),
            key: OTP_USAGE_CONFIG_KEY,
            setting_value: JSON.stringify(DEFAULT_CONFIG),
            description: 'OTP SMS daily cap per phone and per-SMS cost in paise',
            now,
          },
        },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete(
      { schema, tableName: 'platform_settings' },
      { setting_key: OTP_USAGE_CONFIG_KEY },
    );
    await queryInterface.dropTable({ schema, tableName: 'otp_phone_blocks' });
    await queryInterface.dropTable({ schema, tableName: 'otp_send_events' });
  },
};
