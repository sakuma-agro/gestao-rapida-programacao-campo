/* =====================================================================
   Gestão Rápida · Programação Campo — cadastrar pessoas
   O login é criado no servidor (função criar-usuario, a mesma dos outros
   Gestão Rápida), porque a chave que cria login não pode ficar no navegador.
   A senha é gerada lá e aparece uma vez só, para repassar à pessoa.
   ===================================================================== */

function caixaSenha(alvo, html, erro = false) {
  alvo.className = 'pc-senha' + (erro ? ' erro' : '');
  alvo.innerHTML = html;
  const b = alvo.querySelector('[data-copiar]');
  if (b) b.onclick = async () => {
    try { await navigator.clipboard.writeText(b.dataset.copiar); b.textContent = 'Copiada'; }
    catch (e) { b.textContent = 'Selecione e copie'; }
  };
}

function htmlSenha(titulo, senha, rodape) {
  return `<strong>${titulo}</strong> Anote a senha agora — ela não fica guardada e não aparece de novo:
    <div class="pc-senha-valor"><code>${esc(senha)}</code>
      <button type="button" class="btn neutro" data-copiar="${esc(senha)}">Copiar</button></div>
    <small>${rodape}</small>`;
}

/* Ficha para cadastrar uma pessoa nova */
function novaPessoa(depois) {
  if (!App.online) return aviso('Cadastrar pessoa precisa de internet.', true);
  abrirModal('Nova pessoa', `
    <p class="sub">A pessoa entra com o <strong>login</strong> (ou o e-mail) e a senha que o app vai gerar.
      O mesmo login vale para os outros apps Gestão Rápida, conforme o acesso liberado em cada um.</p>
    <div class="colunas">
      ${campoTexto('Nome *', 'np-nome', '')}
      ${campoTexto('E-mail *', 'np-email', '', 'email', 'Pode ser um e-mail da empresa. Não recebe mensagem nenhuma.')}
      ${campoTexto('Login', 'np-login', '', 'text', 'Ex.: joao.silva — de 3 a 30 letras, números, ponto, traço.', 'autocapitalize="none"')}
    </div>
    <div class="campo"><label class="pc-cx"><input type="checkbox" id="np-admin">
      Administrador (vê todas as fazendas e mexe em cadastros e acessos)</label></div>
    <div class="campo" id="np-faz"><label>Fazendas que a pessoa enxerga</label>
      <div class="pc-chips">${fazendasOrdenadas().map(f =>
        `<label class="pc-cx"><input type="checkbox" class="np-f" value="${f.id}"> ${esc(f.nome)}</label>`).join('')}</div>
      <p class="ajuda">Sem nenhuma marcada, a pessoa vê todas.</p></div>
    <div id="np-resultado"></div>
    <div class="acoes">
      <button type="button" class="btn" id="np-ok">Criar acesso</button>
      <button type="button" class="btn neutro" id="np-fechar">Fechar</button>
    </div>`, corpo => {
    const $c = s => corpo.querySelector(s);
    $c('#f-np-nome').oninput = () => {
      if ($c('#f-np-login').dataset.mexido) return;
      const partes = $c('#f-np-nome').value.trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean);
      $c('#f-np-login').value = partes.length > 1 ? partes[0] + '.' + partes[partes.length - 1] : (partes[0] || '');
    };
    $c('#f-np-login').oninput = () => { $c('#f-np-login').dataset.mexido = '1'; };
    $c('#np-admin').onchange = () => { $c('#np-faz').style.display = $c('#np-admin').checked ? 'none' : ''; };
    $c('#np-fechar').onclick = () => { fecharModal(); if (depois) depois(); };

    $c('#np-ok').onclick = async () => {
      const nome = $c('#f-np-nome').value.trim().replace(/\s+/g, ' ');
      const email = $c('#f-np-email').value.trim().toLowerCase();
      const usuario = $c('#f-np-login').value.trim().toLowerCase() || null;
      const admin = $c('#np-admin').checked;
      const fazendas = admin ? [] : [...corpo.querySelectorAll('.np-f:checked')].map(x => x.value);
      if (!nome) return aviso('Falta o nome.', true);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return aviso('E-mail inválido.', true);
      if (usuario && !/^[a-z0-9._-]{3,30}$/.test(usuario)) return aviso('Login inválido: de 3 a 30 caracteres, só letras, números, ponto, traço ou sublinhado.', true);

      // Quem já tem login nos outros apps não é criado de novo: só ganha o acesso aqui.
      const existe = gente.find(g => (g.email || '').toLowerCase() === email);
      if (existe) {
        if (!confirm(`${existe.nome || email} já tem login nos apps Gestão Rápida.\n\nLiberar o acesso à Programação Campo para essa pessoa?`)) return;
        const lista = new Set(existe.modulos || []); lista.add('programacao');
        const { error } = await App.sb.schema('manutencao').from('usuarios').update({ modulos: [...lista], ativo: true }).eq('id', existe.id);
        if (error) return aviso('Não salvou: ' + error.message, true);
        await gravarFazendas(existe.id, fazendas);
        fecharModal(); aviso(`${existe.nome} agora entra na Programação Campo com o login que já usa.`);
        if (depois) depois();
        return;
      }
      if (usuario && gente.some(g => g.usuario === usuario)) return aviso('Esse login já é de outra pessoa. Escolha outro.', true);

      const b = $c('#np-ok'); b.disabled = true; b.textContent = 'Criando…';
      caixaSenha($c('#np-resultado'), '<p>Criando o acesso…</p>');
      try {
        const { data, error } = await App.sb.functions.invoke('criar-usuario', {
          body: { email, nome, usuario, admin, perfil: admin ? 'ADMINISTRADOR' : 'CONSULTA',
                  modulos: ['programacao'], telas: [], locais: [] },
        });
        if (error) throw error;
        if (data && data.erro) throw new Error(data.erro);
        await gravarFazendas(data.id, fazendas);
        caixaSenha($c('#np-resultado'), data.jaExistia
          ? '<strong>Esse e-mail já tinha login.</strong> A senha continua a mesma; o acesso à Programação Campo foi liberado.'
          : htmlSenha('Acesso criado.', data.senha,
              `Entrar com <strong>${esc(usuario || email)}</strong> e essa senha. Peça para trocar no primeiro acesso (Esqueci minha senha).`));
        b.textContent = 'Criado';
        corpo.querySelectorAll('input').forEach(i => { i.disabled = true; });
      } catch (e) {
        b.disabled = false; b.textContent = 'Criar acesso';
        caixaSenha($c('#np-resultado'), '<strong>Não consegui criar o acesso.</strong><br>' + esc(e.message || String(e)), true);
      }
    };
  });
}

