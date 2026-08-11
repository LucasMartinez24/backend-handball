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
      include: { _count: { select: { tablaPosiciones: true } } },
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
      include: { _count: { select: { tablaPosiciones: true } } },
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
      include: { _count: { select: { tablaPosiciones: true } } },
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
// PUT /api/torneos/:id - Actualizar torneo (estado, etc.)
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { nombre, categoria, rama, estado, fechaInicio, progreso, formato, colorClase, idaVuelta } = req.body;
  try {
    // Construir solo los campos que vienen en el body
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
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
