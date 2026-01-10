'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable({ schema: 'lms_api', tableName: 'contacts' }, {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      employee_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'employee_details', key: 'id' }, onDelete: 'CASCADE' },

      type: { type: Sequelize.STRING }, // 'primary' | 'secondary' | 'other'
      contact_number: { type: Sequelize.STRING },
      contact_type: { type: Sequelize.STRING }, // optional descriptor
      note: { type: Sequelize.STRING },

      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      created_by: { type: Sequelize.UUID, allowNull: true },
      updated_by: { type: Sequelize.UUID, allowNull: true },
      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.fn('now') },
      updated_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.fn('now') }
    });

    await queryInterface.addIndex('contacts', ['employee_id']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable({ schema: 'lms_api', tableName: 'contacts' });
  }
};
