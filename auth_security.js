'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');
const jwt = require('jsonwebtoken');
const scrypt = promisify(crypto.scrypt);
const HASH_PREFIX = 'scrypt$';
const secretRequests = new WeakMap();

function query(db, method, ...args) {
  return new Promise((resolve, reject) => db[method](...args, (error, value) => error ? reject(error) : resolve(value)));
}

function validSecret(value) {
  return typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= 4096;
}

async function hashSecret(value) {
  if (!validSecret(value)) throw Object.assign(new Error('密码或安全答案格式无效'), { statusCode: 400 });
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = await scrypt(value, salt, 64);
  return `${HASH_PREFIX}${salt}$${digest.toString('hex')}`;
}

async function verifySecret(value, stored) {
  if (!validSecret(value) || typeof stored !== 'string' || !stored) return false;
  if (!stored.startsWith(HASH_PREFIX)) {
    // Existing accounts are migrated only after a successful credential check.
    const left = Buffer.from(value), right = Buffer.from(stored);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  }
  const parts = stored.split('$');
  if (parts.length !== 3 || !/^[0-9a-f]{32}$/.test(parts[1]) || !/^[0-9a-f]{128}$/.test(parts[2])) return false;
  const digest = await scrypt(value, parts[1], 64);
  return crypto.timingSafeEqual(digest, Buffer.from(parts[2], 'hex'));
}

async function migrateCredentials(userDb, user) {
  const changes = {};
  if (user.password && !user.password.startsWith(HASH_PREFIX)) changes.password = await hashSecret(user.password);
  const answer = user.securityAnswer || user.resetToken;
  if (answer && (!user.securityAnswer || !answer.startsWith(HASH_PREFIX))) {
    changes.securityAnswer = answer.startsWith(HASH_PREFIX) ? answer : await hashSecret(answer.trim());
  }
  if (Object.keys(changes).length || user.resetToken) {
    // Compare the old credentials to avoid overwriting a concurrent password reset.
    const count = await query(userDb, 'update', credentialSnapshot(user),
      { $set: changes, $unset: { resetToken: true } }, {});
    if (!count) throw unauthorized();
  }
  return { ...user, ...changes };
}

function credentialSnapshot(user) {
  const expected = { _id: user._id };
  for (const field of ['password', 'securityAnswer', 'resetToken', 'tokenVersion']) {
    expected[field] = user[field] === undefined ? { $exists: false } : user[field];
  }
  return expected;
}

function tokenClaims(user) {
  return { userId: user._id, username: user.username, role: user.role || 'user', tokenVersion: user.tokenVersion || 0 };
}

function signUserToken(user, secret, expiresIn = '7d') {
  return jwt.sign(tokenClaims(user), secret, { algorithm: 'HS256', expiresIn });
}

async function ensureJwtSecret(settingsDb) {
  if (secretRequests.has(settingsDb)) return secretRequests.get(settingsDb);
  const request = (async () => {
    const settings = await query(settingsDb, 'findOne', { type: 'system' });
    const secret = settings?.jwtSecret || crypto.randomBytes(64).toString('hex');
    if (!settings?.jwtSecret) await query(settingsDb, 'update', { type: 'system' },
      { $set: { type: 'system', jwtSecret: secret, updatedAt: new Date() } }, { upsert: true });
    global.jwtSecret = secret;
    return secret;
  })();
  secretRequests.set(settingsDb, request);
  try { return await request; } finally { secretRequests.delete(settingsDb); }
}

function unauthorized() {
  return Object.assign(new Error('token unauthorized'), { name: 'UnauthorizedError', statusCode: 401 });
}

function createAuthMiddleware(db, publicPaths = []) {
  const excluded = new Set(publicPaths);
  return async function authenticate(req, res, next) {
    if (excluded.has((req.originalUrl || req.url).split('?')[0])) return next();
    try {
      const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
      if (!match) throw unauthorized();
      const settings = await query(db.settingsDb, 'findOne', { type: 'system' });
      if (!settings?.jwtSecret) throw unauthorized();
      let claims;
      try { claims = jwt.verify(match[1], settings.jwtSecret, { algorithms: ['HS256'] }); }
      catch { throw unauthorized(); }
      if (!claims || typeof claims.username !== 'string') throw unauthorized();
      const user = await query(db.userDb, 'findOne', { username: claims.username });
      if (!user || (claims.userId !== undefined && claims.userId !== user._id)
        || (claims.tokenVersion ?? 0) !== (user.tokenVersion || 0)) throw unauthorized();
      req.auth = tokenClaims(user);
      req.authUser = user;
      return next();
    } catch (error) { return next(error); }
  };
}

module.exports = { query, validSecret, hashSecret, verifySecret, migrateCredentials, credentialSnapshot, tokenClaims,
  signUserToken, ensureJwtSecret, createAuthMiddleware };
