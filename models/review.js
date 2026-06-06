module.exports = (sequelize, DataTypes) => {
  const baseFields = require('./baseFields');
  const Review = sequelize.define(
    'Review',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      customer_id: { type: DataTypes.UUID, allowNull: false },
      salon_id: { type: DataTypes.UUID, allowNull: false },
      booking_id: { type: DataTypes.UUID, allowNull: false, unique: true },
      rating: { type: DataTypes.INTEGER, allowNull: false },
      review: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.ENUM('PUBLISHED', 'HIDDEN'),
        allowNull: false,
        defaultValue: 'PUBLISHED',
      },
      moderated_by: { type: DataTypes.UUID, allowNull: true },
      ...baseFields(DataTypes),
    },
    {
      tableName: 'reviews',
      underscored: true,
    }
  );

  Review.associate = (models) => {
    Review.belongsTo(models.Customer, { foreignKey: 'customer_id', as: 'customer' });
    Review.belongsTo(models.Salon, { foreignKey: 'salon_id', as: 'salon' });
    Review.belongsTo(models.Booking, { foreignKey: 'booking_id', as: 'booking' });
    Review.belongsTo(models.User, { foreignKey: 'moderated_by', as: 'moderator' });
  };

  return Review;
};
