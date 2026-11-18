const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");

// Normaliza la categoría del torneo donde se convirtió el gol
function normalizarCategoriaCompetencia(rawCat, rawNombre = "") {
  const c = `${rawCat || ""} ${rawNombre || ""}`.toLowerCase().trim();
  if (c.includes("+35") || c.includes("maxi") || c.includes("veteran") || /\b35\b/.test(c)) {
    return "+35";
  }
  if (c.includes("primera") || c.includes("1ra") || c.includes("mayores")) return "Primera";
  if (c.includes("juvenil") || c.includes("sub-18") || c.includes("sub 18")) return "Juveniles";
  if (c.includes("cadete") || c.includes("sub-16") || c.includes("sub 16")) return "Cadetes";
  if (c.includes("menor") || c.includes("sub-14") || c.includes("sub 14")) return "Menores";
  if (c.includes("infantil") || c.includes("mini")) return "Infantiles";
  return (rawCat || "Primera").replace("División", "").trim();
}

// Obtener tabla de goleadores por torneo o por categoría de competencia (excluyendo +35 y sin mezclar categorías)
router.get("/goleadores", async (req, res) => {
  const { torneoId, genero, categoria } = req.query;

  try {
    const where = { tipo: "GOL" };

    if (torneoId) {
      where.partido = { torneoId };
    }

    const eventosGoles = await prisma.eventoPartido.findMany({
      where,
      include: {
        partido: {
          include: {
            torneo: true,
          },
        },
        jugador: {
          include: {
            club: {
              select: { id: true, nombre: true, siglas: true, logoUrl: true },
            },
          },
        },
      },
    });

    const isMascFilter = genero ? genero.toLowerCase().startsWith("masc") : false;
    const isFemFilter = genero ? genero.toLowerCase().startsWith("fem") : false;
    const hasCatFilter = Boolean(categoria && categoria !== "Todas");
    const targetCat = hasCatFilter ? normalizarCategoriaCompetencia(categoria) : null;

    // Si alguien pide explícitamente "+35", devolver vacío porque +35 no entra en Top Goleadores
    if (targetCat === "+35") {
      return res.json([]);
    }

    const goleadoresMap = new Map();

    for (const ev of eventosGoles) {
      const torneo = ev.partido?.torneo;
      const jugador = ev.jugador;

      // 1. Excluir estrictamente torneos +35 / Maxi y jugadores que sean de categoría +35
      const catTorneo = normalizarCategoriaCompetencia(torneo?.categoria, torneo?.nombre);
      const jCatLower = `${jugador?.categoria || ""} ${jugador?.categoriaEspecial || ""}`.toLowerCase();
      if (
        catTorneo === "+35" ||
        (jugador?.categoria || "").toLowerCase().includes("+35") ||
        (!torneo && jCatLower.includes("+35"))
      ) {
        continue;
      }

      // 2. Determinar la categoría real en la que se convirtió este gol (mandatoria la del torneo del partido)
      const catDelGol = torneo
        ? catTorneo
        : normalizarCategoriaCompetencia(jugador?.categoria);

      if (catDelGol === "+35") {
        continue;
      }

      // 3. Filtrar por Rama / Género de la competencia donde se jugó el partido
      if (isMascFilter || isFemFilter) {
        const ramaStr = `${torneo?.rama || ""} ${torneo?.nombre || ""} ${jugador?.genero || ""}`.toLowerCase();
        if (isMascFilter && !ramaStr.includes("masc") && !ramaStr.startsWith("m")) continue;
        if (isFemFilter && !ramaStr.includes("fem") && !ramaStr.startsWith("f")) continue;
      }

      // 4. Filtrar estrictamente por la categoría del torneo en que se anotó el gol
      //    (Un juvenil que anota en Primera suma esos goles solo en Primera; los que anota en Juveniles solo en Juveniles)
      if (hasCatFilter && catDelGol !== targetCat) {
        continue;
      }

      // 5. Agrupar por (Jugador + Categoría del Gol) para NUNCA mezclar ni sumar goles de distintas categorías
      const basePlayerKey = ev.jugadorId || `inv-${ev.nombreInvitado || "Anonimo"}-${ev.equipoId}`;
      const key = `${basePlayerKey}__${catDelGol}`;

      const nombre = jugador ? jugador.nombreCompleto : (ev.nombreInvitado || "Jugador");
      const clubNombre = jugador?.club?.nombre || "Club Afiliado";
      const clubLogo = jugador?.club?.logoUrl || null;
      const clubSiglas = jugador?.club?.siglas || "CLUB";

      if (!goleadoresMap.has(key)) {
        goleadoresMap.set(key, {
          jugadorId: ev.jugadorId,
          nombre,
          club: clubNombre,
          clubLogo,
          clubSiglas,
          categoria: catDelGol,
          goles: 0,
          partidosIds: new Set(),
        });
      }

      const item = goleadoresMap.get(key);
      item.goles += 1;
      item.partidosIds.add(ev.partidoId);
    }

    const lista = Array.from(goleadoresMap.values())
      .map((g) => ({
        jugadorId: g.jugadorId,
        nombre: g.nombre,
        club: g.club,
        clubLogo: g.clubLogo,
        clubSiglas: g.clubSiglas,
        categoria: g.categoria,
        goles: g.goles,
        pj: g.partidosIds.size,
      }))
      .sort((a, b) => b.goles - a.goles || a.pj - b.pj);

    const ranking = lista.map((item, index) => ({
      pos: index + 1,
      ...item,
    }));

    res.json(ranking);
  } catch (error) {
    console.error("Error al obtener goleadores:", error);
    res.status(500).json({ error: "Error al calcular goleadores" });
  }
});

