'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

function migrateSmsConfigToFlow(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      provider: 'msg91',
      enabled: false,
      auth_key: '',
      sender_id: '',
      flow_id: '',
      template_id: '',
      otp_var_name: 'OTP',
      message_template: '',
    };
  }

  const flowId = String(raw.flow_id || raw.template_id || raw.sms_templateid || '').trim();

  return {
    provider: 'msg91',
    enabled: raw.enabled !== false,
    auth_key: raw.auth_key || raw.sms_apikey || '',
    sender_id: raw.sender_id || raw.sms_sendername || '',
    flow_id: flowId,
    template_id: flowId,
    otp_var_name: String(raw.otp_var_name || 'OTP').trim() || 'OTP',
    message_template: raw.message_template || raw.sms_message || '',
  };
}

module.exports = {
  async up(queryInterface) {
    const rows = await queryInterface.sequelize.query(
      `SELECT id, setting_value FROM ${schema}.platform_settings WHERE setting_key = 'sms_config' LIMIT 1`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    if (!rows.length) return;

    const row = rows[0];
    const current = typeof row.setting_value === 'string'
      ? JSON.parse(row.setting_value)
      : row.setting_value;

    const migrated = migrateSmsConfigToFlow(current);

    await queryInterface.sequelize.query(
      `UPDATE ${schema}.platform_settings
       SET setting_value = :setting_value::jsonb,
           description = :description,
           updated_at = NOW()
       WHERE id = :id`,
      {
        replacements: {
          id: row.id,
          setting_value: JSON.stringify(migrated),
          description:
            'SMS gateway configuration for customer OTP via MSG91 Flow/OneAPI (DLT SMS templates)',
        },
      }
    );
  },

  async down(queryInterface) {
    const rows = await queryInterface.sequelize.query(
      `SELECT id, setting_value FROM ${schema}.platform_settings WHERE setting_key = 'sms_config' LIMIT 1`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    if (!rows.length) return;

    const row = rows[0];
    const current = typeof row.setting_value === 'string'
      ? JSON.parse(row.setting_value)
      : row.setting_value;

    const reverted = {
      provider: 'msg91',
      enabled: current?.enabled !== false,
      auth_key: current?.auth_key || '',
      sender_id: current?.sender_id || '',
      template_id: current?.flow_id || current?.template_id || '',
      message_template: current?.message_template || '',
    };

    await queryInterface.sequelize.query(
      `UPDATE ${schema}.platform_settings
       SET setting_value = :setting_value::jsonb,
           description = :description,
           updated_at = NOW()
       WHERE id = :id`,
      {
        replacements: {
          id: row.id,
          setting_value: JSON.stringify(reverted),
          description: 'SMS gateway configuration for customer OTP (MSG91)',
        },
      }
    );
  },
};
