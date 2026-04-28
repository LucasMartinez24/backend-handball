const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");
const upload = require("../middleware/upload");
const fs = require("fs");
const path = require("path");

// --- UTILIDADES ---

const borrarArchivoFisico = (relativeUrl) => {
  if (relativeUrl) {
    const fullPath = path.join(__dirname, "..", "..", relativeUrl);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch (err) {
        console.error("Error al borrar archivo:", err);
      }
    }
  }
};

const cpUpload = upload.fields([
  { name: "fichaMedica", maxCount: 1 },
  { name: "autorizacionPadres", maxCount: 1 },
  { name: "fichaJugador", maxCount: 1 },
]);

// --- FUNCIÓN INTERNA PARA GESTIONAR EL CLUB DESTINO (ESPEJOS B, C) ---
async function obtenerIdClubDestino(clubPadreId, letraEquipo) {
  if (!letraEquipo || letraEquipo.toUpperCase() === "A") return clubPadreId;

  const letra = letraEquipo.toUpperCase();
  const clubPadre = await prisma.club.findUnique({
    where: { id: clubPadreId },
  });

  if (!clubPadre) return clubPadreId;

  const nombreBase = clubPadre.nombre.replace(/ [BC]$/, "");
  const siglasBase = clubPadre.siglas.replace(/-[BC]$/, "");

  const nombreEspejo = `${nombreBase} ${letra}`;
  const siglasEspejo = `${siglasBase}-${letra}`;

  let clubEspejo = await prisma.club.findFirst({
    where: { nombre: nombreEspejo },
  });

  if (!clubEspejo) {
    clubEspejo = await prisma.club.create({
      data: {
        nombre: nombreEspejo,
        siglas: siglasEspejo,
        logoUrl: clubPadre.logoUrl,
        username: `${clubPadre.username}_${letra.toLowerCase()}`,
        password: clubPadre.password, // Hereda acceso para el mismo delegado
        esInvitado: false,
      },
    });
  }
  return clubEspejo.id;
}

// --- RUTAS ---

// A. OBTENER JUGADORES (Agrupados por Club Raíz para el Delegado)
// src/routes/jugadores.js
// src/routes/jugadores.js

router.get("/", async (req, res) => {
  const { clubId } = req.query;
  try {
    let whereClause = {};

    if (clubId) {
      // 1. Buscamos el club que inició sesión
      const clubRaiz = await prisma.club.findUnique({ where: { id: clubId } });

      if (clubRaiz) {
        // 2. Obtenemos el nombre base (ej: "Rivadavia") quitando el " B" o " C"
        const nombreBase = clubRaiz.nombre.replace(/ [BC]$/, "");

        // 3. Filtramos para que traiga jugadores de "Rivadavia", "Rivadavia B" y "Rivadavia C"
        whereClause = {
          club: {
            nombre: {
              startsWith: nombreBase,
            },
          },
        };
      }
    }

    const jugadores = await prisma.jugador.findMany({
      where: whereClause,
      include: { club: true }, // Esto es vital para que el frontend sepa de qué club es cada uno
      orderBy: { createdAt: "desc" },
    });
    res.json(jugadores);
  } catch (error) {
    res.status(500).json({ error: "Error al listar jugadores" });
  }
});

// B. OBTENER POR ID
router.get("/:id", async (req, res) => {
  try {
    const jugador = await prisma.jugador.findUnique({
      where: { id: req.params.id },
      include: { club: { select: { nombre: true } } },
    });
    if (!jugador)
      return res.status(404).json({ error: "Jugador no encontrado" });
    res.json(jugador);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener jugador" });
  }
});

