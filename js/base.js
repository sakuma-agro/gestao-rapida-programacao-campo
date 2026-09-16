/* =====================================================================
   Gestão Rápida · Programação Campo — núcleo do aplicativo
   Mesmo núcleo do Gestão Rápida (Manutenções).
   Base local completa em IndexedDB + fila de saída (outbox) + sincronização.
   Regra: nada é considerado salvo até o servidor confirmar.
   ===================================================================== */

const App = {
  sb: null,            // cliente Supabase
  usuario: null,       // registro da tabela usuarios
  locais: [],          // locais que o usuário enxerga
  dados: {},           // cópia em memória da base local, para a tela renderizar rápido
  online: navigator.onLine,
  pendentes: 0
};

/* Tabelas que o app baixa inteiras para funcionar sem sinal.
   Sem isto o mecânico abre a OS no pátio e não vê o código da peça. */
const TABELAS_BASE = [
  'fazendas', 'culturas', 'locais', 'tipos_atividade', 'operadores',
  'maquinas', 'implementos', 'usuario_fazendas',
  // o que muda toda semana: vem sempre de novo quando há internet
  'atividades', 'reunioes'
];

/* Colunas que o BANCO gera (identity ALWAYS). Nunca vão no envio: o Postgres
   recusa INSERT/UPSERT com valor nelas. Depois do OK o app lê o número de volta. */
const GERADAS_NO_BANCO = {
  atividades: ['ano', 'mes', 'semana']
};

/* ---------------------------------------------------------------- IndexedDB */
let idb = null;

