const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const upload = require("../middleware/upload");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DATA_FILE = path.join(DATA_DIR, "boletines.json");

const INITIAL_BOLETINES = [];

function leerBoletines() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(INITIAL_BOLETINES, null, 2), "utf8");
      return INITIAL_BOLETINES;
    }
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : INITIAL_BOLETINES;
  } catch (err) {
    console.error("Error leyendo boletines.json:", err);
    return INITIAL_BOLETINES;
  }
}

function guardarBoletines(lista) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(lista, null, 2), "utf8");
  } catch (err) {
    console.error("Error guardando boletines.json:", err);
  }
}

// 1. OBTENER TODOS LOS BOLETINES / CIRCULARES
router.get("/", (req, res) => {
  const lista = leerBoletines();
  res.json(lista);
});

// 2. CREAR NUEVA RESOLUCIÓN / CIRCULAR OFICIAL
router.post("/", upload.single("archivoPdf"), (req, res) => {
  try {
    const lista = leerBoletines();
    const body = req.body || {};

    let resuelveArr = [];
    if (typeof body.resuelve === "string") {
      try {
        resuelveArr = JSON.parse(body.resuelve);
      } catch {
        resuelveArr = body.resuelve
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
      }
    } else if (Array.isArray(body.resuelve)) {
      resuelveArr = body.resuelve;
    }

    let arancelesArr = [];
    if (typeof body.aranceles === "string") {
      try {
        arancelesArr = JSON.parse(body.aranceles);
      } catch {
        arancelesArr = [];
      }
    } else if (Array.isArray(body.aranceles)) {
      arancelesArr = body.aranceles;
    }

    const ahora = new Date();
    const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const fechaFormateada =
      body.fecha ||
      `${String(ahora.getDate()).padStart(2, "0")} ${meses[ahora.getMonth()]} ${ahora.getFullYear()} • ${String(
        ahora.getHours()
      ).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")} hs`;

    const adjuntos = [];
    if (req.file) {
      const sizeKb = Math.max(1, Math.round(req.file.size / 1024));
      const sizeStr = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
      adjuntos.push({
        nombre: req.file.originalname || req.file.filename,
        tamano: sizeStr,
        subtitulo: "Documento Homologado",
        url: `/uploads/${req.file.filename}`,
      });
    } else if (body.nombrePdf) {
      adjuntos.push({
        nombre: body.nombrePdf,
        tamano: body.tamanoPdf || "920 KB",
        subtitulo: "Anexo Oficial FJH",
        url: body.urlPdf || "/docs/Formulario-Fichaje-FJH.pdf",
      });
    }

    const cat = body.categoria || "reglamento";
    const defaultOrgano =
      cat === "tribunal"
        ? "Consejo Directivo"
        : cat === "tesoreria"
        ? "Secretaría Administrativa"
        : "Comisión Técnica Federativa";
    const defaultSuborgano =
      cat === "tribunal"
        ? "Tribunal de Penas & Disciplina Deportiva"
        : cat === "tesoreria"
        ? "Secretaría de Hacienda & Tesorería Institucional"
        : "Comisión Técnica, Reglamento & Fixtures";

    const nuevo = {
      id: `bol-${Date.now()}`,
      numero: (body.numero || `RESOLUCIÓN N° ${String(lista.length + 43).padStart(3, "0")}/2026`).toUpperCase(),
      expediente: body.expediente || `EXP-${Math.floor(1000 + Math.random() * 9000)}`,
      titulo: (body.titulo || "COMUNICACIÓN OFICIAL FEDERATIVA").toUpperCase(),
      categoria: cat,
      organo: body.organo || defaultOrgano,
      suborgano: body.suborgano || defaultSuborgano,
      fecha: fechaFormateada,
      anio: body.anio || String(ahora.getFullYear()),
      urgente: body.urgente === true || body.urgente === "true",
      estado: body.estado || "vigente",
      clubAfectado: body.clubAfectado || "Todos los Clubes Afiliados",
      visto: body.visto || null,
      considerando: body.considerando || null,
      resuelve: resuelveArr,
      resumen: body.resumen || null,
      alertaTitulo: body.alertaTitulo || null,
      alertaTexto: body.alertaTexto || null,
      alertaTipo: body.alertaTipo || (cat === "tribunal" ? "amber" : cat === "tesoreria" ? "tertiary" : "primary"),
      aranceles: arancelesArr,
      adjuntos,
      selloTitulo: body.selloTitulo || "Documento Validado Digitalmente",
      selloAutoridad:
        body.selloAutoridad || "Certificado Oficial CAH / FJH • Consejo Directivo",
      selloIcono: cat === "reglamento" ? "shield" : "verified",
      selloColor: cat === "tesoreria" ? "amber" : "tertiary",
      createdAt: ahora.toISOString(),
    };

    lista.unshift(nuevo);
    guardarBoletines(lista);
    res.status(201).json(nuevo);
  } catch (error) {
    console.error("Error al crear boletín:", error);
    res.status(500).json({ error: "Error al publicar la resolución en el Boletín Oficial" });
  }
});

// 3. ACTUALIZAR RESOLUCIÓN / CIRCULAR
router.patch("/:id", (req, res) => {
  try {
    const lista = leerBoletines();
    const idx = lista.findIndex((b) => b.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: "Resolución no encontrada" });
    }
    lista[idx] = { ...lista[idx], ...req.body };
    guardarBoletines(lista);
    res.json(lista[idx]);
  } catch (error) {
    res.status(500).json({ error: "Error al actualizar resolución" });
  }
});

// 4. ELIMINAR RESOLUCIÓN / CIRCULAR
router.delete("/:id", (req, res) => {
  try {
    const lista = leerBoletines();
    const filtrada = lista.filter((b) => b.id !== req.params.id);
    guardarBoletines(filtrada);
    res.json({ message: "Resolución eliminada del Boletín Oficial" });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar resolución" });
  }
});

module.exports = router;
