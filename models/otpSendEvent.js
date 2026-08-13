module.exports = (sequelize, DataTypes) => {
  const OtpSendEvent = sequelize.define(
    'OtpSendEvent',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      phone: { type: DataTypes.STRING, allowNull: false },
      purpose: { type: DataTypes.STRING(20), allowNull: false },
      status: { type: DataTypes.STRING(20), allowNull: false },
      provider_request_id: { type: DataTypes.STRING(120), allowNull: true },
      error_message: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'otp_send_events',
      underscored: true,
      timestamps: false,
      createdAt: 'created_at',
      updatedAt: false,
    },
  );

  return OtpSendEvent;
};
