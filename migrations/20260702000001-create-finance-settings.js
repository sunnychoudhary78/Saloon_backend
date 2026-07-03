'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable({ schema, tableName: 'finance_settings' }, {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      current_version: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      service_commission_percent: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 10,
      },
      premium_fee_platform_percent: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 70,
      },
      premium_fee_salon_percent: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 30,
      },
      updated_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: { tableName: 'users', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
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
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE "${schema}"."finance_settings"
      ADD CONSTRAINT finance_settings_premium_split_check
      CHECK (premium_fee_platform_percent + premium_fee_salon_percent = 100);
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE "${schema}"."finance_settings"
      ADD CONSTRAINT finance_settings_commission_range_check
      CHECK (service_commission_percent >= 0 AND service_commission_percent <= 100);
    `);

    await queryInterface.createTable({ schema, tableName: 'finance_settings_history' }, {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      version: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
      },
      service_commission_percent: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
      },
      premium_fee_platform_percent: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
      },
      premium_fee_salon_percent: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
      },
      changed_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: { tableName: 'users', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      changed_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      old_values: {
        type: Sequelize.JSONB,
        allowNull: false,
      },
      new_values: {
        type: Sequelize.JSONB,
        allowNull: false,
      },
      change_reason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
    });

    const settingsId = require('crypto').randomUUID();
    const historyId = require('crypto').randomUUID();
    const now = new Date();

    await queryInterface.bulkInsert({ schema, tableName: 'finance_settings' }, [{
      id: settingsId,
      current_version: 1,
      service_commission_percent: 10,
      premium_fee_platform_percent: 70,
      premium_fee_salon_percent: 30,
      created_at: now,
      updated_at: now,
    }]);

    await queryInterface.bulkInsert({ schema, tableName: 'finance_settings_history' }, [{
      id: historyId,
      version: 1,
      service_commission_percent: 10,
      premium_fee_platform_percent: 70,
      premium_fee_salon_percent: 30,
      changed_by: null,
      changed_at: now,
      old_values: JSON.stringify({}),
      new_values: JSON.stringify({
        service_commission_percent: 10,
        premium_fee_platform_percent: 70,
        premium_fee_salon_percent: 30,
      }),
      change_reason: 'Initial seed',
    }]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ schema, tableName: 'finance_settings_history' });
    await queryInterface.dropTable({ schema, tableName: 'finance_settings' });
  },
};
