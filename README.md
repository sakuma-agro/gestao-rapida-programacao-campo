# Gestão Rápida · Programação Campo — SAKUMA Agronegócios

Programação anual das atividades de campo (substitui o quadro de parede e a
planilha "Planejamento Anual – Sakuma SK-01"). Painel por mês e semana
(S1 dias 1–7, S2 8–14, S3 15–21, S4 22 ao fim), lançamento de atividades,
reunião semanal e relatório em PDF / Excel / WhatsApp.

Faz parte da família **Gestão Rápida**, junto com Pessoas e Manutenções.

- Endereço: https://sakuma-agro.github.io/gestao-rapida-programacao-campo/
- Banco: Supabase (mesmo projeto do Manutenções), schema `programacao`
- Login: o mesmo dos outros Gestão Rápida (tabela `manutencao.usuarios`);
  o acesso é liberado pelo módulo `programacao`
- Front-end estático em HTML/CSS/JS puro, PWA instalável, funciona sem internet
- Desenvolvido pela LOP · Inteligência para o agronegócio

## Publicar

1. Criar o repositório `gestao-rapida-programacao-campo` na organização sakuma-agro
   e subir todos os arquivos desta pasta (mantendo as pastas css, js, img, icons).
2. Settings → Pages → Branch `main`, pasta `/ (root)`.
3. Supabase → Project Settings → Data API → Exposed schemas: incluir `programacao`.
4. Supabase → Authentication → URL Configuration → Redirect URLs: incluir
   `https://sakuma-agro.github.io/gestao-rapida-programacao-campo/`.

## Regra da semana

Pelo dia do mês, igual ao quadro da parede: 1–7 = S1, 8–14 = S2, 15–21 = S3,
22 ao último dia = S4. O banco calcula ano, mês e semana sozinho.
