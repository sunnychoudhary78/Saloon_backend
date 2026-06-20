module.exports = (sequelize, DataTypes) => {
  const baseFields = require('./baseFields');
  const Customer = sequelize.define(
    'Customer',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      user_id: { type: DataTypes.UUID, allowNull: false, unique: true },
      profile_image: { type: DataTypes.STRING, allowNull: true },
      gender: { type: DataTypes.STRING, allowNull: true },
      dob: { type: DataTypes.DATEONLY, allowNull: true },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'BLOCKED'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      ...baseFields(DataTypes),
    },
    {
      tableName: 'customers',
      underscored: true,
    }
  );

  Customer.associate = (models) => {
    Customer.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    Customer.hasMany(models.Booking, { foreignKey: 'customer_id', as: 'bookings' });
    Customer.hasMany(models.Review, { foreignKey: 'customer_id', as: 'reviews' });
    Customer.hasMany(models.Payment, { foreignKey: 'customer_id', as: 'payments' });
  };

  return Customer;
};
