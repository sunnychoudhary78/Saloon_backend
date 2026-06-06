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
      { schema, tableName: 'salons' },
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
        application_id: {
          type: Sequelize.UUID,
          allowNull: true,
          unique: true,
          references: { model: { tableName: 'salon_applications', schema }, key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
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
        status: {
          type: Sequelize.ENUM('ACTIVE', 'SUSPENDED', 'CLOSED'),
          allowNull: false,
          defaultValue: 'ACTIVE',
        },
        ...baseAudit(Sequelize),
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ schema, tableName: 'salons' });
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_salons_status";`);
  },
};
