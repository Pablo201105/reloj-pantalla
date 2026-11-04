// Descarga la cotizacion de Bayer AG (ISIN DE000BAY0017) desde el servidor.
// Corre en GitHub Actions: sin CORS y sin clave de API.
//
// Fuente principal: Boerse Frankfurt (Xetra), el mercado oficial donde cotiza
// Bayer. OJO: su API rechaza la peticion con 403 "Invalid CORS request" si se
// manda cabecera Origin, por eso no se puede llamar desde el navegador y
// tiene que hacerse desde aqui.

import { writeFileSync, readFileSync, existsSync } from "node:fs";

const ISIN = "DE000BAY0017";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function pedirJson(url) {
  // Sin cabecera Origin a proposito (ver nota de arriba)
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const red2 = n => (typeof n === "number" ? Math.round(n * 100) / 100 : null);

// ---------- Fuente 1: Boerse Frankfurt / Xetra ----------
async function frankfurt(mic) {
  const j = await pedirJson(
    `https://api.boerse-frankfurt.de/v1/data/quote_box/single?isin=${ISIN}&mic=${mic}`
  );
  if (typeof j.lastPrice !== "number") throw new Error("sin lastPrice");
  return {
    precio: j.lastPrice,
    variacion: j.changeToPrevDayAbsolute,
    variacionPct: j.changeToPrevDayInPercent,
    apertura: j.open,
    momento: j.timestampLastPrice || j.timestamp || null,
    estado: j.tradingStatus || null,
    fuente: mic === "XETR" ? "Xetra" : "Börse Frankfurt",
  };
}

// ---------- Fuente 2: Yahoo (reserva; suele bloquear IPs de servidor) ----------
async function yahoo() {
  const j = await pedirJson(
    "https://query1.finance.yahoo.com/v8/finance/chart/BAYN.DE?interval=1d&range=5d"
  );
  const m = j?.chart?.result?.[0]?.meta;
  if (!m?.regularMarketPrice) throw new Error("sin regularMarketPrice");
  const previo = m.chartPreviousClose ?? m.previousClose;
  const dif = previo ? m.regularMarketPrice - previo : null;
  return {
    precio: m.regularMarketPrice,
    variacion: dif,
    variacionPct: dif !== null && previo ? (dif / previo) * 100 : null,
    apertura: null,
    momento: null,
    estado: null,
    fuente: "Yahoo Finance",
  };
}

const FUENTES = [
  ["frankfurt/XETR", () => frankfurt("XETR")],
  ["frankfurt/XFRA", () => frankfurt("XFRA")],
  ["yahoo", yahoo],
];

let bayer = null;
for (const [nombre, fn] of FUENTES) {
  try {
    const r = await fn();
    bayer = {
      precio: red2(r.precio),
      moneda: "EUR",
      variacion: red2(r.variacion),
      variacionPct: red2(r.variacionPct),
      apertura: red2(r.apertura),
      momento: r.momento,
      estado: r.estado,
      fuente: r.fuente,
    };
    const signo = bayer.variacionPct > 0 ? "+" : "";
    console.log(`OK ${nombre}: ${bayer.precio} EUR ` +
                `(${signo}${bayer.variacionPct}%) · ${r.estado || "-"} · via ${r.fuente}`);
    break;
  } catch (e) {
    console.log(`FALLO ${nombre}: ${e.message}`);
  }
}

const SALIDA = "datos.json";

if (!bayer) {
  console.log("Ninguna fuente respondio.");
  // Conserva el dato anterior marcado como obsoleto en vez de publicar un
  // JSON vacio, que dejaria ese hueco del panel en blanco.
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
