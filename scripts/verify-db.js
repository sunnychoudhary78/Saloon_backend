require('dotenv').config();
const { sequelize } = require('../models');

(async () => {
  const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

  const meta = await sequelize.query(
    `SELECT name FROM "${schema}"."SequelizeMeta" ORDER BY name`,
    { type: sequelize.QueryTypes.SELECT }
  );
  console.log('Migrations:', meta.map((m) => m.name).join(', '));

  const [{ c: permCount }] = await sequelize.query(
    `SELECT COUNT(*)::int AS c FROM ${schema}.permissions`,
    { type: sequelize.QueryTypes.SELECT }
  );
  const hrmsPerms = await sequelize.query(
    `SELECT name FROM ${schema}.permissions WHERE name LIKE 'company.%' OR name LIKE 'department.%'`,
    { type: sequelize.QueryTypes.SELECT }
  );
  console.log('Permissions:', permCount, '| HRMS leftovers:', hrmsPerms.length);

  const roles = await sequelize.query(
    `SELECT u.email, r.name AS role FROM ${schema}.users u
     JOIN ${schema}.user_roles ur ON ur.user_id = u.id
     JOIN ${schema}.roles r ON r.id = ur.role_id
     WHERE u.email = 'superadmin@example.com'`,
    { type: sequelize.QueryTypes.SELECT }
  );
  console.log('Super admin roles:', roles.map((r) => r.role).join(', '));

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
