module.exports = (sequelize, DataTypes) => {
  const baseFields = require('./baseFields');
  const Coupon = sequelize.define(
    'Coupon',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      discount_type: {
        type: DataTypes.ENUM('PERCENT', 'FLAT'),
        allowNull: false,
      },
      discount_value: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      valid_from: { type: DataTypes.DATE, allowNull: false },
      valid_to: { type: DataTypes.DATE, allowNull: false },
      usage_limit: { type: DataTypes.INTEGER, allowNull: true },
      used_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'EXPIRED'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      ...baseFields(DataTypes),
    },
    {
      tableName: 'coupons',
      underscored: true,
    }
  );

  return Coupon;
};
