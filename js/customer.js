/**
 * 顧客データの画面(ホーム / 保険 / 投資 / 預金 / 家計 / プロフィール / お知らせ)
 *
 * この6+1画面は顧客本人とIFAの両方が使う。
 * IFAが顧客一覧から誰かを選んだ場合も同じ画面をそのまま表示し、
 * 「編集・登録ボタンを出すかどうか」だけを state.role で切り替えている。
 * (画面を2系統作ると同じ表示ロジックを二重に持つことになるため)
 *
 * state = { role: 'ifa'|'customer', customerId: 表示対象の顧客ID, reload: 再描画関数 }
 */

import { api } from './api.js';
import {
  h, esc, yen, date, bool, row, textOr, toast,
  showLoading, showError, emptyText, openModal, openFormModal
} from './ui.js';

/** 読み込み→描画の共通の流れ。通信エラーは画面上に出す */
async function load(container, render) {
  showLoading(container);
  try {
    await render();
  } catch (err) {
    showError(container, err.message || String(err));
  }
}

/** APIに渡す顧客ID。顧客本人の場合も自分のIDを明示して送る */
function target(state) {
  return { customerId: state.customerId };
}

const isIfa = (state) => state.role === 'ifa';

// ============================== ホーム ==============================

export function renderHome(container, state) {
  return load(container, async function () {
    const data = await api('home.summary', target(state));
    const assets = data['資産'];
    const insurance = data['保険'];
    const household = data['家計'];
    const alerts = data['直近のお知らせ'] || [];
    const friendAddUrl = data['友だち追加URL'];

    container.innerHTML = `
      ${friendAddUrl ? `
        <div class="card" style="background:#eafaf0">
          満期日や払込日などのお知らせをLINEで受け取るには、公式アカウントの友だち追加をお願いします。<br>
          <a href="${esc(friendAddUrl)}" target="_blank" rel="noopener">友だち追加はこちら</a>
        </div>
      ` : ''}
      <div class="card hero">
        <div class="hero__label">総資産(保険の投資性商品 + 投資商品 + 預金)</div>
        <div class="hero__value num">${esc(yen(assets['総資産']))}</div>
      </div>

      <div class="section-title">資産運用</div>
      <div class="grid2">
        <div class="stat">
          <div class="stat__label">投資性のある保険</div>
          <div class="stat__value num">${esc(yen(assets['投資性商品の資産合計']))}</div>
        </div>
        <div class="stat">
          <div class="stat__label">投資商品</div>
          <div class="stat__value num">${esc(yen(assets['投資商品の資産合計']))}</div>
        </div>
      </div>
      <div class="card" style="margin-top:10px">
        ${row('資産運用合計', yen(assets['資産運用合計']))}
        ${row('預金合計', yen(assets['預金合計']))}
      </div>

      <div class="section-title">保険</div>
      <div class="card">
        ${row('有効な契約', insurance['有効契約件数'] + '件')}
        ${row('直近の満期日・更新日', date(insurance['直近の満期日・更新日']))}
        ${row('次回の払込日', date(insurance['直近の払込日']))}
      </div>

      <div class="section-title">家計(直近の入力月)</div>
      <div class="card">
        ${household ? `
          ${row('対象年月', household['対象年月'])}
          ${row('収入合計', yen(household['収入合計']))}
          ${row('支出合計', yen(household['支出合計']))}
          ${row('収支', yen(household['収支']))}
        ` : emptyText('まだ家計の記録がありません')}
      </div>

      <div class="section-title">最近のお知らせ</div>
      <div class="card">
        ${alerts.length === 0 ? emptyText('お知らせはありません') : alerts.map(function (a) {
          return `<div class="row" style="display:block">
            <div class="item-sub">${esc(textOr(a['日時']))}</div>
            <div>${esc(textOr(a['内容']))}</div>
          </div>`;
        }).join('')}
      </div>
    `;
  });
}

// ============================== 保険契約 ==============================

