import { NextResponse } from 'next/server'
import { generateSuggestedAdminPath } from '@/lib/config/site'

export async function GET() {
  return NextResponse.json({ path: generateSuggestedAdminPath() })
}
