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
    const clubConJugadores = await prisma.club.findUnique({
      where: { id: id },
      include: { jugadores: true },
    });

    if (!clubConJugadores) {
      return res.status(404).json({ error: "Club no encontrado" });
    }

    const archivosABorrar = [];
    if (clubConJugadores.logoUrl)
      archivosABorrar.push(clubConJugadores.logoUrl);

    clubConJugadores.jugadores.forEach((jugador) => {
      if (jugador.fichaMedicaUrl) archivosABorrar.push(jugador.fichaMedicaUrl);
      if (jugador.autorizacionUrl)
        archivosABorrar.push(jugador.autorizacionUrl);
    });

    archivosABorrar.forEach((rutaRelativa) => {
      const rutaLimpia = rutaRelativa.startsWith("/")
        ? rutaRelativa.substring(1)
        : rutaRelativa;
      const rutaAbsoluta = path.join(__dirname, "../../", rutaLimpia);

      if (fs.existsSync(rutaAbsoluta)) {
        fs.unlink(rutaAbsoluta, (err) => {
          if (err)
            console.error(`Error al borrar archivo: ${rutaAbsoluta}`, err);
        });
      }
    });

    // --- SOLUCIÓN AL ERROR P2003 ---
    await prisma.$transaction([
      // 1. Borrar jugadores asociados
      prisma.jugador.deleteMany({ where: { clubId: id } }),

      // 2. Borrar partidos donde el club sea local o visitante (Evita el error de Foreign Key)
      prisma.partido.deleteMany({
        where: {
          OR: [{ localId: id }, { visitanteId: id }],
        },
      }),

      // 3. Finalmente borrar el club
      prisma.club.delete({ where: { id: id } }),
    ]);

    res.json({
      message: "Club, jugadores, partidos y archivos eliminados exitosamente.",
    });
  } catch (error) {
    console.error("Error crítico en eliminación:", error);
    res
      .status(500)
      .json({
        error: "No se pudo eliminar el club debido a dependencias activas.",
      });
  }
});

module.exports = router;
