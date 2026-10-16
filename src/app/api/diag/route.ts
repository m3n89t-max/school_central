import { NextResponse } from 'next/server';
import https from 'node:https';

/** 임시 진단용. 전역 fetch(Next가 패치함) vs node:https 비교. 확인 후 삭제한다. */
export const dynamic = 'force-dynamic';

function viaHttps(url: string, timeoutMs = 15000): Promise<{ status: number; len: number }> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let n = 0;
      res.on('data', (c) => (n += c.length));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, len: n }));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

export async function GET() {
  const KEY = process.env.AIRKOREA_SERVICE_KEY ?? '';
  const url =
    'https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getMsrstnList?' +
    new URLSearchParams({ serviceKey: KEY, returnType: 'json', numOfRows: '200', pageNo: '1', addr: '제주' });

  const out: Record<string, unknown> = {};

  let t = Date.now();
  try {
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    out.globalFetch = { status: r.status, ms: Date.now() - t, len: (await r.text()).length };
  } catch (e) {
    out.globalFetch = { error: (e as Error).name, ms: Date.now() - t };
  }

  t = Date.now();
  try {
    const r = await viaHttps(url);
    out.nodeHttps = { status: r.status, ms: Date.now() - t, len: r.len };
  } catch (e) {
    out.nodeHttps = { error: (e as Error).message, ms: Date.now() - t };
  }

  return NextResponse.json(out);
}
