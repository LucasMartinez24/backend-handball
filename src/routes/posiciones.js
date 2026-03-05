const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");

// Obtener tabla de posiciones por torneo
router.get("/torneo/:torneoId", async (req, res) => {
  const { torneoId } = req.params;

  try {
    const tabla = await prisma.posicion.findMany({
      where: { torneoId: torneoId },
      include: {
        club: {
          select: {
            nombre: true,
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
