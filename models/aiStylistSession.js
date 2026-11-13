module.exports = (sequelize, DataTypes) => {
  const baseFields = require('./baseFields');
  const AiStylistSession = sequelize.define(
    'AiStylistSession',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      user_id: { type: DataTypes.UUID, allowNull: false },
      title: {
        type: DataTypes.STRING(180),
        allowNull: false,
        defaultValue: 'New Style Consultation',
      },
      status: {
        type: DataTypes.STRING(24),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      active_analysis_id: { type: DataTypes.UUID, allowNull: true },
      ...baseFields(DataTypes, { userIdType: DataTypes.UUID }),
    },
    {
      tableName: 'ai_stylist_sessions',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  AiStylistSession.associate = (models) => {
    AiStylistSession.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    AiStylistSession.hasMany(models.AiFaceAnalysis, {
      foreignKey: 'session_id',
      as: 'analyses',
    });
    AiStylistSession.hasMany(models.AiChatMessage, {
      foreignKey: 'session_id',
      as: 'messages',
    });
  };

  return AiStylistSession;
};
