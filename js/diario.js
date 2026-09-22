/* =====================================================================
   Gestão Rápida · Programação Campo — Relatório Diário
   Registro das visitas de campo do dia: fazenda, local/talhão, plantio,
   cultura, informações e fotos. Cada relatório recebe um código
   automático (RD-AAAA-0001), dado pelo banco quando o registro sobe.

   Telas: "diario" (lançar / editar) e "diarios" (histórico).
   PDF em A4 retrato, padrão SAKUMA, com o nome do agrônomo no fim e a
   LOP no canto direito do pé da folha. Envio pelo WhatsApp com o nome
   do arquivo e a mensagem "Relatório Diário (data)".
   ===================================================================== */

const BUCKET_DIARIO = 'programacao-diario';
const MAX_INFO = 2000;
const MAX_FOTOS = 8;
const AGRONOMO_PADRAO = 'Matheus Cassiano';
const CARGO_AGRONOMO = 'Eng. Agrônomo';

/* ---------------------------------------------------------------- fotos */

const urlsFoto = new Map();   // caminho → object URL (miniatura na tela)

async function blobFotoDiario(caminho) {
  const local = await blobDaFoto(caminho);
  if (local) return local;
  if (!App.online || !App.sb) return null;
  const { data, error } = await App.sb.storage.from(BUCKET_DIARIO).download(caminho);
  return error ? null : data;
}
async function urlFotoDiario(caminho) {
  if (urlsFoto.has(caminho)) return urlsFoto.get(caminho);
  const b = await blobFotoDiario(caminho);
  if (!b) return null;
  const u = URL.createObjectURL(b);
  urlsFoto.set(caminho, u);
  return u;
}

/* ---------------------------------------------------------------- ajudantes */

const diariosVisiveis = () => q.todos('diarios').filter(d => d.ativo !== false);
const codigoDiario = d => d.codigo || 'aguardando envio';
const visitaVazia = () => ({ fazenda_id: '', local_id: '', plantio: '', cultura_id: '', informacoes: '', fotos: [] });
const dataLonga = iso => {
  const p = partes(iso);
  const dias = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  return `${br(iso)} · ${dias[new Date(p.ano, p.mes - 1, p.dia).getDay()]}`;
};
const nomeArquivoDiario = d =>
  `Relatorio_Diario_${br(d.data).replace(/\//g, '-')}` + (d.codigo ? `_${d.codigo}` : '');
const mensagemDiario = d => {
  const linhas = [`*Relatório Diário (${br(d.data)})*`, 'SAKUMA Agronegócios'];
  if (d.codigo) linhas.push('Código: ' + d.codigo);
  if (d.agronomo) linhas.push(`${d.agronomo} - ${CARGO_AGRONOMO}`);
  (d.visitas || []).forEach((v, i) => linhas.push(`${i + 1}. ${q.nome('fazendas', v.fazenda_id)} – ${q.nome('locais', v.local_id)}` +
    (q.nome('culturas', v.cultura_id) ? ` (${q.nome('culturas', v.cultura_id)})` : '')));
  linhas.push('', 'Arquivo: ' + nomeArquivoDiario(d) + '.pdf');
  return linhas.join('\n');
};

/* Espera o banco devolver o código. Sem internet, segue sem ele. */
async function garantirCodigo(d) {
  if (d.codigo || !App.online) return d;
  for (let i = 0; i < 12 && !d.codigo; i++) {
    await sincronizar();
    const r = q.por_id('diarios', d.id);
    if (r && r.codigo) d.codigo = r.codigo;
    if (!d.codigo) await new Promise(ok => setTimeout(ok, 500));
  }
  return d;
}

/* ---------------------------------------------------------------- lançar */