function abrirBase() {
  return new Promise((ok, erro) => {
    const req = indexedDB.open('gr-programacao-campo', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('cache')) {
        const s = db.createObjectStore('cache', { keyPath: ['tabela', 'id'] });
        s.createIndex('por_tabela', 'tabela');
      }
      if (!db.objectStoreNames.contains('fila')) {
        db.createObjectStore('fila', { keyPath: 'uuid' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'chave' });
      }
      // Fotos ficam guardadas como Blob até o servidor confirmar o envio.
      if (!db.objectStoreNames.contains('fotos')) {
        db.createObjectStore('fotos', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => { idb = req.result; ok(idb); };
    req.onerror = () => erro(req.error);
  });
}

function tx(store, modo = 'readonly') {
  return idb.transaction(store, modo).objectStore(store);
}

function promessa(req) {
  return new Promise((ok, erro) => {
    req.onsuccess = () => ok(req.result);
    req.onerror = () => erro(req.error);
  });
}

/* A tabela parametros tem "chave" como identificador, não "id". */
const CHAVE_PK = {};

/* Tabelas de ligação não têm id próprio: a chave é o par de ids. Sem isto o
   IndexedDB recusa a linha inteira ("key path yielded a value that is not a
   valid key") e derruba a carga da base toda. Só leitura — o app não grava
   nessas tabelas. */
const CHAVE_COMPOSTA = { usuario_fazendas: ['usuario_id', 'fazenda_id'] };

function pk(tabela) { return CHAVE_PK[tabela] || 'id'; }
function idDe(tabela, registro) {
  const partes = CHAVE_COMPOSTA[tabela];
  if (partes) return partes.map(c => registro[c]).join('|');
  return registro[pk(tabela)];
}

async function gravarLocal(tabela, linhas) {
  const s = tx('cache', 'readwrite');
  for (const l of linhas) {
    const id = idDe(tabela, l);
    // uma linha sem chave não pode derrubar a gravação das outras
    if (id === undefined || id === null || id === '') {
      console.warn('linha sem chave, não gravada localmente:', tabela, l);
      continue;
    }
    s.put({ tabela, id, dado: l });
  }
  return new Promise(ok => { s.transaction.oncomplete = () => ok(true); });
}

async function limparLocal(tabela) {
  const s = tx('cache', 'readwrite');
  const chaves = await promessa(s.index('por_tabela').getAllKeys(tabela));
  chaves.forEach(k => s.delete(k));
  return new Promise(ok => { s.transaction.oncomplete = () => ok(true); });
}

async function lerLocal(tabela) {
  const s = tx('cache').index('por_tabela');
  const res = await promessa(s.getAll(tabela));
  return res.map(r => r.dado);
}

async function meta(chave, valor) {
  if (valor === undefined) {
    const r = await promessa(tx('meta').get(chave));
    return r ? r.valor : null;
  }
  return promessa(tx('meta', 'readwrite').put({ chave, valor }));
}

/* ---------------------------------------------------------------- fila de saída */

/* Todo registro feito offline entra aqui com identificador próprio gerado no
   aparelho e carimbo do PREENCHIMENTO — não do envio. */
async function enfileirar(tabela, registro, operacao = 'upsert') {
  const item = {
    uuid: tabela + ':' + (idDe(tabela, registro) || crypto.randomUUID()),
    tabela, operacao, registro,
    preenchido_em: new Date().toISOString(),
    status: 'pendente',
    tentativas: 0,
    erro: null
  };
  await promessa(tx('fila', 'readwrite').put(item));
  await contarFila();
  sincronizar();          // tenta na hora; se não der, fica na fila
  return item;
}

async function itensDaFila() {
  return promessa(tx('fila').getAll());
}

async function contarFila() {
  const itens = await itensDaFila();
  let fotos = 0;
  try { fotos = (await promessa(tx('fotos').getAll())).filter(f => f.status !== 'enviada').length; }
  catch (e) { /* base antiga, sem a store de fotos */ }
  App.pendentes = itens.filter(i => i.status !== 'enviado').length + fotos;
  pintarEstado();
  return App.pendentes;
}

let sincronizando = false;
let deNovo = false;   // algo entrou na fila enquanto enviava

/* Envia a fila. Idempotente: o mesmo item reenviado usa o mesmo id,
   então o upsert no servidor não duplica. */
async function sincronizar() {
  if (!App.online || !App.sb || !App.usuario) return;
  if (sincronizando) { deNovo = true; return; }
  sincronizando = true;
  try {
    // Na ordem em que foi preenchido: cadastro novo sobe antes da atividade que usa ele.
    const itens = (await itensDaFila()).filter(i => i.status !== 'enviado')
      .sort((x, y) => String(x.preenchido_em).localeCompare(String(y.preenchido_em)));
    for (const item of itens) {
      try {
        let r;
        if (item.operacao === 'upsert') {
          const envio = Object.assign({}, item.registro);
          (GERADAS_NO_BANCO[item.tabela] || []).forEach(c => delete envio[c]);
          r = await App.sb.from(item.tabela)
                .upsert(envio, { onConflict: pk(item.tabela) }).select();
          // O servidor devolve o registro completo (com o número que ele gerou):
          // guardo na base local para a tela mostrar o nº da anomalia / OS.
          if (!r.error && r.data && r.data[0]) {
            const salvo = r.data[0];
            await gravarLocal(item.tabela, [salvo]);
            const lista = App.dados[item.tabela] || [];
            const i = lista.findIndex(x => x[pk(item.tabela)] === salvo[pk(item.tabela)]);
            if (i >= 0) Object.assign(lista[i], salvo); else lista.push(salvo);
          }
        } else if (item.operacao === 'excluir') {
          // Cadastro em uso nunca é apagado: "excluir" aqui é inativar.
          r = await App.sb.from(item.tabela).update({ ativo: false })
                .eq(pk(item.tabela), idDe(item.tabela, item.registro));
        }
        if (r.error) throw r.error;
        // Só sai da fila depois do OK do servidor.
        await promessa(tx('fila', 'readwrite').delete(item.uuid));
      } catch (e) {
        item.status = 'erro';
        item.tentativas += 1;
        item.erro = e.message || String(e);
        await promessa(tx('fila', 'readwrite').put(item));
      }
    }
  } finally {
    sincronizando = false;
    await contarFila();
    if (deNovo) { deNovo = false; setTimeout(sincronizar, 300); }
  }
}

/* ---------------------------------------------------------------- fotos

   A foto do adesivo é obrigatória para concluir a OS. Ela é comprimida no
   aparelho, guardada como Blob e só sobe depois — uma por vez, para não
   travar em conexão fraca de fazenda. */

async function comprimirFoto(arquivo, larguraMax = 1600) {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, larguraMax / bitmap.width);
  const cv = document.createElement('canvas');
  cv.width = Math.round(bitmap.width * escala);
  cv.height = Math.round(bitmap.height * escala);
  cv.getContext('2d').drawImage(bitmap, 0, 0, cv.width, cv.height);
  return new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.82));
}

