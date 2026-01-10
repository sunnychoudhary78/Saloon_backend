// migrations/2025xxxx-create-saved-filters-and-trgm-uuid.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // ensure extension (cluster-wide)
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;');

    // Create table in lms_api schema (adjust schema name if different)
    await queryInterface.createTable(
      { tableName: 'saved_filters', schema: 'lms_api' },
      {
        id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
        user_id: { type: Sequelize.UUID, allowNull: false },
        name: { type: Sequelize.STRING, allowNull: false },
        table_key: { type: Sequelize.STRING, allowNull: false },
        filter_json: { type: Sequelize.JSONB, allowNull: false },
        is_shared: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') }
      }
    );

    // index on user_id
    await queryInterface.addIndex(
      { tableName: 'saved_filters', schema: 'lms_api' },
      ['user_id'],
      { name: 'idx_saved_filters_user_id' }
    );

    // trigram indexes for fast ILIKE (schema-qualified)
    // adjust table names if your actual table names or schema differ
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_employee_associates_name_trgm
      ON lms_api.employee_details USING gin (associates_name gin_trgm_ops);
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_employee_payroll_code_trgm
      ON lms_api.employee_details USING gin (payroll_code gin_trgm_ops);
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_user_email_trgm
      ON lms_api.users USING gin (email gin_trgm_ops);
    `);

    // add FK constraint to users(id)
    await queryInterface.addConstraint(
      { tableName: 'saved_filters', schema: 'lms_api' },
      {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_saved_filters_user_id_users_id',
        references: {
          table: { tableName: 'users', schema: 'lms_api' },
          field: 'id'
        },
        onDelete: 'cascade',
        onUpdate: 'cascade'
      }
    );
  },

  async down(queryInterface) {
    // remove FK constraint
    await queryInterface.removeConstraint(
      { tableName: 'saved_filters', schema: 'lms_api' },
      'fk_saved_filters_user_id_users_id'
    ).catch(() => {});

    // drop saved_filters table
    await queryInterface.dropTable({ tableName: 'saved_filters', schema: 'lms_api' });

    // drop trigram indexes (if they exist)
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS lms_api.idx_employee_associates_name_trgm;').catch(()=>{});
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS lms_api.idx_employee_payroll_code_trgm;').catch(()=>{});
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS lms_api.idx_user_email_trgm;').catch(()=>{});
  }
};
