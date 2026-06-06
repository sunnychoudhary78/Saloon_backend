module.exports = (sequelize, DataTypes) => {
  const baseFields = require('./baseFields');
  const PlatformSetting = sequelize.define(
    'PlatformSetting',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      setting_key: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      setting_value: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      description: { type: DataTypes.TEXT, allowNull: true },
      ...baseFields(DataTypes),
    },
    {
      tableName: 'platform_settings',
      underscored: true,
    }
  );

  return PlatformSetting;
};
