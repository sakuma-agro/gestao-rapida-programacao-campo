/* =====================================================================
   Gestão Rápida · Programação Campo — quem entra vê o quê

   O login é o mesmo dos outros Gestão Rápida (tabela manutencao.usuarios).
   Entra aqui quem é administrador ou tem o módulo "programacao" marcado.
   Por cima disso, cada pessoa pode ficar presa a algumas fazendas
   (programacao.usuario_fazendas). Sem fazenda marcada, vê todas.
   ===================================================================== */

const MODULOS = [
  { id: 'programacao', nome: 'Programação', telas: [
    ['painel', 'Painel anual'],
    ['lancar', 'Lançar atividade'],
    ['atividades', 'Atividades'],
  ] },
  { id: 'diario', nome: 'Relatório Diário', telas: [
    ['diario', 'Lançar diário'],
    ['diarios', 'Histórico'],
  ] },
  { id: 'reuniao', nome: 'Reunião semanal', telas: [
    ['reuniao', 'Reunião semanal'],
  ] },
  { id: 'relatorio', nome: 'Relatórios', telas: [
    ['relatorio', 'Relatório em PDF'],
  ] },
  /* Cadastro muda o app para todo mundo — só administrador. */
  { id: 'cadastros', nome: 'Cadastros', admin: true, telas: [
    ['cadastros', 'Cadastros'],
    ['importar', 'Importar planilha'],
  ] },
];

const Acesso = { admin: false, carregado: false };

const soAdmin = new Set(MODULOS.filter(m => m.admin).flatMap(m => m.telas.map(([t]) => t)));
const moduloDe = tela => MODULOS.find(m => m.telas.some(([t]) => t === tela))?.id || null;

function podeTela(tela) {
  if (Acesso.admin) return true;
  if (soAdmin.has(tela)) return false;
  return !!moduloDe(tela);
}
const telasLiberadas = id => {
  const m = MODULOS.find(x => x.id === id);
  return m ? m.telas.filter(([t]) => podeTela(t)) : [];
};
const modulosLiberados = () => MODULOS.filter(m => telasLiberadas(m.id).length);

function carregarAcesso(u) {
  Acesso.admin = !!(u && (u.admin || u.perfil === 'ADMINISTRADOR'));
  Acesso.carregado = true;
  return Acesso;
}

/* ---------------------------------------------------------------- menu */

let moduloAberto = null;

function montarMenu() {
  $('#menu').innerHTML = modulosLiberados().map(m =>
    `<button type="button" data-modulo="${m.id}">${esc(m.nome)}</button>`).join('')
    + (Acesso.admin ? '<button type="button" data-modulo="config">Configurações</button>' : '');
  $$('#menu button').forEach(b => b.onclick = () => abrirModulo(b.dataset.modulo));
  $('#menu').hidden = false;
  mostrarInicio();
}

function mostrarInicio() {
  moduloAberto = null;
  $$('#menu button').forEach(b => b.classList.remove('ativo'));
  $('#menu2').hidden = true;
  $('#menu2').innerHTML = '';
  TELAS.marca($('#tela'));
}

function desenharMenu2(id) {
  const telas = telasLiberadas(id);
  $('#menu2').hidden = telas.length < 2;
  $('#menu2').innerHTML = telas.map(([t, rot]) =>
    `<button type="button" data-tela="${t}">${esc(rot)}</button>`).join('');
  $$('#menu2 button').forEach(b => b.onclick = () => irPara(b.dataset.tela));
}

function abrirModulo(id, tela) {
  if (!id) return;
  moduloAberto = id;
  $$('#menu button').forEach(b => b.classList.toggle('ativo', b.dataset.modulo === id));
  if (id === 'config') {
    document.body.classList.remove('sem-rodape', 'modo-quadro');
    $('#menu2').hidden = true;
    $('#menu2').innerHTML = '';
    TELAS.config($('#tela'));
    return;
  }
  const telas = telasLiberadas(id);
  if (!telas.length) return;
  desenharMenu2(id);
  irPara(telas.some(([t]) => t === tela) ? tela : telas[0][0]);
}

