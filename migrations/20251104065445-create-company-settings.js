
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable({ schema: 'lms_api', tableName: 'company_settings' }, {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      company_name: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      calendar_year_start: {
        type: Sequelize.DATEONLY,
        allowNull: false,
        comment: 'Start date of the company calendar year (e.g., 2025-01-01)',
      },
      calendar_year_end: {
        type: Sequelize.DATEONLY,
        allowNull: false,
        comment: 'End date of the company calendar year (e.g., 2025-12-31)',
      },
      default_probation_days: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 90,
        comment: 'Default probation period in days for new employees',
      },
      default_notice_period_days: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 30,
        comment: 'Default notice period in days for resignations/terminations',
      },
      timezone: {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: 'UTC',
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    // Optional default seed
    await queryInterface.bulkInsert('company_settings', [
      {
        id: Sequelize.literal('gen_random_uuid()'),
        company_name: 'Default Company',
        calendar_year_start: '2025-01-01',
        calendar_year_end: '2025-12-31',
        default_probation_days: 90,
        default_notice_period_days: 30,
        timezone: 'UTC',
        notes: 'Initial default company configuration',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  down: async (queryInterface /*, Sequelize */) => {
    await queryInterface.dropTable( { schema: 'lms_api', tableName: 'company_settings' });
  },
};
