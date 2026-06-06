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
      { schema, tableName: 'promotional_banners' },
      {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },
        title: { type: Sequelize.STRING, allowNull: false },
        image: { type: Sequelize.STRING, allowNull: false },
        redirect_type: {
          type: Sequelize.ENUM('NONE', 'SALON', 'SERVICE', 'CATEGORY', 'EXTERNAL_URL'),
          allowNull: false,
          defaultValue: 'NONE',
        },
        redirect_value: { type: Sequelize.STRING(255), allowNull: true },
        sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        status: {
          type: Sequelize.ENUM('ACTIVE', 'INACTIVE'),
          allowNull: false,
          defaultValue: 'ACTIVE',
        },
        ...baseAudit(Sequelize),
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ schema, tableName: 'promotional_banners' });
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_promotional_banners_redirect_type";`);
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_promotional_banners_status";`);
  },
};
