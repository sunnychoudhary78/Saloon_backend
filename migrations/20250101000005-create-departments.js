'use strict';
const schema = process.env.DB_SCHEMA || 'template_schema';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable({ schema, tableName: 'departments' }, {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.literal('gen_random_uuid()'), primaryKey: true },
      name: { type: Sequelize.STRING, allowNull: false },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: { tableName: 'companies', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      department_head_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: { tableName: 'users', schema }, key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },
      created_by: { type: Sequelize.UUID, allowNull: true },
      updated_by: { type: Sequelize.UUID, allowNull: true },
      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') }
    });
    await queryInterface.addConstraint({ schema, tableName: 'departments' }, {
      type: 'unique',
      fields: ['company_id', 'name'],
      name: 'departments_company_id_name_key',
    });
    await queryInterface.addIndex({ schema, tableName: 'departments' }, ['department_head_id']);
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable({ schema, tableName: 'departments' });
  }
};
