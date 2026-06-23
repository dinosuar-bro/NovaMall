import type { Pool } from "mysql2/promise";

export interface HealthRepository {
  assertReady(): Promise<void>;
}

export class MysqlHealthRepository implements HealthRepository {
  constructor(private readonly pool: Pool) {}

  async assertReady(): Promise<void> {
    await this.pool.query("SELECT 1");
    await this.pool.query("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1");
  }
}
