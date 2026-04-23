import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ecmbrnrparokqumjmrty.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjbWJybnJwYXJva3F1bWptcnR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNTkxNTUsImV4cCI6MjA5MTczNTE1NX0.z2i98gOrDYTPWeTPZNhGnLwRY3Jz1FIxA-j3Mv9K4Ns';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);