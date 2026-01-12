'use strict';
const schema = process.env.DB_SCHEMA || 'template_schema';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable({ schema, tableName: 'roles' }, {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.literal('gen_random_uuid()'), primaryKey: true },
      name: { type: Sequelize.STRING, allowNull: false, unique: true },
      hierarchy_level: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 500 },
      created_by: { type: Sequelize.UUID, allowNull: true },
      updated_by: { type: Sequelize.UUID, allowNull: true },
      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') }
    });
    await queryInterface.addIndex({ schema, tableName: 'roles' }, ['hierarchy_level'], { name: 'roles_hierarchy_level_idx' });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable({ schema, tableName: 'roles' });
  }
};