const INSURANCE_FIELDS = [
  { name: '保険会社名', label: '保険会社名', type: 'text', required: true },
  { name: '商品名', label: '商品名', type: 'text', required: true },
  { name: '契約ステータス', label: '契約ステータス', type: 'select', required: true, options: ['有効', '失効', '解約済み', '払い済み'] },
  { name: '契約日', label: '契約日', type: 'date' },
  { name: '満期日・更新日', label: '満期日・更新日', type: 'date', help: '30日前と7日前にアラートを送ります' },
  { name: '保険料', label: '保険料(円)', type: 'number' },
  { name: '支払方法・頻度', label: '支払方法・頻度', type: 'select', options: ['月払', '半年払', '年払'] },
  { name: '次回払込日', label: '次回払込日', type: 'date', help: '半年払・年払のみアラートの対象です' },
  { name: '保険金額', label: '保険金額(円)', type: 'number' },
  { name: '保証内容の詳細', label: '保証内容の詳細', type: 'textarea' },
  { name: '受取人', label: '受取人', type: 'text' },
  { name: '投資性の有無', label: '投資性のある商品(変額・外貨建てなど)', type: 'checkbox' },
  { name: '資産評価額', label: '資産評価額(円)', type: 'number', help: '投資性ありの契約のみ入力します(解約返戻金相当額など)' },
  { name: '評価額更新日', label: '評価額更新日', type: 'date' }
];

export function renderInsurance(container, state) {
  return load(container, async function () {
    const res = await api('insurance.list', target(state));
    const items = res.items || [];

    container.innerHTML = `
      <div class="card">
        <div class="stat__label">投資性商品の資産合計</div>
        <div class="hero__value num" style="color:var(--accent-dark);font-size:26px">${esc(yen(res.summary['投資性商品の資産合計']))}</div>
        <div class="item-sub">契約件数 ${esc(res.summary['契約件数'])}件</div>
      </div>
      ${isIfa(state) ? '<button class="btn" id="addInsurance" style="margin-bottom:12px">＋ 保険契約を登録</button>' : ''}
      <div id="insuranceList">
        ${items.length === 0 ? emptyText('登録された保険契約はありません') : items.map(insuranceCard).join('')}
      </div>
    `;

    if (isIfa(state)) {
      container.querySelector('#addInsurance').onclick = function () {
        openFormModal({
          title: '保険契約の登録',
          fields: INSURANCE_FIELDS,
          submitLabel: '登録する',
          onSubmit: async function (values) {
            await api('insurance.create', { customerId: state.customerId, values: values });
            toast('保険契約を登録しました');
            state.reload();
          }
        });
      };
    }

    container.querySelectorAll('[data-contract-id]').forEach(function (el) {
      el.onclick = function () {
        const item = items.find(function (i) { return String(i['契約ID']) === el.dataset.contractId; });
        openInsuranceDetail(item, state);
      };
    });
  });
}

function insuranceCard(item) {
  const status = item['契約ステータス'];
  const badgeClass = status === '有効' ? 'badge--on' : (status === '失効' || status === '解約済み' ? 'badge--off' : '');
  return `
    <div class="card card--tap" data-contract-id="${esc(item['契約ID'])}">
      <div class="item-head">
        <div>
          <div class="item-title">${esc(textOr(item['商品名']))}</div>
          <div class="item-sub">${esc(textOr(item['保険会社名']))}</div>
        </div>
        <span class="badge ${badgeClass}">${esc(textOr(status))}</span>
      </div>
      <div class="row" style="margin-top:8px">
        <span class="row__label">保険料</span>
        <span class="row__value num">${esc(yen(item['保険料']))} ${esc(textOr(item['支払方法・頻度'], ''))}</span>
      </div>
      ${item['投資性の有無'] === true
        ? `<div class="row"><span class="row__label">資産評価額</span><span class="row__value num">${esc(yen(item['資産評価額']))}</span></div>`
        : ''}
    </div>`;
}

function openInsuranceDetail(item, state) {
  const body = h(`
    <div>
      <div class="card">
        ${row('契約ID', item['契約ID'])}
        ${row('保険会社名', item['保険会社名'])}
        ${row('商品名', item['商品名'])}
        ${row('契約ステータス', item['契約ステータス'])}
        ${row('契約日', date(item['契約日']))}
        ${row('満期日・更新日', date(item['満期日・更新日']))}
        ${row('保険料', yen(item['保険料']))}
        ${row('支払方法・頻度', item['支払方法・頻度'])}
        ${row('次回払込日', date(item['次回払込日']))}
        ${row('保険金額', yen(item['保険金額']))}
        ${row('受取人', item['受取人'])}
        ${row('投資性の有無', bool(item['投資性の有無']))}
        ${item['投資性の有無'] === true ? row('資産評価額', yen(item['資産評価額'])) : ''}
        ${item['投資性の有無'] === true ? row('評価額更新日', date(item['評価額更新日'])) : ''}
      </div>
      <div class="card">
        <div class="stat__label">保証内容の詳細</div>
        <div>${esc(textOr(item['保証内容の詳細']))}</div>
      </div>
      ${isIfa(state) ? '<button class="btn" id="editContract">編集する</button>' : ''}
    </div>
  `);

  const modal = openModal(textOr(item['商品名'], '保険契約'), body);

  if (isIfa(state)) {
    body.querySelector('#editContract').onclick = function () {
      modal.close();
      openFormModal({
        title: '保険契約の編集',
        fields: INSURANCE_FIELDS,
        values: item,
        onSubmit: async function (values) {
          await api('insurance.update', { id: item['契約ID'], values: values });
          toast('保険契約を更新しました');
          state.reload();
        },
        onDelete: async function () {
          await api('insurance.delete', { id: item['契約ID'] });
          toast('保険契約を削除しました');
          state.reload();
        }
      });
    };
  }
}

