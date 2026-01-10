'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // ensure pgcrypto is available in Postgres for gen_random_uuid() if you use it
    // await queryInterface.sequelize.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

    await queryInterface.createTable(
      { schema: 'lms_api', tableName: 'table_configs' },
      {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },

        user_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: { schema: 'lms_api', tableName: 'users' },
            key: 'id',
          },
          onDelete: 'CASCADE',
        },

        table_key: {
          type: Sequelize.STRING,
          allowNull: false,
        },

        // store the column config as JSONB: array of { key, visible, order, width?, ... }
        config: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: Sequelize.literal(`'[]'::jsonb`),
        },

        created_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: { schema: 'lms_api', tableName: 'users' },
            key: 'id',
          },
          onDelete: 'SET NULL',
        },

        updated_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: { schema: 'lms_api', tableName: 'users' },
            key: 'id',
          },
          onDelete: 'SET NULL',
        },

        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },

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

    // Unique constraint: one config per user per table_key
    await queryInterface.addConstraint(
      { schema: 'lms_api', tableName: 'table_configs' },
      {
        fields: ['user_id', 'table_key'],
        type: 'unique',
        name: 'uq_table_configs_user_tablekey',
      }
    );

    // helpful index for lookups by user
    await queryInterface.addIndex(
      { schema: 'lms_api', tableName: 'table_configs' },
      ['user_id'],
      { name: 'idx_table_configs_user_id' }
    );

    // index by table_key if you need to query by table
    await queryInterface.addIndex(
      { schema: 'lms_api', tableName: 'table_configs' },
      ['table_key'],
      { name: 'idx_table_configs_table_key' }
    );
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex({ schema: 'lms_api', tableName: 'table_configs' }, 'idx_table_configs_table_key').catch(() => {});
    await queryInterface.removeIndex({ schema: 'lms_api', tableName: 'table_configs' }, 'idx_table_configs_user_id').catch(() => {});
    await queryInterface.removeConstraint({ schema: 'lms_api', tableName: 'table_configs' }, 'uq_table_configs_user_tablekey').catch(() => {});
    await queryInterface.dropTable({ schema: 'lms_api', tableName: 'table_configs' });
  }
};
