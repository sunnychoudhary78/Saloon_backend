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
      { schema, tableName: 'reviews' },
      {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },
        customer_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: { tableName: 'customers', schema }, key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        salon_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: { tableName: 'salons', schema }, key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        booking_id: {
          type: Sequelize.UUID,
          allowNull: false,
          unique: true,
          references: { model: { tableName: 'bookings', schema }, key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        rating: { type: Sequelize.INTEGER, allowNull: false },
        review: { type: Sequelize.TEXT, allowNull: true },
        status: {
          type: Sequelize.ENUM('PUBLISHED', 'HIDDEN'),
          allowNull: false,
          defaultValue: 'PUBLISHED',
        },
        moderated_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: { tableName: 'users', schema }, key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        ...baseAudit(Sequelize),
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ schema, tableName: 'reviews' });
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_reviews_status";`);
  },
};