function marcarMenu(tela) {
  const m = moduloDe(tela);
  if (!m) return;
  if (m !== moduloAberto) {
    moduloAberto = m;
    $$('#menu button').forEach(b => b.classList.toggle('ativo', b.dataset.modulo === m));
    desenharMenu2(m);
  }
  $$('#menu2 button').forEach(b => b.classList.toggle('ativo', b.dataset.tela === tela));
}

/* ---------------------------------------------------------------- tela de marca */

TELAS.marca = el => {
  document.body.classList.add('sem-rodape');
  const s = chaveSemana(hoje());
  const ativs = atividadesVisiveis();
  const daSemana = ativs.filter(a => mesmaSemana(a.data, s) && a.status !== 'Cancelado');
  const atrasadas = ativs.filter(a => statusDe(a) === 'Atrasado');
  el.innerHTML = `
    <section class="marca-inicio">
      <img class="mi-sakuma" src="img/sakuma-marca-vertical.png" alt="SAKUMA Agronegócios">
      <h2>Gestão Rápida <span>Programação Campo</span></h2>
      <p class="mi-dica">Hoje é ${esc(diaSemana(hoje()))}, ${br(hoje())} — <strong>${esc(rotuloSemana(s))}</strong>.</p>
      <div class="pc-atalhos">
        <button type="button" class="btn" data-ir="lancar">Lançar atividade</button>
        <button type="button" class="btn secundario" data-ir="diario">Relatório diário</button>
        <button type="button" class="btn secundario" data-ir="painel">Painel anual</button>
        <button type="button" class="btn secundario" data-ir="reuniao">Reunião semanal
          <small>${daSemana.length} nesta semana</small></button>
        ${atrasadas.length ? `<button type="button" class="btn pc-alerta" data-ir="atividades" data-filtro="Atrasado">
          ${atrasadas.length} atrasada${atrasadas.length > 1 ? 's' : ''}</button>` : ''}
      </div>
      <div class="lop-ass mi-lop" role="img" aria-label="Desenvolvido por LOP — Inteligência para o agronegócio">
    <img src="img/lop-marca.png" alt=""><span class="lop-div"></span>
    <span class="lop-txt"><b>DESENVOLVIDO POR LOP</b><span>INTELIGÊNCIA PARA O AGRONEGÓCIO</span></span>
  </div>
    </section>`;
  el.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => {
    if (b.dataset.filtro) window.filtroInicialAtividades = { status: b.dataset.filtro };
    irPara(b.dataset.ir);
  });
};

/* ---------------------------------------------------------------- configurações

   A lista de gente é a mesma dos outros apps. Aqui só se liga ou desliga o
   acesso à Programação Campo e se escolhe as fazendas de cada um. Pessoa nova
   é criada no Gestão Rápida (Pessoas ou Manutenções). */

let gente = [];

TELAS.config = async el => {
  if (!Acesso.admin) {
    el.innerHTML = '<h1>Configurações</h1><p class="sub">Só administrador mexe nesta lista.</p>';
    return;
  }
  if (!App.online) {
    el.innerHTML = '<h1>Configurações</h1><p class="sub">Mexer em acesso precisa de internet.</p>';
    return;
  }
  el.innerHTML = '<section class="carregando"><p>Buscando a lista de gente…</p></section>';
  const { data, error } = await App.sb.schema('manutencao').from('usuarios').select('*').order('nome');
  if (error) {
    el.innerHTML = `<h1>Configurações</h1><p class="sub">Não consegui ler a lista: ${esc(error.message)}</p>`;
    return;
  }
  gente = data || [];
  const r = await App.sb.from('usuario_fazendas').select('*');
  if (!r.error) { App.dados.usuario_fazendas = r.data; await gravarLocal('usuario_fazendas', r.data); }
  desenharConfig(el);
};

