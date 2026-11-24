// Loads .env.local for scripts and tests. Next.js loads it on its own for the app.
export function loadLocalEnv(): void {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No .env.local file: rely on variables already set in the shell.
  }
}
