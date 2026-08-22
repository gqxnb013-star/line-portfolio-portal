/**
 * 画面を組み立てるための共通部品。
 *
 * フレームワークは使わず、HTML文字列 + 少量のDOM操作で描画する。
 * ビルド不要でGitHub Pagesにそのまま置けることを優先した構成。
 */

/** HTML文字列から要素を作る */
export function h(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

/**
 * シートの値をそのまま画面に出すため、必ずここでエスケープする。
 * (氏名や商品名にHTMLの記号が含まれても壊れないようにする)
 */
export function esc(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 空の値をハイフンに置き換えて表示する */
export function textOr(value, fallback = '—') {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return String(value);
}

/** 金額表示。数値でない場合はハイフンにする */
export function yen(value) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!isFinite(n) || value === '' || value === null || value === undefined) return '—';
  return '¥' + n.toLocaleString('ja-JP');
}

/** 'yyyy-MM-dd' を 'yyyy/MM/dd' にする(空ならハイフン) */
export function date(value) {
  const text = textOr(value, '');
  if (!text) return '—';
  return text.replace(/-/g, '/');
}

/** 真偽値の表示 */
export function bool(value, onText = 'あり', offText = 'なし') {
  return value === true || value === 'true' ? onText : offText;
}

/** 「項目名 : 値」の1行 */
export function row(label, value) {
  return `<div class="row"><span class="row__label">${esc(label)}</span><span class="row__value num">${esc(textOr(value))}</span></div>`;
}

/** 読み込み中の表示に差し替える */
export function showLoading(container) {
  container.innerHTML = '<div class="loading">読み込み中...</div>';
}

/** 画面全体のエラー表示 */
export function showError(container, message) {
  container.innerHTML = `<div class="error-box">${esc(message)}</div>`;
}

/** 一覧が空のときの表示 */
export function emptyText(message) {
  return `<div class="empty">${esc(message)}</div>`;
}

/** 画面下部に数秒だけ出る通知 */
export function toast(message, type = 'info') {
  const el = h(`<div class="toast ${type === 'error' ? 'toast--error' : ''}">${esc(message)}</div>`);
  document.body.appendChild(el);
  setTimeout(function () { el.remove(); }, type === 'error' ? 4000 : 2200);
}

/**
 * ボトムシート形式のモーダルを開く。
 * @param {string} title 見出し
 * @param {Node} content 中身
 * @return {{close: Function}}
 */
export function openModal(title, content) {
  const backdrop = h(`
    <div class="modal-backdrop">
      <div class="modal">
        <div class="modal__head">
          <h2 class="modal__title">${esc(title)}</h2>
          <button class="modal__close" type="button" aria-label="閉じる">✕</button>
        </div>
        <div class="modal__body"></div>
      </div>
    </div>
  `);
  backdrop.querySelector('.modal__body').appendChild(content);

  function close() { backdrop.remove(); }
  backdrop.querySelector('.modal__close').onclick = close;
  // 背景(オーバーレイ)のタップだけで閉じる。中身のタップでは閉じない
  backdrop.onclick = function (e) { if (e.target === backdrop) close(); };

  document.body.appendChild(backdrop);
  return { close: close };
}

/**
 * 項目定義からフォームを組み立てる。
 *
 * fields の要素:
 *   { name: 'シートの列名', label: '表示名', type: 'text|number|date|month|select|textarea|checkbox|email',
 *     options: ['選択肢'], required: true, help: '補足', placeholder: '' }
 *
 * 値の型変換(日付・数値・真偽値)はGAS側の parseValue_ が行うため、
 * ここでは文字列のまま送ってよい。
 *
 * @return {{element: HTMLFormElement, getValues: Function, validate: Function}}
 */
