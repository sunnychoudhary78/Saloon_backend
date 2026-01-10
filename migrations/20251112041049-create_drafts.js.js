'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // ensure pgcrypto extension exists if you want gen_random_uuid()
    // await queryInterface.sequelize.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

    await queryInterface.createTable(
      { schema: 'lms_api', tableName: 'drafts' },
      {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },
        user_id: {
          type: Sequelize.UUID,
          allowNull: true, // draft may be created before user is set in some flows
          references: { model: { schema: 'lms_api', tableName: 'users' }, key: 'id' },
          onDelete: 'CASCADE',
        },
        form_key: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        target_id: {
          type: Sequelize.UUID,
          allowNull: true,
        },
        data: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: Sequelize.literal(`'{}'::jsonb`),
        },
        status: {
          type: Sequelize.ENUM('draft', 'submitted', 'archived'),
          allowNull: false,
          defaultValue: 'draft',
        },
        version: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1,
        },
        last_saved_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        created_by: { type: Sequelize.UUID, allowNull: true },
        updated_by: { type: Sequelize.UUID, allowNull: true },
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
        }
      }
    );

    await queryInterface.addIndex({ schema: 'lms_api', tableName: 'drafts' }, ['user_id', 'form_key'], {
      name: 'idx_drafts_user_form',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex({ schema: 'lms_api', tableName: 'drafts' }, 'idx_drafts_user_form').catch(() => {});
    await queryInterface.dropTable({ schema: 'lms_api', tableName: 'drafts' });
    // optionally drop enum type if needed depending on sequelize/pg version
  }
};
