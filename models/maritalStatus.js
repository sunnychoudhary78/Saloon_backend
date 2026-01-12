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
    ...baseFields(DataTypes, { userIdType: DataTypes.UUID }),
  };

  const MaritalStatus = sequelize.define('MaritalStatus', fields, {
    tableName: 'marital_statuses',
    underscored: true,
  });

  MaritalStatus.associate = function () {};

  return MaritalStatus;
};
