'use strict';
const schema = process.env.DB_SCHEMA || 'template_schema';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable({ schema, tableName: 'experiences' }, {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.literal('gen_random_uuid()'), primaryKey: true },
      employee_id: {
        type: Sequelize.UUID, allowNull: false,
        references: { model: { tableName: 'employee_details', schema }, key: 'id' },
        onDelete: 'CASCADE'
      },
      company_name: { type: Sequelize.STRING },
      from_date: { type: Sequelize.DATEONLY },
      to_date: { type: Sequelize.DATEONLY },
      designation: { type: Sequelize.STRING },
      responsibilities: { type: Sequelize.TEXT },
      is_current: { type: Sequelize.BOOLEAN, defaultValue: false },
      reason_for_leaving: { type: Sequelize.TEXT },
      last_drawn_ctc: { type: Sequelize.DECIMAL(12, 2) },
      created_by: { type: Sequelize.UUID, allowNull: true },
      updated_by: { type: Sequelize.UUID, allowNull: true },
      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addIndex({ schema, tableName: 'experiences' }, ['employee_id'], { name: 'idx_experiences_employee_id' });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable({ schema, tableName: 'experiences' });
  }
};
