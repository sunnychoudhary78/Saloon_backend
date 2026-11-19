'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Enhance rewards table with spend slabs, priority/weight, usage limits, and internal discount rules
    const rewardTable = await queryInterface.describeTable({ schema, tableName: 'rewards' });

    if (!rewardTable.min_booking_amount) {
      await queryInterface.addColumn({ schema, tableName: 'rewards' }, 'min_booking_amount', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      });
    }

    if (!rewardTable.max_booking_amount) {
      await queryInterface.addColumn({ schema, tableName: 'rewards' }, 'max_booking_amount', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      });
    }

    if (!rewardTable.priority) {
      await queryInterface.addColumn({ schema, tableName: 'rewards' }, 'priority', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 10,
      });
    }

    if (!rewardTable.weight) {
      await queryInterface.addColumn({ schema, tableName: 'rewards' }, 'weight', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 10,
      });
    }

    if (!rewardTable.max_claims_per_customer) {
      await queryInterface.addColumn({ schema, tableName: 'rewards' }, 'max_claims_per_customer', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 1,
      });
    }

    if (!rewardTable.total_quantity) {
      await queryInterface.addColumn({ schema, tableName: 'rewards' }, 'total_quantity', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }

    if (!rewardTable.issued_count) {
      await queryInterface.addColumn({ schema, tableName: 'rewards' }, 'issued_count', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }

    // Internal next-booking voucher discount configuration
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "${schema}"."enum_rewards_discount_type" AS ENUM ('PERCENT', 'FLAT');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    if (!rewardTable.discount_type) {
      await queryInterface.addColumn({ schema, tableName: 'rewards' }, 'discount_type', {
        type: Sequelize.ENUM('PERCENT', 'FLAT'),
        allowNull: true,
      });
    }

    if (!rewardTable.discount_value) {
      await queryInterface.addColumn({ schema, tableName: 'rewards' }, 'discount_value', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      });
    }

    if (!rewardTable.min_order_value) {
      await queryInterface.addColumn({ schema, tableName: 'rewards' }, 'min_order_value', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
      });
    }

    if (!rewardTable.max_discount_amount) {
      await queryInterface.addColumn({ schema, tableName: 'rewards' }, 'max_discount_amount', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      });
    }

    // 2. Enhance customer_rewards table with REDEEMED status, visit tracking, and personal issued code
    await queryInterface.sequelize.query(`
      ALTER TYPE "${schema}"."enum_customer_rewards_status" ADD VALUE IF NOT EXISTS 'REDEEMED';
    `);

    const customerRewardTable = await queryInterface.describeTable({ schema, tableName: 'customer_rewards' });

    if (!customerRewardTable.booking_group_id) {
      await queryInterface.addColumn({ schema, tableName: 'customer_rewards' }, 'booking_group_id', {
        type: Sequelize.UUID,
        allowNull: true,
      });
    }

    if (!customerRewardTable.visit_amount) {
      await queryInterface.addColumn({ schema, tableName: 'customer_rewards' }, 'visit_amount', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      });
    }

    if (!customerRewardTable.issued_code) {
      await queryInterface.addColumn({ schema, tableName: 'customer_rewards' }, 'issued_code', {
        type: Sequelize.STRING(100),
        allowNull: true,
      });
    }

    if (!customerRewardTable.redeemed_at) {
      await queryInterface.addColumn({ schema, tableName: 'customer_rewards' }, 'redeemed_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    if (!customerRewardTable.redeemed_booking_id) {
      await queryInterface.addColumn({ schema, tableName: 'customer_rewards' }, 'redeemed_booking_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: { tableName: 'bookings', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS "idx_customer_rewards_cust_reward"
      ON "${schema}"."customer_rewards" ("customer_id", "reward_id");
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS "idx_customer_rewards_booking_group"
      ON "${schema}"."customer_rewards" ("booking_group_id");
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS "idx_customer_rewards_issued_code"
      ON "${schema}"."customer_rewards" ("issued_code");
    `);

    // 3. Add coupon / reward discount tracking fields on bookings table
    const bookingTable = await queryInterface.describeTable({ schema, tableName: 'bookings' });

    if (!bookingTable.coupon_code) {
      await queryInterface.addColumn({ schema, tableName: 'bookings' }, 'coupon_code', {
        type: Sequelize.STRING(100),
        allowNull: true,
      });
    }

    if (!bookingTable.customer_reward_id) {
      await queryInterface.addColumn({ schema, tableName: 'bookings' }, 'customer_reward_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: { tableName: 'customer_rewards', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }

    if (!bookingTable.discount_amount) {
      await queryInterface.addColumn({ schema, tableName: 'bookings' }, 'discount_amount', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
      });
    }

    // 4. Configure realistic spend slabs, per-user caps, total stock, and internal discounts
    //    for the seeded rewards so every booking tier works cleanly right after migrate/reset.
    const slabConfigs = [
      // ₹100 – ₹299 slab
      { code: 'UBERRIDE40', min: 100, max: 299, perUser: 1, total: 200 },
      { code: 'STARUPGRADEFREE', min: 100, max: 299, perUser: 1, total: 150 },
      { code: 'TATA1MGHEALTH20', min: 100, max: 299, perUser: 1, total: 200 },
      // ₹300 – ₹599 slab
      { code: 'SWIGGYFEAST100', min: 300, max: 599, perUser: 1, total: 150 },
      { code: 'ZOMATO20OFF', min: 300, max: 599, perUser: 1, total: 150 },
      { code: 'NYKAAGLOW15', min: 300, max: 599, perUser: 1, total: 120 },
      { code: 'BMSBOGOFRIDAY', min: 300, max: 599, perUser: 1, total: 100 },
      // ₹600 – ₹999 slab
      { code: 'AMZPAYCB150', min: 600, max: 999, perUser: 1, total: 100 },
      { code: 'MYNTRASTYLE250', min: 600, max: 999, perUser: 1, total: 100 },
      { code: 'CULTFITPASS7', min: 600, max: 999, perUser: 1, total: 100 },
      {
        code: 'SALONVIP150',
        min: 600,
        max: 999,
        perUser: null,
        total: 300,
        discountType: 'FLAT',
        discountValue: 150,
        minOrderValue: 500,
        maxDiscountAmount: null,
      },
      // ₹1000+ slab
      { code: 'MMTHOTEL500', min: 1000, max: null, perUser: 1, total: 50 },
    ];

    for (const cfg of slabConfigs) {
      await queryInterface.sequelize.query(
        `UPDATE "${schema}"."rewards"
         SET min_booking_amount = :min,
             max_booking_amount = :max,
             max_claims_per_customer = :perUser,
             total_quantity = :total,
             discount_type = COALESCE(:discountType, discount_type),
             discount_value = COALESCE(:discountValue, discount_value),
             min_order_value = COALESCE(:minOrderValue, min_order_value),
             max_discount_amount = COALESCE(:maxDiscountAmount, max_discount_amount),
             updated_at = NOW()
         WHERE reward_code = :code`,
        {
          replacements: {
            code: cfg.code,
            min: cfg.min,
            max: cfg.max,
            perUser: cfg.perUser,
            total: cfg.total,
            discountType: cfg.discountType || null,
            discountValue: cfg.discountValue ?? null,
            minOrderValue: cfg.minOrderValue ?? null,
            maxDiscountAmount: cfg.maxDiscountAmount ?? null,
          },
        }
      );
    }

    // Seed internal next-booking salon discount vouchers for each spend slab (if not already present)
    const internalTierRewards = [
      {
        title: 'Flat ₹25 Off on Next Salon Visit',
        description: 'Apply directly in Checkout Coupons on your next salon booking of ₹150 or more.',
        brand_name: 'CATCHY Salon Reward',
        image: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=600&auto=format&fit=crop&q=80',
        reward_code: 'SALONNEXT25',
        external_url: null,
        reward_type: 'SALON_DISCOUNT',
        validity_days: 14,
        min_booking_amount: 100,
        max_booking_amount: 299,
        max_claims_per_customer: null,
        total_quantity: 500,
        issued_count: 0,
        discount_type: 'FLAT',
        discount_value: 25,
        min_order_value: 150,
        max_discount_amount: null,
        status: 'ACTIVE',
      },
      {
        title: 'Flat ₹60 Off on Next Salon Visit',
        description: 'Apply directly in Checkout Coupons on your next salon booking of ₹300 or more.',
        brand_name: 'CATCHY Salon Reward',
        image: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=600&auto=format&fit=crop&q=80',
        reward_code: 'SALONNEXT60',
        external_url: null,
        reward_type: 'SALON_DISCOUNT',
        validity_days: 14,
        min_booking_amount: 300,
        max_booking_amount: 599,
        max_claims_per_customer: null,
        total_quantity: 400,
        issued_count: 0,
        discount_type: 'FLAT',
        discount_value: 60,
        min_order_value: 300,
        max_discount_amount: null,
        status: 'ACTIVE',
      },
      {
        title: '20% Off (Up to ₹250) on Next Visit',
        description: 'Exclusive premium reward! Get 20% off (up to ₹250) on your next salon booking above ₹799.',
        brand_name: 'CATCHY Salon Reward',
        image: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=600&auto=format&fit=crop&q=80',
        reward_code: 'SALONLUXE20',
        external_url: null,
        reward_type: 'SALON_DISCOUNT',
        validity_days: 21,
        min_booking_amount: 1000,
        max_booking_amount: null,
        max_claims_per_customer: null,
        total_quantity: 200,
        issued_count: 0,
        discount_type: 'PERCENT',
        discount_value: 20,
        min_order_value: 799,
        max_discount_amount: 250,
        status: 'ACTIVE',
      },
    ];

    for (const item of internalTierRewards) {
      const [exists] = await queryInterface.sequelize.query(
        `SELECT id FROM "${schema}"."rewards" WHERE reward_code = :code LIMIT 1`,
        { replacements: { code: item.reward_code } }
      );
      if (exists.length === 0) {
        await queryInterface.bulkInsert({ schema, tableName: 'rewards' }, [{
          id: Sequelize.literal('gen_random_uuid()'),
          ...item,
          created_at: new Date(),
          updated_at: new Date(),
        }]);
      }
    }
  },

  async down(queryInterface) {
    const bookingTable = await queryInterface.describeTable({ schema, tableName: 'bookings' });
    if (bookingTable.discount_amount) await queryInterface.removeColumn({ schema, tableName: 'bookings' }, 'discount_amount');
    if (bookingTable.customer_reward_id) await queryInterface.removeColumn({ schema, tableName: 'bookings' }, 'customer_reward_id');
    if (bookingTable.coupon_code) await queryInterface.removeColumn({ schema, tableName: 'bookings' }, 'coupon_code');

    const crTable = await queryInterface.describeTable({ schema, tableName: 'customer_rewards' });
    if (crTable.redeemed_booking_id) await queryInterface.removeColumn({ schema, tableName: 'customer_rewards' }, 'redeemed_booking_id');
    if (crTable.redeemed_at) await queryInterface.removeColumn({ schema, tableName: 'customer_rewards' }, 'redeemed_at');
    if (crTable.issued_code) await queryInterface.removeColumn({ schema, tableName: 'customer_rewards' }, 'issued_code');
    if (crTable.visit_amount) await queryInterface.removeColumn({ schema, tableName: 'customer_rewards' }, 'visit_amount');
    if (crTable.booking_group_id) await queryInterface.removeColumn({ schema, tableName: 'customer_rewards' }, 'booking_group_id');

    const rewardTable = await queryInterface.describeTable({ schema, tableName: 'rewards' });
    const cols = [
      'max_discount_amount',
      'min_order_value',
      'discount_value',
      'discount_type',
      'issued_count',
      'total_quantity',
      'max_claims_per_customer',
      'weight',
      'priority',
      'max_booking_amount',
      'min_booking_amount',
    ];
    for (const col of cols) {
      if (rewardTable[col]) {
        await queryInterface.removeColumn({ schema, tableName: 'rewards' }, col);
      }
    }
  },
};