// ============================== 投資商品 ==============================

const INVESTMENT_FIELDS = [
  { name: '商品名', label: '商品名', type: 'text', required: true },
  { name: 'ステータス', label: 'ステータス', type: 'select', required: true, options: ['保有中', '売却済み'] },
  { name: '購入日', label: '購入日', type: 'date' },
  { name: '購入金額・口数', label: '購入金額(円)・口数', type: 'number' },
  { name: '現在評価額', label: '現在評価額(円)', type: 'number', help: '手動で更新します' },
  { name: '評価額更新日', label: '評価額更新日', type: 'date' },
  { name: '評価額取得元', label: '評価額取得元', type: 'select', options: ['手動', 'API連携(将来値)'] },
  { name: '積立設定', label: '積立設定', type: 'text', help: '例: 毎月3万円 / なし' },
  { name: '想定リスク区分', label: '想定リスク区分', type: 'text', help: '例: 低 / 中 / 高' }
];

export function renderInvestment(container, state) {
  return load(container, async function () {
    const res = await api('investment.list', target(state));
    const items = res.items || [];

    container.innerHTML = `
      <div class="card">
        <div class="stat__label">投資商品の資産合計</div>
        <div class="hero__value num" style="color:var(--accent-dark);font-size:26px">${esc(yen(res.summary['投資商品の資産合計']))}</div>
        <div class="item-sub">保有件数 ${esc(res.summary['保有件数'])}件</div>
      </div>
      ${isIfa(state) ? '<button class="btn" id="addInvestment" style="margin-bottom:12px">＋ 投資商品を登録</button>' : ''}
      <div>
        ${items.length === 0 ? emptyText('登録された投資商品はありません') : items.map(investmentCard).join('')}
      </div>
    `;

    if (isIfa(state)) {
      container.querySelector('#addInvestment').onclick = function () {
        openFormModal({
          title: '投資商品の登録',
          fields: INVESTMENT_FIELDS,
          submitLabel: '登録する',
          onSubmit: async function (values) {
            await api('investment.create', { customerId: state.customerId, values: values });
            toast('投資商品を登録しました');
            state.reload();
          }
        });
      };
    }

    container.querySelectorAll('[data-investment-id]').forEach(function (el) {
      el.onclick = function () {
        const item = items.find(function (i) { return String(i['投資ID']) === el.dataset.investmentId; });
        openInvestmentDetail(item, state);
      };
    });
  });
}

function investmentCard(item) {
  // 購入金額と現在評価額がそろっている場合だけ損益を出す
  const cost = typeof item['購入金額・口数'] === 'number' ? item['購入金額・口数'] : null;
  const now = typeof item['現在評価額'] === 'number' ? item['現在評価額'] : null;
  const diff = (cost !== null && now !== null) ? now - cost : null;
  const diffColor = diff === null ? '' : (diff >= 0 ? 'color:var(--income)' : 'color:var(--expense)');

  return `
    <div class="card card--tap" data-investment-id="${esc(item['投資ID'])}">
      <div class="item-head">
        <div>
          <div class="item-title">${esc(textOr(item['商品名']))}</div>
          <div class="item-sub">${esc(textOr(item['想定リスク区分'], 'リスク区分 未設定'))}</div>
        </div>
        <span class="badge ${item['ステータス'] === '保有中' ? 'badge--on' : ''}">${esc(textOr(item['ステータス']))}</span>
      </div>
      <div class="row" style="margin-top:8px">
        <span class="row__label">現在評価額</span>
        <span class="row__value num">${esc(yen(item['現在評価額']))}</span>
      </div>
      ${diff === null ? '' : `<div class="row">
        <span class="row__label">評価損益</span>
        <span class="row__value num" style="${diffColor}">${diff >= 0 ? '+' : '-'}${esc(yen(Math.abs(diff)))}</span>
      </div>`}
    </div>`;
}

