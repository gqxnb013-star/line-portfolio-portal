/**
 * GAS Web App(JSON API)との通信をまとめたモジュール。
 *
 * GAS側(WebApp.gs)は必ずHTTP 200を返し、成否は本文の ok フラグで表す仕様なので、
 * ここで ok=false を例外に変換する。呼び出し側は try/catch だけを見ればよい。
 */

// GASのexec URL。ブラウザに配信される値なので秘密情報ではない
// (データへのアクセス可否はGAS側がLINEのIDトークンを検証して判断している)。
const API_URL = 'https://script.google.com/macros/s/AKfycbyyIFEawr9YGA2saXs2gfwN3yXF_FXpw_lupc7OrSTIjTLUScGOPH5V43J4uQtpUUJSQQ/exec';

/**
 * APIが返したエラー。
 * IDトークンの期限切れだけは「再ログインすれば直る」ため呼び出し側で区別できるようにする。
 */
export class ApiError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ApiError';
    // GAS側は verifyLineIdToken_ の失敗をこの文言で返す(Auth.gs)
    this.needsRelogin = /IDトークン/.test(message);
  }
}

/** 現在ログイン中のLINEアカウントのIDトークン */
function currentIdToken() {
  const token = liff.getIDToken();
  if (!token) {
    throw new ApiError('IDトークンを取得できませんでした。開き直してください。');
  }
  return token;
}

/**
 * APIを呼び出す。
 * @param {string} action WebApp.gs のaction名(例: 'home.summary')
 * @param {Object} params actionごとのパラメータ。values を含む場合はPOSTで送る
 * @return {Promise<*>} レスポンスの data
 */
export async function api(action, params = {}) {
  const payload = Object.assign({ action: action, idToken: currentIdToken() }, params);

  // 更新内容(values)はURLが長くなりやすいのでPOSTで送る。
  // Content-Type: text/plain にするとブラウザのプリフライト(OPTIONS)が発生せず、
  // OPTIONSに応答できないGASでもCORSエラーにならない。
  const json = payload.values !== undefined
    ? await requestPost(payload)
    : await requestGet(payload);

  if (!json || json.ok !== true) {
    const error = new ApiError((json && json.error) || '通信に失敗しました');
    if (error.needsRelogin) relogin();
    throw error;
  }
  sessionStorage.removeItem(RELOGIN_KEY);
  return json.data;
}

// IDトークンは一定時間で期限切れになる。その場合はログインし直せば復旧するが、
// 失敗し続けるとリダイレクトの無限ループになるため、1セッションに1回だけ試みる。
const RELOGIN_KEY = 'portal_relogin_attempted';

function relogin() {
  if (sessionStorage.getItem(RELOGIN_KEY)) return;
  sessionStorage.setItem(RELOGIN_KEY, '1');
  liff.login();
}

async function requestGet(payload) {
  const url = new URL(API_URL);
  Object.keys(payload).forEach(function (key) {
    const value = payload[key];
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  });
  const res = await fetch(url.toString());
  return await res.json();
}

async function requestPost(payload) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });
    return await res.json();
  } catch (err) {
    // GASはPOSTを別ドメインへリダイレクトするため、環境によってはここで失敗する。
    // その場合はGETで送り直す(URL長の上限に触れない範囲で救済する)。
    return await requestGet(payload);
  }
}
