'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. ai_stylist_sessions
    await queryInterface.createTable(
      { schema, tableName: 'ai_stylist_sessions' },
      {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },
        user_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: { tableName: 'users', schema }, key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        },
        title: {
          type: Sequelize.STRING(180),
          allowNull: false,
          defaultValue: 'New Style Consultation',
        },
        status: {
          type: Sequelize.STRING(24),
          allowNull: false,
          defaultValue: 'ACTIVE',
        },
        active_analysis_id: {
          type: Sequelize.UUID,
          allowNull: true,
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        created_by: {
          type: Sequelize.UUID,
          allowNull: true,
        },
        updated_by: {
          type: Sequelize.UUID,
          allowNull: true,
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
      { schema, tableName: 'ai_stylist_sessions' },
      ['user_id', 'is_active', 'updated_at'],
      { name: 'idx_ai_stylist_sessions_user_updated' }
    );

    // 2. ai_face_analyses
    await queryInterface.createTable(
      { schema, tableName: 'ai_face_analyses' },
      {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },
        session_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: { tableName: 'ai_stylist_sessions', schema }, key: 'id' },
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
        front_image_url: {
          type: Sequelize.STRING(500),
          allowNull: false,
        },
        left_image_url: {
          type: Sequelize.STRING(500),
          allowNull: true,
        },
        right_image_url: {
          type: Sequelize.STRING(500),
          allowNull: true,
        },
        hair_mask_url: {
          type: Sequelize.STRING(500),
          allowNull: true,
        },
        on_device_features: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        preferences: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        detected_face_shape: {
          type: Sequelize.STRING(40),
          allowNull: true,
        },
        face_shape_confidence: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        hair_type: {
          type: Sequelize.STRING(60),
          allowNull: true,
        },
        hair_density: {
          type: Sequelize.STRING(60),
          allowNull: true,
        },
        skin_undertone: {
          type: Sequelize.STRING(60),
          allowNull: true,
        },
        analysis_summary: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        recommendations: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: [],
        },
        matched_service_names: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: [],
        },
        ai_provider: {
          type: Sequelize.STRING(40),
          allowNull: true,
        },
        ai_model: {
          type: Sequelize.STRING(80),
          allowNull: true,
        },
        tokens_used: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        created_by: {
          type: Sequelize.UUID,
          allowNull: true,
        },
        updated_by: {
          type: Sequelize.UUID,
          allowNull: true,
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
      { schema, tableName: 'ai_face_analyses' },
      ['user_id', 'created_at'],
      { name: 'idx_ai_face_analyses_user_created' }
    );
    await queryInterface.addIndex(
      { schema, tableName: 'ai_face_analyses' },
      ['session_id', 'created_at'],
      { name: 'idx_ai_face_analyses_session_created' }
    );

    // 3. ai_chat_messages
    await queryInterface.createTable(
      { schema, tableName: 'ai_chat_messages' },
      {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },
        session_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: { tableName: 'ai_stylist_sessions', schema }, key: 'id' },
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
        analysis_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: { tableName: 'ai_face_analyses', schema }, key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        },
        role: {
          type: Sequelize.STRING(20),
          allowNull: false,
        },
        content_text: {
          type: Sequelize.TEXT,
          allowNull: false,
          defaultValue: '',
        },
        image_urls: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: [],
        },
        card_payload: {
          type: Sequelize.JSONB,
          allowNull: true,
        },
        ai_provider: {
          type: Sequelize.STRING(40),
          allowNull: true,
        },
        tokens_used: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        created_by: {
          type: Sequelize.UUID,
          allowNull: true,
        },
        updated_by: {
          type: Sequelize.UUID,
          allowNull: true,
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
      { schema, tableName: 'ai_chat_messages' },
      ['session_id', 'created_at'],
      { name: 'idx_ai_chat_messages_session_created' }
    );
    await queryInterface.addIndex(
      { schema, tableName: 'ai_chat_messages' },
      ['user_id', 'role', 'created_at'],
      { name: 'idx_ai_chat_messages_user_role_created' }
    );

    // 4. ai_tryon_results
    await queryInterface.createTable(
      { schema, tableName: 'ai_tryon_results' },
      {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },
        analysis_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: { tableName: 'ai_face_analyses', schema }, key: 'id' },
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
        hairstyle_name: {
          type: Sequelize.STRING(150),
          allowNull: false,
        },
        hair_color: {
          type: Sequelize.STRING(80),
          allowNull: true,
        },
        prompt_used: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        result_image_url: {
          type: Sequelize.STRING(500),
          allowNull: false,
        },
        provider: {
          type: Sequelize.STRING(40),
          allowNull: true,
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        created_by: {
          type: Sequelize.UUID,
          allowNull: true,
        },
        updated_by: {
          type: Sequelize.UUID,
          allowNull: true,
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
      { schema, tableName: 'ai_tryon_results' },
      ['analysis_id', 'created_at'],
      { name: 'idx_ai_tryon_results_analysis_created' }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ schema, tableName: 'ai_tryon_results' });
    await queryInterface.dropTable({ schema, tableName: 'ai_chat_messages' });
    await queryInterface.dropTable({ schema, tableName: 'ai_face_analyses' });
    await queryInterface.dropTable({ schema, tableName: 'ai_stylist_sessions' });
  },
};
