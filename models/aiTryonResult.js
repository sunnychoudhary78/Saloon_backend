module.exports = (sequelize, DataTypes) => {
  const baseFields = require('./baseFields');
  const AiTryonResult = sequelize.define(
    'AiTryonResult',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      analysis_id: { type: DataTypes.UUID, allowNull: false },
      user_id: { type: DataTypes.UUID, allowNull: false },
      hairstyle_name: { type: DataTypes.STRING(150), allowNull: false },
      hair_color: { type: DataTypes.STRING(80), allowNull: true },
      prompt_used: { type: DataTypes.TEXT, allowNull: true },
      result_image_url: { type: DataTypes.STRING(500), allowNull: false },
      provider: { type: DataTypes.STRING(40), allowNull: true },
      ...baseFields(DataTypes, { userIdType: DataTypes.UUID }),
    },
    {
      tableName: 'ai_tryon_results',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  AiTryonResult.associate = (models) => {
    AiTryonResult.belongsTo(models.AiFaceAnalysis, {
      foreignKey: 'analysis_id',
      as: 'analysis',
    });
    AiTryonResult.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return AiTryonResult;
};