// Obtener tabla de posiciones por torneo o por filtros (con cálculo dinámico en tiempo real y soporte para grupos)
router.get("/torneo/:torneoId", async (req, res) => {
  const { torneoId } = req.params;
  const { grupo, categoria, rama } = req.query;

  try {
    // 1. Resolver el torneo o torneos a consultar
    let torneosIds = [torneoId];

    if (torneoId === 'categoria' || categoria || rama) {
      const torneoWhere = {};
      if (categoria && categoria !== 'TODAS') {
        const catClean = categoria.replace('PRIMERA', 'Primera');
        torneoWhere.categoria = { contains: catClean };
      }
      if (rama && rama !== 'TODAS') {
        torneoWhere.rama = { contains: rama };
      }
      const torneosMatched = await prisma.torneo.findMany({
        where: torneoWhere,
        select: { id: true },
      });
      if (torneosMatched && torneosMatched.length > 0) {
        torneosIds = torneosMatched.map((t) => t.id);
      } else {
        // No hay torneos para esta categoría/rama, retornar lista vacía
        return res.json([]);
      }
    }

    // 2. Obtener todos los clubes inscriptos en la tabla del torneo y todos los partidos regulares
    const [posicionesRegistradas, todosPartidosRegulares] = await Promise.all([
      prisma.posicion.findMany({
        where: { torneoId: { in: torneosIds }, ...(grupo ? { grupo } : {}) },
        include: {
          club: {
            select: { id: true, nombre: true, siglas: true, logoUrl: true, esInvitado: true },
          },
        },
      }),
      prisma.partido.findMany({
        where: {
          torneoId: { in: torneosIds },
          jornada: { lt: 90 },
          ...(grupo ? { grupo } : {}),
        },
        include: {
          local: {
            select: { id: true, nombre: true, siglas: true, logoUrl: true, esInvitado: true },
          },
          visitante: {
            select: { id: true, nombre: true, siglas: true, logoUrl: true, esInvitado: true },
          },
        },
      }),
    ]);

    // 3. Inicializar mapa con TODOS los clubes del torneo (para que todos figuren desde la Fecha 1)
    const tablaMap = new Map();

    const inicializarClub = (club, grupoClub = "General") => {
      if (!club || !club.id) return;
      if (!tablaMap.has(club.id)) {
        tablaMap.set(club.id, {
          clubId: club.id,
          torneoId,
          grupo: grupo || grupoClub || "General",
          pj: 0,
          pg: 0,
          pe: 0,
          pp: 0,
          gf: 0,
          gc: 0,
          dg: 0,
          puntos: 0,
          club: {
            id: club.id,
            nombre: club.nombre,
            siglas: club.siglas,
            logoUrl: club.logoUrl,
          },
        });
      }
    };

    for (const pos of posicionesRegistradas) {
      if (pos.club) inicializarClub(pos.club, pos.grupo);
    }

    for (const p of todosPartidosRegulares) {
      if (p.local) inicializarClub(p.local, p.grupo);
      if (p.visitante) inicializarClub(p.visitante, p.grupo);
    }

    // Filtrar únicamente los partidos regulares finalizados para sumar puntos
    const partidosFinalizados = todosPartidosRegulares.filter(
      (p) => p.estado === "Finalizado"
    );

    for (const p of partidosFinalizados) {
      if (p.local) inicializarClub(p.local);
      if (p.visitante) inicializarClub(p.visitante);

      const gL = Number(p.golesLocal ?? 0);
      const gV = Number(p.golesVisitante ?? 0);

      const itemL = tablaMap.get(p.localId);
      const itemV = tablaMap.get(p.visitanteId);

      if (itemL && itemV) {
        itemL.pj += 1;
        itemV.pj += 1;

        itemL.gf += gL;
        itemL.gc += gV;
        itemL.dg = itemL.gf - itemL.gc;

        itemV.gf += gV;
        itemV.gc += gL;
        itemV.dg = itemV.gf - itemV.gc;

        if (gL > gV) {
          // Victoria Local (3 pts ganador, 1 pt perdedor según reglamento FJH/CAH)
          itemL.pg += 1;
          itemL.puntos += 3;
          itemV.pp += 1;
          itemV.puntos += 1;
        } else if (gL < gV) {
          // Victoria Visitante
          itemV.pg += 1;
          itemV.puntos += 3;
          itemL.pp += 1;
          itemL.puntos += 1;
        } else {
          // Empate (2 pts cada uno en CAH / 1 pt si no hay desempate reglamentario)
          itemL.pe += 1;
          itemV.pe += 1;
          itemL.puntos += 2;
          itemV.puntos += 2;
        }
      }
    }

    // 4. Ordenar según reglamento deportivo oficial: Puntos desc, Diferencia de gol desc, Goles a favor desc
    const tablaCalculada = Array.from(tablaMap.values()).sort((a, b) => {
      if (b.puntos !== a.puntos) return b.puntos - a.puntos;
      if (b.dg !== a.dg) return b.dg - a.dg;
      return b.gf - a.gf;
    });

    return res.json(tablaCalculada);
  } catch (error) {
    console.error("Error al obtener tabla:", error);
    res.status(500).json({ error: "Error al cargar la tabla de posiciones" });
  }
});

module.exports = router;
