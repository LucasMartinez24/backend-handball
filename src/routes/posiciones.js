const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");

// Obtener tabla de posiciones por torneo (con soporte para grupos/zonas)
router.get("/torneo/:torneoId", async (req, res) => {
  const { torneoId } = req.params;
  const { grupo } = req.query;

  try {
    const where = { torneoId: torneoId };
    if (grupo) where.grupo = grupo;

    const tabla = await prisma.posicion.findMany({
      where,
      include: {
        club: {
          select: {
            id: true,
            nombre: true,
            siglas: true,
            logoUrl: true,
          },
        },
      },
      orderBy: [
        { puntos: "desc" },
        { dg: "desc" }, // Diferencia de goles
        { gf: "desc" }, // Goles a favor
      ],
    });

    res.json(tabla);
  } catch (error) {
    console.error("Error al obtener tabla:", error);
    res.status(500).json({ error: "Error al cargar la tabla de posiciones" });
  }
});

module.exports = router;
