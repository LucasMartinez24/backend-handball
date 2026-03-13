const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");
const upload = require("../middleware/upload");
const fs = require("fs");
const path = require("path");

const calcularCategoria = (fechaNacimiento) => {
  const fecha = new Date(fechaNacimiento);
  const edad = 2026 - fecha.getFullYear();
  if (edad >= 18) return "Primera";
  if (edad >= 16) return "Juvenil";
  if (edad >= 14) return "Cadete";
  if (edad >= 12) return "Menores";
  return "Infantiles";
};

const cpUpload = upload.fields([
  { name: "fichaMedica", maxCount: 1 },
  { name: "autorizacionPadres", maxCount: 1 },
  { name: "fichaJugador", maxCount: 1 },
]);

const borrarArchivoFisico = (relativeUrl) => {
  if (relativeUrl) {
    const fullPath = path.join(__dirname, "..", "..", relativeUrl);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  }
};

// A. OBTENER JUGADORES
router.get("/", async (req, res) => {
  const { clubId } = req.query;
  try {
    const jugadores = await prisma.jugador.findMany({
      where: clubId ? { clubId } : {},
      include: { club: true },
      orderBy: { createdAt: "desc" },
    });
    const respuesta = jugadores.map((j) => ({
      ...j,
      categoria: calcularCategoria(j.fechaNacimiento),
    }));
    res.json(respuesta);
  } catch (error) {
    res.status(500).json({ error: "Error interno del servidor" });
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
        equipo: data.equipo, // <--- GUARDAR EQUIPO
        manoHabil: data.manoHabil,
        estado: "Pendiente",
        clubId: data.clubId,
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
    // ... (limpieza de archivos)
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
    // ... (lógica de archivos igual)

    const actualizado = await prisma.jugador.update({
      where: { id },
      data: {
        dni: data.dni,
        nombreCompleto: data.nombreCompleto,
        genero: data.genero,
        nacionalidad: data.nacionalidad,
        email: data.email,
        whatsapp: data.whatsapp,
        tutorPhone: data.tutorPhone,
        manoHabil: data.manoHabil,
        equipo: data.equipo, // <--- ACTUALIZAR EQUIPO
        clubId: data.clubId,
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

// E. ELIMINAR JUGADOR
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
