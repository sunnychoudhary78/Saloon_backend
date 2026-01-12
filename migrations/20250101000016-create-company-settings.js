'use strict';
const schema = process.env.DB_SCHEMA || 'template_schema';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable({ schema, tableName: 'company_settings' }, {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: {
            tableName: 'companies',
            schema: schema
          },
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      company_name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      calendar_year_start: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      calendar_year_end: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      default_probation_days: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 90
      },
      default_notice_period_days: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 30
      },
      timezone: {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: 'UTC'
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      designations: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: []
      },
      gmail_config: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      company_email_config: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('NOW()')
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('NOW()')
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable({ schema, tableName: 'company_settings' });
  }
};
