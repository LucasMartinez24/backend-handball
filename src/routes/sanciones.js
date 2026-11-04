const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");

// 1. OBTENER TODAS LAS SANCIONES
router.get("/", async (req, res) => {
  try {
    const sanciones = await prisma.sancion.findMany({
      include: {
        jugador: {
          select: { id: true, nombreCompleto: true, dni: true, estado: true, categoria: true },
        },
        club: {
          select: { id: true, nombre: true, siglas: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(sanciones);
  } catch (error) {
    console.error("Error al obtener sanciones:", error);
    res.status(500).json({ error: "Error al obtener sanciones del Tribunal de Penas" });
  }
});

// 2. CREAR NUEVO FALLO / SANCIÓN DISCIPLINARIA
router.post("/", async (req, res) => {
  try {
    const {
      sancionado,
      institucion,
      categoria,
      fallo,
      cumplidas = 0,
      totales = 1,
      vigencia = "Torneo Apertura 2026",
      expediente,
      estado = "grave",
      motivo,
      jugadorId,
      clubId,
      inhabilitarJugador = true,
    } = req.body;

    let finalSancionado = sancionado;
    let finalInstitucion = institucion;
    let finalCategoria = categoria;
    let finalClubId = clubId;

    if (jugadorId) {
      const jugador = await prisma.jugador.findUnique({
        where: { id: jugadorId },
        include: { club: true },
      });

      if (jugador) {
        finalSancionado = jugador.nombreCompleto;
        finalInstitucion = jugador.club?.nombre || institucion;
        finalCategoria = jugador.categoria || categoria;
        finalClubId = jugador.clubId || clubId;

        // Si se indica inhabilitar, actualizar inmediatamente el estado del jugador a 'Rechazado' (inhabilitado)
        if (inhabilitarJugador) {
          await prisma.jugador.update({
            where: { id: jugadorId },
            data: { estado: "Rechazado" },
          });
        }
      }
    }

    const nuevaSancion = await prisma.sancion.create({
      data: {
        sancionado: (finalSancionado || "Sancionado").toUpperCase(),
        institucion: finalInstitucion || "Club Federado",
        categoria: finalCategoria || "Primera Masc.",
        fallo: fallo || "1 Fecha de Suspensión",
        cumplidas: Number(cumplidas) || 0,
        totales: Number(totales) || 1,
        vigencia: vigencia || "Torneo Apertura 2026",
        expediente: expediente || `Exp. #${Math.floor(10 + Math.random() * 90)}-T/2026`,
        estado: estado || "grave",
        motivo: motivo || null,
        jugadorId: jugadorId || null,
        clubId: finalClubId || null,
      },
      include: {
        jugador: {
          select: { id: true, nombreCompleto: true, dni: true, estado: true },
        },
        club: {
          select: { id: true, nombre: true, siglas: true },
        },
      },
    });

    res.status(201).json(nuevaSancion);
  } catch (error) {
    console.error("Error al registrar sanción:", error);
    res.status(500).json({ error: "Error al registrar fallo del Tribunal de Penas" });
  }
});

// 3. ACTUALIZAR SANCIÓN (fechas cumplidas, estado, etc.)
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { cumplidas, totales, estado, vigencia, fallo } = req.body;

    const dataToUpdate = {};
    if (cumplidas !== undefined) dataToUpdate.cumplidas = Number(cumplidas);
    if (totales !== undefined) dataToUpdate.totales = Number(totales);
    if (estado !== undefined) dataToUpdate.estado = estado;
    if (vigencia !== undefined) dataToUpdate.vigencia = vigencia;
    if (fallo !== undefined) dataToUpdate.fallo = fallo;

    const actualizada = await prisma.sancion.update({
      where: { id },
      data: dataToUpdate,
      include: {
        jugador: { select: { id: true, nombreCompleto: true, estado: true } },
        club: { select: { id: true, nombre: true, siglas: true } },
      },
    });

    res.json(actualizada);
  } catch (error) {
    console.error("Error al actualizar sanción:", error);
    res.status(500).json({ error: "Error al actualizar la sanción" });
  }
});

// 4. ELIMINAR SANCIÓN
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.sancion.delete({ where: { id } });
    res.json({ message: "Sanción eliminada con éxito" });
  } catch (error) {
    console.error("Error al eliminar sanción:", error);
    res.status(500).json({ error: "Error al eliminar la sanción" });
  }
});

module.exports = router;