function openInvestmentDetail(item, state) {
  const body = h(`
    <div>
      <div class="card">
        ${row('投資ID', item['投資ID'])}
        ${row('商品名', item['商品名'])}
        ${row('ステータス', item['ステータス'])}
        ${row('購入日', date(item['購入日']))}
        ${row('購入金額・口数', yen(item['購入金額・口数']))}
        ${row('現在評価額', yen(item['現在評価額']))}
        ${row('評価額更新日', date(item['評価額更新日']))}
        ${row('評価額取得元', item['評価額取得元'])}
        ${row('積立設定', item['積立設定'])}
        ${row('想定リスク区分', item['想定リスク区分'])}
      </div>
      ${isIfa(state) ? '<button class="btn" id="editInvestment">編集する</button>' : ''}
    </div>
  `);

  const modal = openModal(textOr(item['商品名'], '投資商品'), body);

  if (isIfa(state)) {
    body.querySelector('#editInvestment').onclick = function () {
      modal.close();
      openFormModal({
        title: '投資商品の編集',
        fields: INVESTMENT_FIELDS,
        values: item,
        onSubmit: async function (values) {
          await api('investment.update', { id: item['投資ID'], values: values });
          toast('投資商品を更新しました');
          state.reload();
        },
        onDelete: async function () {
          await api('investment.delete', { id: item['投資ID'] });
          toast('投資商品を削除しました');
          state.reload();
        }
      });
    };
  }
}

// ============================== 銀行資産 ==============================

const BANK_FIELDS = [
  { name: '銀行名', label: '銀行名', type: 'text', required: true },
  { name: '口座種別', label: '口座種別', type: 'select', options: ['普通', '定期', '外貨', 'その他'] },
  { name: '口座番号下4桁', label: '口座番号(下4桁)', type: 'text', placeholder: '1234', help: '安全のため下4桁だけを登録します' },
  { name: '残高', label: '残高(円)', type: 'number' },
  { name: '残高更新日', label: '残高更新日', type: 'date' }
];

/** 今日の日付を 'yyyy-MM-dd' で返す(残高更新日の初期値に使う) */
function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return now.getFullYear() + '-' + month + '-' + day;
}

export function renderBank(container, state) {
  return load(container, async function () {
    const res = await api('bank.list', target(state));
    const items = res.items || [];

    container.innerHTML = `
      <div class="card">
        <div class="stat__label">預金合計</div>
        <div class="hero__value num" style="color:var(--accent-dark);font-size:26px">${esc(yen(res.summary['預金合計']))}</div>
        <div class="item-sub">口座数 ${esc(res.summary['口座数'])}件</div>
      </div>
      <button class="btn" id="addBank" style="margin-bottom:12px">＋ 口座を追加</button>
      <div>
        ${items.length === 0 ? emptyText('登録された口座はありません') : items.map(bankCard).join('')}
      </div>
      <div class="item-sub" style="text-align:center">残高はご自身で更新できます。更新すると担当者に通知されます。</div>
    `;

    container.querySelector('#addBank').onclick = function () {
      openFormModal({
        title: '口座の追加',
        fields: BANK_FIELDS,
        values: { '残高更新日': today() },
        submitLabel: '追加する',
        onSubmit: async function (values) {
          await api('bank.create', { customerId: state.customerId, values: values });
          toast('口座を追加しました');
          state.reload();
        }
      });
    };

    container.querySelectorAll('[data-bank-id]').forEach(function (el) {
      el.onclick = function () {
        const item = items.find(function (i) { return String(i['資産ID']) === el.dataset.bankId; });
        openFormModal({
          title: '口座の編集',
          fields: BANK_FIELDS,
          values: item,
          onSubmit: async function (values) {
            await api('bank.update', { id: item['資産ID'], values: values });
            toast('口座情報を更新しました');
            state.reload();
          },
          onDelete: async function () {
            await api('bank.delete', { id: item['資産ID'] });
            toast('口座を削除しました');
            state.reload();
          }
        });
      };
    });
  });
}

