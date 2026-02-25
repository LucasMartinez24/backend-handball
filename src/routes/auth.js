const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const prisma = require("../lib/prisma");

router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  // 1. Caso especial: Super Admin (Federación)
  // Podés usar variables de entorno para esto
  if (username === "admin" && password === "admin123") {
    const token = jwt.sign(
      { id: "admin-id", role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "8h" },
    );
    return res.json({
      token,
      // Envolvemos todo en un objeto 'user' para que el front no se rompa
      user: {
        id: "admin-id",
        username: "admin",
        role: "admin",
        nombre: "Federación Jujeña",
      },
    });
  }

  // 2. Caso normal: Buscar en la tabla de Clubes
  try {
    const club = await prisma.club.findUnique({ where: { username } });

    if (!club || !(await bcrypt.compare(password, club.password))) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const token = jwt.sign(
      { id: club.id, role: "user" },
      process.env.JWT_SECRET,
      { expiresIn: "8h" },
    );

    res.json({
      token,
      user: {
        id: club.id,
        username: club.username,
        role: "user",
        nombre: club.nombre,
        siglas: club.siglas,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Error en el servidor" });
  }
});

module.exports = router;
