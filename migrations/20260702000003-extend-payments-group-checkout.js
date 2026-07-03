'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      CREATE TYPE "${schema}"."enum_payments_checkout_kind" AS ENUM (
        'PREMIUM_ONLY', 'SALON_FEE', 'COMBINED'
      );
    `);

    await queryInterface.addColumn(
      { schema, tableName: 'payments' },
      'booking_group_id',
      { type: Sequelize.UUID, allowNull: true },
    );
    await queryInterface.addColumn(
      { schema, tableName: 'payments' },
      'checkout_kind',
      { type: `"${schema}"."enum_payments_checkout_kind"`, allowNull: true },
    );
    await queryInterface.addColumn(
      { schema, tableName: 'payments' },
      'settings_version',
      { type: Sequelize.INTEGER, allowNull: true },
    );
    await queryInterface.addColumn(
      { schema, tableName: 'payments' },
      'service_commission_percent',
      { type: Sequelize.DECIMAL(5, 2), allowNull: true },
    );
    await queryInterface.addColumn(
      { schema, tableName: 'payments' },
      'premium_fee_platform_percent',
      { type: Sequelize.DECIMAL(5, 2), allowNull: true },
    );
    await queryInterface.addColumn(
      { schema, tableName: 'payments' },
      'premium_fee_salon_percent',
      { type: Sequelize.DECIMAL(5, 2), allowNull: true },
    );
    await queryInterface.addColumn(
      { schema, tableName: 'payments' },
      'premium_fee_amount',
      { type: Sequelize.DECIMAL(10, 2), allowNull: true },
    );
    await queryInterface.addColumn(
      { schema, tableName: 'payments' },
      'premium_platform_amount',
      { type: Sequelize.DECIMAL(10, 2), allowNull: true },
    );
    await queryInterface.addColumn(
      { schema, tableName: 'payments' },
      'premium_salon_amount',
      { type: Sequelize.DECIMAL(10, 2), allowNull: true },
    );
    await queryInterface.addColumn(
      { schema, tableName: 'payments' },
      'commission_amount',
      { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    );
    await queryInterface.addColumn(
      { schema, tableName: 'payments' },
      'platform_amount',
      { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    );
    await queryInterface.addColumn(
      { schema, tableName: 'payments' },
      'salon_net_amount',
      { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    );
    await queryInterface.addColumn(
      { schema, tableName: 'payments' },
      'cash_confirmed',
      { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    );
    await queryInterface.addColumn(
      { schema, tableName: 'payments' },
      'cash_confirmed_amount',
      { type: Sequelize.DECIMAL(10, 2), allowNull: true },
    );
    await queryInterface.addColumn(
      { schema, tableName: 'payments' },
      'cash_confirmed_at',
      { type: Sequelize.DATE, allowNull: true },
    );
    await queryInterface.addColumn(
      { schema, tableName: 'payments' },
      'cash_confirmed_by',
      { type: Sequelize.UUID, allowNull: true },
    );
    await queryInterface.addColumn(
      { schema, tableName: 'payments' },
      'refunded_amount',
      { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    );
    await queryInterface.addColumn(
      { schema, tableName: 'payments' },
      'is_legacy',
      { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    );

    await queryInterface.changeColumn(
      { schema, tableName: 'payments' },
      'booking_id',
      { type: Sequelize.UUID, allowNull: true },
    );

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS payments_group_checkout_active_unique
      ON "${schema}"."payments" (booking_group_id, checkout_kind)
      WHERE status IN ('PENDING', 'PAID') AND booking_group_id IS NOT NULL AND checkout_kind IS NOT NULL;
    `);

    await queryInterface.addIndex(
      { schema, tableName: 'payments' },
      ['booking_group_id'],
      { name: 'payments_booking_group_id_idx' },
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS "${schema}"."payments_group_checkout_active_unique";
    `);
    const cols = [
      'is_legacy', 'refunded_amount', 'cash_confirmed_by', 'cash_confirmed_at',
      'cash_confirmed_amount', 'cash_confirmed', 'salon_net_amount', 'platform_amount',
      'commission_amount', 'premium_salon_amount', 'premium_platform_amount',
      'premium_fee_amount', 'premium_fee_salon_percent', 'premium_fee_platform_percent',
      'service_commission_percent', 'settings_version', 'checkout_kind', 'booking_group_id',
    ];
    for (const col of cols) {
      await queryInterface.removeColumn({ schema, tableName: 'payments' }, col);
    }
    await queryInterface.changeColumn(
      { schema, tableName: 'payments' },
      'booking_id',
      { type: Sequelize.UUID, allowNull: false },
    );
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_payments_checkout_kind";`);
  },
};
