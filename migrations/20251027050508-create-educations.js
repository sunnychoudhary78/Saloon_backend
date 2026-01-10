'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable({ schema: 'lms_api', tableName: 'educations' }, {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      employee_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'employee_details', key: 'id' }, onDelete: 'CASCADE' },

      level: { type: Sequelize.STRING }, // '10th','12th','graduation','pg','phd'
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

    await queryInterface.addIndex('educations', ['employee_id']);
    await queryInterface.addIndex('educations', ['level']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable({ schema: 'lms_api', tableName: 'educations' });
  }
};
