'use strict';

const { v4: uuidv4 } = require('uuid');
const { prepareSeedSalonImages, imageUrls } = require('./helpers/seedSalonImages');
const { prepareSeedStaffImages, staffImageUrl } = require('./helpers/seedStaffImages');

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

/**
 * Demo dataset for `npm run db:reset` (full wipe → migrate → seed).
 * Always inserts — do not re-run against a DB that already has these phones.
 *
 * Services use a single customer-facing `service_name` (post-flatten).
 * Prefer exact names from constants/salonServiceNames.js so app icons resolve.
 * Each salon declares salon_type: MEN | WOMEN | UNISEX.
 */
const OWNERS = [
  {
    name: 'Priya Menon',
    phone: '9100000001',
    business_name: 'Glow & Grace Pvt Ltd',
    salons: [
      {
        salon_name: 'Glow & Grace',
        salon_type: 'WOMEN',
        description: 'Premium beauty and hair studio for women — cuts, colour, and skin care under one roof.',
        address: 'Shipra Mall, Ahinsa Khand, Indirapuram',
        city: 'Ghaziabad',
        state: 'Uttar Pradesh',
        latitude: 28.6339,
        longitude: 77.3695,
        opening_time: '09:00:00',
        closing_time: '21:00:00',
        is_featured: true,
        featured_sort_order: 1,
        imageIds: [1, 2, 3],
        staff: [
          { name: 'Sneha Kapoor', imageId: 1 },
          { name: 'Anjali Verma', imageId: 2 },
          { name: 'Riya Malhotra', imageId: 3 },
        ],
        services: [
          { service_name: 'Haircut', description: 'Consultation, wash, and precision cut for women.', price: 499, duration: 45 },
          { service_name: 'Hair Color', description: 'Global colour with ammonia-free formulas.', price: 2499, duration: 120 },
          { service_name: 'Facial', description: 'Gold facial for glow and deep cleanse.', price: 1299, duration: 60 },
          { service_name: 'Threading', description: 'Eyebrow and upper-lip threading.', price: 99, duration: 15 },
          { service_name: 'Party Makeup', description: 'Soft glam for evenings out.', price: 1999, duration: 75 },
          { service_name: 'Nail Art', description: 'Custom nail art with gel finish.', price: 799, duration: 45 },
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
        salon_type: 'MEN',
        description: 'Modern men\'s grooming lounge — sharp cuts, beard work, and quick colour.',
        address: 'Indirapuram Habitat Centre, Ahinsa Khand',
        city: 'Ghaziabad',
        state: 'Uttar Pradesh',
        latitude: 28.6388,
        longitude: 77.3706,
        opening_time: '10:00:00',
        closing_time: '20:00:00',
        is_featured: true,
        featured_sort_order: 2,
        imageIds: [4, 5],
        staff: [
          { name: 'Amit Khanna', imageId: 4 },
          { name: 'Kunal Joshi', imageId: 5 },
        ],
        services: [
          { service_name: 'Haircut', description: 'Premium men\'s cut with styling.', price: 399, duration: 30 },
          { service_name: 'Beard Trim', description: 'Beard shape-up and line-up.', price: 199, duration: 20 },
          { service_name: 'Shaving', description: 'Classic hot-towel shave.', price: 249, duration: 25 },
          { service_name: 'Hair Color', description: 'Beard and sideburn colour touch-up.', price: 299, duration: 25 },
          { service_name: 'Head Massage', description: 'Relaxing oil head massage.', price: 249, duration: 20 },
          { service_name: 'Groom Package', description: 'Cut, beard, and facial combo.', price: 999, duration: 75 },
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
        salon_type: 'UNISEX',
        description: 'Trendy cuts and colours for everyone, steps from Vaishali Metro.',
        address: 'Near Vaishali Metro Station, Sector 4',
        city: 'Ghaziabad',
        state: 'Uttar Pradesh',
        latitude: 28.6495,
        longitude: 77.3398,
        opening_time: '09:30:00',
        closing_time: '21:30:00',
        is_featured: false,
        featured_sort_order: 0,
        imageIds: [6, 7, 8, 9],
        staff: [
          { name: 'Pooja Nair', imageId: 1 },
          { name: 'Deepak Rao', imageId: 2 },
          { name: 'Mehak Gill', imageId: 3 },
        ],
        services: [
          { service_name: 'Haircut', description: 'Style cut tailored to face shape.', price: 449, duration: 35 },
          { service_name: 'Hair Color', description: 'Partial or full highlights.', price: 3499, duration: 150 },
          { service_name: 'Hair Spa', description: 'Nourishing hair spa treatment.', price: 899, duration: 45 },
          { service_name: 'Hair Wash', description: 'Wash and blow-dry finish.', price: 199, duration: 20 },
          { service_name: 'Beard Trim', description: 'Quick beard tidy-up.', price: 149, duration: 15 },
          { service_name: 'Hair Extensions', description: 'Clip-in or tape extensions consult.', price: 4999, duration: 120 },
        ],
      },
      {
        salon_name: 'Serenity Spa',
        salon_type: 'UNISEX',
        description: 'Quiet spa and wellness treatments away from the city rush.',
        address: 'Sahibabad Railway Station Road',
        city: 'Ghaziabad',
        state: 'Uttar Pradesh',
        latitude: 28.6714,
        longitude: 77.3505,
        opening_time: '08:00:00',
        closing_time: '20:00:00',
        is_featured: false,
        featured_sort_order: 0,
        imageIds: [10, 11, 12],
        staff: [
          { name: 'Lakshmi Iyer', imageId: 4 },
          { name: 'Nisha Bhatia', imageId: 5 },
          { name: 'Farah Siddiqui', imageId: 1 },
        ],
        services: [
          { service_name: 'Hair Spa', description: 'Aromatherapy hair and scalp spa.', price: 1999, duration: 90 },
          { service_name: 'Body Massage', description: 'Swedish full-body massage.', price: 1499, duration: 60 },
          { service_name: 'Facial', description: 'Hydrating facial for dry skin.', price: 999, duration: 50 },
          { service_name: 'Cleanup', description: 'Deep cleansing cleanup.', price: 699, duration: 40 },
          { service_name: 'Foot Spa', description: 'Soothing foot spa with scrub.', price: 599, duration: 35 },
          { service_name: 'De-Tan Treatment', description: 'Face and neck de-tan.', price: 799, duration: 40 },
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
        salon_type: 'MEN',
        description: 'Classic barbershop with hot-towel finishes and kids cuts.',
        address: 'Mohan Nagar, Ram Nagar',
        city: 'Ghaziabad',
        state: 'Uttar Pradesh',
        latitude: 28.6763,
        longitude: 77.3736,
        opening_time: '10:00:00',
        closing_time: '21:00:00',
        is_featured: false,
        featured_sort_order: 0,
        imageIds: [13, 14, 15],
        staff: [
          { name: 'Imran Ali', imageId: 2 },
          { name: 'Suresh Yadav', imageId: 3 },
          { name: 'Rajesh Kumar', imageId: 4 },
        ],
        services: [
          { service_name: 'Haircut', description: 'Traditional scissors-and-comb cut.', price: 299, duration: 25 },
          { service_name: 'Beard Trim', description: 'Straight-razor tidy with hot towel.', price: 249, duration: 30 },
          { service_name: 'Beard Styling', description: 'Beard style and finish.', price: 279, duration: 25 },
          { service_name: 'Shaving', description: 'Classic barbershop shave.', price: 199, duration: 20 },
          { service_name: 'Eyebrow Grooming', description: 'Men\'s brow tidy.', price: 99, duration: 10 },
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
        salon_type: 'WOMEN',
        description: 'Full-service salon for hair, skin, and nail care in Sector 62.',
        address: 'Sector 62, Noida',
        city: 'Noida',
        state: 'Uttar Pradesh',
        latitude: 28.6289,
        longitude: 77.3648,
        opening_time: '09:00:00',
        closing_time: '20:30:00',
        is_featured: true,
        featured_sort_order: 3,
        imageIds: [16, 17, 18],
        staff: [
          { name: 'Divya Krishnan', imageId: 5 },
          { name: 'Shalini Bose', imageId: 1 },
          { name: 'Kriti Agarwal', imageId: 2 },
        ],
        services: [
          { service_name: 'Facial', description: 'Anti-ageing facial with collagen mask.', price: 1599, duration: 70 },
          { service_name: 'Hair Styling', description: 'Cut, blow-dry, and style.', price: 599, duration: 50 },
          { service_name: 'Pedicure', description: 'Spa pedicure with scrub and polish.', price: 799, duration: 45 },
          { service_name: 'Manicure', description: 'Classic manicure with cuticle care.', price: 499, duration: 35 },
          { service_name: 'Hydra Facial', description: 'Deep hydration facial.', price: 2499, duration: 60 },
          { service_name: 'Nail Extensions', description: 'Gel extensions with shape.', price: 1499, duration: 90 },
        ],
      },
      {
        salon_name: 'Bridal Studio by Meera',
        salon_type: 'WOMEN',
        description: 'Bridal makeup and pre-wedding packages with trial sessions.',
        address: 'Vasundhara Sector 15',
        city: 'Ghaziabad',
        state: 'Uttar Pradesh',
        latitude: 28.6661,
        longitude: 77.3864,
        opening_time: '08:30:00',
        closing_time: '19:00:00',
        is_featured: false,
        featured_sort_order: 0,
        imageIds: [19, 20, 21],
        staff: [
          { name: 'Meera Iyer', imageId: 3 },
          { name: 'Tanya Sharma', imageId: 4 },
          { name: 'Ayesha Khan', imageId: 5 },
          { name: 'Ishita Roy', imageId: 1 },
        ],
        services: [
          { service_name: 'Bridal Makeup', description: 'Full bridal makeup with hair and draping.', price: 8999, duration: 180 },
          { service_name: 'Bridal Beauty Package', description: 'Makeup, hair, and mehendi consult package.', price: 12999, duration: 240 },
          { service_name: 'Pre Bridal Package', description: 'Skin prep sessions before the wedding.', price: 4999, duration: 120 },
          { service_name: 'Party Makeup', description: 'Soft glam for engagement ceremonies.', price: 2999, duration: 90 },
          { service_name: 'Facial', description: 'Bridal prep facial before the big day.', price: 1999, duration: 75 },
          { service_name: 'Hair Styling', description: 'Bridal updo or open waves.', price: 2499, duration: 90 },
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
        salon_type: 'MEN',
        description: 'Luxury grooming for men on Mall Road — cuts, beard, and grey blending.',
        address: '11 Mall Road, C-Scheme',
        city: 'Jaipur',
        state: 'Rajasthan',
        latitude: 26.9124,
        longitude: 75.7873,
        opening_time: '10:00:00',
        closing_time: '22:00:00',
        is_featured: false,
        featured_sort_order: 0,
        imageIds: [22, 23, 24, 25],
        staff: [
          { name: 'Arjun Singh', imageId: 2 },
          { name: 'Manish Chauhan', imageId: 3 },
          { name: 'Vivek Sharma', imageId: 4 },
        ],
        services: [
          { service_name: 'Haircut', description: 'Royal signature cut with finish.', price: 499, duration: 40 },
          { service_name: 'Beard Trim', description: 'Beard trim and shape.', price: 299, duration: 25 },
          { service_name: 'Beard Color', description: 'Natural grey blend for beard.', price: 399, duration: 30 },
          { service_name: 'Head Massage', description: 'Warm oil head massage.', price: 399, duration: 20 },
          { service_name: 'Signature Grooming Package', description: 'Cut, beard, facial, and scalp care.', price: 1499, duration: 90 },
          { service_name: 'Groom Makeup', description: 'Natural groom makeup for weddings.', price: 2499, duration: 60 },
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
        salon_type: 'UNISEX',
        description: 'Affordable everyday styling with quality products on Marine Drive.',
        address: '4 Marine Drive, Ernakulam',
        city: 'Kochi',
        state: 'Kerala',
        latitude: 9.9816,
        longitude: 76.2999,
        opening_time: '09:00:00',
        closing_time: '20:00:00',
        is_featured: false,
        featured_sort_order: 0,
        imageIds: [26, 27],
        staff: [
          { name: 'Kavya Nair', imageId: 5 },
          { name: 'Anu Thomas', imageId: 1 },
        ],
        services: [
          { service_name: 'Haircut', description: 'Basic cut for men or women.', price: 249, duration: 25 },
          { service_name: 'Facial', description: 'Fresh fruit facial.', price: 699, duration: 45 },
          { service_name: 'Waxing', description: 'Arms or legs waxing.', price: 399, duration: 30 },
          { service_name: 'Cleanup', description: 'Quick cleanup for glowing skin.', price: 449, duration: 30 },
          { service_name: 'Shaving', description: 'Clean shave with aftershave.', price: 149, duration: 15 },
          { service_name: 'Hair Botox', description: 'Smoothing hair botox treatment.', price: 3499, duration: 120 },
        ],
      },
      {
        salon_name: 'Zen Spa',
        salon_type: 'UNISEX',
        description: 'Calm spa retreat on Park Street for massage and detox facials.',
        address: '2 Park Street, near Maidan',
        city: 'Kolkata',
        state: 'West Bengal',
        latitude: 22.5535,
        longitude: 88.3516,
        opening_time: '08:00:00',
        closing_time: '21:00:00',
        is_featured: false,
        featured_sort_order: 0,
        imageIds: [28, 29, 30],
        staff: [
          { name: 'Priyanka Das', imageId: 2 },
          { name: 'Sourav Banerjee', imageId: 3 },
          { name: 'Rina Mukherjee', imageId: 4 },
          { name: 'Amitava Sen', imageId: 5 },
        ],
        services: [
          { service_name: 'Body Massage', description: '120-minute full body spa ritual.', price: 2999, duration: 120 },
          { service_name: 'Face Massage', description: 'Relaxing face and neck massage.', price: 699, duration: 30 },
          { service_name: 'Facial', description: 'Detox facial for congested skin.', price: 1199, duration: 60 },
          { service_name: 'Scalp Treatment', description: 'Scalp detox and nourishment.', price: 999, duration: 45 },
          { service_name: 'Keratin Treatment', description: 'Keratin smoothening session.', price: 4999, duration: 150 },
        ],
      },
    ],
  },
];

const DEMO_CUSTOMERS = [
  { name: 'Demo Customer', phone: '9100000099', gender: 'male' },
  { name: 'Demo Customer Women', phone: '9100000098', gender: 'female' },
];

async function getRoleId(queryInterface, roleName) {
  const [role] = await queryInterface.sequelize.query(
    `SELECT id FROM ${schema}.roles WHERE name = :name LIMIT 1`,
    { replacements: { name: roleName }, type: queryInterface.sequelize.QueryTypes.SELECT }
  );
  if (!role) throw new Error(`Role ${roleName} not found`);
  return role.id;
}

module.exports = {
  up: async (queryInterface) => {
    const now = new Date();
    const salonUrlMap = await prepareSeedSalonImages();
    const staffUrlMap = await prepareSeedStaffImages();
    const ownerRoleId = await getRoleId(queryInterface, 'SALON_OWNER');
    const customerRoleId = await getRoleId(queryInterface, 'CUSTOMER');

    let salonCount = 0;
    let staffCount = 0;
    let serviceCount = 0;

    for (const owner of OWNERS) {
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
        const gallery = imageUrls(salonUrlMap, salon.imageIds);

        await queryInterface.bulkInsert({ schema, tableName: 'salons' }, [{
          id: salonId,
          owner_id: ownerId,
          application_id: null,
          salon_name: salon.salon_name,
          salon_type: salon.salon_type || 'UNISEX',
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
          premium_booking_fee: null,
          is_featured: Boolean(salon.is_featured),
          featured_sort_order: salon.featured_sort_order ?? 0,
          status: 'ACTIVE',
          is_active: true,
          created_at: now,
          updated_at: now,
        }]);
        salonCount += 1;

        const staffRows = (salon.staff || []).map((member, index) => ({
          id: uuidv4(),
          salon_id: salonId,
          name: member.name,
          profile_image: staffImageUrl(staffUrlMap, member.imageId),
          status: 'ACTIVE',
          sort_order: index,
          is_active: true,
          created_at: now,
          updated_at: now,
        }));

        if (staffRows.length > 0) {
          await queryInterface.bulkInsert({ schema, tableName: 'salon_staff' }, staffRows);
          staffCount += staffRows.length;
        }

        for (const svc of salon.services) {
          await queryInterface.bulkInsert({ schema, tableName: 'services' }, [{
            id: uuidv4(),
            salon_id: salonId,
            service_name: svc.service_name,
            description: svc.description || null,
            duration_minutes: svc.duration,
            price: svc.price,
            discount_price: null,
            status: 'ACTIVE',
            is_active: true,
            created_at: now,
            updated_at: now,
          }]);
          serviceCount += 1;
        }
      }
    }

    for (const demo of DEMO_CUSTOMERS) {
      const customerUserId = uuidv4();
      await queryInterface.bulkInsert({ schema, tableName: 'users' }, [{
        id: customerUserId,
        name: demo.name,
        phone: demo.phone,
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
        gender: demo.gender,
        dob: null,
        status: 'ACTIVE',
        is_active: true,
        created_at: now,
        updated_at: now,
      }]);
    }

    console.log(
      `Seeded ${OWNERS.length} owners, ${salonCount} salons, ${staffCount} staff, ${serviceCount} services, ${DEMO_CUSTOMERS.length} demo customers`
    );
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `DELETE FROM ${schema}.users WHERE phone LIKE '910000000%'`
    );
  },
};
