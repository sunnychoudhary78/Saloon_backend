// models/permission.js
'use strict'
module.exports = (sequelize, DataTypes) => {
    const baseFields = require('./baseFields');
    const Permission = sequelize.define(
        'Permission',
        {
            id: {
                type: DataTypes.UUID,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true
            },
            name: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true, // e.g. 'employee.create', 'leave.approve'
            },
            displayName: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            
            ...baseFields(DataTypes, { userIdType: DataTypes.UUID }),
        },
        {
            tableName: 'permissions',
            underscored: true,
            timestamps: true,
        }
    )

    Permission.associate = function (models) {
        // Many-to-many: Role <-> Permission through role_permissions
        Permission.belongsToMany(models.Role, {
            through: models.RolePermission || 'role_permissions',
            foreignKey: 'permission_id',
            otherKey: 'role_id',
            as: 'roles',
        })
        if (models.User) {
            Permission.belongsTo(models.User, { foreignKey: 'created_by', as: 'createdBy' });
            Permission.belongsTo(models.User, { foreignKey: 'updated_by', as: 'updatedBy' });
        }
    }

    return Permission
}
