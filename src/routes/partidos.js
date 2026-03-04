const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");
// Obtener fixture de un torneo específico
router.get("/torneo/:torneoId", async (req, res) => {
  const { torneoId } = req.params;

  try {
    const partidos = await prisma.partido.findMany({
      where: { torneoId },
      include: {
        local: { select: { nombre: true, siglas: true, logoUrl: true } },
        visitante: { select: { nombre: true, siglas: true, logoUrl: true } },
      },
      orderBy: [{ jornada: "asc" }, { fecha: "asc" }],
    });
    res.json(partidos);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener el fixture" });
  }
});
// Crear fixture completo (Bulk)
router.post("/bulk", async (req, res) => {
  const { torneoId, jornadas } = req.body;

  try {
    // 1. Extraer IDs únicos de los clubes participantes desde las jornadas
    const clubIds = new Set();
    const partidosData = [];

    jornadas.forEach((j) => {
      j.partidos.forEach((p) => {
        clubIds.add(p.local.id);
        clubIds.add(p.visitante.id);

        let fechaFinal =
          p.fecha && p.hora ? new Date(`${p.fecha}T${p.hora}`) : new Date();

        partidosData.push({
          torneoId: torneoId,
          jornada: parseInt(j.numero),
          localId: p.local.id,
          visitanteId: p.visitante.id,
          fecha: fechaFinal,
          lugar: p.lugar || "Sede a definir",
          estado: "Programado",
        });
      });
    });

    // 2. Ejecutar todo en una transacción de Prisma
    const resultado = await prisma.$transaction(async (tx) => {
      // A. Crear registros en la tabla de posiciones para cada club (si no existen)
      // Esto hará que el contador "equiposCount" funcione inmediatamente
      for (const clubId of clubIds) {
        await tx.posicion.upsert({
          where: {
            torneoId_clubId: { torneoId, clubId },
          },
          update: {}, // Si ya existe, no hacemos nada
          create: {
            torneoId,
            clubId,
            puntos: 0,
            pj: 0,
            pg: 0,
            pe: 0,
            pp: 0,
            gf: 0,
            gc: 0,
            dg: 0,
          },
        });
      }

      // B. Crear los partidos
      const partidosCreados = await tx.partido.createMany({
        data: partidosData,
        skipDuplicates: true,
      });

      // C. Actualizar estado del torneo
      await tx.torneo.update({
        where: { id: torneoId },
        data: { estado: "In Progress" },
      });

      return partidosCreados;
    });

    res.json({
      message: "Fixture y Tabla de Posiciones generados",
      count: resultado.count,
    });
  } catch (error) {
    console.error("Error en transacción:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
