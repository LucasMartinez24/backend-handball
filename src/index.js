const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(
  cors({
    origin: [
      "https://federaciondehandballjujuy.cloud",
      "http://localhost:4200",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
    ],
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));
// Importar rutas
const rutasJugadores = require("./routes/jugadores");
const rutasClubes = require("./routes/clubes");
const rutaAuth = require("./routes/auth");
const partidosRoutes = require("./routes/partidos");
const posicionesRoutes = require("./routes/posiciones");
const ticketRoutes = require("./routes/tickets");
app.use("/api/tickets", ticketRoutes);
app.use("/api/jugadores", rutasJugadores);
app.use("/api/clubes", rutasClubes);
app.use("/api/auth", rutaAuth);
app.use("/api/torneos", require("./routes/torneos"));
app.use("/api/partidos", partidosRoutes);
app.use("/api/posiciones", posicionesRoutes);
app.use("/api/galeria", require("./routes/galeria"));
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor de Handball corriendo en http://localhost:${PORT}`);
});
