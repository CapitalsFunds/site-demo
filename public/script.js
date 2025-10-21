// Мини-калькулятор для сравнения структур
const structures = [
  'ИП',
  'ООО / Холдинг',
  'Личный фонд (ЛФ)',
  'ИП с ЗПИФ',
  'ООО / Холдинг с ЗПИФ',
  'ЛФ с ЗПИФ'
];
const CIT = 0.25; // Налог на прибыль организаций (на будущее)
const TAX_LF = 0.15; // Налог на прибыль для Личного фонда (ЛФ)
const TAX_LF_RATE = 0.15;

function ndfl(x) {
  // x — млн ₽ в год, прогрессивная шкала (возвращает млн ₽ налога)
  // 0…2.4 — 13%
  // 2.4…5 — 15%
  // 5…20 — 18%
  // 20…50 — 20%
  // >50 — 22%
  let tax = 0;
  let rem = x;
  const brackets = [
    { up: 2.4, rate: 0.13 },
    { up: 5, rate: 0.15 },
    { up: 20, rate: 0.18 },
    { up: 50, rate: 0.20 },
    { up: Infinity, rate: 0.22 },
  ];
  let prev = 0;
  for (const b of brackets) {
    if (rem <= 0) break;
    let nextAmount = Math.min(b.up - prev, rem);
    if (nextAmount > 0) tax += nextAmount * b.rate;
    rem -= nextAmount;
    prev = b.up;
  }
  return tax;
}

function growthFactorFromKeyRate(keyRatePct, tYears) {
  const r = (Number(keyRatePct) || 0) / 100;
  const t = Number(tYears) || 1;
  return Math.pow(1 + r, t) - 1;
}

function ndflDividends(gross) {
  const cap = 2.4; // млн ₽
  const r1 = 0.13, r2 = 0.15;
  if (gross <= 0) return 0;
  const b1 = Math.min(gross, cap);
  const b2 = Math.max(gross - cap, 0);
  return b1 * r1 + b2 * r2;
}

