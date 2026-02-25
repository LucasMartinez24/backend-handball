const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");

// Función para calcular categoría según el año actual (2026)
const calcularCategoria = (fechaNacimiento) => {
  const fecha = new Date(fechaNacimiento);
  const edad = 2026 - fecha.getFullYear();

  if (edad >= 18) return "Primera";
  if (edad >= 16) return "Juvenil";
  if (edad >= 14) return "Cadete";
  if (edad >= 12) return "Menores";
  return "Infantiles";
};

// Obtener todos los jugadores
router.get("/", async (req, res) => {
  const { clubId } = req.query; // Capturamos el clubId de la URL

  try {
    const jugadores = await prisma.jugador.findMany({
      where: {
        // Si mandamos clubId, filtramos. Si no, traemos todos (para admin)
        ...(clubId && { clubId: clubId }),
      },
      include: { club: true },
      orderBy: { createdAt: "desc" }, // Los más nuevos primero
    });

    const respuesta = jugadores.map((j) => ({
      ...j,
      categoria: calcularCategoria(j.fechaNacimiento),
    }));

    res.json(respuesta);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Crear un jugador
router.post("/", async (req, res) => {
  const {
    nombreCompleto,
    dni,
    fechaNacimiento,
    clubId,
    genero,
    nacionalidad,
    email,
    whatsapp,
    tutorPhone,
    peso,
    altura,
    manoHabil,
    tipoFicha,
  } = req.body;

  try {
    const nuevo = await prisma.jugador.create({
      data: {
        nombreCompleto,
        dni,
        fechaNacimiento: new Date(fechaNacimiento),
        clubId,
        genero,
        nacionalidad,
        email,
        whatsapp,
        tutorPhone,
        // Convertimos a número por las dudas que lleguen como string
        peso: peso ? parseFloat(peso) : null,
        altura: altura ? parseInt(altura) : null,
        manoHabil,
        tipoFicha,
      },
    });
    res.json(nuevo);
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: "Error al crear el jugador: DNI duplicado o datos inválidos",
    });
  }
});

module.exports = router;
