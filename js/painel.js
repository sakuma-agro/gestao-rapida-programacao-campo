/* =====================================================================
   Gestão Rápida · Programação Campo — painel anual
   O quadro da parede: locais nas linhas, 12 meses × 4 semanas nas colunas.
   ===================================================================== */

const filtroPainel = {
  ano: null, fazenda: '', cultura: '', operador: '', mes: '',
  status: new Set(['Planejado', 'Em andamento', 'Atrasado'])
};

TELAS.painel = el => {
  document.body.classList.add('modo-quadro');
  const f = filtroPainel;
  const agora = chaveSemana(hoje());
  if (!f.ano) f.ano = agora.ano;
  // no celular, abre um mês por vez
  if (!f.mesTocado && window.innerWidth < 760) f.mes = String(agora.mes);

  const anos = new Set([agora.ano, agora.ano + 1]);
  atividadesVisiveis().forEach(a => anos.add(partes(a.data).ano));

  el.innerHTML = `
    <h1>Painel anual ${f.ano}</h1>
    <p class="sub">Toque numa semana para ver, concluir ou lançar. No computador dá para arrastar a atividade para outra semana.</p>
    <details class="pc-maisfiltros" ${window.innerWidth >= 760 || f.abertos ? 'open' : ''}>
    <summary>Filtros e status</summary>
    <div class="filtros pc-filtros">
      <select data-p="ano">${[...anos].sort().map(a => `<option${a === f.ano ? ' selected' : ''}>${a}</option>`).join('')}</select>
      <select data-p="mes">${opcoes(MESES.map((m, i) => ({ id: String(i + 1), nome: m })), f.mes, 'Ano inteiro')}</select>
      <select data-p="fazenda">${opcoes(fazendasOrdenadas(), f.fazenda, 'Todas as fazendas')}</select>
      <select data-p="cultura">${opcoes(q.ordenado('culturas'), f.cultura, 'Todas as culturas')}</select>
      <select data-p="operador">${opcoes(q.ordenado('operadores'), f.operador, 'Todos os operadores')}</select>
    </div>
    <div class="pc-status">${STATUS_TODOS.map(s => `<label class="pc-cx ${STATUS_CLASSE[s]}">
      <input type="checkbox" data-st="${esc(s)}" ${f.status.has(s) ? 'checked' : ''}> ${esc(s)}</label>`).join('')}
    </div>
    </details>
    <div class="pc-barra-quadro">
      <div class="legenda pc-legenda">${q.ordenado('culturas').map(c =>
      `<span class="lg"><i style="background:${esc(c.cor)}"></i>${esc(c.nome)}</span>`).join('')}</div>
      <div class="pc-zoom" role="group" aria-label="Tamanho do painel">
        <button type="button" class="btn neutro" data-z="-1" title="Diminuir">A−</button>
        <span id="pn-zv"></span>
        <button type="button" class="btn neutro" data-z="1" title="Ampliar">A+</button>
        <button type="button" class="btn neutro" id="pn-cheia">Tela cheia</button>
      </div>
      <button type="button" class="btn" id="pn-novo">Lançar atividade</button>
    </div>
    <div class="rolagem pc-rolagem" id="pn-quadro"></div>`;

  // tamanho do painel: fica guardado neste aparelho
  const lerZoom = () => { try { return Number(localStorage.getItem('pc.zoom')) || 1.25; } catch (e) { return 1.25; } };
  const aplicarZoom = z => {
    z = Math.min(2.2, Math.max(0.8, Math.round(z * 100) / 100));
    try { localStorage.setItem('pc.zoom', z); } catch (e) { /* sem armazenamento */ }
    el.querySelector('#pn-quadro').style.setProperty('--z', z);
    el.querySelector('#pn-zv').textContent = Math.round(z * 100) + '%';
    return z;
  };
  let zoom = aplicarZoom(lerZoom());
  el.querySelectorAll('[data-z]').forEach(b => b.onclick = () => { zoom = aplicarZoom(zoom + 0.15 * Number(b.dataset.z)); });
  el.querySelector('#pn-cheia').onclick = () => {
    const q = el.querySelector('#pn-quadro');
    if (document.fullscreenElement) document.exitFullscreen();
    else if (q.requestFullscreen) q.requestFullscreen().catch(() => aviso('Este aparelho não abre em tela cheia.', true));
  };

  el.querySelectorAll('[data-p]').forEach(s => s.onchange = () => {
    f[s.dataset.p] = s.dataset.p === 'ano' ? Number(s.value) : s.value;
    if (s.dataset.p === 'mes') f.mesTocado = true;
    f.abertos = true;
    TELAS.painel(el);
  });
  el.querySelectorAll('[data-st]').forEach(cx => cx.onchange = () => {
    cx.checked ? f.status.add(cx.dataset.st) : f.status.delete(cx.dataset.st);
    desenharQuadro();
  });
  el.querySelector('#pn-novo').onclick = () => irPara('lancar');

  function desenharQuadro() {
    const meses = f.mes ? [Number(f.mes)] : MESES.map((_, i) => i + 1);
    const ativs = atividadesVisiveis().filter(a => {
      const p = partes(a.data);
      if (p.ano !== f.ano || !meses.includes(p.mes)) return false;
      if (f.cultura && a.cultura_id !== f.cultura) return false;
      if (f.operador && a.operador_id !== f.operador) return false;
      return f.status.has(statusDe(a));
    });
    const cel = {};
    ativs.forEach(a => {
      const k = a.local_id + '|' + partes(a.data).mes + '|' + semanaDe(a.data);
      (cel[k] = cel[k] || []).push(a);
    });

    const colAgora = agora.ano === f.ano ? agora.mes + '|' + agora.semana : '';
    // no ano inteiro, os locais aparecem de novo entre junho e julho, como no quadro da parede
    const meio = meses.includes(6) && meses.includes(7) ? 6 : 0;
    let html = `<table class="pc-quadro"><thead><tr><th class="pc-loc" rowspan="2">Local</th>
      ${meses.map(m => `<th colspan="4" class="pc-mes${m === agora.mes && agora.ano === f.ano ? ' agora' : ''}">${MESES[m - 1]}</th>` +
        (m === meio ? '<th class="pc-loc2" rowspan="2">Local</th>' : '')).join('')}</tr>
      <tr>${meses.map(m => [1, 2, 3, 4].map(s =>
        `<th class="pc-sem${colAgora === m + '|' + s ? ' agora' : ''}${s === 1 ? ' ini' : ''}">S${s}</th>`).join('')).join('')}</tr></thead><tbody>`;

    fazendasOrdenadas().filter(fz => !f.fazenda || fz.id === f.fazenda).forEach(fz => {
      const locais = locaisOrdenados().filter(l => l.fazenda_id === fz.id);
      if (!locais.length) return;
      html += meio
        ? `<tr class="pc-faz"><th class="pc-loc">${esc(fz.nome)}</th><td colspan="${meses.filter(m => m <= meio).length * 4}"></td>` +
          `<th class="pc-loc2">${esc(fz.nome)}</th><td colspan="${meses.filter(m => m > meio).length * 4}"></td></tr>`
        : `<tr class="pc-faz"><th class="pc-loc">${esc(fz.nome)}</th><td colspan="${meses.length * 4}"></td></tr>`;
      locais.forEach(l => {
        html += `<tr><th class="pc-loc">${esc(l.nome)}</th>`;
        meses.forEach(m => [1, 2, 3, 4].forEach(s => {
          const lista = (cel[l.id + '|' + m + '|' + s] || []).sort((a, b) => a.data.localeCompare(b.data));
          html += `<td class="pc-cel${colAgora === m + '|' + s ? ' agora' : ''}${s === 1 ? ' ini' : ''}"
            data-local="${l.id}" data-mes="${m}" data-sem="${s}">${lista.map(a => `
            <div class="pc-etq ${STATUS_CLASSE[statusDe(a)]}" draggable="true" data-id="${a.id}"
              style="--cor:${esc(corCultura(a.cultura_id))}"
              title="${esc(br(a.data) + ' · ' + nomeAtividade(a) + ' – ' + q.nome('culturas', a.cultura_id) + ' · ' + statusDe(a) + (a.operador_id ? ' · ' + q.nome('operadores', a.operador_id) : ''))}">
              <b>${partes(a.data).dia}</b> ${esc(nomeAtividade(a))} – ${esc(q.nome('culturas', a.cultura_id))}</div>`).join('')}</td>`;
          if (m === meio && s === 4) html += `<th class="pc-loc2">${esc(l.nome)}</th>`;
        }));
        html += '</tr>';
      });
    });
    html += '</tbody></table>';
    const q2 = el.querySelector('#pn-quadro');
    q2.innerHTML = html;

    // rola até a semana atual
    // abre com o mês atual logo depois da coluna dos locais
    if (!f.mes && agora.ano === f.ano) {
      const ths = q2.querySelectorAll('thead tr:nth-child(2) th');
      const ini = ths[(agora.mes - 1) * 4];
      const loc = q2.querySelector('thead th.pc-loc');
      if (ini && loc) q2.scrollLeft = Math.max(0, ini.offsetLeft - loc.getBoundingClientRect().width - 4);
    }

    q2.querySelectorAll('.pc-etq').forEach(e => {
      e.onclick = ev => { ev.stopPropagation(); abrirAtividade(e.dataset.id, desenharQuadro); };
      e.ondragstart = ev => { ev.dataTransfer.setData('text/plain', e.dataset.id); e.classList.add('arrastando'); };
      e.ondragend = () => e.classList.remove('arrastando');
    });
    q2.querySelectorAll('.pc-cel').forEach(td => {
      td.onclick = () => abrirCelula(td.dataset.local, f.ano, Number(td.dataset.mes), Number(td.dataset.sem), desenharQuadro);
      td.ondragover = ev => { ev.preventDefault(); td.classList.add('alvo'); };
      td.ondragleave = () => td.classList.remove('alvo');
      td.ondrop = async ev => {
        ev.preventDefault(); td.classList.remove('alvo');
        const a = q.por_id('atividades', ev.dataTransfer.getData('text/plain'));
        if (!a) return;
        const m = Number(td.dataset.mes), s = Number(td.dataset.sem);
        const mesmoLocal = td.dataset.local === a.local_id;
        if (!mesmoLocal) return aviso('Arraste só dentro da linha do mesmo local. Para trocar o local, abra a atividade.', true);
        if (mesmaSemana(a.data, { ano: f.ano, mes: m, semana: s })) return;
        // sugere o mesmo dia da semana dentro da nova semana, sem passar do fim
        const desloc = (partes(a.data).dia - 1) % 7;
        let dia = (s - 1) * 7 + 1 + desloc;
        const fim = partes(fimSemana(f.ano, m, s)).dia;
        if (dia > fim) dia = fim;
        const ok = await reprogramar(a, montaData(f.ano, m, dia));
        if (ok) desenharQuadro();
      };
    });
  }
  desenharQuadro();
};

