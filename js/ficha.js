/* =====================================================================
   Gestão Rápida · Programação Campo — ficha de conferência
   Folha simples para imprimir e levar ao campo: separada por dia, com
   caixinhas FEITO / NÃO FEITO para marcar à caneta, local, atividade,
   operador e espaço para anotar. A4 em pé, letra grande, sem siglas.
   ===================================================================== */

const DIAS_EXTENSO = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

function diaExtenso(iso) {
  const p = partes(iso);
  const d = new Date(p.ano, p.mes - 1, p.dia);
  return `${DIAS_EXTENSO[d.getDay()]}, ${String(p.dia).padStart(2, '0')} de ${MESES[p.mes - 1].toLowerCase()}`;
}

async function montarFicha(o) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const L = doc.internal.pageSize.getWidth(), A = doc.internal.pageSize.getHeight();
  const M = 12;
  const agora = new Date();
  const emitido = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const sakuma = await imagemPdf('img/sakuma-logo.png');
  const lop = await imagemPdf('img/lop-marca.png');

  /* ---- cabeçalho */
  const hLogo = 15, wLogo = hLogo * sakuma.w / sakuma.h;
  doc.addImage(sakuma.url, sakuma.tipo, M, 9, wLogo, hLogo);
  const xT = M + wLogo + 6;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(COR.marrom);
  doc.text('Atividades de campo', xT, 15);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(COR.cinza);
  doc.text(o.periodo, xT, 20.5);
  doc.text(o.fazenda ? 'Fazenda: ' + q.nome('fazendas', o.fazenda) : 'Todas as fazendas', xT, 25.5);
  doc.setDrawColor(COR.verde); doc.setLineWidth(0.9); doc.line(M, 29, L - M, 29);

  /* ---- como preencher */
  let y = 33;
  doc.setFillColor(COR.verdeClaro); doc.setDrawColor(COR.verdeLinha); doc.setLineWidth(0.3);
  doc.roundedRect(M, y, L - 2 * M, 15, 1.5, 1.5, 'FD');
  const caixa = (x, yy, marcada) => {
    doc.setDrawColor(COR.cinza); doc.setLineWidth(0.45); doc.setFillColor('#FFFFFF');
    doc.rect(x, yy, 5, 5, 'FD');
    if (marcada) {
      doc.setDrawColor(COR.ok); doc.setLineWidth(0.9);
      doc.line(x + 1, yy + 2.6, x + 2.2, yy + 3.9); doc.line(x + 2.2, yy + 3.9, x + 4.2, yy + 1.1);
    }
  };
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(COR.marrom);
  doc.text('Como preencher:', M + 3, y + 5.5);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(COR.cinza);
  caixa(M + 34, y + 2, true);
  doc.text('FEITO = a atividade foi realizada.', M + 41, y + 5.5);
  caixa(M + 34, y + 8.5, false);
  doc.text('NÃO FEITO = não foi realizada. Escreva o motivo em "Anotações".', M + 41, y + 12);
  y += 20;

  /* ---- tabela separada por dia */
  const ordenada = o.lista.slice().sort((a, b) => a.data.localeCompare(b.data) ||
    q.nome('locais', a.local_id).localeCompare(q.nome('locais', b.local_id), 'pt-BR'));
  const corpo = [];
  let diaAtual = '';
  ordenada.forEach(a => {
    if (a.data !== diaAtual) {
      diaAtual = a.data;
      corpo.push([{ content: diaExtenso(a.data), colSpan: 6,
        styles: { fillColor: COR.marrom, textColor: '#FFFFFF', fontStyle: 'bold', fontSize: 11.5, cellPadding: { top: 2.2, bottom: 2.2, left: 3 } } }]);
    }
    const st = statusDe(a);
    corpo.push({ _a: a, _feito: st === 'Concluído', linha: ['', '',
      q.nome('locais', a.local_id),
      nomeAtividade(a) + '\n' + q.nome('culturas', a.cultura_id) + (maqImpl(a) ? ' · ' + maqImpl(a) : ''),
      q.nome('operadores', a.operador_id) || '', ''] });
  });

  doc.autoTable({
    startY: y, margin: { left: M, right: M, top: 14, bottom: 30 },
    head: [['FEITO', 'NÃO\nFEITO', 'LOCAL', 'ATIVIDADE', 'OPERADOR', 'ANOTAÇÕES']],
    body: corpo.map(r => Array.isArray(r) ? r : r.linha),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 10.5, textColor: COR.cinza, lineColor: COR.verdeLinha, lineWidth: 0.25,
              cellPadding: { top: 2.6, bottom: 2.6, left: 2, right: 2 }, valign: 'middle', minCellHeight: 13 },
    headStyles: { fillColor: COR.verde, textColor: '#FFFFFF', fontStyle: 'bold', fontSize: 9, halign: 'center', minCellHeight: 10 },
    alternateRowStyles: { fillColor: COR.verdeClaro },
    columnStyles: { 0: { cellWidth: 15 }, 1: { cellWidth: 15 }, 2: { cellWidth: 40, fontStyle: 'bold' },
                    3: { cellWidth: 48 }, 4: { cellWidth: 32 }, 5: { cellWidth: 36 } },
    didParseCell: d => {
      if (d.section !== 'body') return;
      const linha = corpo[d.row.index];
      if (Array.isArray(linha)) return;
      if (d.column.index === 4 && !d.cell.raw) d.cell.styles.fillColor = '#FFFFFF';
      if (d.column.index === 5) d.cell.styles.fillColor = '#FFFFFF';
      if (d.column.index === 3) d.cell.styles.fontSize = 10.5;
    },
    didDrawCell: d => {
      if (d.section !== 'body') return;
      const linha = corpo[d.row.index];
      if (Array.isArray(linha)) return;
      const cx = d.cell.x + (d.cell.width - 5) / 2, cy = d.cell.y + (d.cell.height - 5) / 2;
      if (d.column.index === 0) caixa(cx, cy, linha._feito);
      if (d.column.index === 1) caixa(cx, cy, false);
      if (d.column.index === 4 && !d.cell.raw) {        // operador em branco: linha para escrever
        doc.setDrawColor(COR.cinzaClaro); doc.setLineWidth(0.2);
        doc.line(d.cell.x + 2, d.cell.y + d.cell.height - 3.5, d.cell.x + d.cell.width - 2, d.cell.y + d.cell.height - 3.5);
      }
    },
  });
  y = doc.lastAutoTable.finalY + 6;

  /* ---- total e assinaturas */
  const total = ordenada.length;
  if (y > A - 58) { doc.addPage(); y = 20; }
  doc.setFillColor(COR.verdeTotal); doc.rect(M, y, L - 2 * M, 9, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(COR.marrom);
  doc.text(`Total: ${total} atividade${total === 1 ? '' : 's'}`, M + 3, y + 6);
  doc.text('Feitas: ______     Não feitas: ______', L - M - 3, y + 6, { align: 'right' });
  y += 22;
  const larg = (L - 2 * M - 10) / 2;
  doc.setDrawColor(COR.cinza); doc.setLineWidth(0.3);
  doc.line(M, y, M + larg, y); doc.line(M + larg + 10, y, L - M, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(COR.cinza);
  doc.text('Responsável pelo campo', M, y + 4.5);
  doc.text('Conferido por (reunião)          Data: ____/____/______', M + larg + 10, y + 4.5);
  y += 13;
  doc.setFontSize(9); doc.text('Emitido por', M, y);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(COR.marrom);
  doc.text(RESPONSAVEL, M, y + 5);

  /* ---- pé de todas as folhas */
  const paginas = doc.getNumberOfPages();
  const hLop = 7, wLop = hLop * lop.w / lop.h;
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setDrawColor(COR.verde); doc.setLineWidth(0.4); doc.line(M, A - 13, L - M, A - 13);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(COR.cinzaClaro);
    doc.text(`SAKUMA Agronegócios · emitido em ${emitido}`, M, A - 6.5);
    doc.text(`Página ${p} de ${paginas}`, L / 2, A - 6.5, { align: 'center' });
    doc.setFontSize(7);
    const wFrase = doc.getTextWidth(FRASE_LOP);
    const xFrase = L - M - wFrase, xLop = xFrase - 1.6 - wLop, yImg = A - 11;
    doc.addImage(lop.url, lop.tipo, xLop, yImg, wLop, hLop);
    doc.text(FRASE_LOP, xFrase, yImg + hLop * 0.725 + 0.85);
  }
  return doc;
}

Object.assign(window, { montarFicha });