export function buildForm(fields, values = {}) {
  const form = document.createElement('form');
  form.noValidate = true;

  fields.forEach(function (field) {
    const value = values[field.name];
    form.appendChild(h(fieldHtml(field, value)));
  });

  function getValues() {
    const result = {};
    fields.forEach(function (field) {
      const input = form.elements[field.name];
      if (!input) return;
      if (field.type === 'checkbox') {
        // GAS側の parseValue_ が 'true'/'false' を真偽値に戻す
        result[field.name] = input.checked ? 'true' : 'false';
      } else {
        result[field.name] = input.value.trim();
      }
    });
    return result;
  }

  /** 必須項目の未入力を検出する。問題があればメッセージを返す */
  function validate() {
    const current = getValues();
    const missing = fields
      .filter(function (f) { return f.required && !current[f.name]; })
      .map(function (f) { return f.label; });
    return missing.length > 0 ? '入力してください: ' + missing.join('、') : null;
  }

  return { element: form, getValues: getValues, validate: validate };
}

function fieldHtml(field, value) {
  const label = `<label class="field__label" for="f_${field.name}">${esc(field.label)}${field.required ? '<span class="req">*</span>' : ''}</label>`;
  const help = field.help ? `<div class="field__help">${esc(field.help)}</div>` : '';
  const val = value === undefined || value === null ? '' : String(value);

  if (field.type === 'checkbox') {
    const checked = (value === true || value === 'true') ? 'checked' : '';
    return `<div class="field field--check">
      <input type="checkbox" id="f_${field.name}" name="${field.name}" ${checked}>
      <label for="f_${field.name}">${esc(field.label)}</label>
    </div>`;
  }

  if (field.type === 'select') {
    const options = (field.options || []).map(function (option) {
      return `<option value="${esc(option)}" ${option === val ? 'selected' : ''}>${esc(option)}</option>`;
    }).join('');
    return `<div class="field">${label}
      <select id="f_${field.name}" name="${field.name}">
        <option value="">（未選択）</option>${options}
      </select>${help}</div>`;
  }

  if (field.type === 'textarea') {
    return `<div class="field">${label}
      <textarea id="f_${field.name}" name="${field.name}" placeholder="${esc(field.placeholder || '')}">${esc(val)}</textarea>${help}</div>`;
  }

  const type = field.type || 'text';
  // 数値欄はスマホで数字キーボードが出るようにする
  const inputmode = type === 'number' ? ' inputmode="numeric"' : '';
  return `<div class="field">${label}
    <input type="${type}" id="f_${field.name}" name="${field.name}" value="${esc(val)}"${inputmode} placeholder="${esc(field.placeholder || '')}">${help}</div>`;
}

/**
 * フォームを載せたモーダルを開き、保存ボタンの制御までまとめて行う。
 * @param {Object} config { title, fields, values, submitLabel, onSubmit(values), onDelete }
 */
export function openFormModal(config) {
  const form = buildForm(config.fields, config.values || {});
  const wrapper = document.createElement('div');
  wrapper.appendChild(form.element);

  const actions = h(`
    <div>
      <button type="button" class="btn" id="modalSubmit">${esc(config.submitLabel || '保存する')}</button>
      ${config.onDelete ? '<button type="button" class="btn btn--danger" id="modalDelete" style="margin-top:8px">削除する</button>' : ''}
    </div>
  `);
  wrapper.appendChild(actions);

  const modal = openModal(config.title, wrapper);
  const submitBtn = actions.querySelector('#modalSubmit');

  submitBtn.onclick = async function () {
    const message = form.validate();
    if (message) { toast(message, 'error'); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = '保存中...';
    try {
      await config.onSubmit(form.getValues());
      modal.close();
    } catch (err) {
      toast(err.message || String(err), 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = config.submitLabel || '保存する';
    }
  };

  if (config.onDelete) {
    actions.querySelector('#modalDelete').onclick = async function () {
      if (!window.confirm('この内容を削除します。よろしいですか?')) return;
      try {
        await config.onDelete();
        modal.close();
      } catch (err) {
        toast(err.message || String(err), 'error');
      }
    };
  }

  return modal;
}
