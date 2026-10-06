export class ConfigurationError extends Error {
  constructor(
    public code: string,
    message: string,
    public missing: string[] = [],
  ) {
    super(message);
  }
}
const messages: Record<string, string> = {
  ECONNREFUSED:
    "MySQL refused the connection. Verify DB_HOST and DB_PORT. For a local database, try DB_HOST=127.0.0.1; if Hostinger requires a socket, set DB_SOCKET to the confirmed socket path.",
  ENOTFOUND:
    "The MySQL hostname could not be resolved. Check DB_HOST in Hostinger.",
  ENOENT:
    "The configured MySQL socket was not found. Check DB_SOCKET or remove it to use DB_HOST and DB_PORT.",
  ETIMEDOUT:
    "The MySQL connection timed out. Confirm the database endpoint is reachable from this Node.js app.",
  ER_ACCESS_DENIED_ERROR:
    "MySQL rejected the credentials. Check the full prefixed DB_USER, DB_PASSWORD and the user permissions in hPanel.",
  ER_DBACCESS_DENIED_ERROR:
    "The MySQL user does not have access to this database. Assign the user to the database in hPanel.",
  ER_BAD_DB_ERROR:
    "The configured database was not found. Check the full prefixed DB_NAME in hPanel.",
  ER_TABLEACCESS_DENIED_ERROR:
    "The database user cannot create or access the required tables. Check its table permissions in hPanel.",
  ER_BAD_FIELD_ERROR:
    "The database schema does not match this app. Use a dedicated FEDMOGA database; do not delete an existing database.",
  ER_NO_SUCH_TABLE:
    "A required table is unavailable. Check database initialization and database user permissions.",
  ER_TOO_MANY_USER_CONNECTIONS:
    "The database connection limit was reached. Check Hostinger runtime logs and retry after closing unused connections.",
  ER_LOCK_WAIT_TIMEOUT: "The database is busy. Please retry shortly.",
  HANDSHAKE_NO_SSL_SUPPORT:
    "This MySQL endpoint does not support TLS. Use DB_SSL=false for Hostinger local MySQL.",
};
export function diagnose(error: unknown) {
  if (error instanceof ConfigurationError)
    return { code: error.code, error: error.message, missing: error.missing };
  const raw =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  if (messages[raw]) return { code: raw, error: messages[raw] };
  return {
    code: "SERVER_ERROR",
    error:
      "The request could not be completed. Check Hostinger runtime logs or try again.",
  };
}
export function logFailure(error: unknown) {
  const diagnostic = diagnose(error);
  // Never log the original message/SQL/stack: those can contain credentials or member data.
  console.error("FEDMOGA request failed:", diagnostic.code);
  return diagnostic;
}
