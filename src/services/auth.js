const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const config = require("../config");
const { getPool, isDatabaseEnabled } = require("../db/pool");

const COOKIE_NAME = "session";

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.company_id || null,
    },
    config.jwtSecret,
    { expiresIn: "7d" }
  );
}

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

async function findUserByEmail(email) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT u.*, c.name AS company_name
     FROM users u
     LEFT JOIN companies c ON c.id = u.company_id
     WHERE u.email = $1`,
    [email.toLowerCase()]
  );
  return rows[0] || null;
}

async function findUserById(id) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.role, u.company_id, c.name AS company_name
     FROM users u
     LEFT JOIN companies c ON c.id = u.company_id
     WHERE u.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function authenticate(email, password) {
  const user = await findUserByEmail(email);
  if (!user) return null;

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return null;

  return user;
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.nodeEnv === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

function getTokenFromRequest(req) {
  if (req.cookies?.[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
  const header = req.get("Authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return null;
}

function requireAuth(roles = []) {
  return async (req, res, next) => {
    if (!isDatabaseEnabled()) {
      return res.status(503).json({ error: "Base de datos no configurada" });
    }

    const token = getTokenFromRequest(req);
    if (!token) return res.status(401).json({ error: "No autenticado" });

    try {
      const payload = verifyToken(token);
      const user = await findUserById(payload.sub);
      if (!user) return res.status(401).json({ error: "Usuario no encontrado" });

      if (roles.length > 0 && !roles.includes(user.role)) {
        return res.status(403).json({ error: "Sin permisos" });
      }

      req.user = user;
      next();
    } catch {
      return res.status(401).json({ error: "Sesión inválida" });
    }
  };
}

module.exports = {
  COOKIE_NAME,
  signToken,
  authenticate,
  findUserById,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  isDatabaseEnabled,
};
