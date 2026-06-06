'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

const baseAudit = (Sequelize) => ({
  created_by: { type: Sequelize.UUID, allowNull: true },
  updated_by: { type: Sequelize.UUID, allowNull: true },
  is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
});

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable({ schema, tableName: 'salon_owners' }, {
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
    });

    await queryInterface.createTable({ schema, tableName: 'salon_applications' }, {
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
    });

    await queryInterface.createTable({ schema, tableName: 'salons' }, {
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
    });

    await queryInterface.createTable({ schema, tableName: 'service_categories' }, {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      name: { type: Sequelize.STRING, allowNull: false, unique: true },
      description: { type: Sequelize.TEXT, allowNull: true },
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      status: {
        type: Sequelize.ENUM('ACTIVE', 'INACTIVE'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      ...baseAudit(Sequelize),
    });

    await queryInterface.createTable({ schema, tableName: 'services' }, {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      salon_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: { tableName: 'salons', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      category_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: { tableName: 'service_categories', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      service_name: { type: Sequelize.STRING, allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      duration_minutes: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 30 },
      price: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      discount_price: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
      status: {
        type: Sequelize.ENUM('ACTIVE', 'INACTIVE'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      ...baseAudit(Sequelize),
    });

    await queryInterface.createTable({ schema, tableName: 'customers' }, {
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
      profile_image: { type: Sequelize.STRING, allowNull: true },
      gender: { type: Sequelize.STRING, allowNull: true },
      dob: { type: Sequelize.DATEONLY, allowNull: true },
      status: {
        type: Sequelize.ENUM('ACTIVE', 'BLOCKED'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      ...baseAudit(Sequelize),
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ schema, tableName: 'customers' });
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_customers_status";`);
    await queryInterface.dropTable({ schema, tableName: 'services' });
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_services_status";`);
    await queryInterface.dropTable({ schema, tableName: 'service_categories' });
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_service_categories_status";`);
    await queryInterface.dropTable({ schema, tableName: 'salons' });
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_salons_status";`);
    await queryInterface.dropTable({ schema, tableName: 'salon_applications' });
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_salon_applications_application_status";`);
    await queryInterface.dropTable({ schema, tableName: 'salon_owners' });
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_salon_owners_status";`);
  },
};
