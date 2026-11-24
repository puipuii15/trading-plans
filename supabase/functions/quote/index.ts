// Supabase Edge Function "quote" — ambil harga saham IDX dari Yahoo Finance.
// Body (POST JSON): { s: "ASPR,BBCA", range: "6mo", full: true }
//  - s     : kode saham BEI, dipisah koma (maks 30)
//  - range : 5d | 1mo | 3mo | 6mo | 1y | 2y
//  - full  : true = sertakan data candle harian (untuk grafik)
// Hasil: { ASPR: { last, prev, time, candles?: [[unixSec, open, high, low, close, volume], ...] }, ... }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const RANGES = ["5d", "1mo", "3mo", "6mo", "1y", "2y"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  if (req.method === "POST") { try { body = await req.json(); } catch { /* kosong */ } }

  const syms = String(body.s ?? url.searchParams.get("s") ?? "")
    .toUpperCase().split(",").map((x) => x.trim())
    .filter((x) => /^[A-Z0-9]{2,6}$/.test(x)).slice(0, 30);
  const r = String(body.range ?? url.searchParams.get("range") ?? "5d");
  const range = RANGES.includes(r) ? r : "5d";
  const full = Boolean(body.full ?? url.searchParams.get("full"));

  const out: Record<string, unknown> = {};
  await Promise.all(syms.map(async (s) => {
    for (const host of ["query1", "query2"]) {
      try {
        const res = await fetch(
          `https://${host}.finance.yahoo.com/v8/finance/chart/${s}.JK?range=${range}&interval=1d`,
          { headers: { "User-Agent": "Mozilla/5.0" } },
        );
        if (!res.ok) continue;
        const j = await res.json();
        const d = j?.chart?.result?.[0];
        if (!d) continue;
        const q = d.indicators?.quote?.[0] ?? {};
        const ts: number[] = d.timestamp ?? [];
        const candles = ts.map((t, i) => [t, q.open?.[i], q.high?.[i], q.low?.[i], q.close?.[i], q.volume?.[i] ?? 0])
          .filter((c) => c[4] != null);
        const last = d.meta?.regularMarketPrice ?? candles.at(-1)?.[4] ?? null;
        const prev = candles.length > 1 ? candles.at(-2)?.[4] : d.meta?.chartPreviousClose ?? null;
        out[s] = { last, prev, time: d.meta?.regularMarketTime ?? null, ...(full ? { candles } : {}) };
        return;
      } catch { /* coba host berikutnya */ }
    }
    out[s] = null;
  }));

  return new Response(JSON.stringify(out), {
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "max-age=60" },
  });
});
