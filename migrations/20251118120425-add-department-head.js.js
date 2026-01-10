'use strict';

const SCHEMA = 'lms_api'; // set your schema name here

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // add column in specific schema
    await queryInterface.addColumn(
      { tableName: 'departments', schema: SCHEMA },
      'department_head_id',
      {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: { tableName: 'users', schema: SCHEMA }, // reference in same schema; adjust if users are in public schema
          key: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      }
    );

    // add an index (target schema explicitly)
    await queryInterface.addIndex(
      { tableName: 'departments', schema: SCHEMA },
      ['department_head_id'],
      {
        name: 'idx_departments_department_head_id'
      }
    );
  },

  down: async (queryInterface /*, Sequelize */) => {
    // remove index then column
    await queryInterface.removeIndex(
      { tableName: 'departments', schema: SCHEMA },
      'idx_departments_department_head_id'
    ).catch(() => {});
    await queryInterface.removeColumn(
      { tableName: 'departments', schema: SCHEMA },
      'department_head_id'
    );
  }
};
