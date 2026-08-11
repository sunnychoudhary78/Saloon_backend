module.exports = (sequelize, DataTypes) => {
  const CustomerFavorite = sequelize.define(
    'CustomerFavorite',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      user_id: { type: DataTypes.UUID, allowNull: false },
      salon_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'customer_favorites',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      indexes: [
        {
          unique: true,
          fields: ['user_id', 'salon_id'],
          name: 'customer_favorites_user_salon_uq',
        },
      ],
    },
  );

  CustomerFavorite.associate = (models) => {
    CustomerFavorite.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    CustomerFavorite.belongsTo(models.Salon, { foreignKey: 'salon_id', as: 'salon' });
  };

  return CustomerFavorite;
};
