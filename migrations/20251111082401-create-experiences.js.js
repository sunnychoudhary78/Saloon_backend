'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable(
      { schema: 'lms_api', tableName: 'experiences' },
      {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },

        employee_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: { schema: 'lms_api', tableName: 'employee_details' },
            key: 'id',
          },
          onDelete: 'CASCADE',
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

        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('NOW()'),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('NOW()'),
        },
      }
    );

    // optional: add an index on employee_id for faster lookups
    await queryInterface.addIndex(
      { schema: 'lms_api', tableName: 'experiences' },
      ['employee_id'],
      { name: 'idx_experiences_employee_id' }
    );
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex(
      { schema: 'lms_api', tableName: 'experiences' },
      'idx_experiences_employee_id'
    ).catch(() => {});
    await queryInterface.dropTable({ schema: 'lms_api', tableName: 'experiences' });
  },
};
