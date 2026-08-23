/**
 * アプリの起点。LIFFの初期化・役割判定・画面の切り替えを担当する。
 *
 * 画面の出し分け:
 *   未リンク  → PIN入力画面(初回のみ)
 *   顧客      → ホーム/保険/投資/預金/家計 + お知らせ・プロフィール
 *   IFA       → 顧客一覧・ログ管理。顧客を選ぶと、その顧客の画面群へ入る
 */

import { api, ApiError } from './api.js?v=20260823b';
import { esc, toast } from './ui.js?v=20260823b';
import {
  renderHome, renderInsurance, renderInvestment,
  renderBank, renderHousehold, renderProfile, renderNotices
} from './customer.js?v=20260823b';
import { renderCustomerList } from './ifa.js?v=20260823b';

const LIFF_ID = '2011207844-O3tCgdCh';

/** 画面全体の状態。customerId は「いま表示している顧客」を指す */
const state = {
  role: '',           // 'ifa' | 'customer'
  customerId: '',
  customerName: '',
  view: 'home',
  reload: function () { renderView(); }
};

const CUSTOMER_TABS = [
  { key: 'home', icon: '🏠', label: 'ホーム' },
  { key: 'insurance', icon: '🛡️', label: '保険' },
  { key: 'investment', icon: '📈', label: '投資' },
  { key: 'bank', icon: '🏦', label: '預金' },
  { key: 'household', icon: '📝', label: '家計' }
];

const IFA_TABS = [
  { key: 'customers', icon: '👥', label: '顧客一覧' },
  { key: 'logs', icon: '📋', label: 'ログ' }
];

const root = document.getElementById('app');

// ============================== 画面の骨組み ==============================

/** IFAが顧客を選んでいない状態(顧客一覧・ログ管理)かどうか */
function isIfaConsole() {
  return state.role === 'ifa' && !state.customerId;
}

function currentTabs() {
  return isIfaConsole() ? IFA_TABS : CUSTOMER_TABS;
}

function title() {
  if (isIfaConsole()) return 'IFA管理画面';
  if (state.role === 'ifa') return state.customerName + ' 様のデータ';
  return '資産管理ポータル';
}

/** ヘッダー・本体・ボトムナビの枠を組み立て直す */
function renderShell() {
  const showHeaderButtons = !isIfaConsole();

  root.innerHTML = `
    <header class="appbar">
      <h1 class="appbar__title">${esc(title())}</h1>
      ${showHeaderButtons ? `
        <button class="appbar__btn ${state.view === 'notices' ? 'is-active' : ''}" id="navNotices" aria-label="お知らせ">🔔</button>
        <button class="appbar__btn ${state.view === 'profile' ? 'is-active' : ''}" id="navProfile" aria-label="プロフィール">👤</button>
      ` : ''}
    </header>
    ${state.role === 'ifa' && state.customerId ? `
      <div class="context-bar">
        <span>担当者モード：${esc(state.customerName)} 様</span>
        <button id="backToList">顧客一覧へ</button>
      </div>` : ''}
    <main id="main"></main>
    <nav class="bottom-nav">
      ${currentTabs().map(function (tab) {
        return `<button data-view="${tab.key}" class="${state.view === tab.key ? 'is-active' : ''}">
          <span class="icon">${tab.icon}</span><span>${esc(tab.label)}</span>
        </button>`;
      }).join('')}
    </nav>
  `;

  root.querySelectorAll('.bottom-nav button').forEach(function (btn) {
    btn.onclick = function () { go(btn.dataset.view); };
  });

  if (showHeaderButtons) {
    root.querySelector('#navNotices').onclick = function () { go('notices'); };
    root.querySelector('#navProfile').onclick = function () { go('profile'); };
  }

  const backBtn = root.querySelector('#backToList');
  if (backBtn) {
    backBtn.onclick = function () {
      state.customerId = '';
      state.customerName = '';
      go('customers');
    };
  }
}

/** 表示する画面を切り替える */
function go(view) {
  state.view = view;
  renderShell();
  renderView();
}

/** 現在のviewに対応する描画関数を呼ぶ */
function renderView() {
  const main = document.getElementById('main');
  switch (state.view) {
    case 'home': return renderHome(main, state);
    case 'insurance': return renderInsurance(main, state);
    case 'investment': return renderInvestment(main, state);
    case 'bank': return renderBank(main, state);
    case 'household': return renderHousehold(main, state);
    case 'profile': return renderProfile(main, state);
    case 'notices': return renderNotices(main, state);
    case 'customers': return renderCustomerList(main, state, selectCustomer);
    case 'logs': return renderNotices(main, state, { allCustomers: true });
    default: return renderHome(main, state);
  }
}

