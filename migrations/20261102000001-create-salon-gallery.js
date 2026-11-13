'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add optional title and specializations to salon_staff if they don't exist
    const staffTableInfo = await queryInterface.describeTable({ schema, tableName: 'salon_staff' });
    if (!staffTableInfo.title) {
      await queryInterface.addColumn(
        { schema, tableName: 'salon_staff' },
        'title',
        {
          type: Sequelize.STRING(100),
          allowNull: true,
        }
      );
    }
    if (!staffTableInfo.specializations) {
      await queryInterface.addColumn(
        { schema, tableName: 'salon_staff' },
        'specializations',
        {
          type: Sequelize.JSONB,
          allowNull: true,
          defaultValue: [],
        }
      );
    }

    // 2. Create salon_gallery_posts table
    await queryInterface.createTable(
      { schema, tableName: 'salon_gallery_posts' },
      {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },
        salon_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: { tableName: 'salons', schema }, key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        },
        staff_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: { tableName: 'salon_staff', schema }, key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        },
        service_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: { tableName: 'services', schema }, key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        },
        booking_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: { tableName: 'bookings', schema }, key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        },
        customer_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: { tableName: 'users', schema }, key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        },
        title: {
          type: Sequelize.STRING(255),
          allowNull: true,
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        before_image_url: {
          type: Sequelize.STRING(500),
          allowNull: false,
        },
        after_image_url: {
          type: Sequelize.STRING(500),
          allowNull: false,
        },
        is_public: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        customer_consent: {
          type: Sequelize.STRING(30),
          allowNull: false,
          defaultValue: 'APPROVED',
        },
        likes_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        is_featured: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        sort_order: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
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
        },
      }
    );

    await queryInterface.addIndex(
      { schema, tableName: 'salon_gallery_posts' },
      ['salon_id', 'is_public', 'is_active'],
      { name: 'salon_gallery_posts_salon_public_idx' }
    );

    await queryInterface.addIndex(
      { schema, tableName: 'salon_gallery_posts' },
      ['staff_id', 'is_public', 'is_active'],
      { name: 'salon_gallery_posts_staff_idx' }
    );

    await queryInterface.addIndex(
      { schema, tableName: 'salon_gallery_posts' },
      ['customer_id'],
      { name: 'salon_gallery_posts_customer_idx' }
    );

    // 3. Create salon_gallery_likes table
    await queryInterface.createTable(
      { schema, tableName: 'salon_gallery_likes' },
      {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },
        post_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: { tableName: 'salon_gallery_posts', schema }, key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        },
        user_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: { tableName: 'users', schema }, key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
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
        },
      }
    );

    await queryInterface.addIndex(
      { schema, tableName: 'salon_gallery_likes' },
      ['post_id', 'user_id'],
      {
        unique: true,
        name: 'salon_gallery_likes_post_user_uq',
      }
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable({ schema, tableName: 'salon_gallery_likes' });
    await queryInterface.dropTable({ schema, tableName: 'salon_gallery_posts' });
  },
};