TELAS.diario = el => {
  const editar = window.diarioEditando || null;
  window.diarioEditando = null;
  const d = editar ? JSON.parse(JSON.stringify(editar)) : {
    id: crypto.randomUUID(), data: hoje(),
    // o último agrônomo usado; no primeiro relatório, o padrão
    agronomo: (diariosVisiveis().slice().sort((x, y) => String(y.criado_em || '').localeCompare(String(x.criado_em || '')))[0] || {}).agronomo || AGRONOMO_PADRAO,
    agronomo_id: App.usuario ? App.usuario.id : null,
    visitas: [visitaVazia()]
  };
  if (!d.visitas || !d.visitas.length) d.visitas = [visitaVazia()];
  const novo = !editar;
  const agronomos = [...new Set([d.agronomo, AGRONOMO_PADRAO,
    ...diariosVisiveis().map(x => x.agronomo)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  el.innerHTML = `
    <div class="rd-topo">
      <div class="rd-titulo">
        <span class="rd-icone" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5M7.5 11h9M7.5 14.5h9M7.5 18h6" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        <div><h1>Relatório Diário</h1><p class="sub">Registro das atividades de campo</p></div>
      </div>
      <div class="rd-cab">
        <div class="campo"><label for="rd-data">Data *</label>
          <input type="date" id="rd-data" value="${esc(d.data)}"></div>
        <div class="campo"><label for="rd-agronomo">Agrônomo *</label>
          <input type="text" id="rd-agronomo" list="rd-agronomos" value="${esc(d.agronomo || '')}" placeholder="Nome do agrônomo">
          <datalist id="rd-agronomos">${agronomos.map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>
        <div class="rd-codigo"><span>Código</span><b>${d.codigo ? esc(d.codigo) : 'automático ao salvar'}</b></div>
      </div>
    </div>
    <div id="rd-visitas"></div>
    <button type="button" class="btn neutro rd-mais" id="rd-mais">+ Adicionar outra visita</button>
    <div class="acoes">
      <button type="button" class="btn" id="rd-salvar">${novo ? 'Salvar' : 'Salvar alterações'}</button>
      <button type="button" class="btn secundario" id="rd-pdf">Salvar e gerar PDF / WhatsApp</button>
      ${novo ? '' : '<button type="button" class="btn neutro" id="rd-voltar">Voltar ao histórico</button>'}
    </div>`;

  const caixa = el.querySelector('#rd-visitas');

  function desenhar() {
    caixa.innerHTML = d.visitas.map((v, i) => `
      <section class="rd-visita" data-i="${i}">
        <header><h2>${i + 1}. Registro da Visita</h2>
          ${d.visitas.length > 1 ? `<button type="button" class="rd-remover" data-rem="${i}">🗑 Remover</button>` : ''}</header>
        <div class="rd-corpo">
          <div class="rd-grade">
            <div class="campo"><label>Fazenda *</label>
              <select data-c="fazenda_id">${opcoes(fazendasOrdenadas(), v.fazenda_id, 'Selecione')}</select></div>
            <div class="campo"><label>Local / Talhão *</label>
              <select data-c="local_id">${opcoesLocalDaFazenda(v.fazenda_id, v.local_id)}</select></div>
            <div class="campo"><label>Plantio</label>
              <input type="text" data-c="plantio" value="${esc(v.plantio || '')}" placeholder="Digite (se necessário)"></div>
            <div class="campo"><label>Cultura *</label>
              <select data-c="cultura_id">${opcoes(q.ordenado('culturas'), v.cultura_id, 'Selecione')}</select></div>
          </div>
          <div class="campo"><label>Informações *</label>
            <textarea data-c="informacoes" maxlength="${MAX_INFO}" rows="5"
              placeholder="Descreva as atividades, observações, condições da lavoura, pragas, doenças, recomendações, etc.">${esc(v.informacoes || '')}</textarea>
            <p class="ajuda rd-conta">${(v.informacoes || '').length}/${MAX_INFO}</p></div>
          <label class="rd-lbl">Fotos (opcional)</label>
          <div class="rd-fotos">
            ${v.fotos.length < MAX_FOTOS ? `<label class="rd-soltar">
              <input type="file" accept="image/jpeg,image/png" multiple hidden data-arq="${i}">
              <span class="rd-cam" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h3l2-2.5h6L17 7h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" fill="#51534A"/><circle cx="12" cy="13" r="4" fill="#fff"/><circle cx="12" cy="13" r="2.4" fill="#51534A"/></svg></span>
              <span>Clique para adicionar fotos<br>ou arraste os arquivos aqui<br><small>(JPG, PNG)</small></span>
            </label>` : ''}
            ${v.fotos.map((c, k) => `<div class="rd-foto"><img data-foto="${esc(c)}" alt="Foto ${k + 1}">
              <button type="button" data-tira="${i}:${k}" aria-label="Tirar a foto">×</button></div>`).join('')}
          </div>
        </div>
      </section>`).join('');

    caixa.querySelectorAll('.rd-visita').forEach(sec => {
      const i = +sec.dataset.i, v = d.visitas[i];
      const campo = c => sec.querySelector(`[data-c="${c}"]`);
      sec.querySelectorAll('[data-c]').forEach(c => {
        c.oninput = c.onchange = () => {
          v[c.dataset.c] = c.value;
          if (c.dataset.c === 'informacoes') sec.querySelector('.rd-conta').textContent = `${c.value.length}/${MAX_INFO}`;
        };
      });
      campo('fazenda_id').onchange = () => {
        v.fazenda_id = campo('fazenda_id').value;
        if (v.local_id && fazendaDoLocal(v.local_id) !== v.fazenda_id) v.local_id = '';
        campo('local_id').innerHTML = opcoesLocalDaFazenda(v.fazenda_id, v.local_id);
      };
      // local com cultura fixa (abacate, café) preenche a cultura sozinho
      campo('local_id').onchange = () => {
        v.local_id = campo('local_id').value;
        const l = q.por_id('locais', v.local_id);
        if (l && !v.fazenda_id) { v.fazenda_id = l.fazenda_id; campo('fazenda_id').value = l.fazenda_id; }
        if (l && l.cultura_id) { v.cultura_id = l.cultura_id; campo('cultura_id').value = l.cultura_id; }
      };
      const arq = sec.querySelector('[data-arq]');
      if (arq) arq.onchange = () => { addFotos(i, arq.files); arq.value = ''; };
      const zona = sec.querySelector('.rd-soltar');
      if (zona) {
        zona.ondragover = e => { e.preventDefault(); zona.classList.add('sobre'); };
        zona.ondragleave = () => zona.classList.remove('sobre');
        zona.ondrop = e => { e.preventDefault(); zona.classList.remove('sobre'); addFotos(i, e.dataTransfer.files); };
      }
    });
    caixa.querySelectorAll('[data-rem]').forEach(b => b.onclick = () => {
      const v = d.visitas[+b.dataset.rem];
      if ((v.informacoes || v.fotos.length) && !confirm('Remover esta visita e o que foi escrito nela?')) return;
      d.visitas.splice(+b.dataset.rem, 1);
      desenhar();
    });
    caixa.querySelectorAll('[data-tira]').forEach(b => b.onclick = () => {
      const [i, k] = b.dataset.tira.split(':').map(Number);
      d.visitas[i].fotos.splice(k, 1);
      desenhar();
    });
    caixa.querySelectorAll('img[data-foto]').forEach(async img => {
      const u = await urlFotoDiario(img.dataset.foto);
      if (u) img.src = u; else img.closest('.rd-foto').classList.add('sem');
    });
  }

  async function addFotos(i, lista) {
    const v = d.visitas[i];
    const arqs = [...lista].filter(f => /^image\/(jpe?g|png)$/i.test(f.type));
    if (!arqs.length) return aviso('Use fotos JPG ou PNG.', true);
    const cabe = MAX_FOTOS - v.fotos.length;
    if (arqs.length > cabe) aviso(`Cabem até ${MAX_FOTOS} fotos por visita.`, true);
    for (const f of arqs.slice(0, cabe)) {
      try {
        const caminho = await guardarFoto(f, BUCKET_DIARIO, d.id);
        urlsFoto.set(caminho, URL.createObjectURL(f));
        v.fotos.push(caminho);
      } catch (e) { console.error(e); aviso('Não consegui ler a foto ' + f.name, true); }
    }
    desenhar();
  }

  el.querySelector('#rd-mais').onclick = () => {
    const ult = d.visitas[d.visitas.length - 1];
    d.visitas.push(Object.assign(visitaVazia(), { fazenda_id: ult ? ult.fazenda_id : '' }));
    desenhar();
    caixa.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  if (!novo) el.querySelector('#rd-voltar').onclick = () => irPara('diarios');

  async function salvar() {
    d.data = el.querySelector('#rd-data').value;
    d.agronomo = el.querySelector('#rd-agronomo').value.trim().replace(/\s+/g, ' ');
    if (!d.data) return aviso('Falta informar a data.', true), null;
    if (!d.agronomo) return aviso('Falta informar o agrônomo.', true), null;
    for (const [i, v] of d.visitas.entries()) {
      const n = d.visitas.length > 1 ? ` na visita ${i + 1}` : '';
      if (!v.fazenda_id) return aviso('Falta a fazenda' + n + '.', true), null;
      if (!v.local_id) return aviso('Falta o local / talhão' + n + '.', true), null;
      if (!v.cultura_id) return aviso('Falta a cultura' + n + '.', true), null;
      if (!(v.informacoes || '').trim()) return aviso('Faltam as informações' + n + '.', true), null;
      v.plantio = (v.plantio || '').trim();
      v.informacoes = v.informacoes.trim();
    }
    const agora = new Date().toISOString();
    d.ativo = true;
    d.atualizado_em = agora;
    if (App.usuario) d.atualizado_por = App.usuario.id;
    if (!d.criado_em) { d.criado_em = agora; d.criado_por = App.usuario ? App.usuario.id : null; }
    const reg = await gravar('diarios', d);
    aviso(novo ? 'Relatório diário salvo.' : 'Alterações salvas.');
    return reg;
  }

  el.querySelector('#rd-salvar').onclick = async () => {
    const r = await salvar();
    if (!r) return;
    await garantirCodigo(r);
    irPara('diarios');
  };
  el.querySelector('#rd-pdf').onclick = async () => {
    const r = await salvar();
    if (!r) return;
    abrirPdfDiario(r);
  };

  desenhar();
};

/* locais só da fazenda escolhida (sem fazenda: todos, agrupados) */
function opcoesLocalDaFazenda(fazendaId, valor) {
  if (!fazendaId) return opcoesLocais(valor, 'Selecione');
  return opcoes(locaisOrdenados().filter(l => l.fazenda_id === fazendaId), valor, 'Selecione');
}

/* ---------------------------------------------------------------- histórico */

const filtroDiario = { de: '', ate: '', fazenda: '', agronomo: '', busca: '' };

TELAS.diarios = el => {
  const f = filtroDiario;
  if (!f.de) {
    const p = partes(hoje());
    f.de = montaData(p.ano, p.mes, 1);
    f.ate = montaData(p.ano, p.mes, diasNoMes(p.ano, p.mes));
  }
  const agronomos = [...new Set(diariosVisiveis().map(x => x.agronomo).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  el.innerHTML = `
    <h1>Histórico do Relatório Diário</h1>
    <p class="sub">Todos os relatórios lançados, com o código de cada um. Toque em <strong>Abrir</strong> para ver ou corrigir,
      ou em <strong>PDF / WhatsApp</strong> para enviar.</p>
    <div class="filtros pc-filtros">
      <label>De <input type="date" data-f="de" value="${esc(f.de)}"></label>
      <label>Até <input type="date" data-f="ate" value="${esc(f.ate)}"></label>
      <select data-f="fazenda">${opcoes(fazendasOrdenadas(), f.fazenda, 'Todas as fazendas')}</select>
      <select data-f="agronomo">${opcoes(agronomos, f.agronomo, 'Todos os agrônomos')}</select>
      <input type="search" data-f="busca" value="${esc(f.busca)}" placeholder="Buscar código, local, texto…">
    </div>
    <div class="acoes"><button type="button" class="btn" id="rh-novo">+ Novo relatório diário</button></div>
    <div id="rh-lista"></div>`;

  el.querySelectorAll('[data-f]').forEach(c => {
    c.oninput = c.onchange = () => { f[c.dataset.f] = c.value; lista(); };
  });
  el.querySelector('#rh-novo').onclick = () => irPara('diario');

  function filtrados() {
    const b = f.busca.trim().toLowerCase();
    return diariosVisiveis().filter(d =>
      (!f.de || d.data >= f.de) && (!f.ate || d.data <= f.ate) &&
      (!f.agronomo || d.agronomo === f.agronomo) &&
      (!f.fazenda || (d.visitas || []).some(v => v.fazenda_id === f.fazenda)) &&
      (!b || [d.codigo, d.agronomo, br(d.data), ...(d.visitas || []).flatMap(v =>
        [q.nome('fazendas', v.fazenda_id), q.nome('locais', v.local_id), q.nome('culturas', v.cultura_id), v.plantio, v.informacoes])]
        .filter(Boolean).join(' ').toLowerCase().includes(b))
    ).sort((a, b2) => b2.data.localeCompare(a.data) || String(b2.codigo || '~').localeCompare(String(a.codigo || '~')));
  }

  function lista() {
    const ls = filtrados();
    const nVis = ls.reduce((s, d) => s + (d.visitas || []).length, 0);
    const nFot = ls.reduce((s, d) => s + (d.visitas || []).reduce((t, v) => t + (v.fotos || []).length, 0), 0);
    el.querySelector('#rh-lista').innerHTML = `
      <div class="painel pc-ind">
        <div class="cartao"><b>${ls.length}</b><span>relatórios</span></div>
        <div class="cartao"><b>${nVis}</b><span>visitas</span></div>
        <div class="cartao"><b>${nFot}</b><span>fotos</span></div>
      </div>
      ${ls.length ? `<div class="rolagem"><table class="tabela pc-grade rd-tab"><thead><tr>
        <th>Código</th><th>Data</th><th>Agrônomo</th><th>Visitas</th><th class="ce">Fotos</th><th></th>
      </tr></thead><tbody>${ls.map(d => {
        const fotos = (d.visitas || []).reduce((t, v) => t + (v.fotos || []).length, 0);
        return `<tr>
          <td><span class="codigo">${d.codigo ? esc(d.codigo) : '<span class="pc-falta">aguardando envio</span>'}</span></td>
          <td>${br(d.data)}<br><small>${esc(diaSemana(d.data))}</small></td>
          <td>${esc(d.agronomo || '')}</td>
          <td>${(d.visitas || []).map(v => `<div class="rd-vis-lin"><b>${esc(q.nome('fazendas', v.fazenda_id))}</b> – ${esc(q.nome('locais', v.local_id))}
            <span class="pc-cor" style="background:${esc(corCultura(v.cultura_id))}"></span>${esc(q.nome('culturas', v.cultura_id))}${v.plantio ? ` · ${esc(v.plantio)}` : ''}</div>`).join('')}</td>
          <td class="ce">${fotos || '—'}</td>
          <td class="rd-acoes">
            <button type="button" class="btn neutro" data-abrir="${d.id}">Abrir</button>
            <button type="button" class="btn secundario" data-pdf="${d.id}">PDF / WhatsApp</button>
            <button type="button" class="btn neutro pc-excluir" data-exc="${d.id}">Excluir</button>
          </td></tr>`;
      }).join('')}</tbody>
      <tfoot><tr class="pc-total"><td colspan="6">Total: ${ls.length} relatório${ls.length === 1 ? '' : 's'} · ${nVis} visita${nVis === 1 ? '' : 's'}</td></tr></tfoot>
      </table></div>` : '<div class="vazio"><p>Nenhum relatório diário nesse período.</p></div>'}`;

    el.querySelectorAll('[data-abrir]').forEach(b => b.onclick = () => {
      window.diarioEditando = q.por_id('diarios', b.dataset.abrir);
      irPara('diario');
    });
    el.querySelectorAll('[data-pdf]').forEach(b => b.onclick = () => abrirPdfDiario(q.por_id('diarios', b.dataset.pdf)));
    el.querySelectorAll('[data-exc]').forEach(b => b.onclick = async () => {
      const d = q.por_id('diarios', b.dataset.exc);
      if (!confirm(`Excluir o relatório ${codigoDiario(d)} de ${br(d.data)}?`)) return;
      d.ativo = false;
      d.atualizado_em = new Date().toISOString();
      await gravar('diarios', d);
      aviso('Relatório excluído.');
      lista();
    });
  }
  lista();
};

/* ---------------------------------------------------------------- PDF */

async function dadosImagem(blob) {
  const url = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
  const dim = await new Promise(ok => { const i = new Image(); i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => ok(null); i.src = url; });
  return dim ? { url, ...dim, tipo: blob.type.includes('png') ? 'PNG' : 'JPEG' } : null;
}

async function montarPdfDiario(d) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const L = doc.internal.pageSize.getWidth(), A = doc.internal.pageSize.getHeight();
  const M = 12, W = L - 2 * M, BAIXO = A - 16;
  const emitido = new Date();
  const emitidoTxt = emitido.toLocaleDateString('pt-BR') + ' ' + emitido.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const sakuma = await imagemPdf('img/sakuma-logo.png');
  const lop = await imagemPdf('img/lop-marca.png');
  const cod = d.codigo || 'aguardando envio';

  /* ---- cabeçalho */
  const hLogo = 15, wLogo = hLogo * sakuma.w / sakuma.h;
  doc.addImage(sakuma.url, sakuma.tipo, M, 8, wLogo, hLogo);
  const xT = M + wLogo + 5;
  doc.setTextColor(COR.marrom); doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
  doc.text('Relatório Diário', xT, 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(COR.cinza);
  doc.text('Registro das atividades de campo', xT, 19.3);
  // código e data à direita
  doc.setFillColor(COR.verdeClaro); doc.setDrawColor(COR.verdeLinha); doc.setLineWidth(0.3);
  doc.roundedRect(L - M - 52, 7.5, 52, 16, 1.5, 1.5, 'FD');
  doc.setFontSize(7.5); doc.setTextColor(COR.cinzaClaro);
  doc.text('CÓDIGO', L - M - 26, 11.6, { align: 'center' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(d.codigo ? COR.marrom : COR.cinzaClaro);
  doc.text(cod, L - M - 26, 17, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(COR.cinza);
  doc.text(br(d.data), L - M - 26, 21.4, { align: 'center' });
  doc.setDrawColor(COR.verde); doc.setLineWidth(0.9);
  doc.line(M, 27, L - M, 27);

  /* ---- dados do dia */
  let y = 31;
  const fazendas = [...new Set((d.visitas || []).map(v => q.nome('fazendas', v.fazenda_id)).filter(Boolean))];
  doc.autoTable({
    startY: y, margin: { left: M, right: M },
    theme: 'grid',
    head: [['Data', 'Agrônomo', 'Fazenda(s)', 'Visitas']],
    body: [[dataLonga(d.data), d.agronomo || '', fazendas.join(', '), String((d.visitas || []).length)]],
    styles: { font: 'helvetica', fontSize: 9, textColor: COR.cinza, lineColor: COR.verdeLinha, lineWidth: 0.2,
              cellPadding: 1.8, fillColor: COR.verdeClaro },
    headStyles: { fillColor: COR.verde, textColor: COR.branco, fontStyle: 'bold', lineColor: COR.verde },
    columnStyles: { 0: { cellWidth: 48 }, 1: { cellWidth: 52 }, 3: { cellWidth: 18, halign: 'center' } }
  });
  y = doc.lastAutoTable.finalY + 6;

  const novaFolha = () => { doc.addPage(); y = 14; };

  /* ---- visitas */
  for (const [i, v] of (d.visitas || []).entries()) {
    if (y > BAIXO - 40) novaFolha();
    // faixa da visita
    doc.setFillColor(COR.verdeTotal); doc.setDrawColor(COR.verdeLinha); doc.setLineWidth(0.3);
    doc.rect(M, y, W, 7.5, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(COR.marrom);
    doc.text(`${i + 1}. Registro da Visita`, M + 2.5, y + 5.1);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(COR.cinza);
    doc.text(`${q.nome('fazendas', v.fazenda_id)} · ${q.nome('locais', v.local_id)}`, L - M - 2.5, y + 5.1, { align: 'right' });
    y += 7.5;

    doc.autoTable({
      startY: y, margin: { left: M, right: M },
      theme: 'grid',
      head: [['Fazenda', 'Local / Talhão', 'Plantio', 'Cultura']],
      body: [[q.nome('fazendas', v.fazenda_id), q.nome('locais', v.local_id), v.plantio || '—', q.nome('culturas', v.cultura_id)]],
      styles: { font: 'helvetica', fontSize: 9, textColor: COR.cinza, lineColor: COR.verdeLinha, lineWidth: 0.2,
                cellPadding: 1.8, fillColor: COR.branco },
      headStyles: { fillColor: COR.verdeClaro, textColor: COR.marrom, fontStyle: 'bold', lineColor: COR.verdeLinha },
    });
    y = doc.lastAutoTable.finalY + 4;

    // informações
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(COR.marrom);
    if (y > BAIXO - 12) novaFolha();
    doc.text('Informações', M, y + 1); y += 3;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(COR.cinza);
    const linhas = doc.splitTextToSize(v.informacoes || '', W - 6);
    const hL = 4.4;
    let k = 0;
    while (k < linhas.length) {
      const cabem = Math.max(1, Math.floor((BAIXO - y - 5) / hL));
      const parte = linhas.slice(k, k + cabem);
      const alt = parte.length * hL + 4;
      doc.setFillColor(COR.verdeClaro); doc.setDrawColor(COR.verdeLinha); doc.setLineWidth(0.25);
      doc.rect(M, y, W, alt, 'FD');
      doc.text(parte, M + 3, y + 4.8);
      y += alt; k += parte.length;
      if (k < linhas.length) novaFolha();
    }
    y += 4;

    // fotos: 3 por linha
    const fotos = [];
    for (const c of (v.fotos || [])) {
      const b = await blobFotoDiario(c);
      const img = b ? await dadosImagem(b) : null;
      if (img) fotos.push(img);
    }
    if (fotos.length) {
      const gap = 4, wF = (W - 2 * gap) / 3, hF = wF * 0.75;
      if (y > BAIXO - hF - 6) novaFolha();
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(COR.marrom);
      doc.text(`Fotos (${fotos.length})`, M, y + 1); y += 3;
      fotos.forEach((img, n) => {
        const col = n % 3;
        if (col === 0 && n > 0) y += hF + gap;
        if (col === 0 && y + hF > BAIXO) novaFolha();
        const x = M + col * (wF + gap);
        doc.setFillColor(COR.verdeClaro); doc.setDrawColor(COR.verdeLinha); doc.setLineWidth(0.25);
        doc.rect(x, y, wF, hF, 'FD');
        // encaixa a foto inteira na moldura, sem cortar
        const esc2 = Math.min(wF / img.w, hF / img.h);
        const w = img.w * esc2, h = img.h * esc2;
        doc.addImage(img.url, img.tipo, x + (wF - w) / 2, y + (hF - h) / 2, w, h, undefined, 'FAST');
      });
      y += hF + 6;
    }
    y += 2;
  }

  /* ---- agrônomo: só o nome em negrito e o cargo, sem linha de assinatura */
  if (y > BAIXO - 14) novaFolha();
  y += 6;
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  const nomeAg = d.agronomo || '';
  const wNome = doc.getTextWidth(nomeAg);
  doc.setFont('helvetica', 'normal');
  const cargo = ' - ' + CARGO_AGRONOMO;
  const wCargo = doc.getTextWidth(cargo);
  const x0 = (L - wNome - wCargo) / 2;
  doc.setFont('helvetica', 'bold'); doc.setTextColor(COR.marrom);
  doc.text(nomeAg, x0, y);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(COR.cinza);
  doc.text(cargo, x0 + wNome, y);

  /* ---- pé de todas as folhas */
  const total = doc.getNumberOfPages();
  const hLop = 7, wLop = hLop * lop.w / lop.h;
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(COR.verde); doc.setLineWidth(0.4); doc.line(M, A - 10, L - M, A - 10);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2); doc.setTextColor(COR.cinzaClaro);
    doc.text(`SAKUMA Agronegócios · ${cod} · emitido em ${emitidoTxt}`, M, A - 4.5);
    doc.text(`Página ${p} de ${total}`, L / 2 + 14, A - 4.5, { align: 'center' });
    doc.setFontSize(7);
    const wFrase = doc.getTextWidth(FRASE_LOP);
    const xFrase = L - M - wFrase;
    const yImg = A - 8.6;
    doc.addImage(lop.url, lop.tipo, xFrase - 1.6 - wLop, yImg, wLop, hLop);
    doc.text(FRASE_LOP, xFrase, yImg + hLop * 0.725 + 0.85);
  }
  return doc;
}

/* ---------------------------------------------------------------- entrega */

async function abrirPdfDiario(d) {
  if (!d) return;
  if (!window.jspdf || !window.jspdf.jsPDF) return aviso('O gerador de PDF não carregou. Abra o app com internet uma vez.', true);
  aviso('Montando o PDF…');
  await garantirCodigo(d);
  let doc;
  try { doc = await montarPdfDiario(d); }
  catch (e) { console.error(e); return aviso('Não consegui montar o PDF: ' + e.message, true); }
  const nome = nomeArquivoDiario(d).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_') + '.pdf';
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const msg = mensagemDiario(d).replace(/Arquivo: .*$/, 'Arquivo: ' + nome);

  abrirModal('Relatório Diário pronto', `
    <p class="sub"><strong>${esc(nome)}</strong><br>${esc(d.codigo || 'Código sai quando o registro subir (sem internet agora)')}
      · ${(d.visitas || []).length} visita(s)</p>
    <iframe class="pc-pdf" src="${url}" title="Prévia do relatório diário"></iframe>
    <div class="acoes">
      <button type="button" class="btn rd-zap" id="rd-zap">Enviar pelo WhatsApp</button>
      <a class="btn secundario" href="${url}" download="${esc(nome)}" id="rd-baixar">Baixar PDF</a>
      <button type="button" class="btn neutro" id="rd-imp">Imprimir</button>
    </div>`, corpo => {
    corpo.querySelector('#rd-imp').onclick = () => {
      const fr = corpo.querySelector('.pc-pdf');
      try { fr.contentWindow.focus(); fr.contentWindow.print(); }
      catch (e) { window.open(url, '_blank'); }
    };
    corpo.querySelector('#rd-zap').onclick = async () => {
      const arq = new File([blob], nome, { type: 'application/pdf' });
      // celular: compartilha o PDF com a mensagem (escolher o WhatsApp na lista)
      if (navigator.canShare && navigator.canShare({ files: [arq] })) {
        try { await navigator.share({ files: [arq], title: `Relatório Diário (${br(d.data)})`, text: msg.replace(/\*/g, '') }); return; }
        catch (e) { if (e.name === 'AbortError') return; }
      }
      // computador: baixa o PDF e abre o WhatsApp com a mensagem para anexar
      corpo.querySelector('#rd-baixar').click();
      window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
      aviso('PDF baixado. Anexe o arquivo na conversa do WhatsApp.');
    };
  });
}

Object.assign(window, { abrirPdfDiario, montarPdfDiario });
