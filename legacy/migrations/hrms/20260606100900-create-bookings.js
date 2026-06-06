'use strict';

const schema = process.env.DB_SCHEMA || 'template_schema';
const baseAudit = (Sequelize) => ({
  created_by: { type: Sequelize.UUID, allowNull: true },
  updated_by: { type: Sequelize.UUID, allowNull: true },
  is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
});

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { schema, tableName: 'bookings' },
      {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },
        booking_number: { type: Sequelize.STRING(20), allowNull: false, unique: true },
        customer_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: { tableName: 'customers', schema }, key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        salon_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: { tableName: 'salons', schema }, key: 'id' },
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
        booking_date: { type: Sequelize.DATEONLY, allowNull: false },
        booking_time: { type: Sequelize.TIME, allowNull: false },
        notes: { type: Sequelize.TEXT, allowNull: true },
        booking_status: {
          type: Sequelize.ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED'),
          allowNull: false,
          defaultValue: 'PENDING',
        },
        rejection_reason: { type: Sequelize.TEXT, allowNull: true },
        responded_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: { tableName: 'users', schema }, key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        responded_at: { type: Sequelize.DATE, allowNull: true },
        ...baseAudit(Sequelize),
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ schema, tableName: 'bookings' });
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_bookings_booking_status";`);
  },
};
