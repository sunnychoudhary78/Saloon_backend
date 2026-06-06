const baseFields = require('./baseFields');

module.exports = (sequelize, DataTypes) => {
  const Department = sequelize.define('Department', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },

    // FK to users table (nullable — may be assigned after creation)
    department_head_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users', // table name
        key: 'id'
      }
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'companies',
        key: 'id',
      },
    },

    ...baseFields(DataTypes, { userIdType: DataTypes.UUID }),

  }, {
    tableName: 'departments',
    underscored: true,
    indexes: [
      { unique: true, fields: ['company_id', 'name'] },
    ]
  });

  Department.associate = (models) => {
    // optional: department belongsTo a User as the department_head
    if (models.User) {
      Department.belongsTo(models.User, {
        foreignKey: 'department_head_id',
        as: 'department_head',
        constraints: true,
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      });
    }

    // audit relations for created_by / updated_by
    if (models.User) {
      Department.belongsTo(models.User, {
        foreignKey: 'created_by',
        as: 'createdBy',
      });
      Department.belongsTo(models.User, {
        foreignKey: 'updated_by',
        as: 'updatedBy',
      });
    }

    if (models.Company) {
      Department.belongsTo(models.Company, {
        foreignKey: 'company_id',
        as: 'company',
        constraints: true,
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      });
    }

    // other associations (if any) go here...
  };

  return Department;
};
