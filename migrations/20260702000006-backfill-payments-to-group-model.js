'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = {
  async up(queryInterface) {
    const [payments] = await queryInterface.sequelize.query(`
      SELECT p.id, p.booking_id, p.payment_type, p.amount, p.status, p.method,
             b.booking_group_id, b.service_id, b.salon_id
      FROM "${schema}"."payments" p
      JOIN "${schema}"."bookings" b ON b.id = p.booking_id
      WHERE p.booking_group_id IS NULL
    `);

    for (const row of payments) {
      const groupId = row.booking_group_id || row.booking_id;
      const checkoutKind = row.payment_type === 'PREMIUM_FEE' ? 'PREMIUM_ONLY' : 'SALON_FEE';
      const amount = Number(row.amount);
      const commissionPct = 10;
      const platformPct = 70;
      const salonPct = 30;

      let premiumFeeAmount = null;
      let premiumPlatformAmount = null;
      let premiumSalonAmount = null;
      let commissionAmount = 0;
      let platformAmount = 0;
      let salonNetAmount = 0;

      if (checkoutKind === 'PREMIUM_ONLY') {
        premiumFeeAmount = amount;
        premiumPlatformAmount = round2(amount * platformPct / 100);
        premiumSalonAmount = round2(amount * salonPct / 100);
        platformAmount = premiumPlatformAmount;
        salonNetAmount = premiumSalonAmount;
      } else {
        commissionAmount = round2(amount * commissionPct / 100);
        platformAmount = commissionAmount;
        salonNetAmount = round2(amount - commissionAmount);
      }

      await queryInterface.sequelize.query(`
        UPDATE "${schema}"."payments"
        SET booking_group_id = :groupId,
            checkout_kind = :checkoutKind,
            settings_version = 1,
            service_commission_percent = :commissionPct,
            premium_fee_platform_percent = :platformPct,
            premium_fee_salon_percent = :salonPct,
            premium_fee_amount = :premiumFeeAmount,
            premium_platform_amount = :premiumPlatformAmount,
            premium_salon_amount = :premiumSalonAmount,
            commission_amount = :commissionAmount,
            platform_amount = :platformAmount,
            salon_net_amount = :salonNetAmount,
            is_legacy = true,
            updated_at = NOW()
        WHERE id = :id
      `, {
        replacements: {
          id: row.id,
          groupId,
          checkoutKind,
          commissionPct,
          platformPct,
          salonPct,
          premiumFeeAmount,
          premiumPlatformAmount,
          premiumSalonAmount,
          commissionAmount,
          platformAmount,
          salonNetAmount,
        },
      });

      if (checkoutKind === 'SALON_FEE') {
        const [services] = await queryInterface.sequelize.query(`
          SELECT s.id, s.service_name, s.price, s.discount_price
          FROM "${schema}"."services" s
          WHERE s.id = :serviceId
        `, { replacements: { serviceId: row.service_id } });

        const svc = services[0];
        if (svc) {
          const gross = amount;
          const commAmt = round2(gross * commissionPct / 100);
          const salonNet = round2(gross - commAmt);
          await queryInterface.sequelize.query(`
            INSERT INTO "${schema}"."payment_line_items" (
              id, payment_id, booking_id, service_id, service_name_snapshot,
              gross_amount, commission_percent, commission_amount, platform_amount, salon_net_amount,
              status, refunded_amount, settlement_status, created_at, updated_at
            ) VALUES (
              gen_random_uuid(), :paymentId, :bookingId, :serviceId, :serviceName,
              :gross, :commissionPct, :commAmt, :commAmt, :salonNet,
              :status, 0, 'PENDING', NOW(), NOW()
            )
          `, {
            replacements: {
              paymentId: row.id,
              bookingId: row.booking_id,
              serviceId: row.service_id,
              serviceName: svc.service_name,
              gross,
              commissionPct,
              commAmt,
              salonNet,
              status: row.status === 'PAID' ? 'PAID' : 'PENDING',
            },
          });
        }
      }
    }

    await queryInterface.sequelize.query(`
      UPDATE "${schema}"."payments"
      SET booking_group_id = booking_id
      WHERE booking_group_id IS NULL AND booking_id IS NOT NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM "${schema}"."payment_line_items"
      WHERE payment_id IN (SELECT id FROM "${schema}"."payments" WHERE is_legacy = true)
    `);
    await queryInterface.sequelize.query(`
      UPDATE "${schema}"."payments"
      SET booking_group_id = NULL,
          checkout_kind = NULL,
          settings_version = NULL,
          service_commission_percent = NULL,
          premium_fee_platform_percent = NULL,
          premium_fee_salon_percent = NULL,
          premium_fee_amount = NULL,
          premium_platform_amount = NULL,
          premium_salon_amount = NULL,
          commission_amount = 0,
          platform_amount = 0,
          salon_net_amount = 0,
          is_legacy = false
      WHERE is_legacy = true
    `);
  },
};