/* Guarda a foto no aparelho e devolve o caminho que ela terá no Storage. */
async function guardarFoto(arquivo, bucket, prefixo) {
  const blob = await comprimirFoto(arquivo);
  const id = crypto.randomUUID();
  const caminho = prefixo + '/' + id + '.jpg';
  await promessa(tx('fotos', 'readwrite').put({
    id, bucket, caminho, blob, status: 'pendente',
    registrado_em: new Date().toISOString()
  }));
  await contarFila();
  enviarFotos();
  return caminho;
}

/* Devolve o Blob de uma foto guardada no aparelho, ou null se já não estiver aqui. */
async function blobDaFoto(caminho) {
  try {
    const todas = await promessa(tx('fotos').getAll());
    const f = todas.find(x => x.caminho === caminho);
    return f ? f.blob : null;
  } catch (e) { return null; }
}

async function fotosPendentes() {
  const todas = await promessa(tx('fotos').getAll());
  return todas.filter(f => f.status !== 'enviada');
}

let enviandoFotos = false;
async function enviarFotos() {
  if (enviandoFotos || !App.online || !App.sb) return;
  enviandoFotos = true;
  try {
    for (const f of await fotosPendentes()) {
      const { error } = await App.sb.storage.from(f.bucket)
        .upload(f.caminho, f.blob, { contentType: 'image/jpeg', upsert: true });
      if (!error || (error.message || '').includes('already exists')) {
        f.status = 'enviada';
        await promessa(tx('fotos', 'readwrite').put(f));
      }
    }
  } finally {
    enviandoFotos = false;
    await contarFila();
  }
}

/* ---------------------------------------------------------------- gravação */

/* Grava um registro: aplica na base local na hora (o usuário vê o resultado
   mesmo sem sinal) e põe na fila para subir. */
async function gravar(tabela, registro) {
  const chave = pk(tabela);
  if (!registro[chave]) registro[chave] = crypto.randomUUID();
  await gravarLocal(tabela, [registro]);
  const lista = App.dados[tabela] || [];
  const i = lista.findIndex(x => x[chave] === registro[chave]);
  if (i >= 0) lista[i] = registro; else lista.push(registro);
  App.dados[tabela] = lista;
  await enfileirar(tabela, registro);
  return registro;
}

async function inativar(tabela, id) {
  const reg = (App.dados[tabela] || []).find(x => x[pk(tabela)] === id);
  if (reg) { reg.ativo = false; await gravar(tabela, reg); }
}

/* ---------------------------------------------------------------- carga da base */

async function baixarBase(forcar = false) {
  if (!App.online) return false;
  const versao = await meta('versao_base');
  const baixadaEm = await meta('baixada_em');
  const recente = baixadaEm && (Date.now() - new Date(baixadaEm).getTime() < 6 * 3600 * 1000);
  if (!forcar && recente && versao === CONFIG.VERSAO_BASE) return false;

  for (const t of TABELAS_BASE) {
    // O servidor devolve no máximo 1000 linhas por vez: busco em páginas.
    let data = [], error = null;
    for (let de = 0; ; de += 1000) {
      const r = await App.sb.from(t).select('*').range(de, de + 999);
      if (r.error) { error = r.error; break; }
      data = data.concat(r.data || []);
      if (!r.data || r.data.length < 1000) break;
    }
    if (error) { console.warn('não baixou', t, error.message); continue; }
    // apaga o que sumiu do servidor (ex.: fazenda tirada da pessoa)
    await limparLocal(t);
    // o que foi feito aqui e ainda não subiu continua valendo na tela
    const pend = (await itensDaFila()).filter(i => i.tabela === t && i.status !== 'enviado');
    pend.forEach(i => {
      const id = idDe(t, i.registro);
      const k = data.findIndex(x => idDe(t, x) === id);
      if (k >= 0) data[k] = i.registro; else data.push(i.registro);
    });
    await gravarLocal(t, data);
    App.dados[t] = data;
  }
  await meta('versao_base', CONFIG.VERSAO_BASE);
  await meta('baixada_em', new Date().toISOString());
  return true;
}

async function carregarDaBaseLocal() {
  for (const t of TABELAS_BASE) App.dados[t] = await lerLocal(t);
}

/* ---------------------------------------------------------------- consultas */

