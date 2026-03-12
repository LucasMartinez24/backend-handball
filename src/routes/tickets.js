const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");
const upload = require("../middleware/upload");
const fs = require("fs");
const path = require("path");

// Configuración de Multer para múltiples adjuntos (máximo 5 por mensaje)
const ticketUpload = upload.array("attachments", 5);

// AUXILIAR: Borrar archivos si algo falla
const limpiarArchivos = (files) => {
  if (files) {
    files.forEach((file) => {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    });
  }
};

// 1. OBTENER TICKETS (Admin ve todos, Club ve los suyos)
router.get("/", async (req, res) => {
  const { clubId } = req.query;
  try {
    const tickets = await prisma.ticket.findMany({
      where: clubId ? { clubId: clubId } : {},
      include: {
        club: { select: { nombre: true, logoUrl: true } },
        _count: { select: { messages: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener tickets" });
  }
});

// 2. CREAR TICKET (Iniciado por el Club)
router.post("/", ticketUpload, async (req, res) => {
  const { asunto, categoria, descripcion, clubId } = req.body;

  try {
    const ticket = await prisma.ticket.create({
      data: {
        asunto: asunto,
        categoria: categoria || "General", // Garantizamos que no sea NULL
        clubId: clubId,
        messages: {
          create: {
            text: descripcion,
            senderRole: "CLUB",
            senderName: "Secretaría del Club", // Ahora Prisma lo reconocerá
            attachments: {
              create: req.files
                ? req.files.map((f) => ({
                    name: f.originalname,
                    url: `/uploads/tickets/${f.filename}`,
                  }))
                : [],
            },
          },
        },
      },
      include: {
        club: true,
        messages: { include: { attachments: true } },
      },
    });
    res.status(201).json(ticket);
  } catch (error) {
    limpiarArchivos(req.files);
    console.error("DETALLE DEL ERROR:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// 3. OBTENER MENSAJES DE UN TICKET (Chat)
router.get("/:id/messages", async (req, res) => {
  try {
    const messages = await prisma.message.findMany({
      where: { ticketId: req.params.id },
      include: { attachments: true },
      orderBy: { createdAt: "asc" },
    });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: "Error al cargar la conversación" });
  }
});

// 4. ENVIAR RESPUESTA (Admin o Club)
router.post("/:id/reply", ticketUpload, async (req, res) => {
  const { id } = req.params;
  const { message, senderRole, senderName, isInternal } = req.body;

  try {
    const nuevoMensaje = await prisma.message.create({
      data: {
        text: message,
        senderRole: senderRole || "ADMIN",
        senderName: senderName || "Admin Federación",
        isInternal: isInternal === "true",
        ticketId: id,
        attachments: {
          create: req.files
            ? req.files.map((f) => ({
                name: f.originalname,
                url: `/uploads/tickets/${f.filename}`,
              }))
            : [],
        },
      },
      include: { attachments: true },
    });

    // Actualizar fecha de actualización del ticket si no es nota interna
    if (isInternal !== "true") {
      await prisma.ticket.update({
        where: { id },
        data: { createdAt: new Date() }, // O un campo updatedAt si lo tuvieras
      });
    }

    res.status(201).json(nuevoMensaje);
  } catch (error) {
    limpiarArchivos(req.files);
    res.status(500).json({ error: "Error al enviar mensaje" });
  }
});

// 5. ACTUALIZAR ESTADO (Solo Admin)
router.patch("/:id/status", async (req, res) => {
  const { status } = req.body;
  try {
    const actualizado = await prisma.ticket.update({
      where: { id: req.params.id },
      data: { status },
    });
    res.json(actualizado);
  } catch (error) {
    res.status(500).json({ error: "No se pudo actualizar el estado" });
  }
});

module.exports = router;
