const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");
const upload = require("../middleware/upload");
const fs = require("fs");
const path = require("path");

// --- UTILIDADES ---

const calcularCategoria = (fechaNacimiento) => {
  const fecha = new Date(fechaNacimiento);
  const edad = 2026 - fecha.getFullYear();
  if (edad >= 18) return "Primera";
  if (edad >= 16) return "Juvenil";
  if (edad >= 14) return "Cadete";
  if (edad >= 12) return "Menores";
  return "Infantiles";
};

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

// --- RUTAS ---

// A. OBTENER JUGADORES (Con filtro por club)
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
    const dniLimpio = data.dni ? data.dni.toString().replace(/\D/g, "") : "";
    const pesoLimpio = data.peso
      ? data.peso.toString().replace(/\D/g, "")
      : null;
    const alturaLimpia = data.altura
      ? data.altura.toString().replace(/\D/g, "")
      : null;

    const nuevoJugador = await prisma.jugador.create({
      data: {
        dni: dniLimpio,
        nombreCompleto: data.nombreCompleto,
        fechaNacimiento: new Date(data.fechaNacimiento),
        genero: data.genero,
        nacionalidad: data.nacionalidad,
        email: data.email,
        whatsapp: data.whatsapp,
        tutorPhone: data.tutorPhone,
        peso: pesoLimpio ? parseFloat(pesoLimpio) : null,
        altura: alturaLimpia ? parseInt(alturaLimpia) : null,
        equipo: data.equipo,
        manoHabil: data.manoHabil,
        estado: "Pendiente",
        clubId: data.clubId,
        fichaMedicaUrl:
          req.files && req.files["fichaMedica"]
            ? `/uploads/documentos/fichas/${req.files["fichaMedica"][0].filename}`
            : null,
        autorizacionUrl:
          req.files && req.files["autorizacionPadres"]
            ? `/uploads/documentos/autorizaciones/${req.files["autorizacionPadres"][0].filename}`
            : null,
        fichaJugadorUrl:
          req.files && req.files["fichaJugador"]
            ? `/uploads/documentos/fichas-jugadores/${req.files["fichaJugador"][0].filename}`
            : null,
      },
    });
    res.status(201).json(nuevoJugador);
  } catch (error) {
    if (req.files) {
      Object.keys(req.files).forEach((key) => {
        req.files[key].forEach((file) => {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        });
      });
    }
    if (error.code === "P2002") {
      return res
        .status(400)
        .json({ error: "El DNI ya se encuentra registrado en el sistema." });
    }
    res.status(500).json({ error: "Error al crear el jugador" });
  }
});

// D. ACTUALIZACIÓN RÁPIDA DE ESTADO (Audit de Plantilla)
// Esta ruta es la que usa el componente ClubList para aprobar/rechazar
router.patch("/:id/estado", async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;
  try {
    const actualizado = await prisma.jugador.update({
      where: { id },
      data: { estado },
    });
    res.json(actualizado);
  } catch (error) {
    res.status(400).json({ error: "No se pudo actualizar el estado" });
  }
});

// E. ACTUALIZAR JUGADOR COMPLETO (Edición de perfil)
router.put("/:id", cpUpload, async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  try {
    const jugadorActual = await prisma.jugador.findUnique({ where: { id } });
    if (!jugadorActual) return res.status(404).json({ error: "No encontrado" });

    const dniLimpio = data.dni
      ? data.dni.toString().replace(/\D/g, "")
      : jugadorActual.dni;
    const pesoLimpio = data.peso
      ? data.peso.toString().replace(/\D/g, "")
      : undefined;
    const alturaLimpia = data.altura
      ? data.altura.toString().replace(/\D/g, "")
      : undefined;

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
        dni: dniLimpio,
        nombreCompleto: data.nombreCompleto,
        genero: data.genero,
        nacionalidad: data.nacionalidad,
        email: data.email,
        whatsapp: data.whatsapp,
        tutorPhone: data.tutorPhone,
        manoHabil: data.manoHabil,
        equipo: data.equipo,
        clubId: data.clubId,
        estado: data.estado !== undefined ? data.estado : jugadorActual.estado,
        fechaNacimiento: data.fechaNacimiento
          ? new Date(data.fechaNacimiento)
          : undefined,
        peso: pesoLimpio ? parseFloat(pesoLimpio) : undefined,
        altura: alturaLimpia ? parseInt(alturaLimpia) : undefined,
        fichaMedicaUrl,
        autorizacionUrl,
        fichaJugadorUrl,
      },
    });
    res.json(actualizado);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: "Error al actualizar el jugador" });
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
