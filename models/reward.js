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

