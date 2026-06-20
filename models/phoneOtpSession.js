module.exports = (sequelize, DataTypes) => {
  const PhoneOtpSession = sequelize.define(
    'PhoneOtpSession',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      phone: { type: DataTypes.STRING, allowNull: false, unique: true },
      otp: { type: DataTypes.STRING, allowNull: false },
      otp_expires_at: { type: DataTypes.DATE, allowNull: false },
      attempt_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'phone_otp_sessions',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return PhoneOtpSession;
};
