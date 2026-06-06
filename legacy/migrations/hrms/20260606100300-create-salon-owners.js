'use strict';

const schema = process.env.DB_SCHEMA || 'template_schema';
const baseAudit = (Sequelize) => ({
  created_by: { type: Sequelize.UUID, allowNull: true },
  updated_by: { type: Sequelize.UUID, allowNull: true },
  is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
});

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { schema, tableName: 'salon_owners' },
      {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },
        user_id: {
          type: Sequelize.UUID,
          allowNull: false,
          unique: true,
          references: { model: { tableName: 'users', schema }, key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        business_name: { type: Sequelize.STRING, allowNull: false },
        gst_number: { type: Sequelize.STRING, allowNull: true },
        status: {
          type: Sequelize.ENUM('ACTIVE', 'BLOCKED'),
          allowNull: false,
          defaultValue: 'ACTIVE',
        },
        ...baseAudit(Sequelize),
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ schema, tableName: 'salon_owners' });
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_salon_owners_status";`);
  },
};
