import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database utility functions
export async function executeQuery<T>(
  query: string,
  params?: unknown[]
): Promise<{ data: T[] | null; error: any }> {
  try {
    const result = await supabase.rpc('execute_sql', { 
      query, 
      params: params || [] 
    })
    return result
  } catch (error) {
    return { data: null, error }
  }
}

// Type-safe database functions will be added here as we build them