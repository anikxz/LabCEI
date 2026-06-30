/**
 * lib/supabase.ts
 *
 * Re-exports the local API client as `supabase` so every existing import:
 *   import { supabase } from '../lib/supabase'
 * keeps working without any changes.
 */
export { apiClient as supabase } from './apiClient';
