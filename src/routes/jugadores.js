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

// Configuración de campos de archivos
const cpUpload = upload.fields([
  { name: "fichaMedica", maxCount: 1 },
  { name: "autorizacionPadres", maxCount: 1 },
]);

// 1. OBTENER JUGADORES (Con filtro por Club)
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
// Obtener un jugador específico por ID
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const jugador = await prisma.jugador.findUnique({
      where: { id: id },
      // Opcional: incluye el nombre del club si lo necesitas
      include: {
        club: {
          select: { nombre: true },
        },
      },
    });

    if (!jugador) {
      return res.status(404).json({ error: "Jugador no encontrado" });
    }

    res.json(jugador);
  } catch (error) {
    console.error("Error al obtener jugador:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});
// 2. CREAR JUGADOR (Con limpieza automática si falla)
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
        fichaMedicaUrl: req.files["fichaMedica"]
          ? `/uploads/documentos/fichas/${req.files["fichaMedica"][0].filename}`
          : null,
        autorizacionUrl: req.files["autorizacionPadres"]
          ? `/uploads/documentos/autorizaciones/${req.files["autorizacionPadres"][0].filename}`
          : null,
      },
    });

    res.status(201).json(nuevoJugador);
  } catch (error) {
    // ELIMINACIÓN AUTOMÁTICA DE ARCHIVOS SI EL REGISTRO FALLA
    if (req.files) {
      Object.keys(req.files).forEach((fieldName) => {
        req.files[fieldName].forEach((file) => {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        });
      });
    }

    if (error.code === "P2002") {
      return res
        .status(400)
        .json({ error: `El DNI ${req.body.dni} ya está registrado.` });
    }

    console.error("Error en POST:", error);
    res.status(500).json({ error: "Error al crear el jugador" });
  }
});

// 3. ACTUALIZAR JUGADOR (Maneja nuevos archivos y borra los viejos)
router.put("/:id", cpUpload, async (req, res) => {
  const { id } = req.params;
  const { apellidos, nombres, ...dataParaLimpiar } = req.body;

  try {
    const jugadorActual = await prisma.jugador.findUnique({ where: { id } });
    if (!jugadorActual)
      return res.status(404).json({ error: "Jugador no encontrado" });

    let fichaMedicaUrl = jugadorActual.fichaMedicaUrl;
    let autorizacionUrl = jugadorActual.autorizacionUrl;

    // Lógica de reemplazo de archivos (ya la tenés)
    if (req.files && req.files["fichaMedica"]) {
      if (fichaMedicaUrl) {
        const oldPath = path.join(__dirname, "..", "..", fichaMedicaUrl);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      fichaMedicaUrl = `/uploads/documentos/fichas/${req.files["fichaMedica"][0].filename}`;
    }

    if (req.files && req.files["autorizacionPadres"]) {
      if (autorizacionUrl) {
        const oldPath = path.join(__dirname, "..", "..", autorizacionUrl);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      autorizacionUrl = `/uploads/documentos/autorizaciones/${req.files["autorizacionPadres"][0].filename}`;
    }

    // 2. Realizamos el update solo con campos válidos
    const actualizado = await prisma.jugador.update({
      where: { id: id },
      data: {
        dni: dataParaLimpiar.dni ?? jugadorActual.dni,
        nombreCompleto:
          dataParaLimpiar.nombreCompleto ?? jugadorActual.nombreCompleto,
        fechaNacimiento: dataParaLimpiar.fechaNacimiento
          ? new Date(dataParaLimpiar.fechaNacimiento)
          : jugadorActual.fechaNacimiento,
        genero: dataParaLimpiar.genero ?? jugadorActual.genero,
        nacionalidad:
          dataParaLimpiar.nacionalidad ?? jugadorActual.nacionalidad,
        email: dataParaLimpiar.email ?? jugadorActual.email,
        whatsapp: dataParaLimpiar.whatsapp ?? jugadorActual.whatsapp,
        tutorPhone: dataParaLimpiar.tutorPhone ?? jugadorActual.tutorPhone,
        peso: dataParaLimpiar.peso
          ? parseFloat(dataParaLimpiar.peso)
          : jugadorActual.peso,
        altura: dataParaLimpiar.altura
          ? parseInt(dataParaLimpiar.altura)
          : jugadorActual.altura,
        manoHabil: dataParaLimpiar.manoHabil ?? jugadorActual.manoHabil,
        tipoFicha: dataParaLimpiar.tipoFicha ?? jugadorActual.tipoFicha,
        categoria: dataParaLimpiar.categoria ?? jugadorActual.categoria,
        clubId: dataParaLimpiar.clubId ?? jugadorActual.clubId,
        estado: dataParaLimpiar.estado ?? jugadorActual.estado,
        fichaMedicaUrl,
        autorizacionUrl,
      },
    });

    res.json(actualizado);
  } catch (error) {
    // Si falla, limpiar archivos nuevos subidos para no dejar basura
    if (req.files) {
      Object.keys(req.files).forEach((fieldName) => {
        req.files[fieldName].forEach((file) => {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        });
      });
    }
    console.error("Error al actualizar:", error);
    res.status(400).json({ error: "Error al actualizar" });
  }
});

// 4. ELIMINAR JUGADOR (Borra archivos del disco también)
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const jugador = await prisma.jugador.findUnique({ where: { id } });

    if (jugador) {
      // Borrar archivos físicos
      [jugador.fichaMedicaUrl, jugador.autorizacionUrl].forEach((url) => {
        if (url) {
          const fullPath = path.join(__dirname, "..", "..", url);
          if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        }
      });
    }

    await prisma.jugador.delete({ where: { id: id } });
    res.json({ message: "Jugador y sus archivos eliminados correctamente" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo eliminar el jugador" });
  }
});

module.exports = router;
