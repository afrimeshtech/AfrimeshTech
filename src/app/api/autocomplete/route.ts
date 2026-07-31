import { NextResponse } from 'next/server'
import { autocomplete } from '@/modules/search/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q') ?? ''
  const results = await autocomplete(q)
  return NextResponse.json(results)
}
