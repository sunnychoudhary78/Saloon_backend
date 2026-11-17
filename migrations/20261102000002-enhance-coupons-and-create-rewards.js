'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

const baseAudit = (Sequelize) => ({
  created_by: { type: Sequelize.UUID, allowNull: true },
  updated_by: { type: Sequelize.UUID, allowNull: true },
  is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
});

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add fields to coupons table
    const tableInfo = await queryInterface.describeTable({ schema, tableName: 'coupons' });

    if (!tableInfo.title) {
      await queryInterface.addColumn({ schema, tableName: 'coupons' }, 'title', {
        type: Sequelize.STRING(255),
        allowNull: true,
      });
    }

    if (!tableInfo.description) {
      await queryInterface.addColumn({ schema, tableName: 'coupons' }, 'description', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }

    if (!tableInfo.image) {
      await queryInterface.addColumn({ schema, tableName: 'coupons' }, 'image', {
        type: Sequelize.STRING(500),
        allowNull: true,
      });
    }

    if (!tableInfo.min_order_value) {
      await queryInterface.addColumn({ schema, tableName: 'coupons' }, 'min_order_value', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
      });
    }

    if (!tableInfo.max_discount_amount) {
      await queryInterface.addColumn({ schema, tableName: 'coupons' }, 'max_discount_amount', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      });
    }

    // 2. Create rewards master table
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "${schema}"."enum_rewards_reward_type" AS ENUM ('PARTNER_OFFER', 'SALON_DISCOUNT');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "${schema}"."enum_rewards_status" AS ENUM ('ACTIVE', 'INACTIVE');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryInterface.createTable({ schema, tableName: 'rewards' }, {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      title: { type: Sequelize.STRING(255), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: false },
      brand_name: { type: Sequelize.STRING(100), allowNull: false },
      image: { type: Sequelize.STRING(500), allowNull: true },
      reward_code: { type: Sequelize.STRING(100), allowNull: false },
      external_url: { type: Sequelize.STRING(500), allowNull: true },
      reward_type: {
        type: Sequelize.ENUM('PARTNER_OFFER', 'SALON_DISCOUNT'),
        allowNull: false,
        defaultValue: 'PARTNER_OFFER',
      },
      validity_days: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 7 },
      status: {
        type: Sequelize.ENUM('ACTIVE', 'INACTIVE'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      ...baseAudit(Sequelize),
    });

    // 3. Create customer_rewards table
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "${schema}"."enum_customer_rewards_status" AS ENUM ('UNCLAIMED', 'CLAIMED', 'EXPIRED');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryInterface.createTable({ schema, tableName: 'customer_rewards' }, {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      customer_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: { tableName: 'customers', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      booking_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: { tableName: 'bookings', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      reward_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: { tableName: 'rewards', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      status: {
        type: Sequelize.ENUM('UNCLAIMED', 'CLAIMED', 'EXPIRED'),
        allowNull: false,
        defaultValue: 'UNCLAIMED',
      },
      unlocked_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      claimed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    await queryInterface.addIndex(
      { schema, tableName: 'customer_rewards' },
      ['customer_id', 'status'],
      { name: 'idx_customer_rewards_cust_status' }
    );

    // 4. Seed Permissions for rewards
    const permissions = [
      { name: 'reward.read', display_name: 'View Rewards', description: 'View reward catalog and metrics' },
      { name: 'reward.create', display_name: 'Create Reward', description: 'Create new partner and salon rewards' },
      { name: 'reward.update', display_name: 'Update Reward', description: 'Update existing rewards' },
      { name: 'reward.delete', display_name: 'Delete Reward', description: 'Delete or deactivate rewards' },
    ];

    for (const perm of permissions) {
      const [existing] = await queryInterface.sequelize.query(
        `SELECT id FROM "${schema}"."permissions" WHERE name = :name LIMIT 1`,
        { replacements: { name: perm.name } }
      );
      if (existing.length === 0) {
        await queryInterface.bulkInsert({ schema, tableName: 'permissions' }, [{
          id: Sequelize.literal('gen_random_uuid()'),
          name: perm.name,
          display_name: perm.display_name,
          description: perm.description,
          created_at: new Date(),
          updated_at: new Date(),
        }]);
      }
    }

    // Assign permissions to Super Admin and Admin roles
    await queryInterface.sequelize.query(`
      INSERT INTO "${schema}"."role_permissions" (role_id, permission_id, created_at, updated_at)
      SELECT r.id, p.id, NOW(), NOW()
      FROM "${schema}"."roles" r
      CROSS JOIN "${schema}"."permissions" p
      WHERE r.name IN ('SUPER_ADMIN', 'ADMIN', 'super_admin', 'admin', 'Super Admin', 'Admin')
        AND p.name IN ('reward.read', 'reward.create', 'reward.update', 'reward.delete')
        AND NOT EXISTS (
          SELECT 1 FROM "${schema}"."role_permissions" rp
          WHERE rp.role_id = r.id AND rp.permission_id = p.id
        );
    `);

    // 5. Seed 12 High-Quality Realistic Rewards
    const sampleRewards = [
      {
        title: 'Flat ₹100 Off on Food & Gourmet',
        description: 'Enjoy delicious meals delivered to your doorstep. Valid on orders above ₹299 on the Swiggy app.',
        brand_name: 'Swiggy',
        image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&auto=format&fit=crop&q=80',
        reward_code: 'SWIGGYFEAST100',
        external_url: 'https://www.swiggy.com',
        reward_type: 'PARTNER_OFFER',
        validity_days: 14,
        status: 'ACTIVE',
      },
      {
        title: 'Flat 20% Off on Dining & Delivery',
        description: 'Explore top restaurants and get up to ₹150 off on your favorite delicacies across India.',
        brand_name: 'Zomato',
        image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&auto=format&fit=crop&q=80',
        reward_code: 'ZOMATO20OFF',
        external_url: 'https://www.zomato.com',
        reward_type: 'PARTNER_OFFER',
        validity_days: 10,
        status: 'ACTIVE',
      },
      {
        title: 'Flat ₹250 Off on Fashion Trends',
        description: 'Elevate your wardrobe with top styles and premium collections on orders above ₹1,499.',
        brand_name: 'Myntra',
        image: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=600&auto=format&fit=crop&q=80',
        reward_code: 'MYNTRASTYLE250',
        external_url: 'https://www.myntra.com',
        reward_type: 'PARTNER_OFFER',
        validity_days: 15,
        status: 'ACTIVE',
      },
      {
        title: 'Flat 15% Off on Cosmetics & Skincare',
        description: 'Pamper yourself with premium beauty products, wellness items, and luxury cosmetics.',
        brand_name: 'Nykaa',
        image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&auto=format&fit=crop&q=80',
        reward_code: 'NYKAAGLOW15',
        external_url: 'https://www.nykaa.com',
        reward_type: 'PARTNER_OFFER',
        validity_days: 12,
        status: 'ACTIVE',
      },
      {
        title: 'Flat 40% Off on Next 2 City Rides',
        description: 'Comfortable daily commutes at your fingertips. Max discount ₹75 per trip on Uber Go or Premier.',
        brand_name: 'Uber',
        image: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=600&auto=format&fit=crop&q=80',
        reward_code: 'UBERRIDE40',
        external_url: 'https://www.uber.com',
        reward_type: 'PARTNER_OFFER',
        validity_days: 7,
        status: 'ACTIVE',
      },
      {
        title: '₹150 Cashback on Amazon Pay',
        description: 'Get ₹150 instant cashback on your next recharge, bill payment, or shopping order above ₹500.',
        brand_name: 'Amazon',
        image: 'https://images.unsplash.com/photo-1523474255658-4af61b1614ff?w=600&auto=format&fit=crop&q=80',
        reward_code: 'AMZPAYCB150',
        external_url: 'https://www.amazon.in',
        reward_type: 'PARTNER_OFFER',
        validity_days: 14,
        status: 'ACTIVE',
      },
      {
        title: 'Free Beverage Upgrade Voucher',
        description: 'Upgrade your handcrafted beverage from Tall to Grande or Grande to Venti on any dine-in order.',
        brand_name: 'Starbucks',
        image: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=600&auto=format&fit=crop&q=80',
        reward_code: 'STARUPGRADEFREE',
        external_url: 'https://www.starbucks.in',
        reward_type: 'PARTNER_OFFER',
        validity_days: 10,
        status: 'ACTIVE',
      },
      {
        title: 'Flat ₹500 Off on Hotel Bookings',
        description: 'Plan your perfect getaway. Valid on verified domestic hotel bookings with minimum booking of ₹3,000.',
        brand_name: 'MakeMyTrip',
        image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&auto=format&fit=crop&q=80',
        reward_code: 'MMTHOTEL500',
        external_url: 'https://www.makemytrip.com',
        reward_type: 'PARTNER_OFFER',
        validity_days: 30,
        status: 'ACTIVE',
      },
      {
        title: 'Flat 20% Off on Health & Vitamins',
        description: 'Order authentic healthcare products, vitamins, and supplements with guaranteed home delivery.',
        brand_name: 'Tata 1mg',
        image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80',
        reward_code: 'TATA1MGHEALTH20',
        external_url: 'https://www.1mg.com',
        reward_type: 'PARTNER_OFFER',
        validity_days: 14,
        status: 'ACTIVE',
      },
      {
        title: 'Buy 1 Get 1 Free on Movie Tickets',
        description: 'Catch the latest blockbuster movies on the big screen! Valid on weekend and weekday shows.',
        brand_name: 'BookMyShow',
        image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&auto=format&fit=crop&q=80',
        reward_code: 'BMSBOGOFRIDAY',
        external_url: 'https://in.bookmyshow.com',
        reward_type: 'PARTNER_OFFER',
        validity_days: 7,
        status: 'ACTIVE',
      },
      {
        title: '7-Day Free Pass + 20% Off Gym',
        description: 'Access premier fitness centers, yoga studios, and training programs near you with certified trainers.',
        brand_name: 'Cult.fit',
        image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&auto=format&fit=crop&q=80',
        reward_code: 'CULTFITPASS7',
        external_url: 'https://www.cult.fit',
        reward_type: 'PARTNER_OFFER',
        validity_days: 14,
        status: 'ACTIVE',
      },
      {
        title: 'Flat ₹150 Off on Next Salon Visit',
        description: 'Thank you for being a valued customer! Enjoy ₹150 off on any service above ₹500 at any salon.',
        brand_name: 'Salon Partner Special',
        image: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=600&auto=format&fit=crop&q=80',
        reward_code: 'SALONVIP150',
        external_url: 'https://salonapp.com',
        reward_type: 'SALON_DISCOUNT',
        validity_days: 21,
        status: 'ACTIVE',
      },
    ];

    for (const item of sampleRewards) {
      await queryInterface.bulkInsert({ schema, tableName: 'rewards' }, [{
        id: Sequelize.literal('gen_random_uuid()'),
        ...item,
        created_at: new Date(),
        updated_at: new Date(),
      }]);
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ schema, tableName: 'customer_rewards' });
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_customer_rewards_status";`);
    await queryInterface.dropTable({ schema, tableName: 'rewards' });
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_rewards_status";`);
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_rewards_reward_type";`);

    const tableInfo = await queryInterface.describeTable({ schema, tableName: 'coupons' });
    if (tableInfo.title) await queryInterface.removeColumn({ schema, tableName: 'coupons' }, 'title');
    if (tableInfo.description) await queryInterface.removeColumn({ schema, tableName: 'coupons' }, 'description');
    if (tableInfo.image) await queryInterface.removeColumn({ schema, tableName: 'coupons' }, 'image');
    if (tableInfo.min_order_value) await queryInterface.removeColumn({ schema, tableName: 'coupons' }, 'min_order_value');
    if (tableInfo.max_discount_amount) await queryInterface.removeColumn({ schema, tableName: 'coupons' }, 'max_discount_amount');
  },
};

