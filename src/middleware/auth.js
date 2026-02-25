const jwt = require("jsonwebtoken");

const verificarToken = (req, res, next) => {
  const token = req.header("Authorization");

  if (!token) return res.status(403).json({ error: "Acceso denegado" });

  try {
    const verificado = jwt.verify(
      token.replace("Bearer ", ""),
      process.env.JWT_SECRET || "clave_secreta_provisoria",
    );
    req.club = verificado; // Guardamos los datos del club en la petición
    next();
  } catch (error) {
    res.status(401).json({ error: "Token inválido" });
  }
};

module.exports = verificarToken;
