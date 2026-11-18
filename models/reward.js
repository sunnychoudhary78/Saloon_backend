module.exports = (sequelize, DataTypes) => {
  const baseFields = require('./baseFields');
  const Reward = sequelize.define(
    'Reward',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      title: { type: DataTypes.STRING(255), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: false },
      brand_name: { type: DataTypes.STRING(100), allowNull: false },
      image: { type: DataTypes.STRING(500), allowNull: true },
      reward_code: { type: DataTypes.STRING(100), allowNull: false },
      external_url: { type: DataTypes.STRING(500), allowNull: true },
      reward_type: {
        type: DataTypes.ENUM('PARTNER_OFFER', 'SALON_DISCOUNT'),
        allowNull: false,
        defaultValue: 'PARTNER_OFFER',
      },
      validity_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 7 },
      // Spend slab eligibility (in INR)
      min_booking_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      max_booking_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      // Selection control: higher priority tier wins first; weight decides ratio within same priority
      priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 10,
      },
      weight: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 10,
      },
      // Usage & budget limits
      max_claims_per_customer: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 1,
      },
      total_quantity: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      issued_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      // Internal next-booking discount configuration (used when reward_type = 'SALON_DISCOUNT')
      discount_type: {
        type: DataTypes.ENUM('PERCENT', 'FLAT'),
        allowNull: true,
      },
      discount_value: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      min_order_value: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
      },
      max_discount_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'INACTIVE'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      ...baseFields(DataTypes),
    },
    {
      tableName: 'rewards',
      underscored: true,
    }
  );

  Reward.associate = (models) => {
    Reward.hasMany(models.CustomerReward, { foreignKey: 'reward_id', as: 'customer_rewards' });
  };

  return Reward;
};