/* A célula do quadro: tudo daquele local na semana, com ações rápidas. */
function abrirCelula(localId, ano, mes, semana, depois) {
  const s = { ano, mes, semana };
  const l = q.por_id('locais', localId);
  const lista = atividadesVisiveis().filter(a => a.local_id === localId && mesmaSemana(a.data, s))
    .sort((a, b) => a.data.localeCompare(b.data));
  abrirModal(`${l ? l.nome : ''} · ${rotuloSemana(s)}`, `
    <p class="sub">De ${br(inicioSemana(ano, mes, semana))} a ${br(fimSemana(ano, mes, semana))}.</p>
    ${lista.length ? '<ul class="lista">' + lista.map(a => `
      <li data-id="${a.id}">
        <div class="info"><strong>${esc(nomeAtividade(a))} – ${esc(q.nome('culturas', a.cultura_id))}</strong>
          <small>${br(a.data)} · ${esc(q.nome('operadores', a.operador_id) || 'operador a definir')}${maqImpl(a) ? ' · ' + esc(maqImpl(a)) : ''}</small></div>
        ${etqStatus(a)}
        <div class="pc-mini">
          ${statusDe(a) !== 'Concluído' ? '<button type="button" class="btn" data-ac="concluir">Concluir</button>' : ''}
          <button type="button" class="btn secundario" data-ac="reprogramar">Reprogramar</button>
          <button type="button" class="btn neutro" data-ac="abrir">Abrir</button>
        </div>
      </li>`).join('') + '</ul>' : '<div class="vazio"><p>Nada programado nesta semana.</p></div>'}
    <div class="acoes"><button type="button" class="btn" id="cl-novo">Lançar nesta semana</button></div>`, corpo => {
    corpo.querySelectorAll('li[data-id]').forEach(li => li.querySelectorAll('[data-ac]').forEach(b => b.onclick = async () => {
      const a = q.por_id('atividades', li.dataset.id);
      if (b.dataset.ac === 'abrir') return abrirAtividade(a.id, depois);
      const ok = await acaoRapida(a, b.dataset.ac);
      if (ok) { fecharModal(); depois(); }
    }));
    corpo.querySelector('#cl-novo').onclick = () => {
      fecharModal();
      const d = mesmaSemana(hoje(), s) ? hoje() : inicioSemana(ano, mes, semana);
      window.baseLancamento = { local_id: localId, data: d };
      irPara('lancar');
    };
  });
}

window.abrirCelula = abrirCelula;
