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
      { schema, tableName: 'coupons' },
      {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },
        code: { type: Sequelize.STRING(50), allowNull: false, unique: true },
        discount_type: {
          type: Sequelize.ENUM('PERCENT', 'FLAT'),
          allowNull: false,
        },
        discount_value: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
        valid_from: { type: Sequelize.DATE, allowNull: false },
        valid_to: { type: Sequelize.DATE, allowNull: false },
        usage_limit: { type: Sequelize.INTEGER, allowNull: true },
        used_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        status: {
          type: Sequelize.ENUM('ACTIVE', 'INACTIVE', 'EXPIRED'),
          allowNull: false,
          defaultValue: 'ACTIVE',
        },
        ...baseAudit(Sequelize),
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ schema, tableName: 'coupons' });
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_coupons_discount_type";`);
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_coupons_status";`);
  },
};
