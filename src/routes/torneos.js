const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");

// Obtener torneos con conteo de equipos
router.get("/", async (req, res) => {
  try {
    const torneos = await prisma.torneo.findMany({
      include: {
        _count: {
          select: { tablaPosiciones: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const response = torneos.map((t) => ({
      ...t,
      equiposCount: t._count.tablaPosiciones,
    }));

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Crear torneo
router.post("/", async (req, res) => {
  const {
    nombre,
    categoria,
    rama,
    estado,
    fechaInicio,
    progreso,
    formato,
    colorClase,
    idaVuelta,
  } = req.body;

  try {
    const nuevoTorneo = await prisma.torneo.create({
      data: {
        nombre,
        categoria,
        rama,
        estado,
        fechaInicio: new Date(fechaInicio),
        progreso: Number(progreso) || 0,
        formato,
        colorClase,
        idaVuelta: Boolean(idaVuelta),
      },
    });
    res.json(nuevoTorneo);
  } catch (error) {
    console.error("ERROR DETALLADO DE PRISMA:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
