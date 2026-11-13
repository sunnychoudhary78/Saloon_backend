module.exports = (sequelize, DataTypes) => {
  const baseFields = require('./baseFields');
  const AiFaceAnalysis = sequelize.define(
    'AiFaceAnalysis',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      session_id: { type: DataTypes.UUID, allowNull: false },
      user_id: { type: DataTypes.UUID, allowNull: false },
      front_image_url: { type: DataTypes.STRING(500), allowNull: false },
      left_image_url: { type: DataTypes.STRING(500), allowNull: true },
      right_image_url: { type: DataTypes.STRING(500), allowNull: true },
      hair_mask_url: { type: DataTypes.STRING(500), allowNull: true },
      on_device_features: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      preferences: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      detected_face_shape: { type: DataTypes.STRING(40), allowNull: true },
      face_shape_confidence: { type: DataTypes.INTEGER, allowNull: true },
      hair_type: { type: DataTypes.STRING(60), allowNull: true },
      hair_density: { type: DataTypes.STRING(60), allowNull: true },
      skin_undertone: { type: DataTypes.STRING(60), allowNull: true },
      analysis_summary: { type: DataTypes.TEXT, allowNull: true },
      recommendations: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      matched_service_names: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      ai_provider: { type: DataTypes.STRING(40), allowNull: true },
      ai_model: { type: DataTypes.STRING(80), allowNull: true },
      tokens_used: { type: DataTypes.INTEGER, allowNull: true },
      ...baseFields(DataTypes, { userIdType: DataTypes.UUID }),
    },
    {
      tableName: 'ai_face_analyses',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  AiFaceAnalysis.associate = (models) => {
    AiFaceAnalysis.belongsTo(models.AiStylistSession, {
      foreignKey: 'session_id',
      as: 'session',
    });
    AiFaceAnalysis.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    AiFaceAnalysis.hasMany(models.AiTryonResult, {
      foreignKey: 'analysis_id',
      as: 'tryon_results',
    });
  };

  return AiFaceAnalysis;
};
