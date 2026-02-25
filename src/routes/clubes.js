const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");
const bcrypt = require("bcrypt");

router.get("/", async (req, res) => {
  try {
    const clubes = await prisma.club.findMany({
      include: {
        jugadores: true, // Esto trae automáticamente la lista de jugadores de cada club
      },
    });
    console.log(clubes);
    res.json(clubes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/", async (req, res) => {
  const { nombre, siglas, username, password } = req.body;

  try {
    // 1. Encripta  mos la contraseña (10 es el nivel de seguridad)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 2. Creamos el club en la base de datos
    const nuevoClub = await prisma.club.create({
      data: {
        nombre,
        siglas,
        username,
        password: hashedPassword, // Guardamos la versión segura
      },
    });

    // 3. Respondemos sin enviar la contraseña de vuelta
    const { password: _, ...clubSinPassword } = nuevoClub;
    res.status(201).json(clubSinPassword);
  } catch (error) {
    res.status(400).json({ error: "El username o las siglas ya existen" });
  }
});

module.exports = router;

module.exports = router;