const q = {
  ativos: t => (App.dados[t] || []).filter(x => x.ativo !== false),
  todos:  t => (App.dados[t] || []),
  por_id: (t, id) => (App.dados[t] || []).find(x => x.id === id),
  nome:   (t, id) => { const r = q.por_id(t, id); return r ? (r.nome || r.descricao) : ''; },
  ordenado: (t, campo = 'nome') =>
    q.ativos(t).slice().sort((a, b) => String(a[campo] || '').localeCompare(String(b[campo] || ''), 'pt-BR'))
};

/* ---------------------------------------------------------------- interface */

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let avisoTimer;
function aviso(texto, erro = false) {
  const el = $('#aviso');
  el.textContent = texto;
  el.className = 'aviso' + (erro ? ' erro' : '');
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => el.classList.add('oculto'), 3600);
}

function abrirModal(titulo, html, aoAbrir) {
  $('#modal-titulo').textContent = titulo;
  $('#modal-corpo').innerHTML = html;
  $('#modal').classList.remove('oculto');
  if (aoAbrir) aoAbrir($('#modal-corpo'));
}
function fecharModal() {
  $('#modal').classList.add('oculto');
  $('#modal-corpo').innerHTML = '';
}

function pintarEstado() {
  const ponto = $('#ponto-conexao'), txt = $('#txt-conexao'), fila = $('#btn-fila');
  ponto.className = 'ponto ' + (App.online ? 'online' : 'offline');
  txt.textContent = App.online ? 'conectado' : 'sem internet';
  if (App.pendentes > 0) {
    fila.textContent = App.pendentes + (App.pendentes === 1
      ? ' registro aguardando envio' : ' registros aguardando envio');
    fila.classList.remove('oculto');
  } else {
    fila.classList.add('oculto');
  }
}

/* ---------------------------------------------------------------- fila: tela */
async function telaFila() {
  const itens = await itensDaFila();
  const html = itens.length === 0
    ? '<div class="vazio"><p>Nada esperando. Tudo que você registrou já está no servidor.</p></div>'
    : '<ul class="lista">' + itens.map(i => `
        <li>
          <div class="info">
            <strong>${esc(i.tabela)}</strong>
            <small>preenchido em ${new Date(i.preenchido_em).toLocaleString('pt-BR')}</small>
            ${i.erro ? `<small style="color:var(--urgente)">${esc(i.erro)}</small>` : ''}
          </div>
          <span class="etq ${i.status === 'erro' ? 'urgente' : 'atencao'}">${esc(i.status)}</span>
        </li>`).join('') + '</ul>'
      + '<div class="acoes"><button type="button" class="btn" id="btn-sinc">Sincronizar agora</button></div>';
  abrirModal('Registros aguardando envio', html, corpo => {
    const b = corpo.querySelector('#btn-sinc');
    if (b) b.onclick = async () => {
      if (!App.online) return aviso('Sem internet. A fila sobe sozinha quando o sinal voltar.', true);
      await sincronizar();
      aviso(App.pendentes === 0 ? 'Tudo enviado.' : 'Ainda restam ' + App.pendentes + '.');
      telaFila();
    };
  });
}

/* A sessão fica em `sessionStorage`, não em `localStorage`: ela morre quando a
   janela do app fecha. Foi pedido — app fechado tem de voltar pedindo senha.
   O preço é que reabrir SEM INTERNET não entra, porque a primeira entrada
   precisa falar com o servidor. Onde sessionStorage não existir (janela
   anônima, navegador travado), o login simplesmente não é guardado, que é o
   lado seguro do erro. */
function guardaDaSessao() {
  try {
    sessionStorage.setItem('gr.teste', '1');
    sessionStorage.removeItem('gr.teste');
    return sessionStorage;
  } catch (e) { return undefined; }
}

/* ---------------------------------------------------------------- login */

