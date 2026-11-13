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
      title: { type: DataTypes.STRING(255), allowNull: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      image: { type: DataTypes.STRING(500), allowNull: true },
      discount_type: {
        type: DataTypes.ENUM('PERCENT', 'FLAT'),
        allowNull: false,
      },
      discount_value: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      min_order_value: { type: DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: 0 },
      max_discount_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
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
