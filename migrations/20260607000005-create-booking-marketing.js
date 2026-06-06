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
    await queryInterface.createTable({ schema, tableName: 'bookings' }, {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      booking_number: { type: Sequelize.STRING(20), allowNull: false, unique: true },
      customer_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: { tableName: 'customers', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      salon_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: { tableName: 'salons', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      service_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: { tableName: 'services', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      booking_date: { type: Sequelize.DATEONLY, allowNull: false },
      booking_time: { type: Sequelize.TIME, allowNull: false },
      notes: { type: Sequelize.TEXT, allowNull: true },
      booking_status: {
        type: Sequelize.ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      rejection_reason: { type: Sequelize.TEXT, allowNull: true },
      responded_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: { tableName: 'users', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      responded_at: { type: Sequelize.DATE, allowNull: true },
      ...baseAudit(Sequelize),
    });

    await queryInterface.createTable({ schema, tableName: 'reviews' }, {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      customer_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: { tableName: 'customers', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      salon_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: { tableName: 'salons', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      booking_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: { tableName: 'bookings', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      rating: { type: Sequelize.INTEGER, allowNull: false },
      review: { type: Sequelize.TEXT, allowNull: true },
      status: {
        type: Sequelize.ENUM('PUBLISHED', 'HIDDEN'),
        allowNull: false,
        defaultValue: 'PUBLISHED',
      },
      moderated_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: { tableName: 'users', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      ...baseAudit(Sequelize),
    });

    await queryInterface.createTable({ schema, tableName: 'coupons' }, {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      code: { type: Sequelize.STRING(50), allowNull: false, unique: true },
      discount_type: {
        type: Sequelize.ENUM('PERCENT', 'FLAT'),
        allowNull: false,
      },
      discount_value: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      valid_from: { type: Sequelize.DATE, allowNull: false },
      valid_to: { type: Sequelize.DATE, allowNull: false },
      usage_limit: { type: Sequelize.INTEGER, allowNull: true },
      used_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      status: {
        type: Sequelize.ENUM('ACTIVE', 'INACTIVE', 'EXPIRED'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      ...baseAudit(Sequelize),
    });

    await queryInterface.createTable({ schema, tableName: 'promotional_banners' }, {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      title: { type: Sequelize.STRING, allowNull: false },
      image: { type: Sequelize.STRING, allowNull: false },
      redirect_type: {
        type: Sequelize.ENUM('NONE', 'SALON', 'SERVICE', 'CATEGORY', 'EXTERNAL_URL'),
        allowNull: false,
        defaultValue: 'NONE',
      },
      redirect_value: { type: Sequelize.STRING(255), allowNull: true },
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      status: {
        type: Sequelize.ENUM('ACTIVE', 'INACTIVE'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      ...baseAudit(Sequelize),
    });

    await queryInterface.createTable({ schema, tableName: 'platform_settings' }, {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      setting_key: { type: Sequelize.STRING(100), allowNull: false, unique: true },
      setting_value: { type: Sequelize.JSONB, allowNull: false, defaultValue: '{}' },
      description: { type: Sequelize.TEXT, allowNull: true },
      ...baseAudit(Sequelize),
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ schema, tableName: 'platform_settings' });
    await queryInterface.dropTable({ schema, tableName: 'promotional_banners' });
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_promotional_banners_redirect_type";`);
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_promotional_banners_status";`);
    await queryInterface.dropTable({ schema, tableName: 'coupons' });
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_coupons_discount_type";`);
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_coupons_status";`);
    await queryInterface.dropTable({ schema, tableName: 'reviews' });
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_reviews_status";`);
    await queryInterface.dropTable({ schema, tableName: 'bookings' });
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_bookings_booking_status";`);
  },
};
