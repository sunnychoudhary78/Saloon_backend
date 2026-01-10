'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Enable pgcrypto for gen_random_uuid()
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

    await queryInterface.createTable({ schema: 'lms_api', tableName: 'users' }, {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true
      },
      name: { type: Sequelize.STRING, allowNull: false },
      email: { type: Sequelize.STRING, allowNull: false, unique: true },
      password: { type: Sequelize.STRING, allowNull: true },

      // snake_case columns to match underscored: true in models
      role_id: {
        type: Sequelize.UUID,
        allowNull: false, // if you want to allow nulls change to true
        references: { model: 'roles', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT' // don't allow removing a role that users reference
      },
      
      created_by: { type: Sequelize.UUID, allowNull: true },
      updated_by: { type: Sequelize.UUID, allowNull: true },

      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },

      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') }
    });

    await queryInterface.addIndex('users', ['email']);
    await queryInterface.addIndex('users', ['role_id']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable({ schema: 'lms_api', tableName: 'users' });
  }
};
