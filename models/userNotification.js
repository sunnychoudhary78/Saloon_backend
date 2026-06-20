module.exports = (sequelize, DataTypes) => {
  const UserNotification = sequelize.define(
    'UserNotification',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      user_id: { type: DataTypes.UUID, allowNull: false },
      type: { type: DataTypes.STRING(50), allowNull: false },
      title: { type: DataTypes.STRING(255), allowNull: false },
      body: { type: DataTypes.TEXT, allowNull: false },
      data: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      read_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'user_notifications',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  );

  UserNotification.associate = (models) => {
    UserNotification.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return UserNotification;
};
