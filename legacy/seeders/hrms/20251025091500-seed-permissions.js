'use strict';
const schema = process.env.DB_SCHEMA || 'template_schema';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { v4: uuidv4 } = require('uuid');
    const now = new Date();

    const permissions = [
      { id: uuidv4(), name: 'company.read', display_name: 'Read Companies', description: 'View company records', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'company.create', display_name: 'Create Company', description: 'Create a new company', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'companySettings.read', display_name: 'Read Company Settings', description: 'View company settings', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'companySettings.update', display_name: 'Update Company Settings', description: 'Modify company settings', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'department.create', display_name: 'Create Department', description: 'Create a new department', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'department.makeInactive', display_name: 'Deactivate Department', description: 'Mark a department inactive', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'department.read', display_name: 'Read Department', description: 'View department details', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'department.update', display_name: 'Update Department', description: 'Modify department information', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'permission.assign', display_name: 'Assign Permission', description: 'Assign permissions to roles or users', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'permission.create', display_name: 'Create Permission', description: 'Create a new permission', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'permission.makeInactive', display_name: 'Deactivate Permission', description: 'Mark a permission inactive', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'permission.read', display_name: 'Read Permissions', description: 'View permissions', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'permission.update', display_name: 'Update Permission', description: 'Modify permission', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'probation.confirm', display_name: 'Confirm Probation', description: 'Confirm employee after probation', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'role.assign', display_name: 'Assign Role', description: 'Assign roles to users', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'role.create', display_name: 'Create Role', description: 'Create a new role', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'role.makeInactive', display_name: 'Deactivate Role', description: 'Mark a role inactive', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'role.read', display_name: 'Read Role', description: 'View role details', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'role.update', display_name: 'Update Role', description: 'Modify role information', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'stats.read', display_name: 'Read Statistics', description: 'View dashboard statistics', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'user.confirmProbation', display_name: 'Confirm User After Probation', description: 'Confirm user after probation period', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'user.create', display_name: 'Create User', description: 'Create a new user', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'user.makeInactive', display_name: 'Deactivate User', description: 'Deactivate a user', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'user.read', display_name: 'Read User', description: 'View user details', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'user.update', display_name: 'Update User', description: 'Modify user information', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'variables.create', display_name: 'Create Variable', description: 'Create a configuration variable', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'variables.delete', display_name: 'Delete Variable', description: 'Delete a configuration variable', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'variables.read', display_name: 'Read Variables', description: 'View configuration variables', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now },
      { id: uuidv4(), name: 'variables.update', display_name: 'Update Variable', description: 'Modify a configuration variable', created_by: null, updated_by: null, is_active: true, created_at: now, updated_at: now }
    ];

    // Get existing permission names to avoid duplicates
    const existingPermissions = await queryInterface.sequelize.query(
      `SELECT name FROM ${schema}.permissions;`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    const existingNames = existingPermissions.map(p => p.name);
    const toInsert = permissions.filter(p => !existingNames.includes(p.name));

    if (toInsert.length > 0) {
      await queryInterface.bulkInsert({ schema, tableName: 'permissions' }, toInsert);
    }
  },

  down: async (queryInterface, Sequelize) => {
    const names = [
      'company.read','company.create',
      'companySettings.read','companySettings.update',
      'department.create','department.makeInactive','department.read','department.update',
      'permission.assign','permission.create','permission.makeInactive','permission.read','permission.update',
      'probation.confirm',
      'role.assign','role.create','role.makeInactive','role.read','role.update',
      'stats.read',
      'user.confirmProbation','user.create','user.makeInactive','user.read','user.update',
      'variables.create','variables.delete','variables.read','variables.update'
    ];

    await queryInterface.bulkDelete({ schema: 'template_schema', tableName: 'permissions' }, { name: names }, {});
  }
};
