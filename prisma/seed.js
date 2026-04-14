/**
 * Prisma seed file for initializing staff users in the database
 *
 * This script:
 * - Connects to the Prisma database with logging enabled
 * - Generates a bcrypt salt for password hashing
 * - Creates or updates staff users with hashed passwords
 * - Includes 4 default staff users with different roles:
 *   - Admin
 *   - Federation Representative
 *   - Table Official
 *   - Referee Chief
 *
 * @async
 * @function main
 * @returns {Promise<void>}
 * @throws {Error} If database operations fail
 *
 * @warning The default passwords in staffUsers array should be changed
 * in production environments for security purposes
 *
 * @example
 * // Run this seed with:
 * // npx prisma db seed
 */
const bcrypt = require("bcrypt");
const prisma = require("../src/lib/prisma");

async function main() {
  const salt = await bcrypt.genSalt(10);

  const staffUsers = [
    {
      nombre: "Administrador FJH",
      username: "admin",
      role: "admin",
      pass: "HorizonteHandball2026", 
    },
    {
      nombre: "Representante Fed.",
      username: "JugadoresFede2026",
      role: "REP_FEDERACION",
      pass: "JugadoresFederacion_2026",
    },
    {
      nombre: "Oficial de Mesa",
      username: "PlanillaFederacion2026",
      role: "OFICIAL_MESA",
      pass: "Planilla_fede2026",
    },
    {
      nombre: "Jefe de Árbitros",
      username: "Arbitros2026",
      role: "JEFE_ARBITROS",
      pass: "Federacion_Arbitros2026",
    },
  ];

  console.log("Generando usuarios de Staff...");

  for (let u of staffUsers) {
    const passwordHashed = await bcrypt.hash(u.pass, salt);
    await prisma.staff.upsert({
      where: { username: u.username },
      update: {},
      create: {
        nombre: u.nombre,
        username: u.username,
        role: u.role,
        password: passwordHashed,
      },
    });
  }
  console.log("¡Usuarios creados con éxito!");
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