function bankCard(item) {
  const number = textOr(item['口座番号下4桁'], '');
  return `
    <div class="card card--tap" data-bank-id="${esc(item['資産ID'])}">
      <div class="item-head">
        <div>
          <div class="item-title">${esc(textOr(item['銀行名']))}</div>
          <div class="item-sub">${esc(textOr(item['口座種別'], '種別未設定'))}${number ? ' ****' + esc(number) : ''}</div>
        </div>
        <div style="text-align:right">
          <div class="item-amount num">${esc(yen(item['残高']))}</div>
          <div class="item-sub">${esc(date(item['残高更新日']))}時点</div>
        </div>
      </div>
    </div>`;
}

// ============================== 家計内訳 ==============================

const HOUSEHOLD_FIELDS = [
  { name: '対象年月', label: '対象年月', type: 'month', required: true },
  { name: '区分', label: '区分', type: 'select', required: true, options: ['収入', '支出'] },
  { name: 'カテゴリ', label: 'カテゴリ', type: 'text', required: true, placeholder: '例: 給与 / 家賃 / 食費' },
  { name: '金額', label: '金額(円)', type: 'number', required: true }
];

/** 今月を 'yyyy-MM' で返す */
function thisMonth() {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

export function renderHousehold(container, state) {
  return load(container, async function () {
    const res = await api('household.list', target(state));
    const items = res.items || [];
    const months = (res.summary && res.summary['月別']) || [];

    // 対象年月ごとにまとめて表示する(シートは1行=1カテゴリの縦持ちのため)
    const grouped = {};
    items.forEach(function (item) {
      const key = String(item['対象年月']);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });

    container.innerHTML = `
      <button class="btn" id="addHousehold" style="margin-bottom:12px">＋ 家計を記録する</button>
      ${months.length === 0 ? emptyText('まだ家計の記録がありません') : months.map(function (m) {
        const list = grouped[String(m['対象年月'])] || [];
        return `
          <div class="section-title">${esc(m['対象年月'])}</div>
          <div class="card">
            <div class="grid2" style="margin-bottom:10px">
              <div>
                <div class="stat__label">収入</div>
                <div class="stat__value num" style="color:var(--income)">${esc(yen(m['収入合計']))}</div>
              </div>
              <div>
                <div class="stat__label">支出</div>
                <div class="stat__value num" style="color:var(--expense)">${esc(yen(m['支出合計']))}</div>
              </div>
            </div>
            ${row('収支', yen(m['収支']))}
            ${list.map(householdRow).join('')}
          </div>`;
      }).join('')}
    `;

    container.querySelector('#addHousehold').onclick = function () {
      openFormModal({
        title: '家計の記録',
        fields: HOUSEHOLD_FIELDS,
        values: { '対象年月': thisMonth() },
        submitLabel: '記録する',
        onSubmit: async function (values) {
          await api('household.create', { customerId: state.customerId, values: values });
          toast('家計を記録しました');
          state.reload();
        }
      });
    };

    container.querySelectorAll('[data-household-id]').forEach(function (el) {
      el.onclick = function () {
        const item = items.find(function (i) { return String(i['家計内訳ID']) === el.dataset.householdId; });
        openFormModal({
          title: '家計の記録を編集',
          fields: HOUSEHOLD_FIELDS,
          values: item,
          onSubmit: async function (values) {
            await api('household.update', { id: item['家計内訳ID'], values: values });
            toast('家計の記録を更新しました');
            state.reload();
          },
          onDelete: async function () {
            await api('household.delete', { id: item['家計内訳ID'] });
            toast('家計の記録を削除しました');
            state.reload();
          }
        });
      };
    });
  });
}

function householdRow(item) {
  const color = item['区分'] === '収入' ? 'var(--income)' : 'var(--expense)';
  return `
    <div class="row card--tap" data-household-id="${esc(item['家計内訳ID'])}">
      <span class="row__label" style="color:${color}">${esc(textOr(item['区分']))} / ${esc(textOr(item['カテゴリ']))}</span>
      <span class="row__value num">${esc(yen(item['金額']))}<span class="row__chevron">›</span></span>
    </div>`;
}

// ============================== プロフィール ==============================

/** 役割によって編集できる項目が違う(GAS側 Access.gs の EDITABLE_FIELDS と対応させる) */
function profileFields(role) {
  const selfReported = [
    { name: '家族構成', label: '家族構成', type: 'textarea', placeholder: '例: 配偶者、長男(10歳)、長女(7歳)' },
    { name: 'リスク許容度', label: 'リスク許容度', type: 'text', help: '例: 安定重視 / バランス / 積極' }
  ];
  if (role !== 'ifa') return selfReported;

  return [
    { name: '氏名', label: '氏名', type: 'text', required: true },
    { name: '生年月日', label: '生年月日', type: 'date' },
    { name: 'メールアドレス', label: 'メールアドレス', type: 'email', required: true, help: 'PINコードの送信先です' }
  ].concat(selfReported);
}

export function renderProfile(container, state) {
  return load(container, async function () {
    const data = await api('customers.get', target(state));

    container.innerHTML = `
      <div class="card">
        ${row('顧客ID', data['顧客ID'])}
        ${row('氏名', data['氏名'])}
        ${row('生年月日', date(data['生年月日']))}
        ${row('メールアドレス', data['メールアドレス'])}
        ${row('連携状態', data['連携状態'])}
      </div>
      <div class="card">
        <div class="stat__label">家族構成</div>
        <div style="margin-bottom:10px">${esc(textOr(data['家族構成']))}</div>
        <div class="stat__label">リスク許容度</div>
        <div>${esc(textOr(data['リスク許容度']))}</div>
      </div>
      <button class="btn" id="editProfile">${isIfa(state) ? '顧客情報を編集' : '家族構成・リスク許容度を編集'}</button>
      ${isIfa(state) ? '<button class="btn btn--sub" id="reissuePin" style="margin-top:8px">PINコードを再発行してメール送信</button>' : ''}
      ${isIfa(state) ? '' : '<div class="item-sub" style="text-align:center;margin-top:12px">氏名・生年月日・メールアドレスの変更は担当者にご連絡ください。</div>'}
    `;

    container.querySelector('#editProfile').onclick = function () {
      openFormModal({
        title: 'プロフィールの編集',
        fields: profileFields(state.role),
        values: data,
        onSubmit: async function (values) {
          await api('customers.update', { customerId: state.customerId, values: values });
          toast('プロフィールを更新しました');
          state.reload();
        }
      });
    };

    if (isIfa(state)) {
      container.querySelector('#reissuePin').onclick = async function () {
        if (!window.confirm('PINコードを再発行し、登録メールアドレスへ送信します。よろしいですか?')) return;
        try {
          await api('customers.reissuePin', { customerId: state.customerId });
          toast('PINコードを再発行しました');
          state.reload();
        } catch (err) {
          toast(err.message || String(err), 'error');
        }
      };
    }
  });
}

// ============================== お知らせ・ログ ==============================

/**
 * お知らせ一覧。
 * 顧客は自分宛のアラートのみ(GAS側で絞り込み済み)。
 * IFAの場合は種別で絞り込むタブを出し、編集ログの確認にも使えるようにする。
 */
export function renderNotices(container, state, options = {}) {
  const type = options.type || '';
  const customerId = options.allCustomers ? '' : state.customerId;

  return load(container, async function () {
    const items = await api('logs.list', { customerId: customerId, type: type, limit: 100 });

    container.innerHTML = `
      ${isIfa(state) ? `
        <div class="tabs">
          <button data-type="" class="${type === '' ? 'is-active' : ''}">すべて</button>
          <button data-type="アラート" class="${type === 'アラート' ? 'is-active' : ''}">お知らせ</button>
          <button data-type="編集ログ" class="${type === '編集ログ' ? 'is-active' : ''}">編集ログ</button>
        </div>` : ''}
      <div>
        ${items.length === 0 ? emptyText('表示できる記録はありません') : items.map(function (item) {
          return `
            <div class="card">
              <div class="item-head">
                <span class="badge ${item['種別'] === 'アラート' ? 'badge--info' : ''}">${esc(textOr(item['種別']))}</span>
                <span class="item-sub">${esc(textOr(item['日時']))}</span>
              </div>
              <div style="margin-top:6px">${esc(textOr(item['内容']))}</div>
              ${isIfa(state) ? `<div class="item-sub">${esc(textOr(item['対象顧客ID'], '顧客指定なし'))} / ${esc(textOr(item['対象シート・項目']))}</div>` : ''}
            </div>`;
        }).join('')}
      </div>
    `;

    container.querySelectorAll('.tabs button').forEach(function (btn) {
      btn.onclick = function () {
        renderNotices(container, state, { type: btn.dataset.type, allCustomers: options.allCustomers });
      };
    });
  });
}
