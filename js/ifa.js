/**
 * IFA(担当者)専用の画面。
 *
 * - 顧客一覧: 全顧客の総資産・契約件数・連携状態を一覧し、選ぶとその顧客の画面へ入る
 * - 新規顧客登録: 顧客マスタへの追加とPINコードのメール送信(GAS側で自動送信される)
 *
 * 顧客を選んだあとの各画面(ホーム・保険・投資・預金・家計・プロフィール)は
 * customer.js を role='ifa' で使い回す。
 */

import { api } from './api.js?v=20260823b';
import { esc, yen, textOr, toast, showLoading, showError, emptyText, openFormModal } from './ui.js?v=20260823b';

const NEW_CUSTOMER_FIELDS = [
  { name: '氏名', label: '氏名', type: 'text', required: true },
  { name: 'メールアドレス', label: 'メールアドレス', type: 'email', required: true, help: 'ここへPINコードを自動送信します' },
  { name: '生年月日', label: '生年月日', type: 'date' },
  { name: '家族構成', label: '家族構成', type: 'textarea', placeholder: '例: 配偶者、長男(10歳)' },
  { name: 'リスク許容度', label: 'リスク許容度', type: 'text', help: '例: 安定重視 / バランス / 積極' }
];

/**
 * 顧客一覧画面。
 * @param {Function} onSelect (顧客ID, 氏名) => void 顧客を選んだときに呼ばれる
 */
export async function renderCustomerList(container, state, onSelect) {
  showLoading(container);
  try {
    const customers = await api('ifa.dashboard');

    container.innerHTML = `
      <button class="btn" id="addCustomer" style="margin-bottom:12px">＋ 新規顧客を登録</button>
      <div class="search-box">
        <input type="search" id="customerSearch" placeholder="氏名・顧客IDで絞り込み">
      </div>
      <div class="item-sub" style="margin-bottom:8px">登録顧客 ${esc(customers.length)}名</div>
      <div id="customerList"></div>
    `;

    const listEl = container.querySelector('#customerList');

    function draw(keyword) {
      const word = (keyword || '').trim();
      const filtered = word
        ? customers.filter(function (c) {
            return String(c['氏名']).indexOf(word) !== -1 || String(c['顧客ID']).indexOf(word) !== -1;
          })
        : customers;

      listEl.innerHTML = filtered.length === 0
        ? emptyText('該当する顧客がいません')
        : filtered.map(customerCard).join('');

      listEl.querySelectorAll('[data-customer-id]').forEach(function (el) {
        el.onclick = function () {
          const customer = customers.find(function (c) { return String(c['顧客ID']) === el.dataset.customerId; });
          onSelect(customer['顧客ID'], customer['氏名']);
        };
      });
    }

    draw('');
    container.querySelector('#customerSearch').oninput = function (e) { draw(e.target.value); };

    container.querySelector('#addCustomer').onclick = function () {
      openFormModal({
        title: '新規顧客の登録',
        fields: NEW_CUSTOMER_FIELDS,
        submitLabel: '登録してPINを送信',
        onSubmit: async function (values) {
          const created = await api('customers.create', { values: values });
          toast(created['氏名'] + ' 様を登録し、PINコードを送信しました');
          state.reload();
        }
      });
    };
  } catch (err) {
    showError(container, err.message || String(err));
  }
}

function customerCard(customer) {
  const link = customer['連携状態'];
  const badgeClass = link === '連携済み' ? 'badge--on' : (link === 'PIN発行済み' ? 'badge--info' : '');
  return `
    <div class="card card--tap" data-customer-id="${esc(customer['顧客ID'])}">
      <div class="item-head">
        <div>
          <div class="item-title">${esc(textOr(customer['氏名']))}</div>
          <div class="item-sub">${esc(customer['顧客ID'])}</div>
        </div>
        <span class="badge ${badgeClass}">${esc(textOr(link))}</span>
      </div>
      <div class="item-head" style="margin-top:8px;align-items:flex-end">
        <span class="item-sub">保険 ${esc(customer['保険契約件数'])}件 / 投資 ${esc(customer['投資商品件数'])}件</span>
        <span class="item-amount num">${esc(yen(customer['総資産']))}</span>
      </div>
    </div>`;
}
