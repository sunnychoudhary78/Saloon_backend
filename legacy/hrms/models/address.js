'use strict';

module.exports = (sequelize, DataTypes) => {
  const Address = sequelize.define('Address', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },

    employee_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'employee_details', key: 'id' },
      onDelete: 'CASCADE',
    },

    // address_type e.g. 'current','permanent','correspondence','other'
    type: { type: DataTypes.STRING, defaultValue: 'other' },

    address_1: { type: DataTypes.STRING },
    address_2: { type: DataTypes.STRING },
    landmark: { type: DataTypes.STRING },
    city: { type: DataTypes.STRING },
    state: { type: DataTypes.STRING },
    district: { type: DataTypes.STRING },
    pin_code: { type: DataTypes.STRING },
    country: { type: DataTypes.STRING, defaultValue: 'India' },

  }, {
    tableName: 'addresses',
    underscored: true,
  });

  Address.associate = (models) => {
    Address.belongsTo(models.EmployeeDetail, { foreignKey: 'employee_id', as: 'employee' });
  };

  return Address;
};
