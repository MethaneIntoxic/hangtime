import { seedDatabase } from "./seed";

async function reset() {
  await seedDatabase();
}

reset().then(() => {
  console.log("Database reset complete.");
  process.exit(0);
}).catch((err) => {
  console.error("Database reset error:", err);
  process.exit(1);
});
