const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../../data");
const DATA_FILE = path.join(DATA_DIR, "calendario-eventos.json");

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), "utf8");
  }
}

function readEventos() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function writeEventos(list) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), "utf8");
}

// 1. OBTENER TODOS LOS EVENTOS INSTITUCIONALES DEL CALENDARIO
router.get("/", (req, res) => {
  try {
    const eventos = readEventos();
    res.json(eventos);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener eventos del calendario" });
  }
});

// 2. CREAR EVENTO INSTITUCIONAL (Admin FJH)
router.post("/", (req, res) => {
  try {
    const { titulo, fecha, hora, sede, tipo, descripcion, destacado } = req.body;
    if (!titulo || !fecha) {
      return res.status(400).json({ error: "Título y fecha son obligatorios" });
    }

    const nuevo = {
      id: `evt-${Date.now()}`,
      titulo: String(titulo).trim(),
      fecha: String(fecha).trim().substring(0, 10),
      hora: hora ? String(hora).trim() : "09:00",
      sede: sede ? String(sede).trim() : "Sede Central FJH",
      tipo: tipo || "institucional", // institucional | fichajes | arbitraje | torneo
      descripcion: descripcion ? String(descripcion).trim() : "",
      destacado: Boolean(destacado),
      createdAt: new Date().toISOString(),
    };

    const list = readEventos();
    list.unshift(nuevo);
    writeEventos(list);

    res.status(201).json(nuevo);
  } catch (error) {
    res.status(500).json({ error: "Error al crear evento del calendario" });
  }
});

// 3. ELIMINAR EVENTO INSTITUCIONAL (Admin FJH)
router.delete("/:id", (req, res) => {
  try {
    const { id } = req.params;
    const list = readEventos();
    const filtered = list.filter((e) => e.id !== id);
    writeEventos(filtered);
    res.json({ message: "Evento eliminado del calendario" });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar evento" });
  }
});

module.exports = router;