function telaLogin(mensagem) {
  $('#menu').hidden = true;
  $('#menu2').hidden = true;
  document.body.classList.remove('sem-rodape');
  $('#tela').innerHTML = `
    <section class="login">
      <img class="lg-icone" src="icons/gr-192.v1.png" alt="">
      <h1>Gestão Rápida <span>Programação Campo</span></h1>
      <p class="sub">Entre com o usuário que a administração cadastrou para você.</p>
      ${mensagem ? `<p class="sub" style="color:var(--urgente)">${esc(mensagem)}</p>` : ''}
      <div class="campo"><label for="lg-email">Usuário</label>
        <input type="text" id="lg-email" autocomplete="username"
               placeholder="seu nome de usuário" autocapitalize="none" spellcheck="false"></div>
      <div class="campo"><label for="lg-senha">Senha</label>
        <input type="password" id="lg-senha" autocomplete="current-password"></div>
      <button type="button" class="btn" id="lg-entrar">Entrar</button>
      <p style="margin-top:14px">
        <button type="button" class="btn-fantasma" id="lg-esqueci">Esqueceu sua senha?</button>
      </p>
    </section>`;
  $('#lg-entrar').onclick = entrar;
  $('#lg-esqueci').onclick = esqueciSenha;
  $('#lg-senha').onkeydown = e => { if (e.key === 'Enter') entrar(); };
}

/* ---------------------------------------------------------------- senha

   O Supabase manda um e-mail com um link que volta para o próprio app.
   Ao voltar, o endereço traz type=recovery e o app abre a tela de troca. */

function esqueciSenha() {
  const email = ($('#lg-email') && $('#lg-email').value.trim()) || '';
  abrirModal('Recuperar a senha', `
    <p class="sub">Informe seu usuário ou o e-mail do seu login. A mensagem com o link
       para criar uma senha nova vai para o e-mail cadastrado.</p>
    <div class="campo"><label for="rs-email">Usuário ou e-mail</label>
      <input type="text" id="rs-email" value="${esc(email)}" autocomplete="username"
             autocapitalize="none" spellcheck="false"></div>
    <div class="acoes">
      <button type="button" class="btn" id="rs-enviar">Enviar o link</button>
      <button type="button" class="btn neutro" id="rs-cancelar">Cancelar</button>
    </div>`, corpo => {
    corpo.querySelector('#rs-cancelar').onclick = fecharModal;
    corpo.querySelector('#rs-enviar').onclick = async () => {
      const e = corpo.querySelector('#rs-email').value.trim();
      if (!e) return aviso('Informe o usuário ou o e-mail.', true);
      if (!App.online) return aviso('Precisa de internet para enviar o link.', true);
      const b = corpo.querySelector('#rs-enviar');
      b.disabled = true; b.textContent = 'Enviando…';
      const volta = location.origin + location.pathname;
      let error = null;
      if (e.includes('@')) {
        ({ error } = await App.sb.auth.resetPasswordForEmail(e.toLowerCase(), { redirectTo: volta }));
      } else {
        // Pelo nome de usuário quem manda é o servidor: só ele sabe o e-mail.
        const r = await App.sb.functions.invoke('entrar', {
          body: { acao: 'recuperar', usuario: e.toLowerCase(), volta },
        });
        error = r.error || null;
      }
      fecharModal();
      // Não dizemos se existe ou não: isso evita descobrir quem tem conta.
      aviso(error ? 'Não consegui enviar agora. Tente de novo em alguns minutos.'
                  : 'Se esse usuário estiver cadastrado, o link chega em instantes.', !!error);
    };
  });
}

/* Tela de definir a senha nova, aberta quando a pessoa volta pelo link. */
function telaNovaSenha() {
  $('#menu').hidden = true;
  $('#btn-sair').classList.remove('oculto');
  $('#tela').innerHTML = `
    <h1>Definir uma senha nova</h1>
    <p class="sub">Escolha uma senha de pelo menos 8 caracteres. Ela vale para todos os apps
       Gestão Rápida, que usam o mesmo login.</p>
    <div style="max-width:400px">
      <div class="campo"><label for="ns-1">Senha nova</label>
        <input type="password" id="ns-1" autocomplete="new-password"></div>
      <div class="campo"><label for="ns-2">Repita a senha</label>
        <input type="password" id="ns-2" autocomplete="new-password"></div>
      <button type="button" class="btn" id="ns-salvar">Salvar a senha</button>
    </div>`;
  $('#ns-salvar').onclick = async () => {
    const a = $('#ns-1').value, b = $('#ns-2').value;
    if (a.length < 8) return aviso('A senha precisa ter pelo menos 8 caracteres.', true);
    if (a !== b) return aviso('As duas senhas não são iguais.', true);
    const btn = $('#ns-salvar'); btn.disabled = true; btn.textContent = 'Salvando…';
    const { error } = await App.sb.auth.updateUser({ password: a });
    btn.disabled = false; btn.textContent = 'Salvar a senha';
    if (error) return aviso('Não deu para salvar: ' + error.message, true);
    history.replaceState(null, '', location.pathname);
    aviso('Senha alterada. Bem-vindo de volta.');
    iniciarSessao();
  };
  $('#ns-2').onkeydown = e => { if (e.key === 'Enter') $('#ns-salvar').click(); };
}

