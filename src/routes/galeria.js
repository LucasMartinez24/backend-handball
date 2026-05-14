const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");
const upload = require("../middleware/upload");
const fs = require("fs");
const path = require("path");
router.get("/", async (req, res) => {
  try {
    // Intentamos traer las fotos de forma simple primero para descartar errores
    const fotos = await prisma.galeria.findMany({
      orderBy: { createdAt: "desc" },
      // Opcional: limitar a las últimas 50 para que no sea pesado
      take: 50,
    });

    // Enviamos el array directamente para que tu código de Angular original funcione
    res.json(fotos);
  } catch (error) {
    console.error("Error en GET Galería:", error);
    res.status(500).json({ error: "No se pudieron obtener las imágenes" });
  }
});
router.post("/", upload.array("fotos", 10), async (req, res) => {
  // Guardamos la referencia de los archivos subidos por Multer
  const files = req.files;

  try {
    const { titulo, categoria } = req.body;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No se seleccionaron imágenes" });
    }

    // Preparamos los datos para Prisma
    const registros = files.map((file) => ({
      url: `/uploads/galeria/${file.filename}`,
      titulo: titulo || "Foto de Jornada",
      categoria: categoria || "General",
    }));

    // Intentamos guardar en la base de datos
    await prisma.galeria.createMany({
      data: registros,
    });

    // Si llegamos aquí, todo salió bien
    res.json({
      message: "Imágenes publicadas con éxito",
      cantidad: files.length,
    });
  } catch (error) {
    // --- BLOQUE DE SEGURIDAD: SI HAY ERROR EN DB, BORRAMOS ARCHIVOS ---
    console.error("ERROR EN BASE DE DATOS, INICIANDO LIMPIEZA...");

    if (files && files.length > 0) {
      files.forEach((file) => {
        // Construimos la ruta absoluta al archivo que Multer acaba de crear
        const filePath = path.join(file.destination, file.filename);

        // Borramos el archivo físicamente del VPS
        fs.unlink(filePath, (err) => {
          if (err)
            console.error(
              `No se pudo borrar el archivo basura: ${filePath}`,
              err,
            );
          else
            console.log(`Archivo basura eliminado con éxito: ${file.filename}`);
        });
      });
    }

    // Respondemos al frontend con el error
    res.status(500).json({
      error:
        "Error al registrar en la base de datos. Los archivos no fueron cargados.",
    });
  }
});
/**
 * ELIMINAR FOTO (Físico y Base de Datos)
 */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Buscamos la foto para obtener la URL del archivo
    const foto = await prisma.galeria.findUnique({ where: { id } });
    if (!foto) return res.status(404).json({ error: "Foto no encontrada" });

    // 2. Eliminamos el registro de la base de datos
    await prisma.galeria.delete({ where: { id } });

    // 3. Eliminamos el archivo físico del servidor
    // La url guardada es "/uploads/galeria/nombre.jpg"
    // __dirname está en src/routes, subimos dos niveles para llegar a la raíz
    const filePath = path.join(__dirname, "..", "..", foto.url);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Archivo eliminado: ${filePath}`);
    }

    res.json({ message: "Foto eliminada correctamente" });
  } catch (error) {
    console.error("Error al eliminar foto:", error);
    res.status(500).json({ error: "No se pudo eliminar la foto" });
  }
});

module.exports = router;
