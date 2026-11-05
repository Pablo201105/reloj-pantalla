// Sonda temporal: busca un endpoint vivo de precios de carburantes.
// Se ejecuta en GitHub Actions porque la red corporativa interfiere.

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const BASE = "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PrecioCarburantes";

const CANDIDATOS = [
  // Rutas clasicas del Ministerio, con y sin barra final
  `${BASE}/EstacionesTerrestres/`,
  `${BASE}/EstacionesTerrestres`,
  `${BASE}/EstacionesTerrestresFiltroProvincia/28`,
  `${BASE}/EstacionesTerrestres/FiltroProvincia/28`,
  `${BASE}/Listados/ProductosPetroliferos/`,
  `${BASE}/Listados/Provincias/`,
  // Variante con .svc (servicios WCF)
  `${BASE}.svc/EstacionesTerrestres/`,
  // HTTP plano por si la redireccion TLS es el problema
  `http://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PrecioCarburantes/EstacionesTerrestres/`,
  // Geoportal de gasolineras
  "https://geoportalgasolineras.es/geoportal-instalaciones/CalculaRutas?tipoAccion=1",
  "https://geoportalgasolineras.es/resources/files/preciosEESS_es.xls",
];

for (const url of CANDIDATOS) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "application/json,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(45000),
    });
    const ct = r.headers.get("content-type") || "?";
    const txt = await r.text();
    const ms = Date.now() - t0;

    let pista = "";
    // Si parece JSON, intenta leer cuantas estaciones trae
    if (txt.trim().startsWith("{") || txt.trim().startsWith("[")) {
      try {
        const j = JSON.parse(txt);
        const lista = j?.ListaEESSPrecio || (Array.isArray(j) ? j : null);
        pista = lista ? ` · ${lista.length} registros` : " · JSON sin lista reconocible";
        if (lista && lista.length) {
          const k = Object.keys(lista[0]).filter(x => /precio|rotulo|municipio|direcc/i.test(x));
          pista += ` · campos: ${k.slice(0, 5).join(", ")}`;
        }
      } catch { pista = " · JSON invalido"; }
    }

    console.log(`${r.ok ? "OK  " : "--  "} HTTP ${r.status} ${String(ms).padStart(6)}ms ` +
                `${ct.split(";")[0].padEnd(26)} ${String(txt.length).padStart(9)}b${pista}`);
    console.log(`       ${url}`);
  } catch (e) {
    console.log(`ERR  ${e.message}`);
    console.log(`       ${url}`);
  }
}
