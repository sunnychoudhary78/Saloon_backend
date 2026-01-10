'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable({ schema: 'lms_api', tableName: 'role_permissions' }, {
      role_id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
      },
      permission_id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
      },
      created_by: { type: Sequelize.UUID, allowNull: true },
      updated_by: { type: Sequelize.UUID, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      }
    });

    // optional: add foreign keys if your DB and other migrations expect them
    // await queryInterface.addConstraint('role_permissions', {
    //   fields: ['role_id'],
    //   type: 'foreign key',
    //   name: 'fk_role_permissions_role',
    //   references: { table: 'roles', field: 'id' },
    //   onDelete: 'CASCADE',
    //   onUpdate: 'CASCADE',
    // });

    // await queryInterface.addConstraint('role_permissions', {
    //   fields: ['permission_id'],
    //   type: 'foreign key',
    //   name: 'fk_role_permissions_permission',
    //   references: { table: 'permissions', field: 'id' },
    //   onDelete: 'CASCADE',
    //   onUpdate: 'CASCADE',
    // });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable({ schema: 'lms_api', tableName: 'role_permissions' });
  },
};
