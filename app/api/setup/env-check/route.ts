import { NextResponse } from 'next/server'
import { getEnvStatus, requiredEnvMissing } from '@/lib/config/env'

export async function GET() {
  const { required, optional } = getEnvStatus()
  return NextResponse.json({
    required,
    optional,
    missingRequired: requiredEnvMissing(),
  })
}
