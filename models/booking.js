module.exports = (sequelize, DataTypes) => {
  const baseFields = require('./baseFields');
  const Booking = sequelize.define(
    'Booking',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      booking_number: { type: DataTypes.STRING(20), allowNull: false, unique: true },
      // Groups all rows created from a single multi-service request so they can
      // be accepted/rejected/cancelled together as one logical booking.
      booking_group_id: { type: DataTypes.UUID, allowNull: true },
      customer_id: { type: DataTypes.UUID, allowNull: false },
      salon_id: { type: DataTypes.UUID, allowNull: false },
      service_id: { type: DataTypes.UUID, allowNull: false },
      booking_date: { type: DataTypes.DATEONLY, allowNull: false },
      booking_time: { type: DataTypes.TIME, allowNull: false },
      notes: { type: DataTypes.TEXT, allowNull: true },
      booking_status: {
        type: DataTypes.ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      booking_type: {
        type: DataTypes.ENUM('STANDARD', 'PREMIUM'),
        allowNull: false,
        defaultValue: 'STANDARD',
      },
      premium_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      premium_payment_status: {
        type: DataTypes.ENUM('NONE', 'PENDING', 'PAID', 'FAILED'),
        allowNull: false,
        defaultValue: 'NONE',
      },
      rejection_reason: { type: DataTypes.TEXT, allowNull: true },
      responded_by: { type: DataTypes.UUID, allowNull: true },
      responded_at: { type: DataTypes.DATE, allowNull: true },
      reminder_sent_at: { type: DataTypes.DATE, allowNull: true },
      ...baseFields(DataTypes),
    },
    {
      tableName: 'bookings',
      underscored: true,
    }
  );

  Booking.associate = (models) => {
    Booking.belongsTo(models.Customer, { foreignKey: 'customer_id', as: 'customer' });
    Booking.belongsTo(models.Salon, { foreignKey: 'salon_id', as: 'salon' });
    Booking.belongsTo(models.Service, { foreignKey: 'service_id', as: 'service' });
    Booking.belongsTo(models.User, { foreignKey: 'responded_by', as: 'responder' });
    Booking.hasOne(models.Review, { foreignKey: 'booking_id', as: 'review' });
    Booking.hasMany(models.Payment, { foreignKey: 'booking_id', as: 'payments' });
  };

  return Booking;
};
