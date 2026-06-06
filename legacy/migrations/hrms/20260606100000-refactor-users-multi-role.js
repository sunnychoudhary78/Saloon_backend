'use strict';

const schema = process.env.DB_SCHEMA || 'template_schema';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      { schema, tableName: 'users' },
      'phone',
      { type: Sequelize.STRING, allowNull: true, unique: true }
    );

    await queryInterface.addColumn(
      { schema, tableName: 'users' },
      'status',
      {
        type: Sequelize.ENUM('ACTIVE', 'BLOCKED'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      }
    );

    await queryInterface.createTable(
      { schema, tableName: 'user_roles' },
      {
        user_id: {
          type: Sequelize.UUID,
          allowNull: false,
          primaryKey: true,
          references: { model: { tableName: 'users', schema }, key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        role_id: {
          type: Sequelize.UUID,
          allowNull: false,
          primaryKey: true,
          references: { model: { tableName: 'roles', schema }, key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        assigned_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('NOW()'),
        },
        assigned_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: { tableName: 'users', schema }, key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
      }
    );

    await queryInterface.sequelize.query(`
      INSERT INTO ${schema}.user_roles (user_id, role_id, assigned_at)
      SELECT id, role_id, NOW() FROM ${schema}.users WHERE role_id IS NOT NULL
      ON CONFLICT DO NOTHING;
    `);

    await queryInterface.removeColumn({ schema, tableName: 'users' }, 'role_id');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      { schema, tableName: 'users' },
      'role_id',
      {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: { tableName: 'roles', schema }, key: 'id' },
      }
    );

    await queryInterface.sequelize.query(`
      UPDATE ${schema}.users u
      SET role_id = ur.role_id
      FROM (
        SELECT DISTINCT ON (user_id) user_id, role_id
        FROM ${schema}.user_roles
        ORDER BY user_id, assigned_at ASC
      ) ur
      WHERE u.id = ur.user_id;
    `);

    await queryInterface.dropTable({ schema, tableName: 'user_roles' });
    await queryInterface.removeColumn({ schema, tableName: 'users' }, 'status');
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_users_status";`);
    await queryInterface.removeColumn({ schema, tableName: 'users' }, 'phone');
  },
};
