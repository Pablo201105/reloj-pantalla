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

/* ==================================================================
   CIBERAMENAZAS  ·  SANS Internet Storm Center (isc.sans.edu)
   Fuente publica y citable. No manda cabecera CORS, por eso tampoco
   se puede leer desde el navegador y se descarga aqui.
   ================================================================== */
const PUERTOS = {
  20:"FTP",21:"FTP",22:"SSH",23:"Telnet",25:"SMTP",53:"DNS",80:"HTTP",110:"POP3",
  123:"NTP",135:"RPC",139:"NetBIOS",143:"IMAP",161:"SNMP",443:"HTTPS",445:"SMB",
  993:"IMAPS",995:"POP3S",1433:"MSSQL",1900:"SSDP",2222:"SSH alt",3306:"MySQL",
  3389:"RDP",5060:"SIP",5432:"PostgreSQL",5900:"VNC",6379:"Redis",8080:"HTTP alt",
  8443:"HTTPS alt",27017:"MongoDB",
};

async function cargarCiber() {
  const [infocon, puertos, resumen] = await Promise.all([
    pedirJson("https://isc.sans.edu/api/infocon?json").catch(() => null),
    pedirJson("https://isc.sans.edu/api/topports/records/4?json").catch(() => null),
    pedirJson(`https://isc.sans.edu/api/dailysummary/${
      new Date(Date.now() - 864e5).toISOString().slice(0, 10)}?json`).catch(() => null),
  ]);

  if (!infocon && !puertos && !resumen) throw new Error("ISC no responde");

  // topports llega como objeto con claves "0","1","2"... mas metadatos
  const lista = [];
  if (puertos) {
    for (const k of Object.keys(puertos)) {
      const p = puertos[k];
      if (p && typeof p === "object" && p.targetport !== undefined) {
        lista.push({
          puerto: Number(p.targetport),
          nombre: PUERTOS[Number(p.targetport)] || "—",
          registros: Number(p.records) || 0,
          origenes: Number(p.sources) || 0,
        });
      }
    }
    lista.sort((a, b) => b.registros - a.registros);
  }

  // dailysummary devuelve un array; se coge el dia mas reciente
  let hoy = null;
  if (Array.isArray(resumen) && resumen.length) {
    const u = resumen[resumen.length - 1];
    hoy = {
      fecha: u.date,
      ataques: Number(u.records) || 0,
      origenes: Number(u.sources) || 0,
      objetivos: Number(u.targets) || 0,
    };
  }

  return {
    infocon: infocon?.status || null,
    hoy,
    puertos: lista.slice(0, 4),
    fuente: "SANS Internet Storm Center",
  };
}

let ciber = null;
try {
  ciber = await cargarCiber();
  console.log(`OK ciber: infocon=${ciber.infocon} · ` +
              `hoy=${ciber.hoy?.ataques ?? "?"} ataques · ${ciber.puertos.length} puertos`);
} catch (e) {
  console.log(`FALLO ciber: ${e.message}`);
}

/* ==================================================================
   CARBURANTES  ·  fichero oficial del Geoportal de Gasolineras
   (geoportalgasolineras.es). Se regenera cada hora.

   OJO: la antigua API REST del Ministerio esta muerta (404 en todas
   sus rutas, comprobado tambien desde red limpia). Lo unico vivo es
   este XLS de ~7,8 MB con las 11.470 estaciones de Espana, que hay
   que descargar entero y filtrar aqui.
   ================================================================== */
const MUNICIPIO = /alcal[aá] de henares/i;
const URL_XLS = "https://geoportalgasolineras.es/resources/files/preciosEESS_es.xls";

