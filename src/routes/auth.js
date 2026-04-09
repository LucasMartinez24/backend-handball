const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const prisma = require("../lib/prisma");

// backend/src/routes/auth.js
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    // 1. Buscamos primero en la tabla de STAFF (Donde están Admin, Rep, Mesa y Árbitros)
    let user = await prisma.staff.findUnique({ where: { username } });
    let isStaff = !!user;

    // 2. Si no es staff, buscamos en la tabla de CLUBES
    if (!isStaff) {
      user = await prisma.club.findUnique({ where: { username } });
    }

    // 3. Si no existe en ninguna, afuera
    if (!user) {
      return res.status(401).json({ error: "El usuario no existe" });
    }

    // 4. Verificamos la contraseña hasheada
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Contraseña incorrecta" });
    }

    // 5. Generamos el token incluyendo el rol
    const userRole = isStaff ? user.role : "user"; // 'user' es el rol por defecto para los Clubes

    const token = jwt.sign(
      { id: user.id, role: userRole },
      process.env.JWT_SECRET,
      { expiresIn: "8h" },
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: userRole,
        nombre: user.nombre || user.nombreCompleto,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno en el proceso de login" });
  }
});

module.exports = router;
