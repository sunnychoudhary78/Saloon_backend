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
      { schema, tableName: 'salon_applications' },
      {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },
        owner_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: { tableName: 'salon_owners', schema }, key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        salon_name: { type: Sequelize.STRING, allowNull: false },
        description: { type: Sequelize.TEXT, allowNull: true },
        address: { type: Sequelize.TEXT, allowNull: false },
        city: { type: Sequelize.STRING, allowNull: false },
        state: { type: Sequelize.STRING, allowNull: false },
        latitude: { type: Sequelize.DECIMAL(10, 8), allowNull: true },
        longitude: { type: Sequelize.DECIMAL(11, 8), allowNull: true },
        cover_image: { type: Sequelize.STRING, allowNull: true },
        gallery_images: { type: Sequelize.JSONB, allowNull: false, defaultValue: '[]' },
        opening_time: { type: Sequelize.TIME, allowNull: true },
        closing_time: { type: Sequelize.TIME, allowNull: true },
        application_status: {
          type: Sequelize.ENUM('PENDING_APPROVAL', 'APPROVED', 'REJECTED'),
          allowNull: false,
          defaultValue: 'PENDING_APPROVAL',
        },
        rejection_reason: { type: Sequelize.TEXT, allowNull: true },
        reviewed_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: { tableName: 'users', schema }, key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        reviewed_at: { type: Sequelize.DATE, allowNull: true },
        ...baseAudit(Sequelize),
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ schema, tableName: 'salon_applications' });
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_salon_applications_application_status";`);
  },
};
