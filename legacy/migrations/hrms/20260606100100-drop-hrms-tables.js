'use strict';

const schema = process.env.DB_SCHEMA || 'template_schema';

const HRMS_TABLES = [
  'experiences',
  'educations',
  'addresses',
  'employee_details',
  'departments',
  'company_settings',
  'companies',
  'blood_groups',
  'marital_statuses',
  'genders',
  'common_variables',
];

module.exports = {
  async up(queryInterface) {
    for (const tableName of HRMS_TABLES) {
      await queryInterface.sequelize.query(
        `DROP TABLE IF EXISTS ${schema}.${tableName} CASCADE;`
      );
    }
  },

  async down() {
    // Fresh-start migration; HRMS tables are not restored.
  },
};
