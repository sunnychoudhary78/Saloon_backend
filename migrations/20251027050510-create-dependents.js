'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable({ schema: 'lms_api', tableName: 'dependents' }, {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      employee_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'employee_details', key: 'id' }, onDelete: 'CASCADE' },

      name: { type: Sequelize.STRING },
      relation: { type: Sequelize.STRING }, // spouse, child, father, mother
      dob: { type: Sequelize.DATEONLY },
      notes: { type: Sequelize.TEXT },

      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      created_by: { type: Sequelize.UUID, allowNull: true },
      updated_by: { type: Sequelize.UUID, allowNull: true },
      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.fn('now') },
      updated_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.fn('now') }
    });

    await queryInterface.addIndex('dependents', ['employee_id']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable({ schema: 'lms_api', tableName: 'dependents' });
  }
};
