function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

export type Config = {
  host: string;
  port: number;
  dataDir: string;
  cacheDir: string;
  apiToken: string;
};

export function loadConfig(): Config {
  const apiToken = required("API_TOKEN");
  if (apiToken.length < 32) {
    throw new Error("API_TOKEN must be at least 32 characters");
  }

  const port = Number(optional("PORT", "3100"));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${process.env.PORT}`);
  }

  return {
    host: optional("HOST", "127.0.0.1"),
    port,
    dataDir: optional("DATA_DIR", "./data"),
    cacheDir: optional("CACHE_DIR", "./data/cache"),
    apiToken,
  };
}
