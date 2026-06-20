'use strict';

const { v4: uuidv4 } = require('uuid');

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

const SEED_CUSTOMERS = [
  { name: 'Aisha Khan', phone: '9100000101' },
  { name: 'Rohan Mehta', phone: '9100000102' },
  { name: 'Neha Patel', phone: '9100000103' },
  { name: 'Vikram Singh', phone: '9100000104' },
  { name: 'Sneha Iyer', phone: '9100000105' },
];

const REVIEW_TEMPLATES = [
  { rating: 5, text: 'Excellent service and very professional staff. Will visit again!' },
  { rating: 5, text: 'Loved the ambience and the stylist really understood what I wanted.' },
  { rating: 4, text: 'Great experience overall. Slightly busy but worth the wait.' },
  { rating: 4, text: 'Clean salon, skilled team, and fair pricing.' },
  { rating: 4, text: 'Good quality service. Booking was smooth and on time.' },
  { rating: 3, text: 'Decent service but had to wait a bit longer than expected.' },
  { rating: 3, text: 'Average experience. Service was fine but nothing exceptional.' },
  { rating: 2, text: 'Service was okay but communication could be better.' },
  { rating: 5, text: 'Best salon in the area — highly recommend!' },
  { rating: 4, text: 'Friendly staff and great results. Happy with my haircut.' },
];

function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function getRoleId(queryInterface, roleName) {
  const [role] = await queryInterface.sequelize.query(
    `SELECT id FROM ${schema}.roles WHERE name = :name LIMIT 1`,
    { replacements: { name: roleName }, type: queryInterface.sequelize.QueryTypes.SELECT }
  );
  if (!role) throw new Error(`Role ${roleName} not found`);
  return role.id;
}

async function ensureSeedCustomers(queryInterface, now, customerRoleId) {
  const customers = [];

  for (const seed of SEED_CUSTOMERS) {
    const [existingUser] = await queryInterface.sequelize.query(
      `SELECT id FROM ${schema}.users WHERE phone = :phone LIMIT 1`,
      { replacements: { phone: seed.phone }, type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    let userId = existingUser?.id;
    if (!userId) {
      userId = uuidv4();
      await queryInterface.bulkInsert({ schema, tableName: 'users' }, [{
        id: userId,
        name: seed.name,
        phone: seed.phone,
        email: null,
        password: null,
        status: 'ACTIVE',
        is_active: true,
        created_at: now,
        updated_at: now,
      }]);

      await queryInterface.bulkInsert({ schema, tableName: 'user_roles' }, [{
        user_id: userId,
        role_id: customerRoleId,
        assigned_at: now,
      }]);
    }

    const [existingCustomer] = await queryInterface.sequelize.query(
      `SELECT id FROM ${schema}.customers WHERE user_id = :userId LIMIT 1`,
      { replacements: { userId }, type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    let customerId = existingCustomer?.id;
    if (!customerId) {
      customerId = uuidv4();
      await queryInterface.bulkInsert({ schema, tableName: 'customers' }, [{
        id: customerId,
        user_id: userId,
        profile_image: null,
        gender: null,
        dob: null,
        status: 'ACTIVE',
        is_active: true,
        created_at: now,
        updated_at: now,
      }]);
    }

    customers.push({ id: customerId, userId, name: seed.name });
  }

  return customers;
}

module.exports = {
  up: async (queryInterface) => {
    const now = new Date();
    const customerRoleId = await getRoleId(queryInterface, 'CUSTOMER');
    const seedCustomers = await ensureSeedCustomers(queryInterface, now, customerRoleId);

    const salons = await queryInterface.sequelize.query(
      `SELECT id, salon_name FROM ${schema}.salons WHERE status = 'ACTIVE' ORDER BY salon_name ASC`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    let bookingSeq = 1;

    for (const salon of salons) {
      const [existingReview] = await queryInterface.sequelize.query(
        `SELECT id FROM ${schema}.reviews WHERE salon_id = :salonId LIMIT 1`,
        { replacements: { salonId: salon.id }, type: queryInterface.sequelize.QueryTypes.SELECT }
      );
      if (existingReview) {
        console.log(`Skipping reviews for ${salon.salon_name} (already has reviews)`);
        continue;
      }

      const services = await queryInterface.sequelize.query(
        `SELECT id, duration_minutes FROM ${schema}.services WHERE salon_id = :salonId AND status = 'ACTIVE' LIMIT 5`,
        { replacements: { salonId: salon.id }, type: queryInterface.sequelize.QueryTypes.SELECT }
      );
      if (services.length === 0) continue;

      const reviewCount = 3 + (bookingSeq % 4);
      const bookings = [];
      const reviews = [];

      for (let i = 0; i < reviewCount; i += 1) {
        const customer = seedCustomers[i % seedCustomers.length];
        const service = services[i % services.length];
        const template = REVIEW_TEMPLATES[(bookingSeq + i) % REVIEW_TEMPLATES.length];
        const bookingId = uuidv4();
        const bookingDate = daysAgo(10 + i * 3);
        const bookingTime = `${10 + (i % 6)}:00:00`;

        bookings.push({
          id: bookingId,
          booking_number: `BK-SEED-${String(bookingSeq).padStart(5, '0')}`,
          customer_id: customer.id,
          salon_id: salon.id,
          service_id: service.id,
          booking_date: bookingDate,
          booking_time: bookingTime,
          notes: null,
          booking_status: 'ACCEPTED',
          booking_type: 'STANDARD',
          premium_amount: null,
          premium_payment_status: 'NONE',
          rejection_reason: null,
          responded_by: null,
          responded_at: now,
          is_active: true,
          created_by: customer.userId,
          updated_by: customer.userId,
          created_at: now,
          updated_at: now,
        });

        reviews.push({
          id: uuidv4(),
          customer_id: customer.id,
          salon_id: salon.id,
          booking_id: bookingId,
          rating: template.rating,
          review: template.text,
          status: 'PUBLISHED',
          moderated_by: null,
          is_active: true,
          created_by: customer.userId,
          updated_by: customer.userId,
          created_at: now,
          updated_at: now,
        });

        bookingSeq += 1;
      }

      await queryInterface.bulkInsert({ schema, tableName: 'bookings' }, bookings);
      await queryInterface.bulkInsert({ schema, tableName: 'reviews' }, reviews);
      console.log(`Seeded ${reviews.length} reviews for ${salon.salon_name}`);
    }
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `DELETE FROM ${schema}.reviews WHERE booking_id IN (
        SELECT id FROM ${schema}.bookings WHERE booking_number LIKE 'BK-SEED-%'
      )`
    );
    await queryInterface.sequelize.query(
      `DELETE FROM ${schema}.bookings WHERE booking_number LIKE 'BK-SEED-%'`
    );
    await queryInterface.sequelize.query(
      `DELETE FROM ${schema}.customers WHERE user_id IN (
        SELECT id FROM ${schema}.users WHERE phone IN ('9100000101','9100000102','9100000103','9100000104','9100000105')
      )`
    );
    await queryInterface.sequelize.query(
      `DELETE FROM ${schema}.user_roles WHERE user_id IN (
        SELECT id FROM ${schema}.users WHERE phone IN ('9100000101','9100000102','9100000103','9100000104','9100000105')
      )`
    );
    await queryInterface.sequelize.query(
      `DELETE FROM ${schema}.users WHERE phone IN ('9100000101','9100000102','9100000103','9100000104','9100000105')`
    );
  },
};