/* Entrada por NOME de usuário, como no Gestão Rápida (Pessoas). Quem digitar
   o e-mail continua entrando pelo caminho normal do Supabase; quem digitar o
   nome passa pela função `entrar`, no servidor, que é quem sabe traduzir nome
   em e-mail — a tabela de usuários não é legível para quem ainda não entrou. */
async function entrar() {
  const quem = $('#lg-email').value.trim(), senha = $('#lg-senha').value;
  if (!quem || !senha) return aviso('Preencha usuário e senha.', true);
  if (!App.online) return aviso('A primeira entrada precisa de internet.', true);
  const b = $('#lg-entrar'); b.disabled = true; b.textContent = 'Entrando…';

  try {
    if (quem.includes('@')) {
      const { error } = await App.sb.auth.signInWithPassword({
        email: quem.toLowerCase(), password: senha });
      if (error) throw new Error('Usuário ou senha não conferem.');
    } else {
      const { data, error } = await App.sb.functions.invoke('entrar', {
        body: { usuario: quem.toLowerCase(), senha },
      });
      if (error || data?.erro) throw new Error(data?.erro || 'Usuário ou senha não conferem.');
      const { error: erroSessao } = await App.sb.auth.setSession({
        access_token: data.access_token, refresh_token: data.refresh_token,
      });
      if (erroSessao) throw new Error('Entrei, mas não consegui abrir a sessão.');
    }
  } catch (e) {
    b.disabled = false; b.textContent = 'Entrar';
    return telaLogin(e.message || 'Usuário ou senha não conferem.');
  }
  b.disabled = false; b.textContent = 'Entrar';
  iniciarSessao();
}

async function sair() {
  if (App.pendentes > 0 &&
      !confirm(`Há ${App.pendentes} registro(s) que ainda não subiram. Sair mesmo assim?`)) return;
  await App.sb.auth.signOut();
  location.reload();
}

async function iniciarSessao() {
  const { data: sessao } = await App.sb.auth.getSession();
  if (!sessao || !sessao.session) { telaLogin(); return; }

  // Quem é o usuário e quais locais ele enxerga
  const { data: u } = await App.sb.schema('manutencao').from('usuarios')
    .select('*').eq('id', sessao.session.user.id).maybeSingle();
  App.usuario = u || { nome: sessao.session.user.email, perfil: 'CONSULTA' };
  await meta('usuario', App.usuario);

  $('#btn-sair').classList.remove('oculto');

  const u2 = App.usuario;
  const liberado = u2 && u2.ativo !== false &&
    (u2.admin || u2.perfil === 'ADMINISTRADOR' || (u2.modulos || []).includes('programacao'));
  if (!liberado) {
    $('#tela').innerHTML = `<section class="login">
      <img class="lg-icone" src="icons/gr-192.v1.png" alt="">
      <h1>Gestão Rápida <span>Programação Campo</span></h1>
      <p class="sub">Seu usuário ainda não tem acesso à Programação Campo.
        Peça a um administrador para liberar em Configurações.</p></section>`;
    return;
  }

  $('#tela').innerHTML = '<section class="carregando"><p>Baixando a programação para uso sem internet…</p></section>';
  // Primeiro sobe o que ficou pendente; depois a programação vem de novo
  // (muda todo dia e é pequena).
  await sincronizar();
  await baixarBase(true);
  await carregarDaBaseLocal();

  // O que essa pessoa enxerga: módulos, telas e o menu montado em cima disso.
  carregarAcesso(App.usuario);
  montarMenu();

  // O usuário precisa enxergar em qual local está trabalhando.
  const minhas = q.todos('usuario_fazendas').filter(x => x.usuario_id === App.usuario.id);
  $('#lbl-local').textContent = (Acesso.admin || !minhas.length)
    ? 'Todas as fazendas'
    : minhas.map(x => q.nome('fazendas', x.fazenda_id)).join(' · ');

  // Atalhos do ícone do app (?acao=lancar)
  const params = new URLSearchParams(location.search);
  const acao = params.get('acao');
  if (acao && TELAS[acao] && podeTela(acao)) irPara(acao);
  if (acao) history.replaceState(null, '', location.pathname);
  sincronizar();
}

