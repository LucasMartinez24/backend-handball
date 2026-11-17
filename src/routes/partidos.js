const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");

/**
 * 0. OBTENER LISTA DE PARTIDOS RECIENTES / TODAS LAS ACTAS (PARA AUDITORÍA Y MONITOREO)
 */
router.get("/actas/recientes", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const partidos = await prisma.partido.findMany({
      take: limit,
      orderBy: { fecha: "desc" },
      include: {
        local: {
          select: { id: true, nombre: true, siglas: true, logoUrl: true, esInvitado: true },
        },
        visitante: {
          select: { id: true, nombre: true, siglas: true, logoUrl: true, esInvitado: true },
        },
        torneo: {
          select: { id: true, nombre: true, temporada: true, categoria: true, rama: true },
        },
        eventos: true,
      },
    });
    res.json(partidos);
  } catch (error) {
    console.error("Error al obtener actas recientes:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 0.1 OBTENER PARTIDOS DE UN CLUB (AGENDA, RESULTADOS Y FIXTURE)
 */
router.get("/club/:clubId", async (req, res) => {
  try {
    const { clubId } = req.params;
    const { estado } = req.query;

    const where = {
      OR: [
        { localId: clubId },
        { visitanteId: clubId }
      ]
    };

    if (estado) {
      where.estado = estado;
    }

    const partidos = await prisma.partido.findMany({
      where,
      orderBy: [
        { fecha: "asc" },
        { jornada: "asc" }
      ],
      include: {
        local: {
          select: { id: true, nombre: true, siglas: true, logoUrl: true, esInvitado: true },
        },
        visitante: {
          select: { id: true, nombre: true, siglas: true, logoUrl: true, esInvitado: true },
        },
        torneo: {
          select: { id: true, nombre: true, temporada: true, categoria: true, rama: true },
        },
        eventos: {
          include: {
            jugador: {
              select: { id: true, nombreCompleto: true, dni: true }
            }
          }
        }
      },
    });

    res.json(partidos);
  } catch (error) {
    console.error("Error al obtener partidos por club:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 1. OBTENER JORNADAS DISPONIBLES (SOLO FASE REGULAR: JORNADA < 90)
 */
router.get("/torneo/:torneoId/jornadas", async (req, res) => {
  try {
    const jornadas = await prisma.partido.groupBy({
      by: ["jornada"],
      where: {
        torneoId: req.params.torneoId,
        jornada: { lt: 90 },
      },
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
          select: { id: true, nombre: true, siglas: true, logoUrl: true, esInvitado: true },
        },
        visitante: {
          select: { id: true, nombre: true, siglas: true, logoUrl: true, esInvitado: true },
        },
        eventos: {
          include: {
            jugador: {
              select: { id: true, nombreCompleto: true, dni: true },
            },
          },
        },
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
    estado,
  } = req.body;
  const partidoId = req.params.id;
  const estadoFinal = estado === "En Vivo" ? "En Vivo" : "Finalizado";

  const toInt = (value, fallback = 0) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  try {
    await prisma.$transaction(async (tx) => {
      const partido = await tx.partido.findUnique({
        where: { id: partidoId },
        include: { local: true, visitante: true },
      });
      if (!partido) throw new Error("Partido no encontrado");

      // 1. Actualizar Datos Generales del Partido
      await tx.partido.update({
        where: { id: partidoId },
        data: {
          golesLocal: toInt(golesLocal),
          golesVisitante: toInt(golesVisitante),
          golesLocalHT: toInt(golesLocalHT),
          golesVisitanteHT: toInt(golesVisitanteHT),
          arbitro1,
          arbitro2,
          cronometrista,
          observaciones,
          estado: estadoFinal,
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
          if (j.azul) {
            eventosData.push({ ...baseEvento, tipo: "AZUL" });

            // Creación automática de expediente preventivo en Tribunal de Penas si el jugador está federado
            if (j.jugadorId) {
              const jugadorInfo = await tx.jugador.findUnique({
                where: { id: j.jugadorId },
                include: { club: true },
              });
              if (jugadorInfo) {
                await tx.sancion.create({
                  data: {
                    sancionado: jugadorInfo.nombreCompleto,
                    institucion: jugadorInfo.club?.nombre || "Club Afiliado",
                    categoria: jugadorInfo.categoria || "Primera División",
                    fallo: "Suspensión Preventiva (Informe Arbitral por Tarjeta Azul)",
                    cumplidas: 0,
                    totales: 1,
                    vigencia: "En revisión por Tribunal de Penas",
                    expediente: `EXP-AZUL-${Date.now().toString().slice(-6)}`,
                    estado: "grave",
                    motivo: `Informe arbitral del partido ${partido.local?.nombre || ''} vs ${partido.visitante?.nombre || ''}. Tarjeta Azul disciplinaria.`,
                    jugadorId: jugadorInfo.id,
                    clubId: jugadorInfo.clubId,
                  },
                });

                // Inhabilitar temporalmente al jugador
                await tx.jugador.update({
                  where: { id: jugadorInfo.id },
                  data: { estado: "Sancionado" },
                });
              }
            }
          }
        }

        if (eventosData.length > 0) {
          await tx.eventoPartido.createMany({ data: eventosData });
        }
      }

      // 3. Actualizar Tabla de Posiciones (Solo al cerrar oficialmente un partido de Fase Regular)
      if (estadoFinal === "Finalizado" && partido.estado !== "Finalizado" && (partido.jornada || 1) < 90) {
        const gL = toInt(golesLocal);
        const gV = toInt(golesVisitante);
        const ptsL = gL > gV ? 3 : gL === gV ? 2 : 1;
        const ptsV = gV > gL ? 3 : gL === gV ? 2 : 1;

        const upsertPosicion = async (isLocal) => {
          const clubId = isLocal ? partido.localId : partido.visitanteId;
          const gF = isLocal ? gL : gV;
          const gC = isLocal ? gV : gL;
          const pts = isLocal ? ptsL : ptsV;

          await tx.posicion.upsert({
            where: { torneoId_clubId: { torneoId: partido.torneoId, clubId } },
            update: {
              pj: { increment: 1 },
              puntos: { increment: pts },
              gf: { increment: gF },
              gc: { increment: gC },
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
              gf: gF,
              gc: gC,
              dg: gF - gC,
              pg: gF > gC ? 1 : 0,
              pe: gF === gC ? 1 : 0,
              pp: gF < gC ? 1 : 0,
            },
          });
        };

        await upsertPosicion(true);
        await upsertPosicion(false);
      }

      // 4. Si el partido se cerró como Finalizado, evaluar generación progresiva de Playoffs
      if (estadoFinal === "Finalizado") {
        await sincronizarPlayoffsAutomaticos(tx, partido.torneoId);
      }
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
      include: {
        local: true,
        visitante: true,
        eventos: {
          include: {
            jugador: {
              select: { id: true, nombreCompleto: true, dni: true },
            },
          },
        },
      },
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
  const clubesIds = Array.isArray(req.body?.clubesIds) ? req.body.clubesIds : [];

  if (!jornadas) return res.status(400).json({ error: "Formato inválido" });

  try {
    const operaciones = [];
    const clubesParticipantes = new Set(clubesIds.filter(Boolean));

    for (const jornada of jornadas) {
      for (const p of jornada.partidos || []) {
        if (!p.localId || !p.visitanteId) continue;
        clubesParticipantes.add(p.localId);
        clubesParticipantes.add(p.visitanteId);

        let fechaFinal = null;
        if (p.fecha) {
          const fechaLimpia = String(p.fecha).trim().substring(0, 10);
          if (/^\d{4}-\d{2}-\d{2}$/.test(fechaLimpia)) {
            const matchHora = String(p.hora || "15:00").trim().match(/(\d{1,2}):(\d{2})/);
            const hh = matchHora ? matchHora[1].padStart(2, "0") : "15";
            const mm = matchHora ? matchHora[2] : "00";
            const dateObj = new Date(`${fechaLimpia}T${hh}:${mm}:00`);
            if (!isNaN(dateObj.getTime())) {
              dateObj.setHours(dateObj.getHours() + 3);
              fechaFinal = dateObj;
            }
          }
        }

        const numJornada = parseInt(jornada.numero) || 1;
        const faseDefault =
          numJornada === 91
            ? "Cuartos de Final"
            : numJornada === 92
              ? "Semifinales"
              : numJornada === 98
                ? "Tercer Puesto"
                : numJornada === 99
                  ? "Gran Final"
                  : p.grupo
                    ? `Zona ${p.grupo}`
                    : "Fase Regular";

        const data = {
          torneoId,
          jornada: numJornada,
          fase: p.fase || faseDefault,
          grupo: p.grupo || null,
          localId: p.localId,
          visitanteId: p.visitanteId,
          fecha: fechaFinal,
          lugar: p.lugar || "Polideportivo Cuyaya",
          estado: p.estado || "Programado",
          penalesLocal: p.penalesLocal !== undefined ? Number(p.penalesLocal) : 0,
          penalesVisitante: p.penalesVisitante !== undefined ? Number(p.penalesVisitante) : 0,
          arbitro1: p.arbitro1 || null,
          arbitro2: p.arbitro2 || null,
          cronometrista: p.cronometrista || null,
          observaciones: p.observaciones || null,
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

    for (const clubId of clubesParticipantes) {
      operaciones.push(
        prisma.posicion.upsert({
          where: { torneoId_clubId: { torneoId, clubId } },
          update: {},
          create: { torneoId, clubId, grupo: "General" },
        })
      );
    }

    await prisma.$transaction(operaciones);
    res.json({ message: "Fixture guardado correctamente" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * ACTUALIZAR DETALLES / DESIGNACIONES DE UN PARTIDO
 */
router.patch("/:id", async (req, res) => {
  try {
    const { fecha, hora, lugar, estado, arbitro1, arbitro2, cronometrista, observaciones, localId, visitanteId, jornada, fase, grupo } = req.body;
    let fechaFinal = undefined;
    if (fecha !== undefined) {
      if (fecha && hora) {
        const cleanDate = String(fecha).trim().substring(0, 10);
        const matchHora = String(hora).trim().match(/(\d{1,2}):(\d{2})/);
        if (matchHora) {
          const hh = matchHora[1].padStart(2, "0");
          const mm = matchHora[2];
          const dateObj = new Date(`${cleanDate}T${hh}:${mm}:00`);
          if (!isNaN(dateObj.getTime())) {
            fechaFinal = dateObj;
          }
        } else {
          const dateObj = new Date(cleanDate);
          if (!isNaN(dateObj.getTime())) fechaFinal = dateObj;
        }
      } else if (fecha) {
        const dateObj = new Date(fecha);
        if (!isNaN(dateObj.getTime())) fechaFinal = dateObj;
      } else {
        fechaFinal = null;
      }
    }

    const data = {};
    if (fechaFinal !== undefined) data.fecha = fechaFinal;
    if (lugar !== undefined) data.lugar = lugar;
    if (estado !== undefined) data.estado = estado;
    if (arbitro1 !== undefined) data.arbitro1 = arbitro1;
    if (arbitro2 !== undefined) data.arbitro2 = arbitro2;
    if (cronometrista !== undefined) data.cronometrista = cronometrista;
    if (observaciones !== undefined) data.observaciones = observaciones;
    if (localId !== undefined) data.localId = localId;
    if (visitanteId !== undefined) data.visitanteId = visitanteId;
    if (jornada !== undefined) data.jornada = parseInt(jornada);
    if (fase !== undefined) data.fase = fase;
    if (grupo !== undefined) data.grupo = grupo;

    const partido = await prisma.partido.update({
      where: { id: req.params.id },
      data,
      include: { local: true, visitante: true }
    });
    res.json(partido);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 6. CREAR PARTIDO INDIVIDUAL (PLAYOFFS O EXTRA)
 */
router.post("/partido", async (req, res) => {
  try {
    const { torneoId, jornada, fase, grupo, localId, visitanteId, fecha, hora, lugar, estado } = req.body;
    let fechaFinal = null;

    if (fecha) {
      // Limpiar formato si viene con hora o es YYYY-MM-DD
      const fechaLimpia = String(fecha).trim();
      if (fechaLimpia !== "" && fechaLimpia !== "null" && fechaLimpia !== "undefined") {
        if (hora && /^\d{1,2}:\d{2}/.test(String(hora).trim())) {
          const matchHora = String(hora).trim().match(/^(\d{1,2}):(\d{2})/);
          const hh = matchHora[1].padStart(2, "0");
          const mm = matchHora[2];
          const parsed = new Date(`${fechaLimpia.substring(0, 10)}T${hh}:${mm}:00`);
          if (!isNaN(parsed.getTime())) {
            fechaFinal = parsed;
          }
        } else {
          const parsed = new Date(fechaLimpia);
          if (!isNaN(parsed.getTime())) {
            fechaFinal = parsed;
          }
        }
      }
    }

    const nuevoPartido = await prisma.partido.create({
      data: {
        torneoId,
        jornada: parseInt(jornada) || 99,
        fase: fase || "Playoffs",
        grupo: grupo || null,
        localId,
        visitanteId,
        fecha: fechaFinal,
        lugar: lugar || "Sede a definir",
        estado: estado || "Programado",
      },
      include: {
        local: true,
        visitante: true,
      },
    });

    res.status(201).json(nuevoPartido);
  } catch (error) {
    console.error("Error al crear partido individual:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 7. ELIMINAR PARTIDO
 */
router.delete("/:id", async (req, res) => {
  try {
    const partido = await prisma.partido.findUnique({
      where: { id: req.params.id },
    });
    if (partido?.estado === "Finalizado" && (partido?.jornada || 1) < 90)
      return res
        .status(400)
        .json({ error: "No se puede borrar partido oficial de fase regular." });
    await prisma.eventoPartido.deleteMany({ where: { partidoId: req.params.id } });
    await prisma.partido.delete({ where: { id: req.params.id } });
    res.json({ message: "Eliminado" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 8. MOTOR AUTOMÁTICO DE DEFINICIÓN Y PROGRESIÓN DE PLAYOFFS
 * - Define automáticamente SOLO la fase eliminatoria inicial configurada (Cuartos o Semifinales o Final)
 *   cuando finaliza el último partido de la fase regular.
 * - Cuando finalizan todos los partidos de esa fase inicial, genera automáticamente la siguiente fase
 *   (de Cuartos -> Semifinales; de Semifinales -> Gran Final y Tercer Puesto).
 */
async function sincronizarPlayoffsAutomaticos(db, torneoId, options = {}) {
  const torneo = await db.torneo.findUnique({
    where: { id: torneoId },
    include: {
      tablaPosiciones: { include: { club: true } },
      partidos: {
        include: { local: true, visitante: true },
        orderBy: [{ jornada: "asc" }, { id: "asc" }],
      },
    },
  });

  if (!torneo) return { creados: 0, faseGenerada: null };

  // Si se solicita regenerar la fase inicial no jugada (ej. al cambiar configuración de faseInicial)
  if (options.regenerarNoJugados) {
    const noJugados = torneo.partidos.filter(
      (p) => (p.jornada || 1) >= 90 && p.estado !== "Finalizado"
    );
    if (noJugados.length > 0) {
      await db.partido.deleteMany({
        where: { id: { in: noJugados.map((p) => p.id) } },
      });
      torneo.partidos = torneo.partidos.filter(
        (p) => !((p.jornada || 1) >= 90 && p.estado !== "Finalizado")
      );
    }
  }

  const partidosRegulares = torneo.partidos.filter((p) => (p.jornada || 1) < 90);
  const partidosPlayoffs = torneo.partidos.filter((p) => (p.jornada || 1) >= 90);

  // Si aún no hay partidos regulares o falta alguno por finalizar, no se registran llaves todavía
  if (
    partidosRegulares.length === 0 ||
    partidosRegulares.some((p) => p.estado !== "Finalizado")
  ) {
    return {
      creados: 0,
      faseGenerada: null,
      regularCompleta: false,
      regularesJugados: partidosRegulares.filter((p) => p.estado === "Finalizado").length,
      regularesTotales: partidosRegulares.length,
    };
  }

  // Calcular Tabla de Posiciones Oficial de Fase Regular
  const tablaMap = new Map();
  const initClub = (clubId, clubObj) => {
    if (!clubId) return;
    if (!tablaMap.has(clubId)) {
      tablaMap.set(clubId, {
        clubId,
        nombre: clubObj?.nombre || "Club",
        puntos: 0,
        pj: 0,
        gf: 0,
        gc: 0,
        dg: 0,
      });
    }
  };

  for (const pos of torneo.tablaPosiciones || []) {
    initClub(pos.clubId, pos.club);
  }
  for (const p of partidosRegulares) {
    initClub(p.localId, p.local);
    initClub(p.visitanteId, p.visitante);
    if (p.estado === "Finalizado") {
      const gL = Number(p.golesLocal ?? 0);
      const gV = Number(p.golesVisitante ?? 0);
      const itemL = tablaMap.get(p.localId);
      const itemV = tablaMap.get(p.visitanteId);
      if (itemL && itemV) {
        itemL.pj++;
        itemV.pj++;
        itemL.gf += gL;
        itemL.gc += gV;
        itemL.dg = itemL.gf - itemL.gc;
        itemV.gf += gV;
        itemV.gc += gL;
        itemV.dg = itemV.gf - itemV.gc;
        if (gL > gV) {
          itemL.puntos += 3;
          itemV.puntos += 1;
        } else if (gV > gL) {
          itemV.puntos += 3;
          itemL.puntos += 1;
        } else {
          itemL.puntos += 2;
          itemV.puntos += 2;
        }
      }
    }
  }

  const tablaOrdenada = Array.from(tablaMap.values()).sort((a, b) => {
    if (b.puntos !== a.puntos) return b.puntos - a.puntos;
    if (b.dg !== a.dg) return b.dg - a.dg;
    return b.gf - a.gf;
  });

  const rankingIds = tablaOrdenada.map((r) => r.clubId);

  // Determinar sede predeterminada del torneo
  let sedeDefault = "Polideportivo Cuyaya";
  if (torneo.sedes) {
    try {
      const parsed = JSON.parse(torneo.sedes);
      if (Array.isArray(parsed) && parsed.length > 0) sedeDefault = parsed[0];
    } catch {
      const split = String(torneo.sedes).split(",");
      if (split[0]?.trim()) sedeDefault = split[0].trim();
    }
  }

  const esIdaVuelta = torneo.modalidadLlave === "ida_vuelta";
  const nuevosPartidos = [];

  const agregarLlave = (jornadaBase, tituloLlave, mejorClasificadoId, peorClasificadoId) => {
    if (!mejorClasificadoId || !peorClasificadoId) return;
    if (esIdaVuelta) {
      nuevosPartidos.push({
        torneoId,
        jornada: jornadaBase,
        fase: `${tituloLlave} (Ida)`,
        localId: peorClasificadoId,
        visitanteId: mejorClasificadoId,
        lugar: sedeDefault,
        estado: "Programado",
      });
      nuevosPartidos.push({
        torneoId,
        jornada: jornadaBase,
        fase: `${tituloLlave} (Vuelta)`,
        localId: mejorClasificadoId,
        visitanteId: peorClasificadoId,
        lugar: sedeDefault,
        estado: "Programado",
      });
    } else {
      nuevosPartidos.push({
        torneoId,
        jornada: jornadaBase,
        fase: tituloLlave,
        localId: mejorClasificadoId,
        visitanteId: peorClasificadoId,
        lugar: sedeDefault,
        estado: "Programado",
      });
    }
  };

  // Función auxiliar para obtener ganador y perdedor de una llave (soporta Partido Único o Ida/Vuelta)
  const resolverGanadorLlave = (partidosDeLaLlave) => {
    if (!partidosDeLaLlave || partidosDeLaLlave.length === 0) return null;
    if (partidosDeLaLlave.some((p) => p.estado !== "Finalizado")) return null;

    const golesPorClub = new Map();
    for (const p of partidosDeLaLlave) {
      golesPorClub.set(p.localId, (golesPorClub.get(p.localId) || 0) + Number(p.golesLocal ?? 0));
      golesPorClub.set(p.visitanteId, (golesPorClub.get(p.visitanteId) || 0) + Number(p.golesVisitante ?? 0));
    }

    const clubesEnLlave = Array.from(golesPorClub.keys());
    if (clubesEnLlave.length < 2) return null;

    const [clubA, clubB] = clubesEnLlave;
    const golesA = golesPorClub.get(clubA) || 0;
    const golesB = golesPorClub.get(clubB) || 0;

    if (golesA > golesB) return { ganadorId: clubA, perdedorId: clubB };
    if (golesB > golesA) return { ganadorId: clubB, perdedorId: clubA };

    // En caso de empate global sin penales cargados, ventaja deportiva al mejor ubicado en Fase Regular
    const posA = rankingIds.indexOf(clubA);
    const posB = rankingIds.indexOf(clubB);
    if (posA !== -1 && posB !== -1 && posA <= posB) {
      return { ganadorId: clubA, perdedorId: clubB };
    }
    return { ganadorId: clubB, perdedorId: clubA };
  };

  const faseConfig = (torneo.faseInicial || "semifinales").toLowerCase();
  let faseGenerada = null;

  // =========================================================================
  // ETAPA 1: Si NO hay ningún partido de Playoffs todavía, crear SOLO la fase inicial
  // =========================================================================
  if (partidosPlayoffs.length === 0) {
    // Respetar siempre `faseInicial` configurada en el torneo (con resguardo si hay menos clubes en total)
    if (faseConfig.includes("cuartos") && tablaOrdenada.length >= 8) {
      agregarLlave(91, "Cuartos de Final 1 (1° vs 8°)", tablaOrdenada[0].clubId, tablaOrdenada[7].clubId);
      agregarLlave(91, "Cuartos de Final 2 (4° vs 5°)", tablaOrdenada[3].clubId, tablaOrdenada[4].clubId);
      agregarLlave(91, "Cuartos de Final 3 (2° vs 7°)", tablaOrdenada[1].clubId, tablaOrdenada[6].clubId);
      agregarLlave(91, "Cuartos de Final 4 (3° vs 6°)", tablaOrdenada[2].clubId, tablaOrdenada[5].clubId);
      faseGenerada = "Cuartos de Final";
    } else if ((faseConfig.includes("semi") || faseConfig.includes("cuartos")) && tablaOrdenada.length >= 4) {
      agregarLlave(92, "Semifinal 1 (1° vs 4°)", tablaOrdenada[0].clubId, tablaOrdenada[3].clubId);
      agregarLlave(92, "Semifinal 2 (2° vs 3°)", tablaOrdenada[1].clubId, tablaOrdenada[2].clubId);
      faseGenerada = "Semifinales";
    } else if (tablaOrdenada.length >= 2) {
      agregarLlave(99, "Gran Final (1° vs 2°)", tablaOrdenada[0].clubId, tablaOrdenada[1].clubId);
      faseGenerada = "Gran Final";
    }
  } else {
    // =========================================================================
    // ETAPA 2: Si ya existen Cuartos de Final y TODOS finalizaron -> Generar Semifinales
    // =========================================================================
    const partidosCuartos = partidosPlayoffs.filter((p) =>
      (p.fase || "").toLowerCase().includes("cuartos") || p.jornada === 91
    );
    const partidosSemis = partidosPlayoffs.filter((p) =>
      (p.fase || "").toLowerCase().includes("semi") || p.jornada === 92
    );
    const partidosFinal = partidosPlayoffs.filter((p) => {
      const f = (p.fase || "").toLowerCase();
      return (f.includes("final") && !f.includes("semi") && !f.includes("cuartos")) || p.jornada === 99;
    });

    if (
      partidosCuartos.length >= 4 &&
      partidosCuartos.every((p) => p.estado === "Finalizado") &&
      partidosSemis.length === 0
    ) {
      const c1 = resolverGanadorLlave(partidosCuartos.filter((p) => (p.fase || "").includes("Cuartos de Final 1")));
      const c2 = resolverGanadorLlave(partidosCuartos.filter((p) => (p.fase || "").includes("Cuartos de Final 2")));
      const c3 = resolverGanadorLlave(partidosCuartos.filter((p) => (p.fase || "").includes("Cuartos de Final 3")));
      const c4 = resolverGanadorLlave(partidosCuartos.filter((p) => (p.fase || "").includes("Cuartos de Final 4")));

      if (c1 && c2 && c3 && c4) {
        agregarLlave(92, "Semifinal 1", c1.ganadorId, c2.ganadorId);
        agregarLlave(92, "Semifinal 2", c3.ganadorId, c4.ganadorId);
        faseGenerada = "Semifinales";
      }
    }

    // =========================================================================
    // ETAPA 3: Si ya existen las 2 Semifinales y TODAS finalizaron -> Generar Gran Final y 3° Puesto
    // =========================================================================
    if (
      partidosSemis.length >= 2 &&
      partidosSemis.every((p) => p.estado === "Finalizado") &&
      partidosFinal.length === 0
    ) {
      let s1Partidos = partidosSemis.filter((p) => (p.fase || "").includes("Semifinal 1"));
      let s2Partidos = partidosSemis.filter((p) => (p.fase || "").includes("Semifinal 2"));

      // Fallback por si las semifinales se llamaban genéricamente "Semifinales"
      if (s1Partidos.length === 0 || s2Partidos.length === 0) {
        const mitad = Math.ceil(partidosSemis.length / 2);
        s1Partidos = partidosSemis.slice(0, mitad);
        s2Partidos = partidosSemis.slice(mitad);
      }

      const resS1 = resolverGanadorLlave(s1Partidos);
      const resS2 = resolverGanadorLlave(s2Partidos);

      if (resS1 && resS2) {
        if (torneo.tercerPuesto !== false) {
          nuevosPartidos.push({
            torneoId,
            jornada: 98,
            fase: "Tercer Puesto",
            localId: resS1.perdedorId,
            visitanteId: resS2.perdedorId,
            lugar: sedeDefault,
            estado: "Programado",
          });
        }
        agregarLlave(99, "Gran Final", resS1.ganadorId, resS2.ganadorId);
        faseGenerada = "Gran Final";
      }
    }
  }

  for (const data of nuevosPartidos) {
    await db.partido.create({ data });
  }

  return {
    creados: nuevosPartidos.length,
    faseGenerada,
    regularCompleta: true,
    regularesJugados: partidosRegulares.length,
    regularesTotales: partidosRegulares.length,
  };
}

/**
 * 9. ENDPOINT PARA SINCRONIZAR / GENERAR PLAYOFFS AUTOMÁTICOS DEL TORNEO
 */
router.post("/torneo/:torneoId/sincronizar-playoffs", async (req, res) => {
  try {
    const { regenerarNoJugados, faseInicial } = req.body || {};
    const { torneoId } = req.params;

    const resultado = await prisma.$transaction(async (tx) => {
      if (faseInicial) {
        await tx.torneo.update({
          where: { id: torneoId },
          data: { faseInicial },
        });
      }
      return await sincronizarPlayoffsAutomaticos(tx, torneoId, {
        regenerarNoJugados: Boolean(regenerarNoJugados),
      });
    });

    res.json(resultado);
  } catch (error) {
    console.error("Error al sincronizar playoffs:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
