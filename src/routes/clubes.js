const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");
const upload = require("../middleware/upload");

router.get("/", async (req, res) => {
  try {
    const clubes = await prisma.club.findMany({
      include: {
        jugadores: true,
      },
    });
    res.json(clubes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/", upload.single("logo"), async (req, res) => {
  const { nombre, siglas, username, password } = req.body;
  const logoUrl = req.file ? `/uploads/logos/${req.file.filename}` : null;

  try {
    const nuevoClub = await prisma.club.create({
      data: {
        nombre,
        siglas,
        username,
        password: await bcrypt.hash(password, 10),
        logoUrl: logoUrl,
      },
    });
    res.json(nuevoClub);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/:id", upload.single("logo"), async (req, res) => {
  const { id } = req.params;
  const { nombre, siglas, username, password } = req.body;

  try {
    const clubActual = await prisma.club.findUnique({ where: { id: id } });
    if (!clubActual)
      return res.status(404).json({ error: "Club no encontrado" });

    const logoUrl = req.file
      ? `/uploads/logos/${req.file.filename}`
      : clubActual.logoUrl;

    let hashedPassword = clubActual.password;
    if (password && password.trim() !== "") {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const actualizado = await prisma.club.update({
      where: { id: id },
      data: {
        nombre: nombre || clubActual.nombre,
        siglas: siglas || clubActual.siglas,
        username: username || clubActual.username,
        password: hashedPassword,
        logoUrl: logoUrl,
      },
    });

    res.json(actualizado);
  } catch (error) {
    console.error("Error al actualizar club:", error);
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Buscamos el club con TODAS sus dependencias para recolectar archivos
    const club = await prisma.club.findUnique({
      where: { id },
      include: {
        jugadores: true,
        tickets: {
          include: {
            messages: { include: { attachments: true } },
          },
        },
      },
    });

    if (!club) return res.status(404).json({ error: "Club no encontrado" });

    // 2. RECOLECCIÓN Y BORRADO FÍSICO DE ARCHIVOS (Igual que antes)
    const archivos = [];
    if (club.logoUrl) archivos.push(club.logoUrl);
    club.jugadores.forEach((j) => {
      if (j.fichaMedicaUrl) archivos.push(j.fichaMedicaUrl);
      if (j.autorizacionUrl) archivos.push(j.autorizacionUrl);
      if (j.fichaJugadorUrl) archivos.push(j.fichaJugadorUrl);
    });
    club.tickets.forEach((t) => {
      t.messages.forEach((m) => {
        m.attachments.forEach((a) => archivos.push(a.url));
      });
    });

    archivos.forEach((ruta) => {
      if (ruta) {
        const pathAbsoluto = path.join(
          __dirname,
          "../../",
          ruta.startsWith("/") ? ruta.substring(1) : ruta,
        );
        if (fs.existsSync(pathAbsoluto)) fs.unlinkSync(pathAbsoluto);
      }
    });

    // 3. TRANSACCIÓN ATÓMICA: Borrado en orden jerárquico inverso
    await prisma.$transaction(async (tx) => {
      // A. Limpiar Soporte (Nivel más profundo)
      const ticketIds = club.tickets.map((t) => t.id);

      // Borrar adjuntos de mensajes de soporte
      await tx.attachment.deleteMany({
        where: { message: { ticketId: { in: ticketIds } } },
      });

      // Borrar mensajes de soporte
      await tx.message.deleteMany({
        where: { ticketId: { in: ticketIds } },
      });

      // Borrar los tickets
      await tx.ticket.deleteMany({ where: { clubId: id } });

      // B. Limpiar Torneos y Competencias
      // Borrar posiciones en tablas
      await tx.posicion.deleteMany({ where: { clubId: id } });

      // Borrar partidos donde el club participó (Local o Visitante)
      await tx.partido.deleteMany({
        where: {
          OR: [{ localId: id }, { visitanteId: id }],
        },
      });

      // C. Limpiar Jugadores
      await tx.jugador.deleteMany({ where: { clubId: id } });

      // D. FINALMENTE: Borrar el Club
      await tx.club.delete({ where: { id } });
    });

    res.json({
      message:
        "Club y todas sus dependencias (jugadores, partidos, tickets) eliminados correctamente.",
    });
  } catch (error) {
    console.error("ERROR DETALLADO:", error);
    res.status(500).json({
      error: "No se pudo eliminar el club.",
      detalle:
        "Existen dependencias activas en el sistema de torneos o soporte.",
    });
  }
});

module.exports = router;
