const express = require("express");
const {
  authenticate,
  signToken,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  findUserById,
} = require("../../services/auth");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email y contraseña requeridos" });
  }

  try {
    const user = await authenticate(email, password);
    if (!user) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const token = signToken(user);
    setSessionCookie(res, token);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        companyId: user.company_id,
        companyName: user.company_name,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/logout", (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth(), async (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      companyId: req.user.company_id,
      companyName: req.user.company_name,
    },
  });
});

module.exports = router;