function grossUpDividends(netTarget) {
  if (netTarget <= 0) return 0;
  let lo = netTarget, hi = netTarget / 0.85;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const net = mid - ndflDividends(mid);
    if (net < netTarget) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function annuityFV(a, r, n) {
  if (r === 0) return a * n;
  return a * ((1 + r) ** n - 1) / r;
}

function effectFromSaving(saving, r) {
  const S = Math.max(saving, 0); // не капитализируем отрицательную экономию
  return annuityFV(S, r, 10);
}

function ndflProgressive(x){
  const t1=2.4,t2=5,t3=20,t4=50;
  const r1=0.13,r2=0.15,r3=0.18,r4=0.20,r5=0.22;
  if(x<=0) return 0;
  const b1=Math.min(x,t1);
  const b2=Math.min(Math.max(x-t1,0),t2-t1);
  const b3=Math.min(Math.max(x-t2,0),t3-t2);
  const b4=Math.min(Math.max(x-t3,0),t4-t3);
  const b5=Math.max(x-t4,0);
  return b1*r1+b2*r2+b3*r3+b4*r4+b5*r5;
}

function pickSaleForNetTarget({ netTarget, keyRatePct, t, fees=0 }){
  const r = keyRatePct / 100;
  function netGivenC(C) {
    const g = Math.pow(1+r, t) - 1;
    const S = C * (1 + g);
    const base = Math.max(C * g - fees, 0);
    const tax = ndflProgressive(base);
    return S - tax;
  }
  if (netTarget <= 0) return {S:0, base:0};
  let lo = 0, hi = 1;
  while (netGivenC(hi) < netTarget && hi < 1e12) hi *= 2;
  for (let i=0; i<120; i++) {
    const mid=(lo+hi)/2, f=netGivenC(mid)-netTarget;
    if (Math.abs(f) < 1e-6){ lo=hi=mid; break; }
    if (f < 0) lo=mid; else hi=mid;
  }
  const C = (lo+hi)/2;
  const g = Math.pow(1+r, t) - 1;
  const S = C * (1 + g);
  const base = Math.max(C * g - fees, 0);
  return { S, base };
}

function calcRow(structure, EBT, s, rKey) {
  switch(structure) {
    case 'ИП': {
      // EAT = EBT - ndfl(EBT)
      const eat = EBT - ndfl(EBT);
      return { eat };
    }
    case 'ООО / Холдинг': {
      // EAT = EBT − CIT (25%) − НДФЛ по дивидендам (прогрессия 13/15%)
      const citAmount      = EBT * 0.25;
      const profitAfterCIT = EBT - citAmount;
      const netDivTarget   = EBT * s;
      const divGross       = grossUpDividends(netDivTarget);
      const ndflDiv        = ndflDividends(divGross);
      const eat      = EBT - citAmount - ndflDiv;
      return { eat };
    }
    case 'Личный фонд (ЛФ)': {
      // EAT = EBT - (EBT × 15%)
      const tax = EBT * TAX_LF;
      const eat = EBT - tax;
      return { eat };
    }
    case 'ИП с ЗПИФ': {
      // Бисекция: подбор S для нужного "на руки" через ключевую ставку (годовую) на t лет
      const netTarget = EBT * s;
      const keyRatePct = Number(document.getElementById("keyRate")?.value || 0); // keyRate в исходной форме
      const t = Number(document.getElementById("inpt")?.value || 1);
      const fees = Number(document.getElementById("inpFees")?.value || 0);
      const { S, base } = pickSaleForNetTarget({ netTarget, keyRatePct, t, fees });
      const ndfl = ndflProgressive(base);
      const eat = EBT - ndfl;
      return { eat };
    }
    case 'ООО / Холдинг с ЗПИФ': {
      const netTarget  = EBT * s;
      const keyRatePct = Number(document.getElementById("keyRate")?.value || 0);
      const t          = Number(document.getElementById("inpt")?.value || 1);
      const fees       = Number(document.getElementById("inpFees")?.value || 0);
      // 1) Брутто-дивиденды под целевой нетто (gross-up)
      const divGross = grossUpDividends(netTarget);
      const ndflDiv  = ndflDividends(divGross);
      // 2) Продажа паёв = брутто-дивиденды
      const S = divGross;
      // 3) Покупка через ключевую ставку (годовая капитализация за t лет)
      const g = growthFactorFromKeyRate(keyRatePct, t);
      const C = (1+g)>0 ? (S / (1+g)) : S;
      // 4) База прибыли под CIT
      const citBase = Math.max(S - C - fees, 0);
      const CIT = 0.25 * citBase;
      // 5) Итог
      const eat = EBT - CIT - ndflDiv;
      return { eat };
    }
    case 'ЛФ с ЗПИФ': {
      // Исправление: чтение значения по правильному id
      const keyRatePct = Number(document.getElementById("keyRate").value || 0);
      const t          = Number(document.getElementById("inpt").value || 1);
      const fees       = Number(document.getElementById("inpFees")?.value || 0);
      const S = EBT * s;
      const g = growthFactorFromKeyRate(keyRatePct, t);
      const C = (1 + g) > 0 ? (S / (1 + g)) : S;
      const citBase = Math.max(S - C - fees, 0);
      const taxLF = TAX_LF_RATE * citBase;
      const eat = EBT - taxLF;
      return { eat };
    }
  }
}

function format(x) {
  if (x == null) return '—';
  return Number(x).toFixed(1);
}

function renderTable(rows, baseline, baselineEat, hasValidBaseline) {
  // Найти лучший эффект (max) среди строк, где есть значение
  const effects = rows.map(r => typeof r.effect10 === 'number' ? r.effect10 : (r.effect10 ? Number(r.effect10) : -Infinity));
  const maxEffect = Math.max(...effects.filter(x => isFinite(x)));

  let html = '<div class="receipt-table"><table>' +
    '<thead>' +
    '<tr>' +
    '<th rowspan="2">Структура</th>' +
    '<th colspan="3">Экономические показатели (млн. ₽)</th>' +
    '</tr>' +
    '<tr>' +
    '<th>Чистый доход EAT</th>' +
    '<th>Экономия за год</th>' +
    '<th>Эффект за 10 лет</th>' +
    '</tr>' +
    '</thead><tbody>';

  for (const r of rows) {
    html += '<tr>';
    html += `<td>${r.structure}</td>`;
    html += `<td class="num">${format(r.eat)}</td>`;
    html += `<td class="num">${format(r.saving)}</td>`;
    const effectIsBest = Number(r.effect10) === maxEffect && maxEffect > 0;
    html += `<td class="num${effectIsBest ? ' best-effect' : ''}">${format(r.effect10)}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  
  if (!hasValidBaseline) {
    html += '<div class="warning">Для выбранной базовой структуры пока не реализовано правило EAT — расчёт "Экономии за год" и "Эффекта за 10 лет" недоступен.</div>';
  }
  return html;
}

function calculateAndRender() {
  const EBT = parseFloat(document.getElementById('ebt').value);
  const sharePersonal = parseFloat(document.getElementById('sharePersonal').value);
  const keyRate = parseFloat(document.getElementById('keyRate').value);
  const baseline = document.getElementById('baseline').value;
  const s = sharePersonal / 100;
  const r = keyRate / 100;
  const t = document.getElementById('inpt') ? Number(document.getElementById('inpt').value) : 1;
  const fees = document.getElementById('inpFees') ? Number(document.getElementById('inpFees').value) : 0;
  // Считаем eat, effect для всех структур
  const rows = structures.map(structure => {
    const { eat } = calcRow(structure, EBT, s, r);
    return { structure, eat };
  });
  // baselineEat — для подсчёта «Экономии за год»
  const baselineRow = rows.find(r => r.structure === baseline);
  const baselineEat = baselineRow ? baselineRow.eat : null;
  const hasValidBaseline = baselineEat != null;
  // saving: eat - baselineEat, effect10: от saving и r
  rows.forEach(row => {
    let saving = null, effect10 = null;
    if (row.eat != null && hasValidBaseline) {
      saving = row.eat - baselineEat;
      effect10 = effectFromSaving(saving, r);
    }
    row.saving = saving;
    row.effect10 = effect10;
  });
  // Рендер
  document.getElementById('result').innerHTML = renderTable(rows, baseline, baselineEat, hasValidBaseline);
}
// Подключить live-режим
function handleLiveCalcEvents() {
  const form = document.getElementById('calc-form');
  if (!form) return;
  form.addEventListener('input', calculateAndRender);
  form.addEventListener('change', calculateAndRender);
  // Немедленный первый рендер
  calculateAndRender();
}
document.addEventListener('DOMContentLoaded', handleLiveCalcEvents);
