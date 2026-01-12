'use strict';
const schema = process.env.DB_SCHEMA || 'template_schema';

module.exports = {
    up: async (queryInterface, Sequelize) => {

        // 1. Get SuperAdmin role
        const roles = await queryInterface.sequelize.query(
            `SELECT id FROM ${schema}.roles WHERE name ILIKE :name LIMIT 1;`,
            {
                replacements: { name: 'SuperAdmin' },
                type: queryInterface.sequelize.QueryTypes.SELECT
            }
        );

        if (!roles || roles.length === 0)
            throw new Error('SuperAdmin role not found');

        const roleId = roles[0].id;

        // 2. Get all permissions
        const permissions = await queryInterface.sequelize.query(
            `SELECT id FROM ${schema}.permissions;`,
            { type: queryInterface.sequelize.QueryTypes.SELECT }
        );

        if (!permissions || permissions.length === 0)
            throw new Error('No permissions found — run permission seeder first.');

        const permIds = permissions.map(p => p.id);

        // 3. Fetch existing mappings to avoid duplicates
        const existing = await queryInterface.sequelize.query(
            `SELECT permission_id FROM ${schema}.role_permissions WHERE role_id = :roleId AND permission_id IN (:permIds);`,
            {
                replacements: { roleId, permIds },
                type: queryInterface.sequelize.QueryTypes.SELECT
            }
        );

        const existingIds = existing.map(e => e.permission_id);

        // 4. Prepare new inserts
        const now = new Date();
        const toInsert = permIds
            .filter(id => !existingIds.includes(id))
            .map(id => ({
                role_id: roleId,
                permission_id: id,
                created_by: null,
                updated_by: null,
                is_active: true,
                created_at: now,
                updated_at: now
            }));

        if (toInsert.length > 0) {
            await queryInterface.bulkInsert(
                { schema, tableName: 'role_permissions' },
                toInsert
            );
        }
    },

    down: async (queryInterface, Sequelize) => {
        // 1. Get SuperAdmin role
        const roles = await queryInterface.sequelize.query(
            `SELECT id FROM ${schema}.roles WHERE name ILIKE :name LIMIT 1;`,
            {
                replacements: { name: 'SuperAdmin' },
                type: queryInterface.sequelize.QueryTypes.SELECT
            }
        );

        if (!roles || roles.length === 0) return;

        const roleId = roles[0].id;

        // 2. Get all permission IDs
        const permissions = await queryInterface.sequelize.query(
            `SELECT id FROM ${schema}.permissions;`,
            { type: queryInterface.sequelize.QueryTypes.SELECT }
        );

        if (!permissions.length) return;

        const permIds = permissions.map(p => p.id);

        // 3. Remove all SuperAdmin permission mappings
        await queryInterface.bulkDelete(
            { schema, tableName: 'role_permissions' },
            {
                role_id: roleId,
                permission_id: permIds
            }
        );
    }
};
