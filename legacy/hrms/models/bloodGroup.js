'use strict';

const baseFields = require('./baseFields');

module.exports = (sequelize, DataTypes) => {
  const fields = {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    label: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    rh_positive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    ...baseFields(DataTypes, { userIdType: DataTypes.UUID }),
  };

  const BloodGroup = sequelize.define('BloodGroup', fields, {
    tableName: 'blood_groups',
    underscored: true,
  });

  BloodGroup.associate = function () {};

  return BloodGroup;
};
