module.exports = (sequelize, DataTypes) => {
  const CustomerReward = sequelize.define(
    'CustomerReward',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      customer_id: { type: DataTypes.UUID, allowNull: false },
      booking_id: { type: DataTypes.UUID, allowNull: true },
      reward_id: { type: DataTypes.UUID, allowNull: false },
      status: {
        type: DataTypes.ENUM('UNCLAIMED', 'CLAIMED', 'EXPIRED'),
        allowNull: false,
        defaultValue: 'UNCLAIMED',
      },
      unlocked_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      claimed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: 'customer_rewards',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  CustomerReward.associate = (models) => {
    CustomerReward.belongsTo(models.Customer, { foreignKey: 'customer_id', as: 'customer' });
    CustomerReward.belongsTo(models.Booking, { foreignKey: 'booking_id', as: 'booking' });
    CustomerReward.belongsTo(models.Reward, { foreignKey: 'reward_id', as: 'reward' });
  };

  return CustomerReward;
};

