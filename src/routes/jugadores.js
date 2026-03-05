const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");
const upload = require("../middleware/upload");
const fs = require("fs");
const path = require("path");

// Función para calcular categoría según el año actual (2026)
const calcularCategoria = (fechaNacimiento) => {
  const fecha = new Date(fechaNacimiento);
  const edad = 2026 - fecha.getFullYear();

  if (edad >= 18) return "Primera";
  if (edad >= 16) return "Juvenil";
  if (edad >= 14) return "Cadete";
  if (edad >= 12) return "Menores";
  return "Infantiles";
};

// 1. Configuración de campos de archivos (Agregado fichaJugador)
const cpUpload = upload.fields([
  { name: "fichaMedica", maxCount: 1 },
  { name: "autorizacionPadres", maxCount: 1 },
  { name: "fichaJugador", maxCount: 1 },
]);

// AUXILIAR: Borrar archivos físicos
const borrarArchivoFisico = (relativeUrl) => {
  if (relativeUrl) {
    const fullPath = path.join(__dirname, "..", "..", relativeUrl);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  }
};

// --- RUTAS ---

// A. OBTENER JUGADORES (Con filtro por Club)
router.get("/", async (req, res) => {
  const { clubId } = req.query;
  try {
    const jugadores = await prisma.jugador.findMany({
      where: {
        ...(clubId && { clubId: clubId }),
      },
      include: { club: true },
      orderBy: { createdAt: "desc" },
    });

    const respuesta = jugadores.map((j) => ({
      ...j,
      categoria: calcularCategoria(j.fechaNacimiento),
    }));

    res.json(respuesta);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// B. OBTENER JUGADOR POR ID
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const jugador = await prisma.jugador.findUnique({
      where: { id: id },
      include: { club: { select: { nombre: true } } },
    });
    if (!jugador)
      return res.status(404).json({ error: "Jugador no encontrado" });
    res.json(jugador);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener jugador" });
  }
});

// C. CREAR JUGADOR
router.post("/", cpUpload, async (req, res) => {
  try {
    const data = req.body;

    const nuevoJugador = await prisma.jugador.create({
      data: {
        dni: data.dni,
        nombreCompleto: data.nombreCompleto,
        fechaNacimiento: new Date(data.fechaNacimiento),
        genero: data.genero,
        nacionalidad: data.nacionalidad,
        email: data.email,
        whatsapp: data.whatsapp,
        tutorPhone: data.tutorPhone,
        peso: data.peso ? parseFloat(data.peso) : null,
        altura: data.altura ? parseInt(data.altura) : null,
        categoria: data.categoria,
        manoHabil: data.manoHabil,
        estado: "Pendiente",
        clubId: data.clubId,
        // URLs de archivos
        fichaMedicaUrl: req.files["fichaMedica"]
          ? `/uploads/documentos/fichas/${req.files["fichaMedica"][0].filename}`
          : null,
        autorizacionUrl: req.files["autorizacionPadres"]
          ? `/uploads/documentos/autorizaciones/${req.files["autorizacionPadres"][0].filename}`
          : null,
        fichaJugadorUrl: req.files["fichaJugador"]
          ? `/uploads/documentos/fichas-jugadores/${req.files["fichaJugador"][0].filename}`
          : null,
      },
    });

    res.status(201).json(nuevoJugador);
  } catch (error) {
    // Limpieza si falla Prisma
    if (req.files) {
      Object.keys(req.files).forEach((key) => {
        req.files[key].forEach((file) => {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        });
      });
    }
    if (error.code === "P2002")
      return res.status(400).json({ error: "DNI ya registrado" });
    res.status(500).json({ error: "Error al crear el jugador" });
  }
});

// D. ACTUALIZAR JUGADOR
router.put("/:id", cpUpload, async (req, res) => {
  const { id } = req.params;
  const data = req.body;

  try {
    const jugadorActual = await prisma.jugador.findUnique({ where: { id } });
    if (!jugadorActual) return res.status(404).json({ error: "No encontrado" });

    let { fichaMedicaUrl, autorizacionUrl, fichaJugadorUrl } = jugadorActual;

    // Manejo de reemplazo de Ficha Médica
    if (req.files && req.files["fichaMedica"]) {
      borrarArchivoFisico(jugadorActual.fichaMedicaUrl);
      fichaMedicaUrl = `/uploads/documentos/fichas/${req.files["fichaMedica"][0].filename}`;
    }

    // Manejo de reemplazo de Autorización
    if (req.files && req.files["autorizacionPadres"]) {
      borrarArchivoFisico(jugadorActual.autorizacionUrl);
      autorizacionUrl = `/uploads/documentos/autorizaciones/${req.files["autorizacionPadres"][0].filename}`;
    }

    // Manejo de reemplazo de Ficha de Jugador (NUEVO)
    if (req.files && req.files["fichaJugador"]) {
      borrarArchivoFisico(jugadorActual.fichaJugadorUrl);
      fichaJugadorUrl = `/uploads/documentos/fichas-jugadores/${req.files["fichaJugador"][0].filename}`;
    }

    const actualizado = await prisma.jugador.update({
      where: { id },
      data: {
        dni: dataLimpia.dni,
        nombreCompleto: dataLimpia.nombreCompleto,
        genero: dataLimpia.genero,
        nacionalidad: dataLimpia.nacionalidad,
        email: dataLimpia.email,
        whatsapp: dataLimpia.whatsapp,
        tutorPhone: dataLimpia.tutorPhone,
        manoHabil: dataLimpia.manoHabil,
        clubId: dataLimpia.clubId,
        fechaNacimiento: dataLimpia.fechaNacimiento
          ? new Date(dataLimpia.fechaNacimiento)
          : undefined,
        peso: dataLimpia.peso ? parseFloat(dataLimpia.peso) : undefined,
        altura: dataLimpia.altura ? parseInt(dataLimpia.altura) : undefined,
        fichaMedicaUrl,
        autorizacionUrl,
        fichaJugadorUrl,
      },
    });

    res.json(actualizado);
  } catch (error) {
    // Limpiar archivos nuevos si falla la actualización
    if (req.files) {
      Object.keys(req.files).forEach((key) => {
        req.files[key].forEach((file) => {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        });
      });
    }
    res.status(400).json({ error: "Error al actualizar" });
  }
});

// E. ELIMINAR JUGADOR
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const jugador = await prisma.jugador.findUnique({ where: { id } });
    if (jugador) {
      borrarArchivoFisico(jugador.fichaMedicaUrl);
      borrarArchivoFisico(jugador.autorizacionUrl);
      borrarArchivoFisico(jugador.fichaJugadorUrl);
    }
    await prisma.jugador.delete({ where: { id } });
    res.json({ message: "Eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar" });
  }
});

module.exports = router;
