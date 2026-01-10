'use strict';

module.exports = (sequelize, DataTypes) => {
    const TableConfig = sequelize.define(
        'TableConfig',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: DataTypes.UUIDV4,
            },
            user_id: {
                type: DataTypes.UUID,
                allowNull: false,
            },
            table_key: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            config: {
                type: DataTypes.JSONB,
                allowNull: false,
                defaultValue: [],
            },
            created_by: {
                type: DataTypes.UUID,
                allowNull: true,
            },
            updated_by: {
                type: DataTypes.UUID,
                allowNull: true,
            },
            is_active: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            created_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
            },
            updated_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
            },
        },
        {
            tableName: 'table_configs',
            underscored: true,
            // optional: scope to only active configs in some queries
            // defaultScope: { where: { is_active: true } },
        }
    );

    TableConfig.associate = (models) => {
        // owner
        TableConfig.belongsTo(models.User, {
            foreignKey: 'user_id',
            as: 'user',
        });

        // created_by / updated_by relations for audit (optional)
        TableConfig.belongsTo(models.User, {
            foreignKey: 'created_by',
            as: 'createdBy',
        });
        TableConfig.belongsTo(models.User, {
            foreignKey: 'updated_by',
            as: 'updatedBy',
        });
    };

    return TableConfig;
};
