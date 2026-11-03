/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_MODE?: 'mock' | 'hybrid' | 'live';
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_DEMO_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface ImportMetaEnv {
  /** Optional basemap tile URL template (default: OpenStreetMap). */
  readonly VITE_TILE_URL?: string;
  readonly VITE_TILE_ATTRIBUTION?: string;
}
