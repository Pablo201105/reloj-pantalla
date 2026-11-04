// Descarga la cotizacion de Bayer (BAYN.DE) desde el servidor.
// Corre en GitHub Actions: sin problemas de CORS y con IP limpia.
// Prueba varias fuentes en orden y se queda con la primera que funcione.

import { writeFileSync, readFileSync, existsSync } from "node:fs";

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function pedir(url, extra = {}) {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, "Accept": "*/*", ...extra },
    redirect: "follow",
  });
  return { ok: r.ok, status: r.status, texto: await r.text() };
}

// ---------- Fuente 1: Yahoo Finance ----------
async function yahoo() {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/BAYN.DE?interval=1d&range=5d";
  const { ok, status, texto } = await pedir(url);
  if (!ok) throw new Error(`HTTP ${status}`);
  const j = JSON.parse(texto);
  const m = j?.chart?.result?.[0]?.meta;
  if (!m?.regularMarketPrice) throw new Error("sin regularMarketPrice");
  const previo = m.chartPreviousClose ?? m.previousClose;
  return {
    precio: m.regularMarketPrice,
    previo,
    moneda: m.currency || "EUR",
    fuente: "Yahoo Finance",
  };
}

// ---------- Fuente 2: Stooq (CSV) ----------
async function stooq() {
  const url = "https://stooq.com/q/l/?s=bayn.de&f=sd2t2ohlcv&h&e=csv";
  const { ok, status, texto } = await pedir(url);
  if (!ok) throw new Error(`HTTP ${status}`);
  const lineas = texto.trim().split("\n");
  if (lineas.length < 2) throw new Error("CSV vacio");
  const c = lineas[1].split(",");
  // Symbol,Date,Time,Open,High,Low,Close,Volume
  const cierre = parseFloat(c[6]), apertura = parseFloat(c[3]);
  if (!isFinite(cierre)) throw new Error("cierre no numerico: " + lineas[1]);
  return { precio: cierre, previo: apertura, moneda: "EUR", fuente: "Stooq" };
}

// ---------- Fuente 3: Yahoo, host alternativo ----------
async function yahoo2() {
  const url = "https://query2.finance.yahoo.com/v7/finance/quote?symbols=BAYN.DE";
  const { ok, status, texto } = await pedir(url);
  if (!ok) throw new Error(`HTTP ${status}`);
  const q = JSON.parse(texto)?.quoteResponse?.result?.[0];
  if (!q?.regularMarketPrice) throw new Error("sin precio");
  return {
    precio: q.regularMarketPrice,
    previo: q.regularMarketPreviousClose,
    moneda: q.currency || "EUR",
    fuente: "Yahoo Finance (quote)",
  };
}

const FUENTES = [["yahoo", yahoo], ["stooq", stooq], ["yahoo2", yahoo2]];

let bayer = null;
for (const [nombre, fn] of FUENTES) {
  try {
    const r = await fn();
    const variacion = r.previo ? r.precio - r.previo : null;
    bayer = {
      precio: Math.round(r.precio * 100) / 100,
      moneda: r.moneda,
      variacion: variacion === null ? null : Math.round(variacion * 100) / 100,
      variacionPct: variacion === null ? null
        : Math.round((variacion / r.previo) * 10000) / 100,
      fuente: r.fuente,
    };
    console.log(`OK  ${nombre}: ${bayer.precio} ${bayer.moneda} ` +
                `(${bayer.variacionPct > 0 ? "+" : ""}${bayer.variacionPct}%) via ${r.fuente}`);
    break;
  } catch (e) {
    console.log(`FALLO ${nombre}: ${e.message}`);
  }
}

const SALIDA = "datos.json";

if (!bayer) {
  console.log("Ninguna fuente respondio.");
  // Conserva el dato anterior y marca que esta obsoleto,
  // en vez de publicar un JSON vacio que dejaria el panel en blanco.
  if (existsSync(SALIDA)) {
    const prev = JSON.parse(readFileSync(SALIDA, "utf8"));
    prev.obsoleto = true;
    writeFileSync(SALIDA, JSON.stringify(prev, null, 2) + "\n");
    console.log("Mantenido el dato anterior, marcado como obsoleto.");
    process.exit(0);
  }
  process.exit(1);
}

writeFileSync(SALIDA, JSON.stringify({
  bayer,
  actualizado: new Date().toISOString(),
  obsoleto: false,
}, null, 2) + "\n");

console.log("Escrito " + SALIDA);
