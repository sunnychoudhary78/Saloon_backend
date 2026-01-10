// models/rolePermission.js
'use strict'
module.exports = (sequelize, DataTypes) => {
    const baseFields = require('./baseFields');
    const RolePermission = sequelize.define(
        'RolePermission',
        {
            role_id: {
                type: DataTypes.UUID,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true
            },
            permission_id: {
                type: DataTypes.UUID,
                primaryKey: true,
            },
            ...baseFields(DataTypes),
        },
        {
            tableName: 'role_permissions',
            timestamps: false,
            underscored: true,
        }
    )

    RolePermission.associate = function (models) {
        // optional associations for completeness
    }

    return RolePermission
}