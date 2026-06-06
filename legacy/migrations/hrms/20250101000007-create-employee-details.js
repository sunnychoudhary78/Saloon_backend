'use strict';
const schema = process.env.DB_SCHEMA || 'template_schema';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable({ schema, tableName: 'employee_details' }, {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.literal('gen_random_uuid()'), primaryKey: true },
      user_id: {
        type: Sequelize.UUID, allowNull: false, unique: true,
        references: { model: { tableName: 'users', schema }, key: 'id' },
        onDelete: 'CASCADE'
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
        type: Sequelize.UUID, allowNull: true,
        references: { model: { tableName: 'users', schema }, key: 'id' },
        onDelete: 'SET NULL'
      },
      department_head_id: {
        type: Sequelize.UUID, allowNull: true,
        references: { model: { tableName: 'users', schema }, key: 'id' },
        onDelete: 'SET NULL'
      },
      department_id: {
        type: Sequelize.UUID, allowNull: true,
        references: { model: { tableName: 'departments', schema }, key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },
      company_id: {
        type: Sequelize.UUID, allowNull: true,
        references: { model: { tableName: 'companies', schema }, key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
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
      profile_picture: { type: Sequelize.STRING, comment: 'Employee profile image file path or URL' },
      is_on_probation: { type: Sequelize.BOOLEAN, defaultValue: true },
      work_mode: { type: Sequelize.STRING, allowNull: false, defaultValue: 'OFFICE' },
      hybrid_office_days: { type: Sequelize.JSONB, defaultValue: [] },
      employee_edit_enabled: { type: Sequelize.BOOLEAN, defaultValue: true, comment: 'If false, employee cannot edit their details until manager enables' },
      created_by: { type: Sequelize.UUID, allowNull: true },
      updated_by: { type: Sequelize.UUID, allowNull: true },
      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') }
    });
    await queryInterface.addIndex({ schema, tableName: 'employee_details' }, ['department_id'], { name: 'idx_employee_details_department_id' });
    await queryInterface.addIndex({ schema, tableName: 'employee_details' }, ['company_id'], { name: 'idx_employee_details_company_id' });
    await queryInterface.addConstraint({ schema, tableName: 'employee_details' }, {
      fields: ['payroll_code'],
      type: 'unique',
      name: 'employee_details_payroll_code_unique',
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable({ schema, tableName: 'employee_details' });
  }
};
