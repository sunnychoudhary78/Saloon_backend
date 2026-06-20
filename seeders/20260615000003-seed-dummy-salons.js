'use strict';

const { v4: uuidv4 } = require('uuid');
const { prepareSeedSalonImages, imageUrls } = require('./helpers/seedSalonImages');

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

const OWNERS = [
  {
    name: 'Priya Menon',
    phone: '9100000001',
    business_name: 'Glow & Grace Pvt Ltd',
    salons: [
      {
        salon_name: 'Glow & Grace',
        description: 'Premium beauty and hair studio for women.',
        address: 'Shipra Mall, Ahinsa Khand, Indirapuram',
        city: 'Ghaziabad',
        state: 'Uttar Pradesh',
        latitude: 28.6339,
        longitude: 77.3695,
        opening_time: '09:00:00',
        closing_time: '21:00:00',
        imageIds: [1, 2, 3],
        services: [
          { category: 'Haircut', name: 'Women Haircut', price: 499, duration: 45 },
          { category: 'Hair Color', name: 'Global Color', price: 2499, duration: 120 },
          { category: 'Facial', name: 'Gold Facial', price: 1299, duration: 60 },
        ],
      },
    ],
  },
  {
    name: 'Rahul Sharma',
    phone: '9100000002',
    business_name: 'Elite Cuts Grooming',
    salons: [
      {
        salon_name: 'Elite Cuts',
        description: 'Modern men grooming and styling lounge.',
        address: 'Indirapuram Habitat Centre, Ahinsa Khand',
        city: 'Ghaziabad',
        state: 'Uttar Pradesh',
        latitude: 28.6388,
        longitude: 77.3706,
        opening_time: '10:00:00',
        closing_time: '20:00:00',
        imageIds: [4, 5],
        services: [
          { category: 'Haircut', name: 'Men Premium Cut', price: 399, duration: 30 },
          { category: 'Beard', name: 'Beard Styling', price: 199, duration: 20 },
          { category: 'Hair Color', name: 'Beard Color', price: 299, duration: 25 },
        ],
      },
    ],
  },
  {
    name: 'Ananya Reddy',
    phone: '9100000003',
    business_name: 'Ananya Salons Group',
    salons: [
      {
        salon_name: 'Urban Style Salon',
        description: 'Trendy cuts and colors for all ages.',
        address: 'Near Vaishali Metro Station, Sector 4',
        city: 'Ghaziabad',
        state: 'Uttar Pradesh',
        latitude: 28.6495,
        longitude: 77.3398,
        opening_time: '09:30:00',
        closing_time: '21:30:00',
        imageIds: [6, 7, 8, 9],
        services: [
          { category: 'Haircut', name: 'Style Cut', price: 449, duration: 35 },
          { category: 'Hair Color', name: 'Highlights', price: 3499, duration: 150 },
          { category: 'Spa', name: 'Head Spa', price: 899, duration: 45 },
        ],
      },
      {
        salon_name: 'Serenity Spa',
        description: 'Relaxing spa and wellness treatments.',
        address: 'Sahibabad Railway Station Road',
        city: 'Ghaziabad',
        state: 'Uttar Pradesh',
        latitude: 28.6714,
        longitude: 77.3505,
        opening_time: '08:00:00',
        closing_time: '20:00:00',
        imageIds: [10, 11, 12],
        services: [
          { category: 'Spa', name: 'Aromatherapy Spa', price: 1999, duration: 90 },
          { category: 'Massage', name: 'Swedish Massage', price: 1499, duration: 60 },
          { category: 'Facial', name: 'Hydrating Facial', price: 999, duration: 50 },
        ],
      },
    ],
  },
  {
    name: 'Vikram Patel',
    phone: '9100000004',
    business_name: 'The Barber Lounge Co.',
    salons: [
      {
        salon_name: 'The Barber Lounge',
        description: 'Classic barber shop with premium service.',
        address: 'Mohan Nagar, Ram Nagar',
        city: 'Ghaziabad',
        state: 'Uttar Pradesh',
        latitude: 28.6763,
        longitude: 77.3736,
        opening_time: '10:00:00',
        closing_time: '21:00:00',
        imageIds: [13, 14, 15],
        services: [
          { category: 'Haircut', name: 'Classic Cut', price: 299, duration: 25 },
          { category: 'Beard', name: 'Hot Towel Shave', price: 249, duration: 30 },
          { category: 'Haircut', name: 'Kids Cut', price: 199, duration: 20 },
        ],
      },
    ],
  },
  {
    name: 'Meera Iyer',
    phone: '9100000005',
    business_name: 'Meera Beauty Ventures',
    salons: [
      {
        salon_name: 'Bliss Salon',
        description: 'Full-service salon for hair and skin.',
        address: 'Sector 62, Noida',
        city: 'Noida',
        state: 'Uttar Pradesh',
        latitude: 28.6289,
        longitude: 77.3648,
        opening_time: '09:00:00',
        closing_time: '20:30:00',
        imageIds: [16, 17, 18],
        services: [
          { category: 'Facial', name: 'Anti-Ageing Facial', price: 1599, duration: 70 },
          { category: 'Haircut', name: 'Blow Dry & Cut', price: 599, duration: 50 },
          { category: 'Spa', name: 'Pedicure Spa', price: 799, duration: 45 },
        ],
      },
      {
        salon_name: 'Bridal Studio by Meera',
        description: 'Bridal makeup and pre-wedding packages.',
        address: 'Vasundhara Sector 15',
        city: 'Ghaziabad',
        state: 'Uttar Pradesh',
        latitude: 28.6661,
        longitude: 77.3864,
        opening_time: '08:30:00',
        closing_time: '19:00:00',
        imageIds: [19, 20, 21],
        services: [
          { category: 'Bridal Makeup', name: 'Bridal Makeup', price: 8999, duration: 180 },
          { category: 'Bridal Makeup', name: 'Engagement Look', price: 4999, duration: 120 },
          { category: 'Facial', name: 'Bridal Facial', price: 1999, duration: 75 },
        ],
      },
    ],
  },
  {
    name: 'Arjun Singh',
    phone: '9100000006',
    business_name: 'Royal Grooming House',
    salons: [
      {
        salon_name: 'Royal Grooming',
        description: 'Luxury grooming experience for men.',
        address: '11 Mall Road',
        city: 'Jaipur',
        state: 'Rajasthan',
        opening_time: '10:00:00',
        closing_time: '22:00:00',
        imageIds: [22, 23, 24, 25],
        services: [
          { category: 'Haircut', name: 'Royal Cut', price: 499, duration: 40 },
          { category: 'Beard', name: 'Beard Trim & Shape', price: 299, duration: 25 },
          { category: 'Massage', name: 'Head Massage', price: 399, duration: 20 },
          { category: 'Hair Color', name: 'Grey Blending', price: 599, duration: 40 },
        ],
      },
    ],
  },
  {
    name: 'Kavya Nair',
    phone: '9100000007',
    business_name: 'Kavya Wellness Salons',
    salons: [
      {
        salon_name: 'Fresh Look Salon',
        description: 'Affordable styling with quality products.',
        address: '4 Marine Drive',
        city: 'Kochi',
        state: 'Kerala',
        opening_time: '09:00:00',
        closing_time: '20:00:00',
        imageIds: [26, 27],
        services: [
          { category: 'Haircut', name: 'Basic Cut', price: 249, duration: 25 },
          { category: 'Facial', name: 'Fruit Facial', price: 699, duration: 45 },
        ],
      },
      {
        salon_name: 'Zen Spa',
        description: 'Calm spa retreat in the city.',
        address: '2 Park Street',
        city: 'Kolkata',
        state: 'West Bengal',
        opening_time: '08:00:00',
        closing_time: '21:00:00',
        imageIds: [28, 29, 30],
        services: [
          { category: 'Spa', name: 'Full Body Spa', price: 2999, duration: 120 },
          { category: 'Massage', name: 'Deep Tissue Massage', price: 1799, duration: 75 },
          { category: 'Facial', name: 'Detox Facial', price: 1199, duration: 60 },
        ],
      },
    ],
  },
];

