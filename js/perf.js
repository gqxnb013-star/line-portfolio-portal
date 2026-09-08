/**
 * 処理時間の計測と表示(パフォーマンス調査用)
 *
 * LINEアプリ内のWebViewでは開発者ツールのコンソールを開けないため、
 * 計測結果を画面上のパネルに直接表示する。
 * 表示するのは URLに ?debug=1 が付いているときだけで、通常の利用時は何も出さない。
 * (計測そのものは常に行い、記録だけ残す。オーバーヘッドは時刻取得のみ)
 *
 * GAS側(Perf.gs)がレスポンスの _perf に返す内訳もここで一緒に表示する。
 *   往復    : ブラウザから見た通信の往復時間
 *   サーバ  : GAS内部の処理時間(往復との差がネットワーク+GASの起動時間)
 *   内訳    : line.verify(LINEの検証API) / sheet.read(シート読み込み) など
 */

const records = [];
let panel = null;

/**
 * ?debug=1 が付いているか。
 * LIFF経由だとクエリが liff.state の中に入って渡るケースがあるため両方を見る
 * (app.js の isSetupMode と同じ事情)。
 */
export function isDebugMode() {
  const search = new URLSearchParams(location.search);
  if (search.get('debug') === '1') return true;
  const liffState = search.get('liff.state');
  return !!liffState && new URLSearchParams(liffState.replace(/^\?/, '')).get('debug') === '1';
}

/**
 * 計測を1件記録する。
 * @param {string} label 何にかかった時間か(例: 'liff.init'、'api:home.summary')
 * @param {number} ms    ミリ秒
 * @param {Object} [server] GASが返した _perf(あれば内訳を表示する)
 */
export function recordPerf(label, ms, server) {
  records.push({ label: label, ms: Math.round(ms), server: server || null, at: new Date() });
  if (records.length > 50) records.shift();
  update();
}

/** 記録を全部返す(必要なら共有用にコピーできるようにするため) */
export function perfRecords() {
  return records.slice();
}

/** デバッグモードならパネルを作る。アプリ起動時に1回だけ呼ぶ */
export function setupPerfPanel() {
  if (!isDebugMode() || panel) return;

  panel = document.createElement('div');
  panel.id = 'perfPanel';
  panel.style.cssText = [
    'position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:9999',
    'max-height:45vh', 'overflow:auto', 'padding:8px 10px',
    'background:rgba(17,24,39,.94)', 'color:#e5e7eb',
    'font:11px/1.5 monospace', 'white-space:pre-wrap'
  ].join(';');
  // タップで折りたたむ(画面操作の邪魔になったときのため)
  panel.addEventListener('click', function () {
    panel.dataset.collapsed = panel.dataset.collapsed === '1' ? '' : '1';
    update();
  });
  document.body.appendChild(panel);
  update();
}

/** パネルの中身を書き直す */
function update() {
  if (!panel) return;

  const total = records.reduce(function (sum, r) { return sum + r.ms; }, 0);
  const head = '⏱ 計測 ' + records.length + '件 / 合計 ' + total + 'ms（タップで開閉）';

  if (panel.dataset.collapsed === '1') {
    panel.textContent = head;
    return;
  }

  // 新しいものが上に来るようにする
  const lines = records.slice().reverse().map(function (r) {
    let line = pad(r.ms) + 'ms  ' + r.label;
    if (r.server) {
      line += '\n        └ サーバ ' + r.server.total + 'ms' + breakdown(r.server.marks);
    }
    return line;
  });

  panel.textContent = head + '\n' + lines.join('\n');
}

/**
 * GASの内訳を「ラベル 合計ms×回数」の形に並べる。時間の長い順。
 * スマホの狭い画面でも読めるよう1項目ずつ改行する。
 */
function breakdown(marks) {
  const keys = Object.keys(marks || {});
  if (keys.length === 0) return '';
  return keys
    .sort(function (a, b) { return marks[b].ms - marks[a].ms; })
    .map(function (key) {
      return '\n           ・' + key + ' ' + marks[key].ms + 'ms×' + marks[key].count;
    })
    .join('');
}

function pad(ms) {
  return ('    ' + ms).slice(-5);
}
