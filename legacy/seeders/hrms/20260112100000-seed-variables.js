'use strict';

const { v4: uuidv4 } = require('uuid');
const SCHEMA = process.env.DB_SCHEMA || 'template_schema';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const now = new Date();
    
    // Blood Groups
    const bloodGroups = [
      { code: 'A_POS', label: 'A+', description: 'A Positive', rh_positive: true },
      { code: 'A_NEG', label: 'A-', description: 'A Negative', rh_positive: false },
      { code: 'B_POS', label: 'B+', description: 'B Positive', rh_positive: true },
      { code: 'B_NEG', label: 'B-', description: 'B Negative', rh_positive: false },
      { code: 'O_POS', label: 'O+', description: 'O Positive', rh_positive: true },
      { code: 'O_NEG', label: 'O-', description: 'O Negative', rh_positive: false },
      { code: 'AB_POS', label: 'AB+', description: 'AB Positive', rh_positive: true },
      { code: 'AB_NEG', label: 'AB-', description: 'AB Negative', rh_positive: false },
    ].map(item => ({
      id: uuidv4(),
      ...item,
      is_active: true,
      created_at: now,
      updated_at: now,
    }));

    await queryInterface.bulkInsert({ tableName: 'blood_groups', schema: SCHEMA }, bloodGroups);

    // Marital Statuses
    const maritalStatuses = [
      { code: 'SINGLE', label: 'Single', description: 'Never married' },
      { code: 'MARRIED', label: 'Married', description: 'Currently married' },
      { code: 'DIVORCED', label: 'Divorced', description: 'Marriage legally ended' },
      { code: 'WIDOWED', label: 'Widowed', description: 'Spouse has died' },
      { code: 'SEPARATED', label: 'Separated', description: 'Legally married but living apart' },
      { code: 'UNSPECIFIED', label: 'Unspecified / Not Disclosed', description: 'User did not specify' },
    ].map(item => ({
      id: uuidv4(),
      ...item,
      is_active: true,
      created_at: now,
      updated_at: now,
    }));

    await queryInterface.bulkInsert({ tableName: 'marital_statuses', schema: SCHEMA }, maritalStatuses);

    // Genders
    const genders = [
      { code: 'MALE', label: 'Male', description: 'Assigned male at birth / male identity' },
      { code: 'FEMALE', label: 'Female', description: 'Assigned female at birth / female identity' },
      { code: 'OTHER', label: 'Other', description: 'Non-binary / third gender / prefer not to say' },
      { code: 'NOT_DISCLOSED', label: 'Not Disclosed', description: 'User did not specify' },
      { code: 'TRANSGENDER', label: 'Transgender', description: 'For more explicit capture (optional)' },
    ].map(item => ({
      id: uuidv4(),
      ...item,
      is_active: true,
      created_at: now,
      updated_at: now,
    }));

    await queryInterface.bulkInsert({ tableName: 'genders', schema: SCHEMA }, genders);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete({ tableName: 'genders', schema: SCHEMA }, null, {});
    await queryInterface.bulkDelete({ tableName: 'marital_statuses', schema: SCHEMA }, null, {});
    await queryInterface.bulkDelete({ tableName: 'blood_groups', schema: SCHEMA }, null, {});
  }
};
