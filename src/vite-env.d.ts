interface ImportMetaEnv {
  /** The Supabase project this build talks to. Left out, the app runs with no server. */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** The newest migration's name, set by vite.config.ts: a saved copy from another is thrown away. */
  readonly VITE_SCHEMA_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
