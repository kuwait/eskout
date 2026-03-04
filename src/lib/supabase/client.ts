// src/lib/supabase/client.ts
// Browser-side Supabase client for client components
// Uses createBrowserClient from @supabase/ssr for cookie-based auth
// RELEVANT FILES: src/lib/supabase/server.ts, src/middleware.ts, src/lib/types/index.ts

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