/* ---------------------------------------------------------------- navegação */

function irPara(nome) {
  // Quem não tem a tela liberada não chega nela nem por link nem por botão.
  if (window.podeTela && nome !== 'marca' && nome !== 'config' && !podeTela(nome)) {
    aviso('Você não tem acesso a essa tela.', true);
    return mostrarInicio();
  }
  if (nome !== 'marca') document.body.classList.remove('sem-rodape');
  // o modo compacto pertence ao painel consolidado; sair dele desfaz
  if (nome !== 'painel') document.body.classList.remove('modo-quadro');
  if (window.marcarMenu) marcarMenu(nome);
  const fn = TELAS[nome];
  if (fn) { window.scrollTo(0, 0); fn($('#tela')); }
}

/* ---------------------------------------------------------------- partida */

window.addEventListener('online',  () => { App.online = true;  pintarEstado(); sincronizar(); enviarFotos(); });
window.addEventListener('offline', () => { App.online = false; pintarEstado(); });

window.addEventListener('beforeunload', e => {
  if (App.pendentes > 0) { e.preventDefault(); e.returnValue = ''; }
});

let promptInstalar = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); promptInstalar = e;
  $('#btn-instalar').classList.remove('oculto');
});

document.addEventListener('DOMContentLoaded', async () => {
  $('#modal-fechar').onclick = fecharModal;
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') fecharModal(); });
  $('#btn-fila').onclick = telaFila;
  $('#btn-sair').onclick = sair;
  $('#btn-instalar').onclick = async () => {
    if (promptInstalar) { promptInstalar.prompt(); promptInstalar = null; $('#btn-instalar').classList.add('oculto'); }
    else abrirModal('Instalar no iPhone',
      '<p>No iPhone a instalação é pelo Safari: toque em <strong>Compartilhar</strong> e depois em ' +
      '<strong>Adicionar à Tela de Início</strong>. O app abre em janela própria, sem a barra do navegador.</p>');
  };
  // o nome do app no topo funciona como o logotipo de um site: volta ao início
  const bInicio = $('#btn-inicio');
  if (bInicio) bInicio.onclick = () =>
    (window.mostrarInicio ? mostrarInicio() : irPara('inicio'));

  pintarEstado();
  await abrirBase();
  await contarFila();

  if (CONFIG.SUPABASE_URL.includes('COLE-AQUI')) {
    $('#tela').innerHTML = `<h1>Falta configurar o Supabase</h1>
      <p class="sub">Abra o arquivo <code>js/config.js</code> e cole a URL do projeto e a chave
      <em>anon public</em>. Elas estão em Supabase → Project Settings → API.</p>`;
    return;
  }

  App.sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    db: { schema: CONFIG.SCHEMA || 'public' },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Chave própria: o app de vistorias divide o mesmo endereço e o mesmo
      // projeto Supabase, e não pode ser derrubado quando este app fecha.
      storageKey: 'gr.programacao.auth',
      storage: guardaDaSessao(),
    },
  });

  // Voltando pelo link do e-mail: o endereço traz type=recovery.
  App.sb.auth.onAuthStateChange((evento) => {
    if (evento === 'PASSWORD_RECOVERY') telaNovaSenha();
  });
  if (location.hash.includes('type=recovery')) { telaNovaSenha(); return; }
  await carregarDaBaseLocal();
  iniciarSessao();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const novo = reg.installing;
        novo.addEventListener('statechange', () => {
          if (novo.state === 'installed' && navigator.serviceWorker.controller) {
            aviso('Nova versão disponível. Feche e abra o app para atualizar.');
          }
        });
      });
    });
  }
});

/* Os arquivos são scripts clássicos: `const` no topo não vira propriedade de
   window. Publico o que telas.js usa, para a ordem de carga não importar. */
Object.assign(window, {
  App, q, $, $$, esc, aviso, abrirModal, fecharModal, telaLogin,
  gravar, inativar, irPara, sincronizar, pk, meta, blobDaFoto, baixarBase,
  guardarFoto, enviarFotos, esqueciSenha, telaNovaSenha, lerLocal, gravarLocal
});
