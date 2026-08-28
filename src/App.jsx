import React, { useState, useEffect, useMemo } from "react";

/* ------------------------------------------------------------------ */
/*  Paleta e utilidades                                               */
/* ------------------------------------------------------------------ */

const C = {
  ink: "#0E1116",
  soft: "#4A5464",
  line: "#E2E6ED",
  tint: "#EEF3FC",
  blue: "#1A4FC4",
  steel: "#C6CDD9",
};

const MODEL = "claude-sonnet-4-6";
const DISPLAY = "Archivo, system-ui, sans-serif";
const BODY = "'Instrument Sans', system-ui, sans-serif";

const n = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  const x = parseFloat(String(v).replace(/\./g, "").replace(",", "."));
  return isNaN(x) ? 0 : x;
};
const nf = (v, d = 0) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v || 0);
const brl = (v, d = 2) => "R$ " + nf(v, d);

const readFile = (file) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res({ name: file.name, mime: file.type || "image/png", b64: String(r.result).split(",")[1], legenda: "" });
    r.onerror = () => rej(new Error("Não consegui ler " + file.name));
    r.readAsDataURL(file);
  });

async function callClaude(messages, system) {
  const r = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, system, messages }),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error?.message || "A API respondeu " + r.status + ". Tente de novo em alguns segundos.");
  }
  const d = await r.json();
  return (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

function parseJson(txt) {
  const s = txt.indexOf("{");
  const e = txt.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("A resposta veio sem JSON. Tente gerar de novo.");
  return JSON.parse(txt.slice(s, e + 1));
}

const emptyRow = (extra) => ({
  nome: "",
  descritor: "",
  status: "ativo",
  gasto: "",
  alcance: "",
  impressoes: "",
  cliques: "",
  resultados: "",
  ...(extra || {}),
});

/* ------------------------------------------------------------------ */
/*  Reconciliação                                                     */
/* ------------------------------------------------------------------ */

const somar = (rows) =>
  rows.reduce(
    (a, r) => ({
      gasto: a.gasto + n(r.gasto),
      alcance: a.alcance + n(r.alcance),
      impressoes: a.impressoes + n(r.impressoes),
      cliques: a.cliques + n(r.cliques),
      resultados: a.resultados + n(r.resultados),
    }),
    { gasto: 0, alcance: 0, impressoes: 0, cliques: 0, resultados: 0 }
  );

function reconciliar(niveis) {
  const camp = somar(niveis.campanhas);
  const conj = somar(niveis.conjuntos.filter((r) => n(r.impressoes) > 0 || n(r.gasto) > 0));
  const anun = somar(niveis.anuncios.filter((r) => n(r.impressoes) > 0 || n(r.gasto) > 0));
  const campos = ["gasto", "impressoes", "cliques", "resultados"];
  const rotulos = { gasto: "investimento", impressoes: "impressões", cliques: "cliques", resultados: "resultados" };
  const divergencias = [];
  const checar = (nivel, tot) => {
    campos.forEach((k) => {
      const base = camp[k];
      if (!base) return;
      const dif = tot[k] - base;
      if (Math.abs(dif) / base > 0.005) {
        divergencias.push(
          `A soma de ${rotulos[k]} no nível de ${nivel} (${nf(tot[k], k === "gasto" ? 2 : 0)}) não bate com a campanha (${nf(base, k === "gasto" ? 2 : 0)}). Diferença de ${nf(Math.abs(dif), k === "gasto" ? 2 : 0)}.`
        );
      }
    });
  };
  if (niveis.conjuntos.length) checar("conjunto", conj);
  if (niveis.anuncios.length) checar("anúncio", anun);
  if (niveis.campanhas.length > 1)
    divergencias.push(
      "O alcance de campanhas diferentes não foi somado: o Meta só remove pessoas repetidas dentro da mesma campanha."
    );
  const faltando = [];
  ["campanhas", "conjuntos", "anuncios"].forEach((nivel) =>
    niveis[nivel].forEach((r) => {
      if (r.nome && !n(r.alcance) && n(r.impressoes)) faltando.push(`Alcance não informado em "${r.nome}".`);
    })
  );
  return { camp, conj, anun, divergencias, faltando, integro: divergencias.length === 0 };
}

function calcularKpis(t) {
  const freq = t.alcance ? t.impressoes / t.alcance : 0;
  return [
    { rotulo: "Resultados", valor: nf(t.resultados) },
    { rotulo: "Custo por resultado", valor: t.resultados ? brl(t.gasto / t.resultados) : "—" },
    { rotulo: "Investimento", valor: brl(t.gasto) },
    { rotulo: "Alcance", valor: nf(t.alcance) },
    { rotulo: "Impressões", valor: nf(t.impressoes) },
    { rotulo: "Frequência", valor: freq ? nf(freq, 2) : "—" },
    { rotulo: "CPM", valor: t.impressoes ? brl((t.gasto / t.impressoes) * 1000) : "—" },
    { rotulo: "CTR", valor: t.impressoes ? nf((t.cliques / t.impressoes) * 100, 2) + "%" : "—" },
  ];
}

/* ------------------------------------------------------------------ */
/*  Montagem do HTML final                                            */
/* ------------------------------------------------------------------ */

const esc = (s) =>
  String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const src = (img) => (img ? `data:${img.mime};base64,${img.b64}` : "");

function montarHtml({ meta, niveis, kpis, rec, copy, logo, prints, criativos }) {
  const TOPS = [0, 4, 8, 13];
  const BOTS = [4, 8, 13, 20];
  const PADS = [6, 10, 15, 22];
  const CORES = ["#4A80E0", "#1A4FC4", "#143C96", "#0C2660"];

  const pessoas = Array.from({ length: 10 }, (_, i) => {
    const on = i < (copy.pictograma?.destaque || 0);
    return `<div class="pes ${on ? "on" : "off"}"><span class="cab"></span><span class="cor"></span></div>`;
  }).join("");

  const linhasTabela = (rows) =>
    rows
      .filter((r) => r.nome && (n(r.impressoes) || n(r.gasto)))
      .map(
        (r) => `<tr>
        <td><b>${esc(r.nome)}</b>${r.descritor ? `<span class="desc">${esc(r.descritor)}</span>` : ""}</td>
        <td class="num">${brl(n(r.gasto))}</td>
        <td class="num">${nf(n(r.impressoes))}</td>
        <td class="num">${n(r.alcance) ? nf(n(r.impressoes) / n(r.alcance), 2) : "—"}</td>
        <td class="num">${nf(n(r.resultados))}</td>
        <td class="num">${n(r.resultados) ? brl(n(r.gasto) / n(r.resultados)) : "—"}</td>
      </tr>`
      )
      .join("");

  const oportunidades = (copy.oportunidades || [])
    .map(
      (o, i) => `<section class="bloco">
      <h2>${esc(o.titulo)}</h2>
      <p class="apoio">${esc(o.apoio)}</p>
      ${
        o.itens && o.itens.length
          ? `<table class="mini"><tbody>${o.itens
              .map((it) => `<tr><td>${esc(it.rotulo)}</td><td class="num">${esc(it.valor)}</td></tr>`)
              .join("")}</tbody></table>`
          : ""
      }
      ${i === 0 && prints[0] ? figura(prints[0]) : ""}
      <div class="rule">${esc(o.regra)}</div>
    </section>`
    )
    .join("");

  function figura(img) {
    return `<figure><img src="${src(img)}" alt="${esc(img.legenda || "Print do Gerenciador de Anúncios")}"><figcaption>${
      img.legenda ? `<b>${esc(img.legenda.split(".")[0])}.</b> ${esc(img.legenda.split(".").slice(1).join(".").trim())}` : "<b>Print do painel original.</b>"
    }</figcaption></figure>`;
  }

  const comparacao =
    criativos.length >= 2
      ? `<section class="bloco"><h2>Duas peças, lado a lado</h2>
      <div class="lado">${criativos
        .slice(0, 2)
        .map(
          (c, i) => `<div><span class="etq">${i === 0 ? "Peça A" : "Peça B"}</span>
          <p>${esc(c.legenda || "Criativo que rodou no período.")}</p>
          <img src="${src(c)}" alt="Prévia do criativo ${i + 1}"></div>`
        )
        .join("")}</div></section>`
      : "";

  const abas = (copy.funil || [])
    .map(
      (f, i) =>
        `<button class="fx" role="tab" id="tab${i}" aria-controls="pan${i}" aria-selected="${i === 0}" tabindex="${
          i === 0 ? 0 : -1
        }" style="clip-path:polygon(${TOPS[i]}% 0,${100 - TOPS[i]}% 0,${100 - BOTS[i]}% 100%,${BOTS[i]}% 100%);background:${
          CORES[i]
        };padding-left:${PADS[i]}%;padding-right:${PADS[i]}%${f.naoMedida ? ";outline-offset:-6px" : ""}">
        <span class="fxe">${esc(f.etapa)}</span><span class="fxv">${esc(f.valor)}</span></button>`
    )
    .join("");

  const paineis = (copy.funil || [])
    .map(
      (f, i) => `<div class="pan" id="pan${i}" role="tabpanel" aria-labelledby="tab${i}" ${i === 0 ? "" : "hidden"}>
      <div class="pcols">
        ${[f.colunaA, f.colunaB]
          .filter(Boolean)
          .map(
            (col) => `<div><h4>${esc(col.titulo)}</h4><ul>${(col.itens || [])
              .map((x) => `<li>${esc(x)}</li>`)
              .join("")}</ul></div>`
          )
          .join("")}
      </div>
      <div class="meta">${esc(f.meta)}</div>
    </div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatório de Meta Ads — ${esc(meta.cliente)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@700;800;900&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--ink:${C.ink};--soft:${C.soft};--line:${C.line};--tint:${C.tint};--blue:${C.blue};--steel:${C.steel}}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:var(--ink);font-family:'Instrument Sans',system-ui,sans-serif;font-size:16px;line-height:1.55}
.wrap{max-width:1080px;margin:0 auto;padding:40px 28px 80px}
h1,h2,h3,h4,.num,.kpi b,.fxv{font-family:Archivo,system-ui,sans-serif}
header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:22px;border-bottom:4px solid var(--ink)}
.marca{display:flex;gap:14px;align-items:center}
.marca img{width:56px;height:56px;object-fit:contain}
.marca b{font-family:Archivo;font-weight:800;font-size:19px;display:block}
.marca span{color:var(--soft);font-size:13px}
.para{text-align:right;font-size:13px;color:var(--soft)}
.para b{font-family:Archivo;font-weight:800;font-size:17px;color:var(--ink);display:block}
.veredito{padding:54px 0 20px;max-width:19ch}
.veredito p{font-family:Archivo;font-weight:800;font-size:clamp(38px,6.4vw,66px);line-height:1.02;margin:0;letter-spacing:-.02em}
.veredito em{font-style:normal;color:var(--blue)}
.sub{max-width:56ch;color:var(--soft);margin:20px 0 0}
.grid{display:grid;gap:2px;background:var(--line);border-top:3px solid var(--ink);border-bottom:3px solid var(--ink);margin:34px 0}
.g4{grid-template-columns:repeat(4,1fr)}.g3{grid-template-columns:repeat(3,1fr)}.g2{grid-template-columns:repeat(2,1fr)}
.cel{background:#fff;padding:20px 18px}
.kpi span{display:block;font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:var(--soft);font-weight:600}
.kpi b{display:block;font-weight:800;font-size:30px;margin:6px 0 4px;letter-spacing:-.02em}
.kpi i{font-style:normal;font-size:13px;color:var(--soft)}
.sec{font-family:Archivo;font-weight:800;font-size:12px;letter-spacing:.14em;text-transform:uppercase;margin:56px 0 14px;padding-bottom:10px;border-bottom:3px solid var(--ink)}
.cel h3{margin:0 0 6px;font-size:16px;font-weight:700}
.cel h3::before{content:"✓";color:var(--blue);margin-right:8px}
.cel p{margin:0;font-size:14px;color:var(--soft)}
.picto{display:flex;gap:10px;flex-wrap:wrap;margin:26px 0 10px}
.pes{width:38px;height:56px;position:relative;color:var(--ink)}
.pes.off{color:var(--steel)}
.pes .cab{position:absolute;top:0;left:50%;transform:translateX(-50%);width:16px;height:16px;border-radius:50%;background:currentColor}
.pes .cor{position:absolute;top:19px;left:0;right:0;bottom:0;background:currentColor;clip-path:polygon(30% 0,70% 0,100% 22%,100% 62%,78% 62%,78% 100%,58% 100%,58% 66%,42% 66%,42% 100%,22% 100%,22% 62%,0 62%,0 22%)}
.leg{color:var(--soft);font-size:14px;margin:0 0 10px}
.bloco{margin:52px 0}
.bloco h2{font-size:25px;font-weight:800;margin:0 0 6px;letter-spacing:-.01em}
.apoio{color:var(--soft);margin:0 0 18px;max-width:62ch}
.rule{background:var(--tint);border-left:5px solid var(--blue);padding:16px 20px;margin-top:18px;font-weight:500}
table{width:100%;border-collapse:collapse;margin:8px 0}
th{font-family:Archivo;font-weight:800;font-size:11px;letter-spacing:.1em;text-transform:uppercase;text-align:left;padding:0 10px 10px;border-bottom:3px solid var(--ink)}
th.num,td.num{text-align:right}
td{padding:14px 10px;border-bottom:1px solid var(--line);font-size:15px;vertical-align:top}
td.num{font-family:Archivo;font-weight:700}
.desc{display:block;font-size:12px;color:var(--soft);font-weight:400}
.mini td{padding:10px}
figure{margin:24px 0}
figure img{max-width:100%;border:1px solid var(--line);display:block}
figcaption{font-size:13px;color:var(--soft);margin-top:10px;max-width:70ch}
figcaption b{color:var(--ink)}
.lado{display:grid;grid-template-columns:1fr 1fr;gap:28px}
.lado img{max-height:360px;width:auto;max-width:100%;border:1px solid var(--line);margin-top:12px}
.etq{font-family:Archivo;font-weight:800;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--blue)}
.funil{margin:14px 0 0}
.fx{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%;border:0;color:#fff;padding-top:22px;padding-bottom:22px;cursor:pointer;opacity:.42;font-family:inherit;text-align:left}
.fx[aria-selected="true"]{opacity:1;filter:drop-shadow(0 6px 14px rgba(14,17,22,.22))}
.fx:focus-visible{outline:3px solid var(--ink);outline-offset:-3px}
.fxe{font-weight:600;font-size:15px}
.fxv{font-weight:800;font-size:22px}
.pan{border:1px solid var(--line);border-top:3px solid var(--ink);padding:26px 24px;margin-top:22px}
.pcols{display:grid;grid-template-columns:1fr 1fr;gap:28px}
.pan h4{margin:0 0 10px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--blue)}
.pan ul{margin:0;padding-left:18px;color:var(--soft);font-size:14px}
.pan li{margin-bottom:7px}
.meta{margin-top:20px;padding-top:16px;border-top:1px solid var(--line);font-weight:600}
.lista{list-style:none;padding:0;margin:0}
.lista li{padding-left:22px;position:relative;margin-bottom:12px;font-size:15px}
.lista li::before{content:"";position:absolute;left:0;top:8px;width:9px;height:9px;background:var(--ink)}
.amp li::before{background:var(--blue)}
.amp h3{color:var(--blue)}
.porque{background:#fff;padding:24px}
.porque h3{font-family:Archivo;font-weight:800;font-size:20px;margin:8px 0 12px}
.porque p{font-size:14px;color:var(--soft);margin:0 0 10px}
.porque .k{border-top:1px solid var(--line);padding-top:14px;margin-top:6px}
.porque .k b{font-family:Archivo;font-weight:800;font-size:26px;display:block}
.porque .k span{font-size:12px;color:var(--soft);text-transform:uppercase;letter-spacing:.09em}
.fim{background:var(--ink);color:#fff;padding:44px 36px;margin:60px 0 0}
.fim .etq{color:#7FA3F0}
.fim h2{font-family:Archivo;font-weight:800;font-size:30px;margin:12px 0 14px;max-width:24ch}
.fim p{color:#C6CDD9;max-width:64ch;margin:0}
footer{margin-top:40px;padding-top:18px;border-top:1px solid var(--line);color:var(--soft);font-size:13px}
footer h4{font-family:Archivo;font-size:11px;letter-spacing:.12em;text-transform:uppercase;margin:26px 0 8px;color:var(--ink)}
footer ul{margin:0;padding-left:18px}
@media(max-width:700px){
 .g4,.g3,.g2,.lado,.pcols{grid-template-columns:1fr}
 .fx{clip-path:none!important;padding-left:20px!important;padding-right:20px!important}
 .veredito{padding-top:32px}
}
@media print{
 .wrap{max-width:none;padding:0}
 .fx{opacity:1!important;filter:none!important}
 .pan{display:block!important}
 .bloco,.grid,figure,.fim,table{page-break-inside:avoid}
 .fx,.fim,.rule,.pan{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style></head><body><div class="wrap">

<header>
 <div class="marca">${logo ? `<img src="${src(logo)}" alt="Logo ${esc(meta.assessoria)}">` : ""}
  <div><b>${esc(meta.assessoria)}</b><span>${esc(meta.posicionamento)}</span></div></div>
 <div class="para"><b>Para ${esc(meta.cliente)}</b>${esc(meta.periodo)}<br>Emitido em ${esc(meta.dataEmissao)}</div>
</header>

<div class="veredito"><p>${String(copy.veredito?.frase || "").replace(
    new RegExp(esc(copy.veredito?.destaque || "@@"), "i"),
    (m) => `<em>${m}</em>`
  )}</p></div>
<p class="sub">${esc(copy.veredito?.apoio)}</p>

<div class="grid g4">${kpis
    .map(
      (k, i) =>
        `<div class="cel kpi"><span>${esc(k.rotulo)}</span><b>${esc(k.valor)}</b><i>${esc(
          (copy.notasKpi || [])[i] || ""
        )}</i></div>`
    )
    .join("")}</div>

<h2 class="sec">O que a conta conquistou</h2>
<div class="grid g3">${(copy.conquistas || [])
    .map((c) => `<div class="cel"><h3>${esc(c.titulo)}</h3><p>${esc(c.texto)}</p></div>`)
    .join("")}</div>

<div class="picto">${pessoas}</div>
<p class="leg">${esc(copy.pictograma?.legenda)}</p>

${oportunidades}

${comparacao}

<h2 class="sec">Como cada peça se comportou</h2>
<table><thead><tr><th>Peça</th><th class="num">Investimento</th><th class="num">Impressões</th><th class="num">Frequência</th><th class="num">Resultados</th><th class="num">Custo/result.</th></tr></thead>
<tbody>${linhasTabela(niveis.anuncios.length ? niveis.anuncios : niveis.conjuntos)}</tbody></table>

<h2 class="sec">O caminho até o resultado</h2>
<div class="funil" role="tablist" aria-label="Etapas do funil">${abas}</div>
${paineis}

<h2 class="sec">Manter e ampliar</h2>
<div class="grid g2">
 <div class="cel"><h3>Manter</h3><ul class="lista">${(copy.manter || [])
    .map((x) => `<li>${esc(x)}</li>`)
    .join("")}</ul></div>
 <div class="cel amp"><h3>Ampliar</h3><ul class="lista amp">${(copy.ampliar || [])
    .map((x) => `<li>${esc(x)}</li>`)
    .join("")}</ul></div>
</div>

<div class="grid g2">${(copy.porques || [])
    .map(
      (p) => `<div class="cel porque"><span class="etq">${esc(p.etiqueta)}</span>
   <h3>${esc(p.titulo)}</h3>${(p.paragrafos || []).map((x) => `<p>${esc(x)}</p>`).join("")}
   <div class="k"><b>${esc(p.kpi?.valor)}</b><span>${esc(p.kpi?.rotulo)}</span></div></div>`
    )
    .join("")}</div>

<div class="fim"><span class="etq">Comece por aqui</span>
 <h2>${esc(copy.fechamento?.recomendacao)}</h2><p>${esc(copy.fechamento?.justificativa)}</p></div>

<footer>
 <b>${esc(meta.responsavel)}</b> · ${esc(meta.contato)}<br>
 Período analisado: ${esc(meta.periodo)} · Fonte: Gerenciador de Anúncios da Meta
 ${
   rec.divergencias.length || rec.faltando.length
     ? `<h4>Divergências e lacunas nos dados</h4><ul>${[...rec.divergencias, ...rec.faltando]
         .map((d) => `<li>${esc(d)}</li>`)
         .join("")}</ul>`
     : `<h4>Divergências e lacunas nos dados</h4><ul><li>As somas dos três níveis conferem com o total da campanha.</li>${
         meta.canal === "whatsapp+direct"
           ? "<li>Conversas iniciadas contam apenas o botão do WhatsApp. Quem responde pelo Direct do Instagram não aparece nesta contagem.</li>"
           : ""
       }${meta.cicloFechado === "parcial" ? "<li>O período é um ciclo parcial. Comparações com outros períodos usam ritmo diário.</li>" : ""}</ul>`
 }
</footer>
</div>
<script>
(function(){
 var tabs=[].slice.call(document.querySelectorAll('.fx'));
 var pans=[].slice.call(document.querySelectorAll('.pan'));
 function sel(i){tabs.forEach(function(t,j){t.setAttribute('aria-selected',j===i);t.tabIndex=j===i?0:-1;});pans.forEach(function(p,j){p.hidden=j!==i;});}
 tabs.forEach(function(t,i){
  t.addEventListener('click',function(){sel(i);});
  t.addEventListener('keydown',function(e){
   var d=e.key==='ArrowDown'||e.key==='ArrowRight'?1:(e.key==='ArrowUp'||e.key==='ArrowLeft'?-1:0);
   if(!d)return;e.preventDefault();var k=(i+d+tabs.length)%tabs.length;sel(k);tabs[k].focus();
  });
 });
})();
</script>
</body></html>`;
}

/* ------------------------------------------------------------------ */
/*  Componentes de interface                                          */
/* ------------------------------------------------------------------ */

const Campo = ({ label, hint, children }) => (
  <label className="block mb-4">
    <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: C.soft }}>
      {label}
    </span>
    <div className="mt-1">{children}</div>
    {hint && <span style={{ fontSize: 12, color: C.soft }}>{hint}</span>}
  </label>
);

