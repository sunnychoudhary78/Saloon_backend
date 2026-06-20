module.exports = (sequelize, DataTypes) => {
  const DeviceToken = sequelize.define(
    'DeviceToken',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      user_id: { type: DataTypes.UUID, allowNull: false },
      token: { type: DataTypes.STRING(512), allowNull: false, unique: true },
      platform: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'android' },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'device_tokens',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  );

  DeviceToken.associate = (models) => {
    DeviceToken.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return DeviceToken;
};
