'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Uncomment if gen_random_uuid() isn't already enabled:
    // await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

    await queryInterface.createTable(
      { schema: 'lms_api', tableName: 'employee_details' },
      {
        id: {
          type: Sequelize.UUID,
          primaryKey: true,
          defaultValue: Sequelize.literal('gen_random_uuid()')
        },

        user_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'CASCADE',
          unique: true
        },

        client_name: { type: Sequelize.STRING },
        client_code: { type: Sequelize.STRING },
        payroll_code: { type: Sequelize.STRING },
        associates_name: { type: Sequelize.STRING },

        doj: { type: Sequelize.DATEONLY },
        dob: { type: Sequelize.DATEONLY },
        dol: { type: Sequelize.DATEONLY },

        designation: { type: Sequelize.STRING },
        department_name: { type: Sequelize.STRING },
        gender: { type: Sequelize.STRING },

        contact_primary: { type: Sequelize.STRING },
        contact_secondary: { type: Sequelize.STRING },
        email: { type: Sequelize.STRING },
        blood_group: { type: Sequelize.STRING },

        manager_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL'
        },

        department_head_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL'
        },

        total_experience: { type: Sequelize.STRING },
        work_location: { type: Sequelize.STRING },

        aadhar_number_encrypted: { type: Sequelize.TEXT },
        pan_number_encrypted: { type: Sequelize.TEXT },
        esi_no: { type: Sequelize.STRING },
        uan_no: { type: Sequelize.STRING },

        bank_name: { type: Sequelize.STRING },
        ifsc_code: { type: Sequelize.STRING },
        account_number_encrypted: { type: Sequelize.TEXT },

        marital_status: { type: Sequelize.STRING },
        date_of_marriage: { type: Sequelize.DATEONLY },

        nominee_name: { type: Sequelize.STRING },
        nominee_dob: { type: Sequelize.DATEONLY },
        nominee_relation: { type: Sequelize.STRING },

        father_name: { type: Sequelize.STRING },
        father_dob: { type: Sequelize.DATEONLY },
        mother_name: { type: Sequelize.STRING },
        mother_dob: { type: Sequelize.DATEONLY },

        spouse_name: { type: Sequelize.STRING },
        spouse_dob: { type: Sequelize.DATEONLY },

        basic: { type: Sequelize.DECIMAL(12, 2) },
        hra: { type: Sequelize.DECIMAL(12, 2) },
        conveyance: { type: Sequelize.DECIMAL(12, 2) },
        other_allowance: { type: Sequelize.DECIMAL(12, 2) },
        bonus: { type: Sequelize.DECIMAL(12, 2) },
        gross: { type: Sequelize.DECIMAL(12, 2) },
        ctc: { type: Sequelize.DECIMAL(12, 2) },

        // 👇 New field (combined from second migration)
        profile_picture: {
          type: Sequelize.STRING,
          allowNull: true,
          comment: 'Employee profile image file path or URL'
        },

        // 👇 Probation-related fields (from third migration)
        is_on_probation: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: 'Indicates if employee is currently on probation'
        },

        probation_end_date: {
          type: Sequelize.DATEONLY,
          allowNull: true,
          comment: 'Expected probation end date'
        },

        probation_reviewed_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
          comment: 'User who reviewed probation'
        },

        probation_reviewed_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: 'When probation was reviewed'
        },

        // base fields
        is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
        created_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL'
        },
        updated_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL'
        },

        created_at: {
          allowNull: false,
          type: Sequelize.DATE,
          defaultValue: Sequelize.fn('now')
        },
        updated_at: {
          allowNull: false,
          type: Sequelize.DATE,
          defaultValue: Sequelize.fn('now')
        }
      }
    );

    // indexes for performance
    await queryInterface.addIndex(
      { schema: 'lms_api', tableName: 'employee_details' },
      ['user_id']
    );
    await queryInterface.addIndex(
      { schema: 'lms_api', tableName: 'employee_details' },
      ['client_code']
    );
    await queryInterface.addIndex(
      { schema: 'lms_api', tableName: 'employee_details' },
      ['payroll_code']
    );
    await queryInterface.addIndex(
      { schema: 'lms_api', tableName: 'employee_details' },
      ['manager_id']
    );
    await queryInterface.addIndex(
      { schema: 'lms_api', tableName: 'employee_details' },
      ['department_head_id']
    );

    // 👇 New index for quick lookup of probation status
    await queryInterface.addIndex(
      { schema: 'lms_api', tableName: 'employee_details' },
      ['is_on_probation']
    );
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable({ schema: 'lms_api', tableName: 'employee_details' });
  }
};
