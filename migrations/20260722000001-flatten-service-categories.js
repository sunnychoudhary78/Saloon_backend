'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';
const bannerEnum = 'enum_promotional_banners_redirect_type';
const categoryPermissions = [
  'serviceCategory.read',
  'serviceCategory.create',
  'serviceCategory.update',
  'serviceCategory.makeInactive',
];

const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
const qualified = (name) => `${quote(schema)}.${quote(name)}`;

async function replaceBannerEnum(queryInterface, values, transaction) {
  const oldType = qualified(bannerEnum);
  const nextTypeName = `${bannerEnum}_next`;
  const nextType = qualified(nextTypeName);
  const valueSql = values.map((value) => `'${value}'`).join(', ');

  await queryInterface.sequelize.query(`DROP TYPE IF EXISTS ${nextType};`, { transaction });
  await queryInterface.sequelize.query(`CREATE TYPE ${nextType} AS ENUM (${valueSql});`, { transaction });
  await queryInterface.sequelize.query(
    `ALTER TABLE ${qualified('promotional_banners')}
     ALTER COLUMN redirect_type DROP DEFAULT,
     ALTER COLUMN redirect_type TYPE ${nextType}
       USING redirect_type::text::${nextType},
     ALTER COLUMN redirect_type SET DEFAULT 'NONE'::${nextType};`,
    { transaction }
  );
  await queryInterface.sequelize.query(`DROP TYPE ${oldType};`, { transaction });
  await queryInterface.sequelize.query(
    `ALTER TYPE ${nextType} RENAME TO ${quote(bannerEnum)};`,
    { transaction }
  );
}

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `UPDATE ${qualified('promotional_banners')}
         SET redirect_type = 'NONE', redirect_value = NULL, updated_at = NOW()
         WHERE redirect_type = 'CATEGORY';`,
        { transaction }
      );
      await replaceBannerEnum(
        queryInterface,
        ['NONE', 'SALON', 'SERVICE', 'EXTERNAL_URL'],
        transaction
      );

      await queryInterface.sequelize.query(
        `UPDATE ${qualified('services')} AS service
         SET service_name = category.name,
             description = CASE
               WHEN NULLIF(BTRIM(service.description), '') IS NULL
                 THEN service.service_name
               ELSE service.service_name || E'\n' || service.description
             END,
             updated_at = NOW()
         FROM ${qualified('service_categories')} AS category
         WHERE category.id = service.category_id;`,
        { transaction }
      );

      await queryInterface.sequelize.query(
        `WITH ranked_services AS (
           SELECT id,
                  ROW_NUMBER() OVER (
                    PARTITION BY
                      salon_id,
                      LOWER(REGEXP_REPLACE(BTRIM(service_name), '\\s+', ' ', 'g')),
                      COALESCE(LOWER(REGEXP_REPLACE(BTRIM(description), '\\s+', ' ', 'g')), ''),
                      price
                    ORDER BY id
                  ) AS duplicate_number
           FROM ${qualified('services')}
         )
         UPDATE ${qualified('services')} AS service
         SET description = service.description || E'\nDuplicate record: ' || service.id::text,
             updated_at = NOW()
         FROM ranked_services
         WHERE ranked_services.id = service.id
           AND ranked_services.duplicate_number > 1;`,
        { transaction }
      );

      await queryInterface.removeColumn(
        { schema, tableName: 'services' },
        'category_id',
        { transaction }
      );
      await queryInterface.dropTable(
        { schema, tableName: 'service_categories' },
        { transaction }
      );
      await queryInterface.sequelize.query(
        `DROP TYPE IF EXISTS ${qualified('enum_service_categories_status')};`,
        { transaction }
      );

      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX services_salon_normalized_identity_uq
         ON ${qualified('services')} (
           salon_id,
           LOWER(REGEXP_REPLACE(BTRIM(service_name), '\\s+', ' ', 'g')),
           COALESCE(LOWER(REGEXP_REPLACE(BTRIM(description), '\\s+', ' ', 'g')), ''),
           price
         );`,
        { transaction }
      );

      await queryInterface.sequelize.query(
        `DELETE FROM ${qualified('role_permissions')}
         WHERE permission_id IN (
           SELECT id FROM ${qualified('permissions')} WHERE name IN (:categoryPermissions)
         );`,
        { replacements: { categoryPermissions }, transaction }
      );
      await queryInterface.sequelize.query(
        `DELETE FROM ${qualified('permissions')} WHERE name IN (:categoryPermissions);`,
        { replacements: { categoryPermissions }, transaction }
      );
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeIndex(
        { schema, tableName: 'services' },
        'services_salon_normalized_identity_uq',
        { transaction }
      );

      await queryInterface.createTable(
        { schema, tableName: 'service_categories' },
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
            primaryKey: true,
          },
          name: { type: Sequelize.STRING, allowNull: false, unique: true },
          description: { type: Sequelize.TEXT, allowNull: true },
          sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          status: {
            type: Sequelize.ENUM('ACTIVE', 'INACTIVE'),
            allowNull: false,
            defaultValue: 'ACTIVE',
          },
          created_by: { type: Sequelize.UUID, allowNull: true },
          updated_by: { type: Sequelize.UUID, allowNull: true },
          is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
          updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
        },
        { transaction }
      );

      await queryInterface.sequelize.query(
        `INSERT INTO ${qualified('service_categories')}
           (id, name, description, sort_order, status, is_active, created_at, updated_at)
         SELECT gen_random_uuid(), MIN(service_name), NULL,
                ROW_NUMBER() OVER (ORDER BY MIN(service_name)) - 1,
                'ACTIVE', TRUE, NOW(), NOW()
         FROM ${qualified('services')}
         GROUP BY LOWER(REGEXP_REPLACE(BTRIM(service_name), '\\s+', ' ', 'g'));`,
        { transaction }
      );

      await queryInterface.addColumn(
        { schema, tableName: 'services' },
        'category_id',
        { type: Sequelize.UUID, allowNull: true },
        { transaction }
      );
      await queryInterface.sequelize.query(
        `UPDATE ${qualified('services')} AS service
         SET category_id = category.id,
             service_name = SPLIT_PART(service.description, E'\n', 1),
             description = CASE
               WHEN POSITION(E'\n' IN service.description) > 0
                 THEN NULLIF(
                   SUBSTRING(service.description FROM POSITION(E'\n' IN service.description) + 1),
                   ''
                 )
               ELSE NULL
             END,
             updated_at = NOW()
         FROM ${qualified('service_categories')} AS category
         WHERE LOWER(REGEXP_REPLACE(BTRIM(service.service_name), '\\s+', ' ', 'g'))
             = LOWER(REGEXP_REPLACE(BTRIM(category.name), '\\s+', ' ', 'g'));`,
        { transaction }
      );
      await queryInterface.changeColumn(
        { schema, tableName: 'services' },
        'category_id',
        {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: { tableName: 'service_categories', schema }, key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        { transaction }
      );

      await replaceBannerEnum(
        queryInterface,
        ['NONE', 'SALON', 'SERVICE', 'CATEGORY', 'EXTERNAL_URL'],
        transaction
      );

      const permissionLabels = [
        ['serviceCategory.read', 'Read Categories', 'View service categories'],
        ['serviceCategory.create', 'Create Category', 'Create service category'],
        ['serviceCategory.update', 'Update Category', 'Update service category'],
        ['serviceCategory.makeInactive', 'Deactivate Category', 'Deactivate category'],
      ];
      for (const [name, displayName, description] of permissionLabels) {
        await queryInterface.sequelize.query(
          `INSERT INTO ${qualified('permissions')}
             (id, name, display_name, description, is_active, created_at, updated_at)
           VALUES (gen_random_uuid(), :name, :displayName, :description, TRUE, NOW(), NOW())
           ON CONFLICT (name) DO NOTHING;`,
          { replacements: { name, displayName, description }, transaction }
        );
      }
      await queryInterface.sequelize.query(
        `INSERT INTO ${qualified('role_permissions')}
           (role_id, permission_id, created_at, updated_at)
         SELECT role.id, permission.id, NOW(), NOW()
         FROM ${qualified('roles')} AS role
         CROSS JOIN ${qualified('permissions')} AS permission
         WHERE (
             role.name IN ('SUPER_ADMIN', 'ADMIN')
             AND permission.name IN (:categoryPermissions)
           )
           OR (
             role.name IN ('SUPPORT_AGENT', 'MARKETING_MANAGER')
             AND permission.name = 'serviceCategory.read'
           )
         ON CONFLICT DO NOTHING;`,
        { replacements: { categoryPermissions }, transaction }
      );
    });
  },
};
