const multer = require("multer");
const path = require("path");
const fs = require("fs");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // 1. Definimos la ruta base de uploads (subiendo dos niveles desde src/middleware)
    const baseUploadPath = path.join(__dirname, "..", "..", "uploads");

    // 2. Determinamos la subcarpeta según el nombre del campo (fieldname) que viene de Angular
    let subFolder = "";

    // ... dentro de storage destination ...
    switch (file.fieldname) {
      case "logo":
        subFolder = "logos";
        break;
      case "fichaMedica":
        subFolder = "documentos/fichas";
        break;
      case "autorizacionPadres":
        subFolder = "documentos/autorizaciones";
        break;
      case "fichaJugador": // <--- AGREGAR ESTO
        subFolder = "documentos/fichas-jugadores";
        break;
      default:
        subFolder = "otros";
    }

    const finalPath = path.join(baseUploadPath, subFolder);

    // 3. Verificamos y creamos la carpeta específica de forma recursiva
    if (!fs.existsSync(finalPath)) {
      fs.mkdirSync(finalPath, { recursive: true });
    }

    cb(null, finalPath);
  },
  filename: (req, file, cb) => {
    // Generamos un nombre único para evitar colisiones
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    // Ejemplo: fichaMedica-1772606-44397.pdf
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname),
    );
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // Límite de 5MB por archivo para no saturar el VPS
});

module.exports = upload;
