#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Load environment variables
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function runMigration() {
  try {
    console.log('Loading migration SQL...')
    const sqlPath = path.join(__dirname, '..', 'database', 'migrations', '001_initial_schema.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')
    
    console.log('Connecting to Supabase...')
    
    // Split SQL by statements and execute each one
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'))
    
    console.log(`Executing ${statements.length} SQL statements...`)
    
    for (const statement of statements) {
      if (statement) {
        console.log(`Executing: ${statement.substring(0, 50)}...`)
        const { error } = await supabase.rpc('exec_sql', { sql: statement })
        
        if (error) {
          console.error('SQL Error:', error)
          console.error('Statement:', statement)
        }
      }
    }
    
    console.log('Migration completed successfully!')
    
    // Test connection by inserting sample team
    console.log('Testing with sample team insert...')
    const { data, error } = await supabase
      .from('teams')
      .insert([
        {
          id: 'alabama',
          name: 'University of Alabama',
          short_name: 'Alabama',
          mascot: 'Crimson Tide',
          conference: 'SEC',
          color_primary: '#9E1B32',
          color_alt: '#FFFFFF'
        }
      ])
      .select()
    
    if (error) {
      console.error('Test insert failed:', error)
    } else {
      console.log('Test insert successful:', data)
    }
    
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

runMigration()