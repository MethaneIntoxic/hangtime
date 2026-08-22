import type { Client } from "@libsql/client";
import { applyIncrementalMigrations } from "./migrations";

function isBusy(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const candidate = error as Error & { code?: string; rawCode?: number };
  return candidate.code === "SQLITE_BUSY" || candidate.rawCode === 5 || /database is locked/i.test(error.message);
}

export type DatabaseInitOptions = {
  applyLocalPragmas?: boolean;
};

export async function initDatabase(
  client: Client,
  { applyLocalPragmas = true }: DatabaseInitOptions = {},
): Promise<void> {
  // These connection-level pragmas are useful for local SQLite files, but
  // Turso's HTTP/libSQL endpoint rejects them during remote migrations.
  if (applyLocalPragmas) {
    await client.execute("PRAGMA busy_timeout = 10000");
    await client.execute("PRAGMA foreign_keys = ON");
  }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      avatar_path TEXT,
      account_kind TEXT NOT NULL DEFAULT 'full',
      timezone TEXT NOT NULL DEFAULT 'Asia/Singapore',
      coarse_area TEXT,
      notification_prefs TEXT DEFAULT '{"email":true,"push":false}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dining_companions (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      companion_user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'accepted',
      is_favourite INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dietary_rules (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      rule_code TEXT NOT NULL,
      severity TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cuisine_preferences (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      cuisine_code TEXT NOT NULL,
      weight INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS calendar_connections (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'google',
      status TEXT NOT NULL DEFAULT 'connected',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      organizer_id TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'draft',
      version INTEGER NOT NULL DEFAULT 1,
      date TEXT NOT NULL,
      window_start TEXT NOT NULL,
      window_end TEXT NOT NULL,
      meal_type TEXT NOT NULL DEFAULT 'dinner',
      group_budget_cents INTEGER NOT NULL DEFAULT 12000,
      alcohol_mode TEXT NOT NULL DEFAULT 'excluded',
      fairness_mode TEXT NOT NULL DEFAULT 'equal_journeys',
      timezone TEXT NOT NULL DEFAULT 'Asia/Singapore',
      shortlist_size INTEGER NOT NULL DEFAULT 5,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plan_participants (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      coarse_origin_label TEXT,
      is_ready INTEGER NOT NULL DEFAULT 0,
      dietary_declared INTEGER NOT NULL DEFAULT 0,
      acknowledged_state TEXT NOT NULL DEFAULT 'pending',
      joined_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS plan_participants_plan_user_uq
      ON plan_participants(plan_id, user_id);

    CREATE TABLE IF NOT EXISTS plan_invites (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      email TEXT,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      accepted_at TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS availability_windows (
      id TEXT PRIMARY KEY,
      participant_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual'
    );

    CREATE TABLE IF NOT EXISTS recommendation_runs (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      plan_version INTEGER NOT NULL,
      algorithm_version TEXT NOT NULL DEFAULT 'v1.0',
      status TEXT NOT NULL DEFAULT 'queued',
      weights_json TEXT,
      failure_reason TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recommendation_candidates (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      rank INTEGER NOT NULL,
      venue_id TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      coarse_area TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      cuisine TEXT NOT NULL,
      price_tier INTEGER NOT NULL,
      price_range_min_cents INTEGER NOT NULL,
      price_range_max_cents INTEGER NOT NULL,
      rating REAL NOT NULL,
      rating_count INTEGER NOT NULL,
      badges_json TEXT NOT NULL,
      transit_estimates_json TEXT NOT NULL,
      dietary_suitability_json TEXT NOT NULL,
      booking_url TEXT,
      maps_url TEXT,
      why_recommended TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS candidate_scores (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL,
      fairness_score REAL NOT NULL,
      total_travel_score REAL NOT NULL,
      food_match_score REAL NOT NULL,
      budget_fit_score REAL NOT NULL,
      quality_score REAL NOT NULL,
      total_score REAL NOT NULL,
      tie_breaker_seed INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ballots (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ballot_selections (
      id TEXT PRIMARY KEY,
      ballot_id TEXT NOT NULL,
      candidate_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plan_decisions (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      candidate_id TEXT NOT NULL,
      exact_start_time TEXT NOT NULL,
      decision_kind TEXT NOT NULL DEFAULT 'winner',
      override_reason TEXT,
      decided_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plan_events (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      satisfaction_score INTEGER NOT NULL,
      reuse_intent INTEGER NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_outbox (
      id TEXT PRIMARY KEY,
      recipient_email TEXT NOT NULL,
      recipient_id TEXT,
      channel TEXT NOT NULL DEFAULT 'in_app',
      template TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      sent_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_magic_links (
      id TEXT PRIMARY KEY,
      email_normalized TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      delivery_status TEXT NOT NULL DEFAULT 'pending',
      provider_message_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS auth_magic_links_email_created_idx
      ON auth_magic_links(email_normalized, created_at);
    CREATE INDEX IF NOT EXISTS auth_magic_links_expires_idx
      ON auth_magic_links(expires_at);

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS auth_sessions_user_idx
      ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS auth_sessions_expiry_revoked_idx
      ON auth_sessions(expires_at, revoked_at);

    CREATE TABLE IF NOT EXISTS auth_rate_limits (
      key_hash TEXT NOT NULL,
      bucket_start TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (key_hash, bucket_start)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_normalized_uq
      ON profiles(lower(trim(email)));

    CREATE TABLE IF NOT EXISTS private_locations (
      id TEXT PRIMARY KEY,
      subject_kind TEXT NOT NULL CHECK (subject_kind IN ('profile', 'plan_participant')),
      subject_id TEXT NOT NULL UNIQUE,
      owner_user_id TEXT NOT NULL,
      plan_id TEXT,
      ciphertext BLOB NOT NULL CHECK (length(ciphertext) > 0),
      nonce BLOB NOT NULL CHECK (length(nonce) = 12),
      auth_tag BLOB NOT NULL CHECK (length(auth_tag) = 16),
      key_version TEXT NOT NULL,
      payload_version INTEGER NOT NULL DEFAULT 1 CHECK (payload_version = 1),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (
        (subject_kind = 'profile' AND plan_id IS NULL) OR
        (subject_kind = 'plan_participant' AND plan_id IS NOT NULL)
      )
    );

    CREATE INDEX IF NOT EXISTS private_locations_key_version_idx
      ON private_locations(key_version);
    CREATE INDEX IF NOT EXISTS private_locations_owner_idx
      ON private_locations(owner_user_id);
    CREATE INDEX IF NOT EXISTS private_locations_plan_idx
      ON private_locations(plan_id);

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    INSERT OR IGNORE INTO schema_migrations(version, applied_at)
    VALUES
      ('0001_base', datetime('now')),
      ('0002_production_auth', datetime('now')),
      ('0003_private_locations', datetime('now')),
      ('0004_libsql_concurrency_indexes', datetime('now'));
      `);
      break;
    } catch (error) {
      if (!isBusy(error) || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }

  await applyIncrementalMigrations(client);

  for (const table of ["profiles", "plan_participants"]) {
    const columns = await client.execute(`PRAGMA table_info(${table})`);
    const legacy = columns
      .rows.map((column) => String(column.name))
      .filter((name) => ["postal_code", "lat", "lng"].includes(name));
    if (legacy.length > 0) {
      throw new Error(
        `${table} contains legacy plaintext location columns (${legacy.join(", ")}). ` +
        "Quiesce the app and run pnpm migrate:location-encryption before startup.",
      );
    }
  }

  // Brand/provider migration: rewrite only legacy public venue links. Exact
  // participant origins are never included in these outbound URLs.
  await client.executeMultiple(`
    UPDATE recommendation_candidates
    SET maps_url =
      'https://www.openstreetmap.org/?mlat=' || printf('%.6f', lat) ||
      '&mlon=' || printf('%.6f', lng) ||
      '#map=18/' || printf('%.6f', lat) || '/' || printf('%.6f', lng)
    WHERE maps_url LIKE 'https://maps.google.com/%';
  `);

}