async function gravarFazendas(usuarioId, fazendas) {
  if (!usuarioId) return;
  await App.sb.from('usuario_fazendas').delete().eq('usuario_id', usuarioId);
  if (fazendas.length) {
    await App.sb.from('usuario_fazendas').insert(fazendas.map(fazenda_id => ({ usuario_id: usuarioId, fazenda_id })));
  }
  const r = await App.sb.from('usuario_fazendas').select('*');
  if (!r.error) { App.dados.usuario_fazendas = r.data; await gravarLocal('usuario_fazendas', r.data); }
}

/* Senha nova e ligar/desligar, a partir da linha da pessoa */
function fichaPessoa(u, depois) {
  const eu = (App.usuario || {}).id === u.id;
  abrirModal(u.nome || u.email, `
    <p class="sub">Login: <strong>${esc(u.usuario || '—')}</strong> · E-mail: ${esc(u.email || '—')}<br>
      ${u.ativo === false ? '<span class="etq inativo">sem acesso aos apps</span>' : 'Acesso ativo.'}</p>
    <div id="fp-resultado"></div>
    <div class="acoes">
      <button type="button" class="btn secundario" id="fp-senha">Gerar senha nova</button>
      ${eu ? '' : `<button type="button" class="btn neutro" id="fp-ativo">${u.ativo === false ? 'Devolver acesso' : 'Tirar acesso aos apps'}</button>`}
      <button type="button" class="btn neutro" id="fp-fechar">Fechar</button>
    </div>`, corpo => {
    const res = corpo.querySelector('#fp-resultado');
    corpo.querySelector('#fp-fechar').onclick = () => { fecharModal(); if (depois) depois(); };
    corpo.querySelector('#fp-senha').onclick = async () => {
      if (!u.email) return aviso('Essa pessoa não tem e-mail de login.', true);
      if (!confirm(`Gerar uma senha nova para ${u.nome}?\n\nA senha atual deixa de funcionar na hora.`)) return;
      caixaSenha(res, '<p>Gerando…</p>');
      try {
        const { data, error } = await App.sb.functions.invoke('criar-usuario', { body: { acao: 'senha', email: u.email } });
        if (error) throw error;
        if (data && data.erro) throw new Error(data.erro);
        caixaSenha(res, htmlSenha('Senha nova.', data.senha, 'A senha anterior já não funciona mais.'));
      } catch (e) {
        caixaSenha(res, '<strong>Não consegui trocar a senha.</strong><br>' + esc(e.message || String(e)), true);
      }
    };
    const bAtivo = corpo.querySelector('#fp-ativo');
    if (bAtivo) bAtivo.onclick = async () => {
      const desligar = u.ativo !== false;
      if (desligar && !confirm(`Tirar o acesso de ${u.nome}?\n\nVale para todos os apps Gestão Rápida. O histórico continua guardado.`)) return;
      const { error } = await App.sb.schema('manutencao').from('usuarios').update({ ativo: !desligar }).eq('id', u.id);
      if (error) return aviso('Não salvou: ' + error.message, true);
      u.ativo = !desligar;
      fecharModal(); aviso(desligar ? 'Acesso retirado.' : 'Acesso devolvido.');
      if (depois) depois();
    };
  });
}

Object.assign(window, { novaPessoa, fichaPessoa });
