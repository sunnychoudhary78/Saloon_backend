'use strict';

const baseFields = require('./baseFields');

module.exports = (sequelize, DataTypes) => {
  const fields = {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    ...baseFields(DataTypes, { userIdType: DataTypes.UUID }),
  };

  const CommonVariable = sequelize.define('CommonVariable', fields, {
    tableName: 'common_variables',
    underscored: true,
  });

  CommonVariable.associate = function () {};

  return CommonVariable;
};
