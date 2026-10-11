// Which server this build talks to: read at start-up, without loading the
// server's client code (see lazyRemote.ts).

export interface ServerConfig {
  readonly url: string;
  /** The publishable key: public by design, it names the project and nothing more. */
  readonly key: string;
}

/** The server this build talks to, or null for a build made without one. */
export function serverConfig(
  env: Readonly<{ VITE_SUPABASE_URL?: string; VITE_SUPABASE_PUBLISHABLE_KEY?: string }>,
): ServerConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && key ? { url, key } : null;
}
