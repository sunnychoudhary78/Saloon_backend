'use strict';

module.exports = (sequelize, DataTypes) => {
  const CompanySetting = sequelize.define(
    'CompanySetting',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      company_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      calendar_year_start: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        validate: {
          isDate: true,
        },
      },
      calendar_year_end: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        validate: {
          isDate: true,
        },
      },
      default_probation_days: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 90,
        validate: {
          min: 0,
        },
      },
      default_notice_period_days: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 30,
        validate: {
          min: 0,
        },
      },
      timezone: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'UTC',
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      designations: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: [],
      },
      gmail_config: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
      },
      company_email_config: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
      },
    },
    {
      tableName: 'company_settings',
      underscored: true,
      timestamps: true,
    }
  );

  CompanySetting.associate = function (models) {
    if (models.Company) {
      CompanySetting.belongsTo(models.Company, {
        foreignKey: 'company_id',
        as: 'company',
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      });
    }
  };

  return CompanySetting;
};
