'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

const baseAudit = (Sequelize) => ({
  created_by: { type: Sequelize.UUID, allowNull: true },
  updated_by: { type: Sequelize.UUID, allowNull: true },
  is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
});

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      CREATE TYPE "${schema}"."enum_settlement_batches_status" AS ENUM (
        'DRAFT', 'APPROVED', 'SETTLED', 'CANCELLED'
      );
    `);
    await queryInterface.sequelize.query(`
      CREATE TYPE "${schema}"."enum_settlement_ledger_entry_type" AS ENUM (
        'SERVICE_COMMISSION', 'SERVICE_SALON_NET', 'PREMIUM_PLATFORM', 'PREMIUM_SALON', 'REFUND', 'ADJUSTMENT'
      );
    `);
    await queryInterface.sequelize.query(`
      CREATE TYPE "${schema}"."enum_settlement_ledger_status" AS ENUM (
        'PENDING', 'IN_BATCH', 'SETTLED', 'REVERSED'
      );
    `);

    await queryInterface.createTable({ schema, tableName: 'settlement_batches' }, {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      batch_number: {
        type: Sequelize.STRING(20),
        allowNull: false,
        unique: true,
      },
      salon_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: { tableName: 'salons', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      period_start: { type: Sequelize.DATEONLY, allowNull: true },
      period_end: { type: Sequelize.DATEONLY, allowNull: true },
      total_salon_net: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      status: {
        type: `"${schema}"."enum_settlement_batches_status"`,
        allowNull: false,
        defaultValue: 'DRAFT',
      },
      approved_by: { type: Sequelize.UUID, allowNull: true },
      approved_at: { type: Sequelize.DATE, allowNull: true },
      settled_by: { type: Sequelize.UUID, allowNull: true },
      settled_at: { type: Sequelize.DATE, allowNull: true },
      settlement_reference: { type: Sequelize.STRING, allowNull: true },
      notes: { type: Sequelize.TEXT, allowNull: true },
      ...baseAudit(Sequelize),
    });

    await queryInterface.createTable({ schema, tableName: 'settlement_ledger' }, {
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
      payment_line_item_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: { tableName: 'payment_line_items', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      booking_id: { type: Sequelize.UUID, allowNull: true },
      booking_group_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      salon_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: { tableName: 'salons', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      entry_type: {
        type: `"${schema}"."enum_settlement_ledger_entry_type"`,
        allowNull: false,
      },
      amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'INR',
      },
      settings_version: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      source_commission_percent: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
      },
      source_split_percent: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
      },
      status: {
        type: `"${schema}"."enum_settlement_ledger_status"`,
        allowNull: false,
        defaultValue: 'PENDING',
      },
      settlement_batch_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: { tableName: 'settlement_batches', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      settled_at: { type: Sequelize.DATE, allowNull: true },
      settlement_reference: { type: Sequelize.STRING, allowNull: true },
      notes: { type: Sequelize.TEXT, allowNull: true },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    await queryInterface.addIndex(
      { schema, tableName: 'settlement_ledger' },
      ['salon_id', 'status'],
      { name: 'settlement_ledger_salon_status_idx' },
    );
    await queryInterface.addIndex(
      { schema, tableName: 'settlement_ledger' },
      ['payment_id'],
      { name: 'settlement_ledger_payment_idx' },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ schema, tableName: 'settlement_ledger' });
    await queryInterface.dropTable({ schema, tableName: 'settlement_batches' });
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_settlement_ledger_status";`);
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_settlement_ledger_entry_type";`);
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_settlement_batches_status";`);
  },
};
