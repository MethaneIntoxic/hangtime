import { createClient } from "@libsql/client";
import { getLocationKeyring } from "../src/lib/location/keyring";
import { PrivateLocationRepository } from "../src/lib/location/repository";

const keyring = getLocationKeyring();
const url = process.env.TURSO_DATABASE_URL?.trim();
if (!url) throw new Error("TURSO_DATABASE_URL is required.");
const sqlite = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN?.trim() });

try {
  const repository = new PrivateLocationRepository(sqlite, keyring);
  let rotated = 0;
  let conflicted = 0;

  for (const version of keyring.keys.keys()) {
    if (version === keyring.activeVersion) continue;
    const rows = await repository.listEncryptedByKeyVersion(version);
    for (const row of rows) {
      if (await repository.rotate(row, keyring)) rotated += 1;
      else conflicted += 1;
    }
  }

  const remaining = await sqlite.execute({
    sql: "SELECT COUNT(*) AS count FROM private_locations WHERE key_version <> ?",
    args: [keyring.activeVersion],
  });
  const remainingCount = Number(remaining.rows[0]?.count ?? 0);
  if (remainingCount > 0) {
    throw new Error(
      `Location key rotation is incomplete: ${remainingCount} row(s) still use a retiring key. ` +
      `Rerun after resolving ${conflicted} concurrent update conflict(s).`,
    );
  }
  console.log(
    `LOCATION_KEY_ROTATION_PASS active_version=${keyring.activeVersion} rotated=${rotated}`,
  );
} finally {
  sqlite.close();
}
