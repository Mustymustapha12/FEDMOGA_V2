import mysql, {
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";
import { schema } from "./schema";
import { ConfigurationError } from "./diagnostics";
let pool: Pool | undefined;
let ready: Promise<void> | undefined;
export function getPool() {
  if (!pool) {
    const missing = ["DB_USER", "DB_NAME", "DB_PASSWORD"].filter(
      (name) => !process.env[name],
    );
    if (missing.length)
      throw new ConfigurationError(
        "DB_CONFIG_MISSING",
        "Required database environment variables are missing at runtime: " +
          missing.join(", "),
        missing,
      );
    const port = Number(process.env.DB_PORT || 3306);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new ConfigurationError(
        "DB_PORT_INVALID",
        "DB_PORT must be a number between 1 and 65535",
      );
    pool = mysql.createPool({
      ...(process.env.DB_SOCKET
        ? { socketPath: process.env.DB_SOCKET }
        : {
            host:
              process.env.DB_HOST === "localhost"
                ? "127.0.0.1"
                : process.env.DB_HOST || "127.0.0.1",
          }),
      port,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectionLimit: 5,
      waitForConnections: true,
      queueLimit: 30,
      connectTimeout: 10000,
      charset: "utf8mb4",
      supportBigNumbers: true,
      bigNumberStrings: false,
      ...(process.env.DB_SSL === "true"
        ? { ssl: { rejectUnauthorized: true } }
        : {}),
    });
  }
  return pool;
}
export async function ensureDatabase() {
  if (!ready)
    ready = (async () => {
      for (const statement of schema) await getPool().query(statement);
    })().catch((e) => {
      ready = undefined;
      throw e;
    });
  await ready;
}
type Executor = Pool | PoolConnection;
export class Statement {
  constructor(
    private sql: string,
    private values: unknown[] = [],
    private connection?: Executor,
  ) {}
  bind(...values: unknown[]) {
    return new Statement(this.sql, values, this.connection);
  }
  private async execute() {
    if (!this.connection) await ensureDatabase();
    return (this.connection || getPool()).execute(
      this.sql,
      this.values as (string | number | null)[],
    );
  }
  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const [rows] = await this.execute();
    return ((rows as RowDataPacket[])[0] as T) ?? null;
  }
  async all<T = Record<string, unknown>>() {
    const [rows] = await this.execute();
    return { results: rows as T[] };
  }
  async run() {
    const [result] = await this.execute();
    return { meta: { changes: (result as ResultSetHeader).affectedRows } };
  }
}
export function database(connection?: PoolConnection) {
  return { prepare: (sql: string) => new Statement(sql, [], connection) };
}
export async function transaction<T>(
  work: (db: ReturnType<typeof database>) => Promise<T>,
): Promise<T> {
  await ensureDatabase();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(database(connection));
    await connection.commit();
    return result;
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
}
export async function audit(actor: string, action: string, target = "") {
  await database()
    .prepare(
      "INSERT INTO audit_logs(id,actor,action,target,created_at) VALUES(?,?,?,?,?)",
    )
    .bind(crypto.randomUUID(), actor, action, target, new Date().toISOString())
    .run();
}
