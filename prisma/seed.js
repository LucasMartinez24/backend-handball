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
      nombre: "Comunity Manager",
      username: "ComunityManagerFJH",
      role: "CM",
      pass: "CM2026FHJ",
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
