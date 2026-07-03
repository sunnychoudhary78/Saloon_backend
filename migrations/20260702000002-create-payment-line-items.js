'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      CREATE TYPE "${schema}"."enum_payment_line_items_status" AS ENUM (
        'PENDING', 'PAID', 'REFUNDED', 'PARTIALLY_REFUNDED'
      );
    `);
    await queryInterface.sequelize.query(`
      CREATE TYPE "${schema}"."enum_payment_line_items_settlement_status" AS ENUM (
        'PENDING', 'IN_BATCH', 'SETTLED', 'REVERSED'
      );
    `);

    await queryInterface.createTable({ schema, tableName: 'payment_line_items' }, {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      payment_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: { tableName: 'payments', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      booking_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: { tableName: 'bookings', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      service_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: { tableName: 'services', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      service_name_snapshot: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      gross_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      commission_percent: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
      },
      commission_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      platform_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      salon_net_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      status: {
        type: `"${schema}"."enum_payment_line_items_status"`,
        allowNull: false,
        defaultValue: 'PENDING',
      },
      refunded_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      settlement_status: {
        type: `"${schema}"."enum_payment_line_items_settlement_status"`,
        allowNull: false,
        defaultValue: 'PENDING',
      },
      settlement_batch_id: {
        type: Sequelize.UUID,
        allowNull: true,
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

    await queryInterface.addIndex(
      { schema, tableName: 'payment_line_items' },
      ['payment_id'],
      { name: 'payment_line_items_payment_idx' },
    );
    await queryInterface.addIndex(
      { schema, tableName: 'payment_line_items' },
      ['booking_id'],
      { name: 'payment_line_items_booking_idx' },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ schema, tableName: 'payment_line_items' });
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_payment_line_items_settlement_status";`);
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_payment_line_items_status";`);
  },
};
