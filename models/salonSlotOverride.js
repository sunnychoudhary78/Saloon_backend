module.exports = (sequelize, DataTypes) => {
  const baseFields = require('./baseFields');
  const SalonSlotOverride = sequelize.define(
    'SalonSlotOverride',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      salon_id: { type: DataTypes.UUID, allowNull: false },
      slot_date: { type: DataTypes.DATEONLY, allowNull: false },
      slot_start: { type: DataTypes.TIME, allowNull: false },
      is_blocked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      note: { type: DataTypes.TEXT, allowNull: true },
      ...baseFields(DataTypes, { userIdType: DataTypes.UUID }),
    },
    {
      tableName: 'salon_slot_overrides',
      underscored: true,
    }
  );

  SalonSlotOverride.associate = (models) => {
    SalonSlotOverride.belongsTo(models.Salon, { foreignKey: 'salon_id', as: 'salon' });
  };

  return SalonSlotOverride;
};
