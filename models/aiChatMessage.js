module.exports = (sequelize, DataTypes) => {
  const baseFields = require('./baseFields');
  const AiChatMessage = sequelize.define(
    'AiChatMessage',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      session_id: { type: DataTypes.UUID, allowNull: false },
      user_id: { type: DataTypes.UUID, allowNull: false },
      analysis_id: { type: DataTypes.UUID, allowNull: true },
      role: { type: DataTypes.STRING(20), allowNull: false },
      content_text: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: '',
      },
      image_urls: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      card_payload: { type: DataTypes.JSONB, allowNull: true },
      ai_provider: { type: DataTypes.STRING(40), allowNull: true },
      tokens_used: { type: DataTypes.INTEGER, allowNull: true },
      ...baseFields(DataTypes, { userIdType: DataTypes.UUID }),
    },
    {
      tableName: 'ai_chat_messages',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  AiChatMessage.associate = (models) => {
    AiChatMessage.belongsTo(models.AiStylistSession, {
      foreignKey: 'session_id',
      as: 'session',
    });
    AiChatMessage.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    AiChatMessage.belongsTo(models.AiFaceAnalysis, {
      foreignKey: 'analysis_id',
      as: 'analysis',
    });
  };

  return AiChatMessage;
};
