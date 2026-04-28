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
        jugadores: true, // Esto permitirá que el contador de jugadores funcione
      },
      orderBy: { nombre: "asc" },
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
    // P2002 es el código de Prisma para violación de restricción única
    if (error.code === "P2002") {
      return res.status(400).json({
        message:
          "Las siglas o el nombre de usuario ya están registrados por otra institución.",
      });
    }
    res.status(500).json({ message: "Error interno del servidor" });
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
// backend/routes/clubes.js

// backend/src/routes/clubes.js (o jugadores.js según tu estructura)
router.get("/:id/jugadores", async (req, res) => {
  try {
    const jugadores = await prisma.jugador.findMany({
      where: {
        clubId: req.params.id,
        estado: "Aprobado", // O quita esto si quieres ver a todos
      },
      // ESTO ES LO QUE FALTA:
      select: {
        id: true,
        nombreCompleto: true,
        dni: true,
        genero: true, // <--- INDISPENSABLE
        categoria: true, // <--- INDISPENSABLE
        categoriaEspecial: true, // <--- INDISPENSABLE
      },
    });
    res.json(jugadores);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// backend/routes/clubes.js

router.get("/:id/agenda-completa", async (req, res) => {
  const { id } = req.params;

  try {
    const partidos = await prisma.partido.findMany({
      where: {
        OR: [{ localId: id }, { visitanteId: id }],
      },
      include: {
        local: { select: { nombre: true, logoUrl: true, id: true } },
        visitante: { select: { nombre: true, logoUrl: true, id: true } },
        torneo: { select: { nombre: true, categoria: true, rama: true } },
      },
      orderBy: {
        fecha: "asc",
      },
    });

    res.json(partidos);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener la agenda del club" });
  }
});
// NUEVA RUTA: CREAR CLUB INVITADO RÁPIDO
router.post("/invitado-rapido", async (req, res) => {
  const { nombre, siglas } = req.body;
  try {
    const nuevoInvitado = await prisma.club.create({
      data: {
        nombre: nombre.toUpperCase(),
        siglas: siglas.toUpperCase(),
        esInvitado: true,
        // No enviamos username ni password, quedan como null
      },
    });
    res.json(nuevoInvitado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.get("/:id/agenda-completa", async (req, res) => {
  const { id } = req.params;

  try {
    const partidos = await prisma.partido.findMany({
      where: {
        OR: [{ localId: id }, { visitanteId: id }],
      },
      select: {
        torneoId: true, // Solo necesitamos el ID del torneo para contar
        estado: true,
      },
    });

    res.json(partidos);
  } catch (error) {
    console.error("Error al obtener agenda:", error);
    res.status(500).json({ error: "Error al obtener la agenda del club" });
  }
});
module.exports = router;