// C. CREAR JUGADOR (POST)
router.post("/", cpUpload, async (req, res) => {
  try {
    const data = req.body;

    // MUDANZA AUTOMÁTICA SEGÚN EQUIPO
    const finalClubId = await obtenerIdClubDestino(data.clubId, data.equipo);

    const insertData = {
      dni: data.dni.toString().replace(/\D/g, ""),
      nombreCompleto: data.nombreCompleto,
      fechaNacimiento: new Date(data.fechaNacimiento),
      categoria: data.categoria || "Primera",
      genero: data.genero,
      nacionalidad: data.nacionalidad || "Argentina",
      email: data.email || null,
      whatsapp: data.whatsapp || null,
      tutorPhone: data.tutorPhone || null,
      equipo: data.equipo || "A",
      manoHabil: data.manoHabil || "Derecha",
      clubId: finalClubId,
      estado: "Pendiente",
      fichaMedicaUrl: req.files["fichaMedica"]
        ? `/uploads/documentos/fichas/${req.files["fichaMedica"][0].filename}`
        : null,
      autorizacionUrl: req.files["autorizacionPadres"]
        ? `/uploads/documentos/autorizaciones/${req.files["autorizacionPadres"][0].filename}`
        : null,
      fichaJugadorUrl: req.files["fichaJugador"]
        ? `/uploads/documentos/fichas-jugadores/${req.files["fichaJugador"][0].filename}`
        : null,
    };

    if (data.categoriaEspecial)
      insertData.categoriaEspecial = data.categoriaEspecial;
    if (data.peso) insertData.peso = parseFloat(data.peso);
    if (data.altura) insertData.altura = parseInt(data.altura);

    const nuevoJugador = await prisma.jugador.create({ data: insertData });
    res.status(201).json(nuevoJugador);
  } catch (error) {
    if (req.files) {
      Object.values(req.files)
        .flat()
        .forEach((file) => {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        });
    }

    if (error.code === "P2002") {
      const dniDuplicado = req.body.dni.toString().replace(/\D/g, "");
      const existente = await prisma.jugador.findUnique({
        where: { dni: dniDuplicado },
        include: { club: { select: { nombre: true } } },
      });
      if (existente) {
        return res.status(400).json({
          error: `El DNI ${dniDuplicado} ya está registrado en la Federación bajo el club: ${existente.club.nombre}.`,
        });
      }
    }
    res.status(500).json({ error: "Error al crear: " + error.message });
  }
});

// D. EDITAR JUGADOR (PUT)
router.put("/:id", cpUpload, async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const jugadorActual = await prisma.jugador.findUnique({
      where: { id },
      include: { club: true },
    });
    if (!jugadorActual) return res.status(404).json({ error: "No encontrado" });

    // GESTIÓN DE MUDANZA DE CLUB
    const finalClubId = await obtenerIdClubDestino(
      data.clubId || jugadorActual.clubId,
      data.equipo,
    );

    let { fichaMedicaUrl, autorizacionUrl, fichaJugadorUrl } = jugadorActual;
    if (req.files) {
      if (req.files["fichaMedica"]) {
        borrarArchivoFisico(jugadorActual.fichaMedicaUrl);
        fichaMedicaUrl = `/uploads/documentos/fichas/${req.files["fichaMedica"][0].filename}`;
      }
      if (req.files["autorizacionPadres"]) {
        borrarArchivoFisico(jugadorActual.autorizacionUrl);
        autorizacionUrl = `/uploads/documentos/autorizaciones/${req.files["autorizacionPadres"][0].filename}`;
      }
      if (req.files["fichaJugador"]) {
        borrarArchivoFisico(jugadorActual.fichaJugadorUrl);
        fichaJugadorUrl = `/uploads/documentos/fichas-jugadores/${req.files["fichaJugador"][0].filename}`;
      }
    }

    const actualizado = await prisma.jugador.update({
      where: { id },
      data: {
        dni: data.dni ? data.dni.toString().replace(/\D/g, "") : undefined,
        nombreCompleto: data.nombreCompleto,
        categoria: data.categoria,
        categoriaEspecial: data.categoriaEspecial,
        genero: data.genero,
        equipo: data.equipo || "A",
        clubId: finalClubId, // AQUÍ SE REALIZA LA MUDANZA SI CAMBIÓ LA LETRA
        fechaNacimiento: data.fechaNacimiento
          ? new Date(data.fechaNacimiento)
          : undefined,
        peso: data.peso ? parseFloat(data.peso) : undefined,
        altura: data.altura ? parseInt(data.altura) : undefined,
        fichaMedicaUrl,
        autorizacionUrl,
        fichaJugadorUrl,
      },
    });
    res.json(actualizado);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar" });
  }
});

// E. ACTUALIZACIÓN RÁPIDA DE ESTADO (PATCH)
router.patch("/:id/estado", async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;
  try {
    const actualizado = await prisma.jugador.update({
      where: { id },
      data: { estado },
    });
    res.json(actualizado); // Es vital que devuelvas el objeto para el 'next' del frontend
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar" });
  }
});

// F. ELIMINAR JUGADOR
router.delete("/:id", async (req, res) => {
  try {
    const jugador = await prisma.jugador.findUnique({
      where: { id: req.params.id },
    });
    if (jugador) {
      borrarArchivoFisico(jugador.fichaMedicaUrl);
      borrarArchivoFisico(jugador.autorizacionUrl);
      borrarArchivoFisico(jugador.fichaJugadorUrl);
    }
    await prisma.jugador.delete({ where: { id: req.params.id } });
    res.json({ message: "Eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar" });
  }
});

module.exports = router;