const inputStyle = {
  width: "100%",
  border: `1px solid ${C.line}`,
  borderRadius: 2,
  padding: "9px 11px",
  fontFamily: BODY,
  fontSize: 14,
  color: C.ink,
  outlineColor: C.blue,
};

const Botao = ({ children, onClick, disabled, tom = "azul" }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      fontFamily: DISPLAY,
      fontWeight: 800,
      fontSize: 13,
      letterSpacing: ".04em",
      padding: "12px 22px",
      borderRadius: 2,
      border: tom === "azul" ? "none" : `2px solid ${C.ink}`,
      background: disabled ? C.steel : tom === "azul" ? C.blue : "#fff",
      color: tom === "azul" ? "#fff" : C.ink,
      cursor: disabled ? "not-allowed" : "pointer",
    }}
  >
    {children}
  </button>
);

function Tabela({ titulo, nota, rows, setRows }) {
  const cols = [
    ["nome", "Nome", 2],
    ["descritor", "Descritor", 1],
    ["gasto", "Gasto", 1],
    ["alcance", "Alcance", 1],
    ["impressoes", "Impressões", 1],
    ["cliques", "Cliques", 1],
    ["resultados", "Resultados", 1],
  ];
  const upd = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="mb-8">
      <div className="flex items-baseline justify-between mb-2">
        <h3 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 13, letterSpacing: ".1em", textTransform: "uppercase" }}>{titulo}</h3>
        <button onClick={() => setRows([...rows, emptyRow()])} style={{ fontSize: 12, color: C.blue, fontWeight: 600 }}>
          + linha
        </button>
      </div>
      {nota && <p style={{ fontSize: 12, color: C.soft, margin: "0 0 8px" }}>{nota}</p>}
      <div className="overflow-x-auto" style={{ borderTop: `3px solid ${C.ink}` }}>
        <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 720 }}>
          <thead>
            <tr>
              {cols.map(([k, l]) => (
                <th key={k} style={{ fontFamily: DISPLAY, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: C.soft, textAlign: "left", padding: "8px 6px" }}>
                  {l}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${C.line}` }}>
                {cols.map(([k]) => (
                  <td key={k} style={{ padding: 3 }}>
                    <input value={r[k] ?? ""} onChange={(e) => upd(i, k, e.target.value)} style={{ ...inputStyle, padding: "6px 8px", fontSize: 13 }} />
                  </td>
                ))}
                <td style={{ padding: 3 }}>
                  <button onClick={() => setRows(rows.filter((_, j) => j !== i))} style={{ color: C.soft, fontSize: 16, padding: "0 6px" }} aria-label="Remover linha">
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Aplicação                                                         */
/* ------------------------------------------------------------------ */

export default function GeradorRelatorio() {
  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Archivo:wght@700;800;900&family=Instrument+Sans:wght@400;500;600&display=swap";
    document.head.appendChild(l);
    return () => document.head.removeChild(l);
  }, []);

  const [etapa, setEtapa] = useState(1);
  const [meta, setMeta] = useState({
    assessoria: "",
    posicionamento: "",
    cliente: "",
    periodo: "",
    dataEmissao: new Date().toLocaleDateString("pt-BR"),
    responsavel: "",
    contato: "",
    objetivo: "",
    canal: "whatsapp",
    cicloFechado: "fechado",
  });
  const [logo, setLogo] = useState(null);
  const [prints, setPrints] = useState([]);
  const [criativos, setCriativos] = useState([]);
  const [niveis, setNiveis] = useState({ campanhas: [emptyRow()], conjuntos: [emptyRow()], anuncios: [emptyRow()] });
  const [copy, setCopy] = useState(null);
  const [html, setHtml] = useState("");
  const [carregando, setCarregando] = useState("");
  const [erro, setErro] = useState("");

  const rec = useMemo(() => reconciliar(niveis), [niveis]);
  const totais = niveis.campanhas.some((r) => n(r.gasto)) ? rec.camp : rec.conj;
  const kpis = useMemo(() => calcularKpis(totais), [totais]);

  const setM = (k, v) => setMeta((m) => ({ ...m, [k]: v }));

  const subir = async (e, alvo) => {
    setErro("");
    try {
      const arquivos = await Promise.all([...e.target.files].map(readFile));
      if (alvo === "logo") setLogo(arquivos[0]);
      if (alvo === "prints") setPrints((p) => [...p, ...arquivos]);
      if (alvo === "criativos") setCriativos((p) => [...p, ...arquivos]);
    } catch (err) {
      setErro(err.message);
    }
  };

  /* ---- leitura dos prints ---- */
  async function lerPrints() {
    if (!prints.length) return setErro("Envie ao menos um print do Gerenciador antes de ler os números.");
    setErro("");
    setCarregando("Lendo os prints…");
    try {
      const conteudo = [
        ...prints.map((p) => ({ type: "image", source: { type: "base64", media_type: p.mime, data: p.b64 } })),
        {
          type: "text",
          text:
            "Estes são prints do Gerenciador de Anúncios da Meta, em nível de campanha, conjunto e anúncio. Transcreva os números exatamente como aparecem, sem estimar. Responda SOMENTE com JSON, sem cercas de código, neste formato: " +
            '{"campanhas":[{"nome":"","descritor":"","status":"","gasto":0,"alcance":0,"impressoes":0,"cliques":0,"resultados":0}],"conjuntos":[...],"anuncios":[...]}. ' +
            'Use ponto como separador decimal e null quando o valor não estiver visível no print. Em "descritor" ponha o objetivo ou o público quando aparecer.',
        },
      ];
      const txt = await callClaude([{ role: "user", content: conteudo }]);
      const d = parseJson(txt);
      const norm = (arr) => (Array.isArray(arr) ? arr : []).map((r) => ({ ...emptyRow(), ...r, ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === null ? "" : v])) }));
      setNiveis({ campanhas: norm(d.campanhas), conjuntos: norm(d.conjuntos), anuncios: norm(d.anuncios) });
      setEtapa(2);
    } catch (err) {
      setErro(err.message + " Você pode digitar os números na mão na etapa seguinte.");
      setEtapa(2);
    }
    setCarregando("");
  }

  /* ---- redação ---- */
  async function escrever() {
    setErro("");
    const contexto = JSON.stringify({
      cliente: meta.cliente,
      periodo: meta.periodo,
      objetivo: meta.objetivo,
      canal: meta.canal === "whatsapp+direct" ? "WhatsApp e Direct do Instagram, mas a métrica só conta o WhatsApp" : "somente WhatsApp",
      ciclo: meta.cicloFechado,
      totais: { ...totais, custoPorResultado: totais.resultados ? totais.gasto / totais.resultados : null, frequencia: totais.alcance ? totais.impressoes / totais.alcance : null },
      campanhas: niveis.campanhas.filter((r) => r.nome),
      conjuntos: niveis.conjuntos.filter((r) => r.nome),
      anuncios: niveis.anuncios.filter((r) => r.nome),
      divergencias: rec.divergencias,
    });

    const sistema =
      "Você escreve relatórios de Meta Ads para o dono do negócio, não para o time de marketing. Regras: nunca invente número, use só os que estão nos dados; traduza percentual em frase ('7 em cada 10 que clicam puxam conversa'); o ajuste aparece como oportunidade disponível, nunca como erro cometido; aprendizado é ganho ('o teste já deu a resposta'); toda recomendação carrega o número que a justifica; uma ideia por bloco; nada de emoji, jargão de agência ou parágrafo com mais de quatro linhas. Responda SEMPRE só com JSON válido, sem cercas de código e sem texto fora do JSON.";

    const passos = [
      {
        nome: "Veredito, KPIs e conquistas",
        pedido:
          'Formato: {"veredito":{"frase":"","destaque":"","apoio":""},"notasKpi":["","","","","","","",""],"conquistas":[{"titulo":"","texto":""}],"pictograma":{"destaque":0,"legenda":""}}. A frase do veredito tem no máximo 8 palavras, usa o melhor número da conta (não o problema) e cabe em linhas de até 19 caracteres; "destaque" é a palavra exata da frase que ficará em azul. "apoio" é uma linha explicando em números. As 8 notas, de até 9 palavras cada, seguem esta ordem: resultados, custo por resultado, investimento, alcance, impressões, frequência, CPM, CTR. São exatamente 6 conquistas, cada uma com título de até 5 palavras e um parágrafo curto com o número que sustenta o ponto. O pictograma resume a conta em "de cada 10, X": "destaque" é um inteiro de 1 a 10 derivado dos dados e a legenda explica a proporção em uma linha.',
      },
      {
        nome: "Oportunidades",
        pedido:
          'Formato: {"oportunidades":[{"titulo":"","apoio":"","itens":[{"rotulo":"","valor":""}],"regra":""}] com 3 itens}. Cada oportunidade traz um achado real dos dados (concentração de resultado numa peça, estrutura parada, fadiga de criativo, distribuição de verba, público estreito, etapa não medida). "itens" são de 2 a 4 linhas de dado já formatadas em português. "regra" é a conclusão em uma frase.',
      },
      {
        nome: "Funil e fechamento",
        pedido:
          'Formato: {"funil":[{"etapa":"","valor":"","naoMedida":false,"colunaA":{"titulo":"","itens":["",""]},"colunaB":{"titulo":"","itens":["",""]},"meta":""}],"manter":["","","",""],"ampliar":["","","",""],"porques":[{"etiqueta":"","titulo":"","paragrafos":["","",""],"kpi":{"rotulo":"","valor":""}}],"fechamento":{"recomendacao":"","justificativa":""}}. O funil tem exatamente 4 etapas reais desta conta, da mais ampla para a mais estreita; a quarta pode ser a que ainda não é medida, com valor "não medido" e naoMedida true. Cada coluna do funil tem título de 2 palavras e 2 ou 3 ações curtas, e "meta" é uma frase com o alvo do próximo período. Manter e ampliar têm 4 itens de uma linha cada. São 2 "porquês", explicando o raciocínio das duas recomendações mais importantes. A recomendação final é uma só, com até 12 palavras.',
      },
    ];

    let acc = {};
    for (const p of passos) {
      setCarregando("Escrevendo: " + p.nome + "…");
      try {
        const txt = await callClaude(
          [{ role: "user", content: "Dados da conta em JSON:\n" + contexto + "\n\n" + p.pedido }],
          sistema
        );
        acc = { ...acc, ...parseJson(txt) };
      } catch (err) {
        setErro("Falhou em “" + p.nome + "”: " + err.message);
        setCarregando("");
        return;
      }
    }
    setCopy(acc);
    setHtml(montarHtml({ meta, niveis, kpis, rec, copy: acc, logo, prints, criativos }));
    setCarregando("");
    setEtapa(4);
  }

  const baixar = () => {
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `relatorio-meta-ads-${(meta.cliente || "cliente").toLowerCase().replace(/\s+/g, "-")}.html`;
    a.click();
  };

  const etapas = ["Dados e imagens", "Números", "Reconciliação", "Relatório"];

  return (
    <div style={{ fontFamily: BODY, color: C.ink, background: "#fff", minHeight: "100vh" }}>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <header className="flex items-end justify-between pb-4" style={{ borderBottom: `4px solid ${C.ink}` }}>
          <div>
            <h1 style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 26, margin: 0, letterSpacing: "-.02em" }}>
              Gerador de relatório
            </h1>
            <p style={{ color: C.soft, fontSize: 13, margin: "4px 0 0" }}>Meta Ads · da leitura dos prints ao HTML pronto</p>
          </div>
          <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 12, letterSpacing: ".1em", color: C.blue, textTransform: "uppercase" }}>
            Etapa {etapa} de 4
          </span>
        </header>

        <nav className="flex gap-2 my-5 flex-wrap">
          {etapas.map((e, i) => (
            <button
              key={e}
              onClick={() => setEtapa(i + 1)}
              style={{
                fontFamily: DISPLAY,
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                padding: "7px 12px",
                borderRadius: 2,
                background: etapa === i + 1 ? C.ink : C.tint,
                color: etapa === i + 1 ? "#fff" : C.soft,
              }}
            >
              {e}
            </button>
          ))}
        </nav>

        {erro && (
          <div style={{ background: C.tint, borderLeft: `5px solid ${C.blue}`, padding: "14px 18px", marginBottom: 20, fontSize: 14 }}>{erro}</div>
        )}
        {carregando && (
          <div style={{ background: C.ink, color: "#fff", padding: "14px 18px", marginBottom: 20, fontSize: 14, fontFamily: DISPLAY, fontWeight: 700 }}>
            {carregando}
          </div>
        )}

        {/* ETAPA 1 */}
        {etapa === 1 && (
          <div>
            <div className="grid md:grid-cols-2 gap-x-8">
              <Campo label="Assessoria"><input style={inputStyle} value={meta.assessoria} onChange={(e) => setM("assessoria", e.target.value)} /></Campo>
              <Campo label="Linha de posicionamento"><input style={inputStyle} value={meta.posicionamento} onChange={(e) => setM("posicionamento", e.target.value)} /></Campo>
              <Campo label="Cliente"><input style={inputStyle} value={meta.cliente} onChange={(e) => setM("cliente", e.target.value)} /></Campo>
              <Campo label="Período analisado" hint="Ex.: 1 a 31 de julho de 2026"><input style={inputStyle} value={meta.periodo} onChange={(e) => setM("periodo", e.target.value)} /></Campo>
              <Campo label="Responsável"><input style={inputStyle} value={meta.responsavel} onChange={(e) => setM("responsavel", e.target.value)} /></Campo>
              <Campo label="Contato"><input style={inputStyle} value={meta.contato} onChange={(e) => setM("contato", e.target.value)} /></Campo>
              <Campo label="Data de emissão"><input style={inputStyle} value={meta.dataEmissao} onChange={(e) => setM("dataEmissao", e.target.value)} /></Campo>
              <Campo label="O que o cliente considera resultado" hint="Conversa no WhatsApp, agendamento, venda no balcão…">
                <input style={inputStyle} value={meta.objetivo} onChange={(e) => setM("objetivo", e.target.value)} />
              </Campo>
              <Campo label="Canal de atendimento">
                <select style={inputStyle} value={meta.canal} onChange={(e) => setM("canal", e.target.value)}>
                  <option value="whatsapp">Só botão do WhatsApp</option>
                  <option value="whatsapp+direct">WhatsApp e Direct do Instagram</option>
                </select>
              </Campo>
              <Campo label="Ciclo">
                <select style={inputStyle} value={meta.cicloFechado} onChange={(e) => setM("cicloFechado", e.target.value)}>
                  <option value="fechado">Período fechado</option>
                  <option value="parcial">Ciclo parcial</option>
                </select>
              </Campo>
            </div>

            <h3 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", marginTop: 28, paddingBottom: 8, borderBottom: `3px solid ${C.ink}` }}>
              Imagens
            </h3>
            <div className="grid md:grid-cols-3 gap-6 mt-5">
              <div>
                <Campo label="Logo da assessoria" hint="Envie em 2× do tamanho de exibição (112px ou mais).">
                  <input type="file" accept="image/*" onChange={(e) => subir(e, "logo")} style={{ fontSize: 13 }} />
                </Campo>
                {logo && <img src={src(logo)} alt="Logo carregado" style={{ height: 48 }} />}
              </div>
              <div>
                <Campo label="Prints do Gerenciador" hint="Campanha, conjunto e anúncio.">
                  <input type="file" accept="image/*" multiple onChange={(e) => subir(e, "prints")} style={{ fontSize: 13 }} />
                </Campo>
                {prints.map((p, i) => (
                  <div key={i} className="mb-2">
                    <div style={{ fontSize: 12, color: C.soft }}>{p.name}</div>
                    <input
                      placeholder="O que olhar nesta imagem"
                      value={p.legenda}
                      onChange={(e) => setPrints(prints.map((x, j) => (j === i ? { ...x, legenda: e.target.value } : x)))}
                      style={{ ...inputStyle, padding: "6px 8px", fontSize: 12 }}
                    />
                  </div>
                ))}
              </div>
              <div>
                <Campo label="Prévias do criativo" hint="Duas peças geram a comparação lado a lado.">
                  <input type="file" accept="image/*" multiple onChange={(e) => subir(e, "criativos")} style={{ fontSize: 13 }} />
                </Campo>
                {criativos.map((p, i) => (
                  <div key={i} className="mb-2">
                    <div style={{ fontSize: 12, color: C.soft }}>{p.name}</div>
                    <input
                      placeholder="Uma linha sobre a peça"
                      value={p.legenda}
                      onChange={(e) => setCriativos(criativos.map((x, j) => (j === i ? { ...x, legenda: e.target.value } : x)))}
                      style={{ ...inputStyle, padding: "6px 8px", fontSize: 12 }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <Botao onClick={lerPrints} disabled={!!carregando}>Ler os números dos prints</Botao>
              <Botao tom="linha" onClick={() => setEtapa(2)}>Digitar os números na mão</Botao>
            </div>
          </div>
        )}

        {/* ETAPA 2 */}
        {etapa === 2 && (
          <div>
            <p style={{ color: C.soft, fontSize: 14, maxWidth: "62ch" }}>
              Confira cada linha contra o print antes de seguir. O que você corrigir aqui é o que vai para o relatório — nada é
              preenchido por estimativa.
            </p>
            <Tabela titulo="Campanha" rows={niveis.campanhas} setRows={(r) => setNiveis({ ...niveis, campanhas: r })} />
            <Tabela titulo="Conjuntos" nota="Inclua também os pausados e em rascunho: é onde costuma aparecer verba parada." rows={niveis.conjuntos} setRows={(r) => setNiveis({ ...niveis, conjuntos: r })} />
            <Tabela titulo="Anúncios" rows={niveis.anuncios} setRows={(r) => setNiveis({ ...niveis, anuncios: r })} />
            <Botao onClick={() => setEtapa(3)}>Conferir as somas</Botao>
          </div>
        )}

        {/* ETAPA 3 */}
        {etapa === 3 && (
          <div>
            <div style={{ background: rec.integro ? C.tint : "#fff", borderLeft: `5px solid ${rec.integro ? C.blue : C.ink}`, padding: "18px 22px", marginBottom: 24 }}>
              <b style={{ fontFamily: DISPLAY, fontSize: 15 }}>
                {rec.integro ? "As somas dos três níveis conferem." : "Há divergência entre os níveis."}
              </b>
              {!rec.integro && (
                <ul style={{ fontSize: 14, color: C.soft, margin: "10px 0 0", paddingLeft: 18 }}>
                  {rec.divergencias.map((d, i) => (
                    <li key={i} style={{ marginBottom: 6 }}>{d}</li>
                  ))}
                </ul>
              )}
              <p style={{ fontSize: 13, color: C.soft, margin: "10px 0 0" }}>
                Divergências e lacunas vão para as notas de rodapé do relatório, com ou sem correção.
              </p>
            </div>

            <div className="grid" style={{ gridTemplateColumns: "repeat(4,1fr)", gap: 2, background: C.line, borderTop: `3px solid ${C.ink}`, borderBottom: `3px solid ${C.ink}` }}>
              {kpis.map((k) => (
                <div key={k.rotulo} style={{ background: "#fff", padding: "16px 14px" }}>
                  <span style={{ fontSize: 10, letterSpacing: ".09em", textTransform: "uppercase", color: C.soft, fontWeight: 600 }}>{k.rotulo}</span>
                  <b style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 24, display: "block", marginTop: 4 }}>{k.valor}</b>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 13, color: C.soft, margin: "16px 0 24px" }}>
              Frequência, CPM, CTR e custo por resultado foram recalculados a partir dos números que você confirmou, não copiados do painel.
            </p>
            <Botao onClick={escrever} disabled={!!carregando || !totais.gasto}>Escrever o relatório</Botao>
          </div>
        )}

        {/* ETAPA 4 */}
        {etapa === 4 && html && (
          <div>
            <div className="flex gap-3 mb-5 flex-wrap">
              <Botao onClick={baixar}>Baixar o HTML</Botao>
              <Botao tom="linha" onClick={escrever} disabled={!!carregando}>Escrever de novo</Botao>
              <Botao tom="linha" onClick={() => { const w = window.open(); w.document.write(html); w.document.close(); }}>Abrir em nova aba</Botao>
            </div>
            <p style={{ fontSize: 13, color: C.soft, marginBottom: 12 }}>
              Prévia abaixo. Para o PDF, abra em nova aba e imprima pelo navegador.
            </p>
            <iframe title="Prévia do relatório" srcDoc={html} style={{ width: "100%", height: 700, border: `1px solid ${C.line}` }} />
          </div>
        )}
      </div>
    </div>
  );
}