const DEMO_CUSTOMER = {
  name: 'Demo Customer',
  phone: '9100000099',
};

async function getRoleId(queryInterface, roleName) {
  const [role] = await queryInterface.sequelize.query(
    `SELECT id FROM ${schema}.roles WHERE name = :name LIMIT 1`,
    { replacements: { name: roleName }, type: queryInterface.sequelize.QueryTypes.SELECT }
  );
  if (!role) throw new Error(`Role ${roleName} not found`);
  return role.id;
}

async function getCategoryMap(queryInterface) {
  const rows = await queryInterface.sequelize.query(
    `SELECT id, name FROM ${schema}.service_categories`,
    { type: queryInterface.sequelize.QueryTypes.SELECT }
  );
  return Object.fromEntries(rows.map((r) => [r.name, r.id]));
}

async function userExists(queryInterface, phone) {
  const [row] = await queryInterface.sequelize.query(
    `SELECT id FROM ${schema}.users WHERE phone = :phone LIMIT 1`,
    { replacements: { phone }, type: queryInterface.sequelize.QueryTypes.SELECT }
  );
  return Boolean(row);
}

module.exports = {
  up: async (queryInterface) => {
    const now = new Date();
    const urlMap = await prepareSeedSalonImages();
    const ownerRoleId = await getRoleId(queryInterface, 'SALON_OWNER');
    const customerRoleId = await getRoleId(queryInterface, 'CUSTOMER');
    const catByName = await getCategoryMap(queryInterface);

    for (const owner of OWNERS) {
      if (await userExists(queryInterface, owner.phone)) {
        console.log(`Skipping seeded owner ${owner.phone} (already exists)`);
        continue;
      }

      const userId = uuidv4();
      const ownerId = uuidv4();

      await queryInterface.bulkInsert({ schema, tableName: 'users' }, [{
        id: userId,
        name: owner.name,
        phone: owner.phone,
        email: null,
        password: null,
        status: 'ACTIVE',
        is_active: true,
        created_at: now,
        updated_at: now,
      }]);

      await queryInterface.bulkInsert({ schema, tableName: 'user_roles' }, [{
        user_id: userId,
        role_id: ownerRoleId,
        assigned_at: now,
      }]);

      await queryInterface.bulkInsert({ schema, tableName: 'salon_owners' }, [{
        id: ownerId,
        user_id: userId,
        business_name: owner.business_name,
        gst_number: null,
        status: 'ACTIVE',
        is_active: true,
        created_at: now,
        updated_at: now,
      }]);

      for (const salon of owner.salons) {
        const salonId = uuidv4();
        const gallery = imageUrls(urlMap, salon.imageIds);

        await queryInterface.bulkInsert({ schema, tableName: 'salons' }, [{
          id: salonId,
          owner_id: ownerId,
          application_id: null,
          salon_name: salon.salon_name,
          description: salon.description,
          address: salon.address,
          city: salon.city,
          state: salon.state,
          latitude: salon.latitude ?? null,
          longitude: salon.longitude ?? null,
          cover_image: gallery[0],
          gallery_images: JSON.stringify(gallery),
          phone: owner.phone,
          opening_time: salon.opening_time,
          closing_time: salon.closing_time,
          status: 'ACTIVE',
          is_active: true,
          created_at: now,
          updated_at: now,
        }]);

        for (const svc of salon.services) {
          const categoryId = catByName[svc.category];
          if (!categoryId) throw new Error(`Category not found: ${svc.category}`);

          await queryInterface.bulkInsert({ schema, tableName: 'services' }, [{
            id: uuidv4(),
            salon_id: salonId,
            category_id: categoryId,
            service_name: svc.name,
            description: null,
            duration_minutes: svc.duration,
            price: svc.price,
            discount_price: null,
            status: 'ACTIVE',
            is_active: true,
            created_at: now,
            updated_at: now,
          }]);
        }
      }
    }

    if (!(await userExists(queryInterface, DEMO_CUSTOMER.phone))) {
      const customerUserId = uuidv4();
      await queryInterface.bulkInsert({ schema, tableName: 'users' }, [{
        id: customerUserId,
        name: DEMO_CUSTOMER.name,
        phone: DEMO_CUSTOMER.phone,
        email: null,
        password: null,
        status: 'ACTIVE',
        is_active: true,
        created_at: now,
        updated_at: now,
      }]);

      await queryInterface.bulkInsert({ schema, tableName: 'user_roles' }, [{
        user_id: customerUserId,
        role_id: customerRoleId,
        assigned_at: now,
      }]);

      await queryInterface.bulkInsert({ schema, tableName: 'customers' }, [{
        id: uuidv4(),
        user_id: customerUserId,
        profile_image: null,
        gender: null,
        dob: null,
        status: 'ACTIVE',
        is_active: true,
        created_at: now,
        updated_at: now,
      }]);
    }
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `DELETE FROM ${schema}.users WHERE phone LIKE '910000000%'`
    );
  },
};
