'use strict';

const schema = process.env.DB_SCHEMA || 'template_schema';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { schema, tableName: 'audit_logs' },
      {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },
        user_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: { tableName: 'users', schema }, key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        action: { type: Sequelize.STRING(100), allowNull: false },
        entity_type: { type: Sequelize.STRING(50), allowNull: false },
        entity_id: { type: Sequelize.UUID, allowNull: true },
        old_values: { type: Sequelize.JSONB, allowNull: true },
        new_values: { type: Sequelize.JSONB, allowNull: true },
        ip_address: { type: Sequelize.STRING(45), allowNull: true },
        user_agent: { type: Sequelize.TEXT, allowNull: true },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('NOW()'),
        },
      }
    );

    await queryInterface.addIndex({ schema, tableName: 'audit_logs' }, ['entity_type', 'entity_id']);
    await queryInterface.addIndex({ schema, tableName: 'audit_logs' }, ['user_id']);
    await queryInterface.addIndex({ schema, tableName: 'audit_logs' }, ['created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ schema, tableName: 'audit_logs' });
  },
};
