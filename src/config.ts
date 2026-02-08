const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  browserIdleMs: parseInt(process.env.BROWSER_IDLE_MS || '60000', 10),
  defaultTimeout: parseInt(process.env.DEFAULT_TIMEOUT || '30000', 10),
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || String(100 * 1024 * 1024), 10),
  chromePath: process.env.CHROME_PATH || '/usr/bin/google-chrome-stable',
} as const;

export default config;
