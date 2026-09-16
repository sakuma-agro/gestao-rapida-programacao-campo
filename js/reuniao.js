/* =====================================================================
   Gestão Rápida · Programação Campo — reunião semanal
   Semana anterior (programado × feito), semana atual e próxima semana,
   com ações rápidas e as anotações da reunião.
   ===================================================================== */

const estadoReuniao = { semana: null, fazenda: '' };

function atividadesDaSemana(s, fazenda) {
  return atividadesVisiveis().filter(a => mesmaSemana(a.data, s) &&
    (!fazenda || fazendaDoLocal(a.local_id) === fazenda))
    .sort((a, b) => a.data.localeCompare(b.data) ||
      q.nome('locais', a.local_id).localeCompare(q.nome('locais', b.local_id), 'pt-BR'));
}

function indicadores(lista) {
  const c = { total: 0, concluido: 0, atrasado: 0, andamento: 0, planejado: 0, cancelado: 0 };
  lista.forEach(a => {
    const s = statusDe(a);
    if (s === 'Cancelado') { c.cancelado++; return; }
    c.total++;
    if (s === 'Concluído') c.concluido++;
    else if (s === 'Atrasado') c.atrasado++;
    else if (s === 'Em andamento') c.andamento++;
    else c.planejado++;
  });
  c.pct = c.total ? Math.round(c.concluido * 100 / c.total) : 0;
  return c;
}

function reuniaoDe(s, fazenda) {
  return q.todos('reunioes').find(r => r.ano === s.ano && r.mes === s.mes && r.semana === s.semana &&
    (r.fazenda_id || '') === (fazenda || ''));
}

TELAS.reuniao = el => {
  document.body.classList.remove('modo-quadro');
  const E = estadoReuniao;
  if (!E.semana) E.semana = chaveSemana(hoje());
  const s = E.semana;
  const ant = semanaVizinha(s, -1), prox = semanaVizinha(s, 1);
  const atual = atividadesDaSemana(s, E.fazenda);
  const ind = indicadores(atual);
  const indAnt = indicadores(atividadesDaSemana(ant, E.fazenda));
  const reu = reuniaoDe(s, E.fazenda) || {};

  el.innerHTML = `
    <h1>Reunião semanal</h1>
    <div class="pc-navsem">
      <button type="button" class="btn neutro" id="rn-ant" aria-label="Semana anterior">‹</button>
      <div><strong>${esc(rotuloSemana(s))}</strong>
        <small>${br(inicioSemana(s.ano, s.mes, s.semana))} a ${br(fimSemana(s.ano, s.mes, s.semana))}</small></div>
      <button type="button" class="btn neutro" id="rn-prox" aria-label="Próxima semana">›</button>
      <button type="button" class="btn-fantasma" id="rn-hoje">Semana atual</button>
      <select id="rn-faz">${opcoes(fazendasOrdenadas(), E.fazenda, 'Todas as fazendas')}</select>
    </div>

    <div class="painel pc-ind">
      <div class="cartao"><b>${ind.total}</b><span>programadas</span></div>
      <div class="cartao pc-c-ok"><b>${ind.concluido}</b><span>concluídas</span></div>
      <div class="cartao"><b>${ind.andamento + ind.planejado}</b><span>a fazer</span></div>
      <div class="cartao ${ind.atrasado ? 'alerta' : ''}"><b>${ind.atrasado}</b><span>atrasadas</span></div>
      <div class="cartao"><b>${ind.pct}%</b><span>cumprimento</span></div>
      <div class="cartao"><b>${indAnt.pct}%</b><span>semana anterior</span></div>
    </div>

    <div class="pc-reuniao">
      <section>${blocoSemana('Semana anterior — programado × feito', ant, E.fazenda, true)}</section>
      <section>${blocoSemana('Esta semana', s, E.fazenda)}</section>
      <section>${blocoSemana('Próxima semana', prox, E.fazenda)}</section>
    </div>

    <section class="pc-cartao">
      <h2>Anotações da reunião</h2>
      <div class="colunas">
        ${campoTexto('Data da reunião', 'data_reuniao', reu.data_reuniao || hoje(), 'date')}
        ${campoTexto('Participantes', 'participantes', reu.participantes || '')}
      </div>
      ${campoArea('Anotações, decisões e combinados', 'anotacoes', reu.anotacoes || '')}
      <div class="acoes">
        <button type="button" class="btn" id="rn-salvar">Salvar anotações</button>
        <button type="button" class="btn secundario" id="rn-pdf">Relatório da reunião (PDF)</button>
        <button type="button" class="btn secundario" id="rn-lancar">Lançar atividade</button>
      </div>
    </section>`;

  const mudar = n => { E.semana = n; TELAS.reuniao(el); };
  el.querySelector('#rn-ant').onclick = () => mudar(ant);
  el.querySelector('#rn-prox').onclick = () => mudar(prox);
  el.querySelector('#rn-hoje').onclick = () => mudar(chaveSemana(hoje()));
  el.querySelector('#rn-faz').onchange = e => { E.fazenda = e.target.value; TELAS.reuniao(el); };
  el.querySelector('#rn-lancar').onclick = () => {
    window.baseLancamento = { data: mesmaSemana(hoje(), s) ? hoje() : inicioSemana(s.ano, s.mes, s.semana) };
    irPara('lancar');
  };

  el.querySelectorAll('[data-rid]').forEach(b => b.onclick = async () => {
    const a = q.por_id('atividades', b.dataset.rid);
    if (b.dataset.ac === 'abrir') return abrirAtividade(a.id, () => TELAS.reuniao(el));
    const ok = await acaoRapida(a, b.dataset.ac);
    if (ok) TELAS.reuniao(el);
  });

  const salvarNotas = async () => {
    const f = lerForm(el.querySelector('.pc-cartao'));
    const r = Object.assign({}, reu, {
      id: reu.id || crypto.randomUUID(), ano: s.ano, mes: s.mes, semana: s.semana,
      fazenda_id: E.fazenda || null, data_reuniao: f.data_reuniao,
      participantes: f.participantes, anotacoes: f.anotacoes, ativo: true,
      atualizado_em: new Date().toISOString()
    });
    await gravar('reunioes', r);
    return r;
  };
  el.querySelector('#rn-salvar').onclick = async () => { await salvarNotas(); aviso('Anotações salvas.'); };
  el.querySelector('#rn-pdf').onclick = async () => {
    const r = await salvarNotas();
    gerarRelatorio({
      titulo: 'Relatório da reunião semanal',
      periodo: rotuloSemana(s) + ` (${br(inicioSemana(s.ano, s.mes, s.semana))} a ${br(fimSemana(s.ano, s.mes, s.semana))})`,
      fazenda: E.fazenda,
      lista: atividadesDaSemana(s, E.fazenda),
      blocos: [
        { titulo: 'Semana anterior — ' + rotuloSemana(ant), lista: atividadesDaSemana(ant, E.fazenda) },
        { titulo: 'Próxima semana — ' + rotuloSemana(prox), lista: atividadesDaSemana(prox, E.fazenda) }
      ],
      reuniao: r,
      arquivo: `Reuniao_S${s.semana}_${MESES[s.mes - 1]}_${s.ano}`
    });
  };
};