async function cargarCarburantes() {
  const XLSX = await import("xlsx");
  const r = await fetch(URL_XLS, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(120000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);

  const buf = Buffer.from(await r.arrayBuffer());
  const libro = XLSX.read(buf, { type: "buffer" });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, blankrows: false, raw: false });

  const generado = String(filas[0]?.[1] ?? "").trim();

  // La cabecera es la fila cuya primera celda es "Provincia".
  // No sirve buscar "precio": la fila de descripcion tambien lo contiene.
  const iCab = filas.findIndex(f => /^provincia$/i.test(String(f[0] ?? "").trim()));
  if (iCab < 0) throw new Error("no se encuentra la cabecera");
  const cab = filas[iCab].map(c => String(c ?? "").trim());
  const col = re => cab.findIndex(c => re.test(c));

  const C = {
    municipio: col(/^municipio$/i), direccion: col(/^direcci/i),
    rotulo: col(/^r[oó]tulo$/i),    venta: col(/^tipo venta$/i),
    g95: col(/^precio gasolina 95 e5$/i),
    goa: col(/^precio gas[oó]leo a$/i),
    adblue: col(/^precio adblue$/i),
  };

  // Los precios vienen como "1,699" (coma decimal)
  const num = v => {
    const n = parseFloat(String(v ?? "").trim().replace(",", "."));
    return isFinite(n) && n > 0 ? n : null;
  };

  const est = filas.slice(iCab + 1)
    .filter(f => MUNICIPIO.test(String(f[C.municipio] ?? "")))
    .filter(f => String(f[C.venta] ?? "").trim().toUpperCase() === "P")  // solo publicas
    .map(f => ({
      rotulo: String(f[C.rotulo] ?? "").trim(),
      direccion: String(f[C.direccion] ?? "").trim(),
      g95: num(f[C.g95]), goa: num(f[C.goa]), adblue: num(f[C.adblue]),
    }));

  if (!est.length) throw new Error("ninguna estacion en el municipio");

  const red3 = n => Math.round(n * 1000) / 1000;

  function resumir(clave) {
    const con = est.filter(e => e[clave] !== null).sort((a, b) => a[clave] - b[clave]);
    if (!con.length) return null;
    const b = con[0];
    return {
      min: red3(b[clave]),
      media: red3(con.reduce((s, e) => s + e[clave], 0) / con.length),
      max: red3(con[con.length - 1][clave]),
      rotulo: b.rotulo,
      direccion: b.direccion,
      estaciones: con.length,
    };
  }

  return {
    municipio: "Alcalá de Henares",
    generado,
    total: est.length,
    goa: resumir("goa"),
    g95: resumir("g95"),
    adblue: resumir("adblue"),
    fuente: "Geoportal de Gasolineras (MITECO)",
  };
}

let carburantes = null;
try {
  carburantes = await cargarCarburantes();
  console.log(`OK carburantes: ${carburantes.total} estaciones · ` +
              `gasoleo ${carburantes.goa?.min} · gasolina ${carburantes.g95?.min} · ` +
              `adblue ${carburantes.adblue?.min ?? "-"} · fichero ${carburantes.generado}`);
} catch (e) {
  console.log(`FALLO carburantes: ${e.message}`);
}

/* ==================================================================
   ESCRITURA  ·  si una parte falla se conserva la anterior, para que
   el panel nunca se quede con un hueco en blanco.
   ================================================================== */
const SALIDA = "datos.json";
const previo = existsSync(SALIDA) ? JSON.parse(readFileSync(SALIDA, "utf8")) : {};

if (!bayer && !ciber && !carburantes &&
    !previo.bayer && !previo.ciber && !previo.carburantes) {
  console.log("Ninguna fuente respondio y no hay datos previos.");
  process.exit(1);
}

const salida = {
  bayer: bayer || previo.bayer || null,
  bayerObsoleto: !bayer && !!previo.bayer,
  ciber: ciber || previo.ciber || null,
  ciberObsoleto: !ciber && !!previo.ciber,
  carburantes: carburantes || previo.carburantes || null,
  carburantesObsoleto: !carburantes && !!previo.carburantes,
  actualizado: new Date().toISOString(),
};

if (salida.bayerObsoleto)       console.log("Cotizacion: conservada la anterior (obsoleta).");
if (salida.ciberObsoleto)       console.log("Ciber: conservados los datos anteriores (obsoletos).");
if (salida.carburantesObsoleto) console.log("Carburantes: conservados los anteriores (obsoletos).");

writeFileSync(SALIDA, JSON.stringify(salida, null, 2) + "\n");
console.log("Escrito " + SALIDA);
