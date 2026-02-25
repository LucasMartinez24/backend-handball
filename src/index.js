const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Importar rutas
const rutasJugadores = require("./routes/jugadores");
const rutasClubes = require("./routes/clubes");
const rutaAuth = require("./routes/auth");

app.use("/api/jugadores", rutasJugadores);
app.use("/api/clubes", rutasClubes);
app.use("/api/auth", rutaAuth);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor de Handball corriendo en http://localhost:${PORT}`);
});
