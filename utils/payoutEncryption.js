const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY = crypto
  .createHash('sha256')
  .update(process.env.PAYOUT_ENCRYPTION_KEY || process.env.JWT_SECRET || 'salon-payout-dev-key')
  .digest();

function encryptAccountNumber(accountNumber) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(accountNumber), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptAccountNumber(encrypted) {
  if (!encrypted) return null;
  const [ivHex, tagHex, dataHex] = String(encrypted).split(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

function maskAccountNumber(accountNumber) {
  const str = String(accountNumber || '');
  if (str.length <= 4) return '****';
  return `${'*'.repeat(Math.max(0, str.length - 4))}${str.slice(-4)}`;
}

module.exports = {
  encryptAccountNumber,
  decryptAccountNumber,
  maskAccountNumber,
};