function desenharConfig(el) {
  const eu = (App.usuario || {}).id;
  const faz = fazendasOrdenadas();
  const uf = q.todos('usuario_fazendas');
  el.innerHTML = `
    <h1>Configurações</h1>
    <p class="sub">Quem entra na Programação Campo e quais fazendas enxerga. O login é o mesmo dos
      outros apps Gestão Rápida. Toque no nome para gerar senha nova ou tirar o acesso.
      Sem nenhuma fazenda marcada, a pessoa vê todas.</p>
    <div class="acoes"><button type="button" class="btn" id="cf-nova">Nova pessoa</button></div>
    <div class="rolagem">
    <table class="tabela"><thead><tr>
      <th>Pessoa</th><th class="ce">Acesso</th>
      ${faz.map(f => `<th class="ce">${esc(f.nome)}</th>`).join('')}
    </tr></thead><tbody>
    ${gente.map(u => {
      const adm = u.admin || u.perfil === 'ADMINISTRADOR';
      const tem = adm || (u.modulos || []).includes('programacao');
      return `<tr>
        <td><button type="button" class="pc-nome" data-pessoa="${u.id}">${esc(u.nome || u.email)}</button>${u.id === eu ? ' <span class="etq ok">você</span>' : ''}
          ${adm ? ' <span class="etq neutro">administrador</span>' : ''}
          <br><small>${esc(u.usuario || u.email || '')}</small>
          ${u.ativo === false ? '<br><span class="etq inativo">inativo</span>' : ''}</td>
        <td class="ce"><input type="checkbox" class="cf-acesso" data-id="${u.id}" ${tem ? 'checked' : ''}
          ${adm ? 'disabled title="Administrador enxerga tudo"' : ''}></td>
        ${faz.map(f => `<td class="ce"><input type="checkbox" class="cf-faz" data-id="${u.id}" data-faz="${f.id}"
          ${uf.some(x => x.usuario_id === u.id && x.fazenda_id === f.id) ? 'checked' : ''}
          ${adm ? 'disabled title="Administrador vê todas as fazendas"' : ''}></td>`).join('')}
      </tr>`;
    }).join('')}
    </tbody></table></div>`;

  const recarregar = () => TELAS.config(el);
  $('#cf-nova').onclick = () => novaPessoa(recarregar);
  $$('[data-pessoa]').forEach(b => b.onclick = () => fichaPessoa(gente.find(x => x.id === b.dataset.pessoa), recarregar));

  $$('.cf-acesso').forEach(cx => cx.onchange = async () => {
    const u = gente.find(x => x.id === cx.dataset.id);
    const lista = new Set(u.modulos || []);   // os módulos dos outros apps ficam como estão
    cx.checked ? lista.add('programacao') : lista.delete('programacao');
    const { error } = await App.sb.schema('manutencao').from('usuarios')
      .update({ modulos: [...lista] }).eq('id', u.id);
    if (error) { cx.checked = !cx.checked; return aviso('Não salvou: ' + error.message, true); }
    u.modulos = [...lista];
    aviso(cx.checked ? `${u.nome} agora entra na Programação Campo.` : `Acesso de ${u.nome} retirado.`);
  });

  $$('.cf-faz').forEach(cx => cx.onchange = async () => {
    const reg = { usuario_id: cx.dataset.id, fazenda_id: cx.dataset.faz };
    const r = cx.checked
      ? await App.sb.from('usuario_fazendas').insert(reg)
      : await App.sb.from('usuario_fazendas').delete().match(reg);
    if (r.error) { cx.checked = !cx.checked; return aviso('Não salvou: ' + r.error.message, true); }
    const lista = q.todos('usuario_fazendas').filter(x => !(x.usuario_id === reg.usuario_id && x.fazenda_id === reg.fazenda_id));
    if (cx.checked) lista.push(reg);
    App.dados.usuario_fazendas = lista;
    aviso('Fazendas atualizadas.');
  });
}

Object.assign(window, {
  MODULOS, Acesso, podeTela, carregarAcesso, montarMenu, mostrarInicio, abrirModulo, marcarMenu
});