function blocoSemana(titulo, s, fazenda, retrospectiva = false) {
  const lista = atividadesDaSemana(s, fazenda);
  const ind = indicadores(lista);
  return `<h2>${esc(titulo)}</h2>
    <p class="sub">${esc(rotuloSemana(s))} · ${ind.total} programada${ind.total === 1 ? '' : 's'}${retrospectiva ? ` · ${ind.concluido} feita${ind.concluido === 1 ? '' : 's'} (${ind.pct}%)` : ''}</p>
    ${lista.length ? '<ul class="lista pc-rlista">' + lista.map(a => {
      const st = statusDe(a);
      return `<li class="${STATUS_CLASSE[st]}">
        <div class="info"><strong>${esc(nomeAtividade(a))} – ${esc(q.nome('culturas', a.cultura_id))}</strong>
          <small>${br(a.data)} (${esc(diaSemana(a.data))}) · ${esc(q.nome('locais', a.local_id))}</small>
          <small>${esc(q.nome('operadores', a.operador_id) || 'operador a definir')}${maqImpl(a) ? ' · ' + esc(maqImpl(a)) : ''}</small></div>
        ${etqStatus(st)}
        <div class="pc-mini">
          ${st !== 'Concluído' && st !== 'Cancelado' ? `<button type="button" class="btn" data-rid="${a.id}" data-ac="concluir">Concluir</button>` : ''}
          ${pendente(st) && st !== 'Em andamento' ? `<button type="button" class="btn secundario" data-rid="${a.id}" data-ac="andamento">Em andamento</button>` : ''}
          ${pendente(st) ? `<button type="button" class="btn secundario" data-rid="${a.id}" data-ac="reprogramar">Reprogramar</button>` : ''}
          ${pendente(st) ? `<button type="button" class="btn neutro" data-rid="${a.id}" data-ac="cancelar">Cancelar</button>` : ''}
          <button type="button" class="btn-fantasma" data-rid="${a.id}" data-ac="abrir">Abrir</button>
        </div></li>`;
    }).join('') + '</ul>' : '<div class="vazio"><p>Nada programado.</p></div>'}`;
}

Object.assign(window, { atividadesDaSemana, indicadores });