/** IFAが顧客一覧から1人選んだとき */
function selectCustomer(customerId, customerName) {
  state.customerId = customerId;
  state.customerName = customerName;
  go('home');
}

// ============================== 単独表示の画面 ==============================

/** ナビゲーションを持たない1画面だけの表示(PIN入力・IFA登録・エラー) */
function renderStandalone(html) {
  root.innerHTML = `<div class="standalone">${html}</div>`;
}

function renderStatus(message) {
  renderStandalone(`<h1>資産管理ポータル</h1><p>${esc(message)}</p>`);
}

function renderFatalError(message) {
  renderStandalone(`
    <h1>読み込みに失敗しました</h1>
    <div class="error-box">${esc(message)}</div>
    <button class="btn btn--sub" onclick="location.reload()">再読み込み</button>
  `);
}

/** 初回のみ表示するPIN入力画面 */
function renderPinForm() {
  renderStandalone(`
    <h1>アカウント連携</h1>
    <p>担当者から届いたメールに記載のPINコードを入力してください。（発行から24時間で期限切れになります）</p>
    <div class="field">
      <input type="text" id="pinInput" inputmode="numeric" maxlength="6" placeholder="6桁のPINコード">
    </div>
    <button class="btn" id="pinSubmit">連携する</button>
    <p id="pinMsg" style="margin-top:12px"></p>
  `);

  const btn = document.getElementById('pinSubmit');
  btn.onclick = async function () {
    const pin = document.getElementById('pinInput').value.trim();
    if (!pin) { toast('PINコードを入力してください', 'error'); return; }

    btn.disabled = true;
    btn.textContent = '確認中...';
    try {
      await api('linkPin', { pin: pin });
      renderStatus('連携が完了しました。画面を読み込み直しています...');
      await start(); // 連携直後は顧客として扱えるので、そのまま本体を開く
    } catch (err) {
      toast(err.message || String(err), 'error');
      btn.disabled = false;
      btn.textContent = '連携する';
    }
  };
}

/** ?setup=ifa でのみ開く、IFA本人登録画面(初回セットアップ専用) */
function renderIfaSetupForm() {
  renderStandalone(`
    <h1>担当者本人の登録</h1>
    <p>初回セットアップ専用の画面です。GASのスクリプトプロパティに設定した合言葉を入力してください。</p>
    <div class="field">
      <input type="password" id="secretInput" placeholder="合言葉">
    </div>
    <button class="btn" id="secretSubmit">登録する</button>
    <p id="secretMsg" style="margin-top:12px"></p>
  `);

  const btn = document.getElementById('secretSubmit');
  btn.onclick = async function () {
    btn.disabled = true;
    btn.textContent = '確認中...';
    try {
      const res = await api('registerIfa', { secret: document.getElementById('secretInput').value });
      renderStatus('担当者として登録しました(LINE UserID: ' + res.lineUserId + ')。以後 ?setup=ifa は使わないでください。');
    } catch (err) {
      toast(err.message || String(err), 'error');
      btn.disabled = false;
      btn.textContent = '登録する';
    }
  };
}

/**
 * ?setup=ifa の判定。
 * LIFFのURL(liff.line.me/{LIFF_ID}?setup=ifa)経由だと、クエリが
 * liff.state パラメータの中に入って渡ってくるケースがあるため両方を見る。
 */
function isSetupMode() {
  const search = new URLSearchParams(location.search);
  if (search.get('setup') === 'ifa') return true;
  const liffState = search.get('liff.state');
  return !!liffState && new URLSearchParams(liffState.replace(/^\?/, '')).get('setup') === 'ifa';
}

// ============================== 起動 ==============================

/** 役割を判定して最初の画面を開く */
async function start() {
  const res = await api('role');
  state.role = res.role;

  if (res.role === 'unlinked') {
    renderPinForm();
    return;
  }
  if (res.role === 'customer') {
    state.customerId = res.customerId;
    go('home');
    return;
  }
  // IFAは顧客を選ぶところから始める
  go('customers');
}

async function init() {
  renderStatus('読み込み中...');
  try {
    await liff.init({ liffId: LIFF_ID });
    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }

    if (isSetupMode()) {
      renderIfaSetupForm();
      return;
    }
    await start();
  } catch (err) {
    // IDトークンの期限切れは再ログインで解消するので、api.js側で自動的に処理される
    if (err instanceof ApiError && err.needsRelogin) {
      renderStatus('ログインをやり直しています...');
      return;
    }
    renderFatalError(err.message || String(err));
  }
}

init();
