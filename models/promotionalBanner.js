module.exports = (sequelize, DataTypes) => {
  const baseFields = require('./baseFields');
  const PromotionalBanner = sequelize.define(
    'PromotionalBanner',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      title: { type: DataTypes.STRING, allowNull: false },
      image: { type: DataTypes.STRING, allowNull: false },
      redirect_type: {
        type: DataTypes.ENUM('NONE', 'SALON', 'SERVICE', 'CATEGORY', 'EXTERNAL_URL'),
        allowNull: false,
        defaultValue: 'NONE',
      },
      redirect_value: { type: DataTypes.STRING(255), allowNull: true },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'INACTIVE'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      ...baseFields(DataTypes),
    },
    {
      tableName: 'promotional_banners',
      underscored: true,
    }
  );

  return PromotionalBanner;
};
