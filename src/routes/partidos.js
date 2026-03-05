const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");

// GET /api/partidos/torneo/:torneoId/jornadas
// Resuelve el error 404 de: http://localhost:3000/api/partidos/torneo/.../jornadas
router.get("/torneo/:torneoId/jornadas", async (req, res) => {
  try {
    const jornadas = await prisma.partido.groupBy({
      by: ["jornada"],
      where: { torneoId: req.params.torneoId },
      orderBy: { jornada: "asc" },
    });
    res.json(jornadas.map((j) => j.jornada));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.patch("/:id/resultado", async (req, res) => {
  const { golesLocal, golesVisitante } = req.body;
  const partidoId = req.params.id;

  try {
    const partido = await prisma.partido.findUnique({
      where: { id: partidoId },
      include: { torneo: true },
    });

    if (!partido)
      return res.status(404).json({ error: "Partido no encontrado" });

    // Calculamos puntos de Handball (Gana: 3, Empata: 1, Pierde: 0)
    const ptsLocal =
      golesLocal > golesVisitante ? 3 : golesLocal === golesVisitante ? 1 : 0;
    const ptsVisit =
      golesVisitante > golesLocal ? 3 : golesLocal === golesVisitante ? 1 : 0;

    await prisma.$transaction([
      // 1. Actualizar el partido
      prisma.partido.update({
        where: { id: partidoId },
        data: { golesLocal, golesVisitante, estado: "Finalizado" },
      }),
      // 2. Actualizar Tabla Local
      prisma.posicion.update({
        where: {
          torneoId_clubId: {
            torneoId: partido.torneoId,
            clubId: partido.localId,
          },
        },
        data: {
          pj: { increment: 1 },
          pg: { increment: golesLocal > golesVisitante ? 1 : 0 },
          pe: { increment: golesLocal === golesVisitante ? 1 : 0 },
          pp: { increment: golesLocal < golesVisitante ? 1 : 0 },
          gf: { increment: golesLocal },
          gc: { increment: golesVisitante },
          dg: { increment: golesLocal - golesVisitante },
          puntos: { increment: ptsLocal },
        },
      }),
      // 3. Actualizar Tabla Visitante
      prisma.posicion.update({
        where: {
          torneoId_clubId: {
            torneoId: partido.torneoId,
            clubId: partido.visitanteId,
          },
        },
        data: {
          pj: { increment: 1 },
          pg: { increment: golesVisitante > golesLocal ? 1 : 0 },
          pe: { increment: golesLocal === golesVisitante ? 1 : 0 },
          pp: { increment: golesVisitante < golesLocal ? 1 : 0 },
          gf: { increment: golesVisitante },
          gc: { increment: golesLocal },
          dg: { increment: golesVisitante - golesLocal },
          puntos: { increment: ptsVisit },
        },
      }),
    ]);

    res.json({ message: "Resultado y posiciones actualizadas" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// GET /api/partidos/torneo/:torneoId/jornada/:numero
// Resuelve el error 404 de: http://localhost:3000/api/partidos/torneo/.../jornada/1
router.get("/torneo/:torneoId/jornada/:numero", async (req, res) => {
  try {
    const partidos = await prisma.partido.findMany({
      where: {
        torneoId: req.params.torneoId,
        jornada: parseInt(req.params.numero),
      },
      include: {
        local: { select: { nombre: true, logoUrl: true } },
        visitante: { select: { nombre: true, logoUrl: true } },
      },
    });
    res.json(partidos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Crear fixture completo (Bulk)
router.post("/bulk", async (req, res) => {
  const { torneoId, jornadas } = req.body;

  try {
    const clubIds = new Set();
    const partidosData = [];

    jornadas.forEach((j) => {
      j.partidos.forEach((p) => {
        clubIds.add(p.local.id);
        clubIds.add(p.visitante.id);

        // Validación de fecha para evitar el RangeError
        let fechaFinal = null;
        if (p.fecha && p.fecha.trim() !== "") {
          // Creamos la fecha base (Año, Mes, Día) a las 00:00 local
          // Nota: El input date devuelve "YYYY-MM-DD", usamos split para evitar desfases
          const [year, month, day] = p.fecha.split("-").map(Number);
          fechaFinal = new Date(year, month - 1, day); // month es 0-indexed en JS

          if (p.hora && p.hora.trim() !== "") {
            const [hours, minutes] = p.hora.split(":").map(Number);
            // Seteamos la hora exacta que elegiste en el frontend
            fechaFinal.setHours(hours, minutes, 0, 0);
          }
        }

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

    const resultado = await prisma.$transaction(async (tx) => {
      // 1. ELIMINAR PARTIDOS PREVIOS: Limpiamos el fixture existente para este torneo
      await tx.partido.deleteMany({
        where: { torneoId: torneoId },
      });

      // 2. CREAR POSICIONES: Upsert para cada club participante
      for (const clubId of clubIds) {
        await tx.posicion.upsert({
          where: { torneoId_clubId: { torneoId, clubId } },
          update: {},
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

      // 3. INSERTAR NUEVO FIXTURE
      const partidosCreados = await tx.partido.createMany({
        data: partidosData,
        skipDuplicates: true,
      });

      // 4. ACTUALIZAR ESTADO DEL TORNEO
      await tx.torneo.update({
        where: { id: torneoId },
        data: { estado: "In Progress" },
      });

      return partidosCreados;
    });

    res.json({
      message: "Fixture actualizado correctamente",
      count: resultado.count,
    });
  } catch (error) {
    console.error("Error al actualizar fixture:", error);
    res.status(500).json({ error: error.message });
  }
});
router.get("/torneo/:torneoId", async (req, res) => {
  const { torneoId } = req.params;
  try {
    const partidos = await prisma.partido.findMany({
      where: { torneoId },
      include: {
        local: true, // Incluye la info completa del club local
        visitante: true, // Incluye la info completa del club visitante
      },
      orderBy: { jornada: "asc" },
    });
    res.json(partidos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
module.exports = router;
