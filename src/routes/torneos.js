const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");
router.get("/club/:clubId", async (req, res) => {
  const { clubId } = req.params;
  try {
    const torneos = await prisma.torneo.findMany({
      where: {
        tablaPosiciones: {
          some: { clubId: clubId },
        },
      },
      include: {
        _count: { select: { tablaPosiciones: true } },
        tablaPosiciones: { select: { clubId: true } },
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
// GET /api/torneos - Listado general con conteo
router.get("/", async (req, res) => {
  try {
    const torneos = await prisma.torneo.findMany({
      include: {
        _count: { select: { tablaPosiciones: true } },
        tablaPosiciones: { select: { clubId: true } },
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

// GET /api/torneos/:id - Detalle de UN torneo
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const torneo = await prisma.torneo.findUnique({
      where: { id },
      include: {
        _count: { select: { tablaPosiciones: true } },
        tablaPosiciones: { select: { clubId: true } },
      },
    });
    if (!torneo) return res.status(404).json({ error: "Torneo no encontrado" });
    res.json({ ...torneo, equiposCount: torneo._count.tablaPosiciones });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// DELETE /api/torneos/:id
// DELETE /api/torneos/:id
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    // Iniciamos una transacción para borrar en cascada manualmente
    await prisma.$transaction(async (tx) => {
      // 1. Borrar Eventos de los partidos que pertenecen a este torneo
      await tx.eventoPartido.deleteMany({
        where: {
          partido: {
            torneoId: id,
          },
        },
      });

      // 2. Borrar todos los Partidos del torneo
      await tx.partido.deleteMany({
        where: {
          torneoId: id,
        },
      });

      // 3. Borrar la Tabla de Posiciones del torneo
      await tx.posicion.deleteMany({
        where: {
          torneoId: id,
        },
      });

      // 4. Finalmente, borrar el registro del Torneo
      await tx.torneo.delete({
        where: { id: id },
      });
    });

    res.json({
      message:
        "Torneo y toda su información asociada eliminados correctamente.",
    });
  } catch (error) {
    console.error("Error al eliminar torneo:", error);
    res.status(500).json({
      error: "Error interno al intentar eliminar el torneo y sus dependencias.",
      details: error.message,
    });
  }
});
// PUT /api/torneos/:id - Actualizar torneo (estado, formato, configuracion)
router.put("/:id", async (req, res) => {
  const { id } = req.params;
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
    temporada,
    sedes,
    faseInicial,
    tercerPuesto,
    modalidadLlave,
    cantidadGrupos,
    criterioDesempate,
  } = req.body;
  try {
    const dataToUpdate = {};
    if (nombre !== undefined) dataToUpdate.nombre = nombre;
    if (categoria !== undefined) dataToUpdate.categoria = categoria;
    if (rama !== undefined) dataToUpdate.rama = rama;
    if (estado !== undefined) dataToUpdate.estado = estado;
    if (fechaInicio !== undefined) dataToUpdate.fechaInicio = new Date(fechaInicio);
    if (progreso !== undefined) dataToUpdate.progreso = Number(progreso);
    if (formato !== undefined) dataToUpdate.formato = formato;
    if (colorClase !== undefined) dataToUpdate.colorClase = colorClase;
    if (idaVuelta !== undefined) dataToUpdate.idaVuelta = Boolean(idaVuelta);
    if (temporada !== undefined) dataToUpdate.temporada = temporada;
    if (sedes !== undefined) {
      dataToUpdate.sedes = Array.isArray(sedes) ? JSON.stringify(sedes) : (sedes ? String(sedes) : null);
    }
    if (faseInicial !== undefined) dataToUpdate.faseInicial = faseInicial;
    if (tercerPuesto !== undefined) dataToUpdate.tercerPuesto = Boolean(tercerPuesto);
    if (modalidadLlave !== undefined) dataToUpdate.modalidadLlave = modalidadLlave;
    if (cantidadGrupos !== undefined) dataToUpdate.cantidadGrupos = Number(cantidadGrupos);
    if (criterioDesempate !== undefined) dataToUpdate.criterioDesempate = criterioDesempate;

    const torneoActualizado = await prisma.torneo.update({
      where: { id },
      data: dataToUpdate,
    });
    res.json(torneoActualizado);
  } catch (error) {
    console.error("Error al actualizar torneo:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/torneos - Crear torneo
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
    temporada,
    sedes,
    faseInicial,
    tercerPuesto,
    modalidadLlave,
    cantidadGrupos,
    criterioDesempate,
  } = req.body;
  try {
    const nuevoTorneo = await prisma.torneo.create({
      data: {
        nombre,
        categoria,
        rama,
        estado: estado || "Upcoming",
        fechaInicio: new Date(fechaInicio),
        progreso: Number(progreso) || 0,
        formato: formato || "liga",
        colorClase: colorClase || "from-[#0b3c5d] via-court-card to-surface-container",
        idaVuelta: Boolean(idaVuelta),
        temporada: temporada || "2026",
        sedes: Array.isArray(sedes) ? JSON.stringify(sedes) : (sedes ? String(sedes) : null),
        faseInicial: faseInicial || "semifinales",
        tercerPuesto: tercerPuesto !== undefined ? Boolean(tercerPuesto) : true,
        modalidadLlave: modalidadLlave || "ida_vuelta",
        cantidadGrupos: Number(cantidadGrupos) || 2,
        criterioDesempate: criterioDesempate || "dif_gol",
      },
    });
    res.json(nuevoTorneo);
  } catch (error) {
    console.error("Error al crear torneo:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/torneos/:id/estructura - Detalle y organizacion de formato
router.get("/:id/estructura", async (req, res) => {
  const { id } = req.params;
  try {
    const torneo = await prisma.torneo.findUnique({
      where: { id },
      include: {
        partidos: {
          include: {
            local: { select: { id: true, nombre: true, siglas: true, logoUrl: true } },
            visitante: { select: { id: true, nombre: true, siglas: true, logoUrl: true } },
          },
          orderBy: [{ jornada: "asc" }, { fecha: "asc" }],
        },
        tablaPosiciones: {
          include: {
            club: { select: { id: true, nombre: true, siglas: true, logoUrl: true } },
          },
          orderBy: [{ puntos: "desc" }, { dg: "desc" }, { gf: "desc" }],
        },
      },
    });

    if (!torneo) return res.status(404).json({ error: "Torneo no encontrado" });

    let sedesArray = [];
    if (torneo.sedes) {
      try {
        sedesArray = JSON.parse(torneo.sedes);
      } catch {
        sedesArray = torneo.sedes.split(",").map((s) => s.trim());
      }
    }

    const partidosPorFase = {};
    for (const p of torneo.partidos) {
      const faseKey = p.fase || (p.grupo ? `Zona ${p.grupo}` : `Jornada ${p.jornada}`);
      if (!partidosPorFase[faseKey]) partidosPorFase[faseKey] = [];
      partidosPorFase[faseKey].push(p);
    }

    const tablasPorGrupo = {};
    for (const pos of torneo.tablaPosiciones) {
      const gKey = pos.grupo || "General";
      if (!tablasPorGrupo[gKey]) tablasPorGrupo[gKey] = [];
      tablasPorGrupo[gKey].push(pos);
    }

    res.json({
      ...torneo,
      sedesList: sedesArray,
      partidosPorFase,
      tablasPorGrupo,
    });
  } catch (error) {
    console.error("Error al obtener estructura del torneo:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
