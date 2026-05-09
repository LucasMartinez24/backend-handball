const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");

/**
 * 1. OBTENER JORNADAS DISPONIBLES
 */
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

/**
 * 2. OBTENER PARTIDOS POR JORNADA
 */
router.get("/torneo/:torneoId/jornada/:numero", async (req, res) => {
  try {
    const partidos = await prisma.partido.findMany({
      where: {
        torneoId: req.params.torneoId,
        jornada: parseInt(req.params.numero),
      },
      include: {
        local: {
          select: { id: true, nombre: true, logoUrl: true, esInvitado: true },
        },
        visitante: {
          select: { id: true, nombre: true, logoUrl: true, esInvitado: true },
        },
        eventos: true,
      },
    });
    res.json(partidos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 3. OFICIALIZAR RESULTADOS (ACTA CERRADA)
 */
router.patch("/:id/resultado", async (req, res) => {
  const {
    golesLocal,
    golesVisitante,
    golesLocalHT,
    golesVisitanteHT,
    arbitro1,
    arbitro2,
    cronometrista,
    observaciones,
    detallesJugadores,
  } = req.body;
  const partidoId = req.params.id;

  try {
    await prisma.$transaction(async (tx) => {
      const partido = await tx.partido.findUnique({ where: { id: partidoId } });
      if (!partido) throw new Error("Partido no encontrado");

      // 1. Actualizar Datos Generales del Partido
      await tx.partido.update({
        where: { id: partidoId },
        data: {
          golesLocal: parseInt(golesLocal),
          golesVisitante: parseInt(golesVisitante),
          golesLocalHT: parseInt(golesLocalHT),
          golesVisitanteHT: parseInt(golesVisitanteHT),
          arbitro1,
          arbitro2,
          cronometrista,
          observaciones,
          estado: "Finalizado",
        },
      });

      // 2. Procesar Eventos (Estadísticas, Números e Invitados)
      if (detallesJugadores && detallesJugadores.length > 0) {
        await tx.eventoPartido.deleteMany({ where: { partidoId } });
        const eventosData = [];

        for (const j of detallesJugadores) {
          const dorsal = parseInt(j.numero) || 0;
          const equipoIdData = j.equipoId;

          const baseEvento = {
            partidoId,
            equipoId: equipoIdData,
            jugadorId: j.jugadorId || null,
            nombreInvitado: j.jugadorId ? null : j.nombreCompleto,
            numeroInvitado: dorsal,
          };

          // REGISTRO DE PRESENCIA: Clave para que el número se guarde aunque no haga goles
          eventosData.push({ ...baseEvento, tipo: "PRESENCIA" });

          // Goles
          for (let i = 0; i < (j.goles || 0); i++) {
            eventosData.push({ ...baseEvento, tipo: "GOL" });
          }
          // Amarillas
          if (j.am > 0) eventosData.push({ ...baseEvento, tipo: "AMARILLA" });
          // Exclusiones
          for (let i = 0; i < (j.excl || 0); i++) {
            eventosData.push({ ...baseEvento, tipo: "DOS_MINUTOS" });
          }
          // Tarjetas Especiales
          if (j.roja) eventosData.push({ ...baseEvento, tipo: "ROJA" });
          if (j.azul) eventosData.push({ ...baseEvento, tipo: "AZUL" });
        }

        if (eventosData.length > 0) {
          await tx.eventoPartido.createMany({ data: eventosData });
        }
      }

      // 3. Actualizar Tabla de Posiciones
      const ptsL =
        golesLocal > golesVisitante ? 3 : golesLocal === golesVisitante ? 1 : 0;
      const ptsV =
        golesVisitante > golesLocal ? 3 : golesLocal === golesVisitante ? 1 : 0;

      const upsertPosicion = async (isLocal) => {
        const clubId = isLocal ? partido.localId : partido.visitanteId;
        const gF = isLocal ? golesLocal : golesVisitante;
        const gC = isLocal ? golesVisitante : golesLocal;
        const pts = isLocal ? ptsL : ptsV;

        await tx.posicion.upsert({
          where: { torneoId_clubId: { torneoId: partido.torneoId, clubId } },
          update: {
            pj: { increment: 1 },
            puntos: { increment: pts },
            gf: { increment: parseInt(gF) },
            gc: { increment: parseInt(gC) },
            dg: { increment: gF - gC },
            pg: { increment: gF > gC ? 1 : 0 },
            pe: { increment: gF === gC ? 1 : 0 },
            pp: { increment: gF < gC ? 1 : 0 },
          },
          create: {
            torneoId: partido.torneoId,
            clubId,
            pj: 1,
            puntos: pts,
            gf: parseInt(gF),
            gc: parseInt(gC),
            dg: gF - gC,
            pg: gF > gC ? 1 : 0,
            pe: gF === gC ? 1 : 0,
            pp: gF < gC ? 1 : 0,
          },
        });
      };

      await upsertPosicion(true);
      await upsertPosicion(false);
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 4. OBTENER FIXTURE COMPLETO
 */
router.get("/torneo/:torneoId", async (req, res) => {
  try {
    const partidos = await prisma.partido.findMany({
      where: { torneoId: req.params.torneoId },
      include: { local: true, visitante: true },
      orderBy: { jornada: "asc" },
    });
    res.json(partidos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**

 * 5. SINCRONIZAR FIXTURE (POST) - VERSIÓN ULTRA-ROBUSTA
 */
/**
/**
 * 5. SINCRONIZAR FIXTURE (POST) - SOLUCIÓN DEFINITIVA ZONA HORARIA
 */
router.post("/torneo/:torneoId/fixture", async (req, res) => {
  const { torneoId } = req.params;
  const jornadas = Array.isArray(req.body) ? req.body : req.body.jornadas;

  if (!jornadas) return res.status(400).json({ error: "Formato inválido" });

  try {
    const operaciones = [];

    for (const jornada of jornadas) {
      for (const p of jornada.partidos) {
        let fechaFinal = null;

        if (p.fecha && p.hora) {
          // CONSTRUCCIÓN: "2026-05-10T14:00:00"
          // Al mandarlo como objeto Date, JS lo pasa a UTC.
          // Para evitarlo, forzamos la conversión a ISO y quitamos la 'Z'
          // o usamos el formato que Prisma entiende como local.
          const localString = `${p.fecha}T${p.hora}:00.000Z`;

          // Truco: Le sumamos manualmente las 3 horas para que al restarlas quede igual
          // O mejor aún, usamos un string ISO directo si tu base de datos lo permite:
          const dateObj = new Date(`${p.fecha}T${p.hora}:00`);
          // Compensación manual de 3 horas (Argentina es UTC-3)
          dateObj.setHours(dateObj.getHours() + 3);
          fechaFinal = dateObj;
        }

        const data = {
          torneoId,
          jornada: parseInt(jornada.numero),
          localId: p.localId,
          visitanteId: p.visitanteId,
          fecha: fechaFinal,
          lugar: p.lugar || "Sede a definir",
          estado: p.estado || "Programado",
        };

        if (p.id) {
          operaciones.push(
            prisma.partido.update({ where: { id: p.id }, data }),
          );
        } else {
          operaciones.push(prisma.partido.create({ data }));
        }
      }
    }

    await prisma.$transaction(operaciones);
    res.json({ message: "Fixture guardado correctamente" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 6. ELIMINAR PARTIDO
 */
router.delete("/:id", async (req, res) => {
  try {
    const partido = await prisma.partido.findUnique({
      where: { id: req.params.id },
    });
    if (partido?.estado === "Finalizado")
      return res
        .status(400)
        .json({ error: "No se puede borrar partido oficial." });
    await prisma.partido.delete({ where: { id: req.params.id } });
    res.json({ message: "Eliminado" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
