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
      CREATE TYPE "${schema}"."enum_salon_payout_accounts_verification_status" AS ENUM (
        'PENDING', 'VERIFIED', 'REJECTED'
      );
    `);

    await queryInterface.createTable({ schema, tableName: 'salon_payout_accounts' }, {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      salon_owner_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: { tableName: 'salon_owners', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      salon_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: { tableName: 'salons', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      account_holder_name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      account_number_encrypted: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      ifsc_code: {
        type: Sequelize.STRING(11),
        allowNull: false,
      },
      upi_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      is_primary: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      verification_status: {
        type: `"${schema}"."enum_salon_payout_accounts_verification_status"`,
        allowNull: false,
        defaultValue: 'PENDING',
      },
      ...baseAudit(Sequelize),
    });

    await queryInterface.addIndex(
      { schema, tableName: 'salon_payout_accounts' },
      ['salon_owner_id'],
      { name: 'salon_payout_accounts_owner_idx' },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ schema, tableName: 'salon_payout_accounts' });
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_salon_payout_accounts_verification_status";`);
  },
};
