import { fetchOfficialDashboard } from '@/lib/stock-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await fetchOfficialDashboard();
    return Response.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    return Response.json(
      { error: '官方資料暫時無法同步', detail: error instanceof Error ? error.message : 'Unknown error' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
