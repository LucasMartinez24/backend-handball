const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");
const bcrypt = require("bcrypt");

router.get("/", async (req, res) => {
  try {
    const clubes = await prisma.club.findMany({
      include: {
        jugadores: true, // Esto trae automáticamente la lista de jugadores de cada club
      },
    });
    res.json(clubes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const upload = require("../middleware/upload");

// 'logo' debe coincidir con el nombre del campo en el FormData de Angular
router.post("/", upload.single("logo"), async (req, res) => {
  const { nombre, siglas, username, password } = req.body;

  // Si se subió un archivo, guardamos la ruta relativa
  const logoUrl = req.file ? `/uploads/logos/${req.file.filename}` : null;

  try {
    const nuevoClub = await prisma.club.create({
      data: {
        nombre,
        siglas,
        username,
        password: await bcrypt.hash(password, 10),
        logoUrl: logoUrl, // Aquí se guarda el string en la DB
      },
    });
    res.json(nuevoClub);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Actualizar un club existente
router.put("/:id", upload.single("logo"), async (req, res) => {
  const { id } = req.params;
  const { nombre, siglas, username, password } = req.body;

  try {
    // 1. Buscamos el club actual para tener los datos previos (especialmente el password y logo)
    const clubActual = await prisma.club.findUnique({ where: { id: id } });
    if (!clubActual)
      return res.status(404).json({ error: "Club no encontrado" });

    // 2. Gestionar el logo: si viene un archivo nuevo lo usamos, sino mantenemos el anterior
    const logoUrl = req.file
      ? `/uploads/logos/${req.file.filename}`
      : clubActual.logoUrl;

    // 3. Gestionar el password: solo hasheamos si el usuario envió uno nuevo
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
const fs = require("fs");
const path = require("path");

router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Buscamos el club y sus jugadores para obtener las rutas guardadas
    const clubConJugadores = await prisma.club.findUnique({
      where: { id: id },
      include: { jugadores: true },
    });

    if (!clubConJugadores) {
      return res.status(404).json({ error: "Club no encontrado" });
    }

    const archivosABorrar = [];

    // Logo del club (ej: /uploads/logos/archivo.png)
    if (clubConJugadores.logoUrl)
      archivosABorrar.push(clubConJugadores.logoUrl);

    // Archivos de jugadores (ej: /uploads/fichas/archivo.pdf)
    clubConJugadores.jugadores.forEach((jugador) => {
      if (jugador.fichaMedicaUrl) archivosABorrar.push(jugador.fichaMedicaUrl);
      if (jugador.autorizacionUrl)
        archivosABorrar.push(jugador.autorizacionUrl);
    });

    // 2. Borramos los archivos físicos
    archivosABorrar.forEach((rutaRelativa) => {
      // Como tus rutas en DB ya empiezan con /uploads,
      // unimos la raíz del proyecto con esa ruta relativa.
      // path.join(__dirname, "../../") nos lleva a "E:\Federacion de Handball\backend-handball"
      const rutaLimpia = rutaRelativa.startsWith("/")
        ? rutaRelativa.substring(1)
        : rutaRelativa;
      const rutaAbsoluta = path.join(__dirname, "../../", rutaLimpia);

      if (fs.existsSync(rutaAbsoluta)) {
        fs.unlink(rutaAbsoluta, (err) => {
          if (err)
            console.error(`Error al borrar archivo: ${rutaAbsoluta}`, err);
          else console.log(`Archivo eliminado del disco: ${rutaAbsoluta}`);
        });
      }
    });

    // 3. Eliminación en Cascada en la Base de Datos
    await prisma.$transaction([
      prisma.jugador.deleteMany({ where: { clubId: id } }),
      prisma.club.delete({ where: { id: id } }),
    ]);

    res.json({
      message: "Club, jugadores y archivos eliminados exitosamente.",
    });
  } catch (error) {
    console.error("Error crítico en eliminación:", error);
    res
      .status(500)
      .json({ error: "No se pudo eliminar el club y sus dependencias." });
  }
});
module.exports = router;
