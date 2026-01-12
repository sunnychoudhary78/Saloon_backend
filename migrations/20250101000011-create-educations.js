'use strict';
const schema = process.env.DB_SCHEMA || 'template_schema';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable({ schema, tableName: 'educations' }, {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      employee_id: { type: Sequelize.UUID, allowNull: false, references: { model: { tableName: 'employee_details', schema }, key: 'id' }, onDelete: 'CASCADE' },
      level: { type: Sequelize.STRING },
      board_or_university: { type: Sequelize.STRING },
      institution: { type: Sequelize.STRING },
      from_year: { type: Sequelize.STRING },
      to_year: { type: Sequelize.STRING },
      passing_year: { type: Sequelize.STRING },
      percentage: { type: Sequelize.STRING },
      notes: { type: Sequelize.TEXT },
      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      created_by: { type: Sequelize.UUID, allowNull: true },
      updated_by: { type: Sequelize.UUID, allowNull: true },
      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.fn('now') },
      updated_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.fn('now') }
    });
    await queryInterface.addIndex({ schema, tableName: 'educations' }, ['employee_id']);
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable({ schema, tableName: 'educations' });
  }
};
