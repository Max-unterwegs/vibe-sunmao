/**
 * 界面层：落地页 / 关卡面板 / 工具条 / 结课问答 / 图谱 / 提示
 */
import { ending, gallery as galleryInfo, intro } from '../data/knowledge.js';

const ICONS = {
  reset: '<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v4.6h4.6"/>',
  explode: '<path d="M12 3v5M12 16v5M3 12h5M16 12h5"/><path d="M6.4 6.4l3.2 3.2M14.4 14.4l3.2 3.2M17.6 6.4l-3.2 3.2M9.6 14.4l-3.2 3.2"/>',
  guides: '<path d="M4.5 19.5L19.5 4.5"/><circle cx="8.4" cy="15.6" r="1.5"/><circle cx="15.6" cy="8.4" r="1.5"/>',
  sound: '<path d="M4 9.5v5h3.5l4.5 3.7V5.8L7.5 9.5H4z"/><path d="M16 8.6a4.6 4.6 0 0 1 0 6.8"/><path d="M18.6 6.2a8 8 0 0 1 0 11.6"/>',
  mute: '<path d="M4 9.5v5h3.5l4.5 3.7V5.8L7.5 9.5H4z"/><path d="M16.4 9.6l5 4.8M21.4 9.6l-5 4.8"/>',
  help: '<circle cx="12" cy="12" r="8.4"/><path d="M9.4 9.3a2.7 2.7 0 1 1 3.9 2.5c-.6.3-1 .9-1 1.6v.5"/><circle cx="12.3" cy="17" r=".7"/>',
  info: '<path d="M5.5 4.5h9l4 4v11h-13z"/><path d="M9 10h5.5M9 13.5h5.5M9 17h3.5"/>',
  atlas: '<rect x="4.2" y="4.2" width="6.2" height="6.2" rx="1.2"/><rect x="13.6" y="4.2" width="6.2" height="6.2" rx="1.2"/><rect x="4.2" y="13.6" width="6.2" height="6.2" rx="1.2"/><rect x="13.6" y="13.6" width="6.2" height="6.2" rx="1.2"/>',
};

const TOOLS = [
  { id: 'reset', label: '重置', key: 'R' },
  { id: 'explode', label: '爆炸', key: 'X' },
  { id: 'guides', label: '辅助', key: 'G' },
  { id: 'sound', label: '声音', key: 'M' },
  { id: 'help', label: '帮助', key: 'H' },
  { id: 'info', label: '知识', key: '', mobile: true },
  { id: 'atlas', label: '图谱', key: '', mobile: true },
];

const $ = (sel, root = document) => root.querySelector(sel);

function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

export class UI {
  constructor(handlers = {}) {
    this.h = handlers;
    this.el = {
      app: $('#app'),
      rail: $('#rail'),
      panel: $('#panel'),
      toolbar: $('#toolbar'),
      hint: $('#hintText'),
      hintbar: $('#hintbar'),
      landing: $('#landing'),
      cards: $('#landingCards'),
      controls: $('#landingControls'),
      modal: $('#modal'),
      modalCard: $('#modalCard'),
      toast: $('#toast'),
      label: $('#pieceLabel'),
      rotate: $('#rotateWidget'),
      angle: $('#angleVal'),
      camera: $('#cameraWidget'),
      loader: $('#loader'),
      loaderBar: $('#loaderBar'),
      loaderText: $('#loaderText'),
      fallback: $('#fallback'),
      brand: $('#brand'),
    };
    this.mode = 'landing';
    this._toastTimer = 0;
    this._def = null;
    this._tab = 0;
    this._steps = [];
    this._buildToolbar();
    this._bindGlobal();
    this.renderLandingControls();
    this.setAppMode('landing');
  }

  /* ------------------------------- 基础构建 ------------------------------- */
  _buildToolbar() {
    this.el.toolbar.innerHTML = TOOLS.map((t) => `
      <button class="tool ${t.mobile ? 'tool-mobile' : ''}" data-tool="${t.id}" title="${t.label}${t.key ? ` (${t.key})` : ''}">
        ${icon(t.id)}
        <span>${t.label}</span>
        <kbd>${t.key}</kbd>
      </button>`).join('');
    this.el.toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tool]');
      if (!btn) return;
      this.h.onTool?.(btn.dataset.tool);
    });
    const cw = this.el.camera;
    cw.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cam]');
      if (btn) this.h.onCam?.(btn.dataset.cam);
    });
    this.el.rotate.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-rot]');
      if (btn) this.h.onRotate?.(Number(btn.dataset.rot));
    });
  }

  _bindGlobal() {
    $('#btnStart').addEventListener('click', () => {
      this.h.onStart?.();
    });
    $('#btnGallery').addEventListener('click', () => this.h.onGallery?.());
    this.el.landing.addEventListener('click', (e) => {
      const card = e.target.closest('[data-level]');
      if (card) this.h.onLevel?.(Number(card.dataset.level));
    });
    this.el.rail.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-nav]');
      if (!btn) return;
      if (btn.dataset.nav === 'gallery') this.h.onGallery?.();
      else this.h.onLevel?.(Number(btn.dataset.nav));
    });
    this.el.modal.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) this.closeModal();
    });
    this.el.panel.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (tab) {
        this._tab = Number(tab.dataset.tab);
        this.renderTabBody();
      }
      const nav = e.target.closest('[data-goto]');
      if (nav) this.h.onLevel?.(Number(nav.dataset.goto));
    });
  }

  setAppMode(mode) {
    this.mode = mode;
    this.el.app.classList.remove('mode-landing', 'mode-level', 'mode-gallery');
    this.el.app.classList.add(`mode-${mode}`);
    this.el.landing.classList.toggle('hidden', mode !== 'landing');
    if (mode !== 'level' && mode !== 'gallery') this.el.app.classList.remove('panel-open');
  }

  togglePanel(force) {
    const open = typeof force === 'boolean' ? force : !this.el.app.classList.contains('panel-open');
    this.el.app.classList.toggle('panel-open', open);
  }

  /* -------------------------------- 加载 --------------------------------- */
  setLoader(progress, text) {
    if (this.el.loaderBar) this.el.loaderBar.style.width = `${Math.round(progress * 100)}%`;
    if (text && this.el.loaderText) this.el.loaderText.textContent = text;
  }

  hideLoader() {
    this.el.loader.classList.add('hidden');
    this.el.app.classList.remove('is-loading');
  }

  showFallback() {
    this.el.fallback.hidden = false;
    this.el.loader.classList.add('hidden');
  }

  /* -------------------------------- 落地页 -------------------------------- */
  renderLandingControls() {
    this.el.controls.innerHTML = intro.controls
      .map((c) => `<div><b>${c.k}</b>${c.v}</div>`)
      .join('');
  }

  showLanding(progress) {
    this.setAppMode('landing');
    this.el.cards.innerHTML = progress.list.map((item, i) => {
      const p = progress.levels[item.id] || {};
      const locked = i > progress.unlocked;
      const done = !!p.done;
      return `
        <button class="level-card ${locked ? 'locked' : ''} ${done ? 'done' : ''}"
          data-level="${i}" ${locked ? 'aria-disabled="true"' : ''}
          style="animation-delay:${0.08 * i + 0.15}s">
          <div class="n">${item.numeral}</div>
          <h3>${item.name}</h3>
          <p>${item.joint} · ${item.tags.slice(0, 2).join(' · ')}</p>
          <div class="card-foot">
            <span class="card-tag">${locked ? '尚未解锁' : done ? '已研习 · 可重温' : '待研习'}</span>
            <span class="arrow">→</span>
          </div>
        </button>`;
    }).join('');
  }

  /* --------------------------------- 关卡 --------------------------------- */
  showLevel(def, progress) {
    const info = def.info;
    this._def = def;
    this._tab = 0;
    this.setAppMode('level');
    this.el.panel.innerHTML = `
      <div class="panel-head">
        <div class="panel-kicker">第 ${info.numeral} 关 · ${info.en}</div>
        <div class="panel-title">${info.name} <small>${info.joint}</small></div>
        <div class="panel-seal">${info.numeral}</div>
        <p class="panel-lede">${info.lede}</p>
      </div>
      <div class="tabs">
        ${info.tabs.map((t, i) => `<button class="tab ${i === 0 ? 'active' : ''}" data-tab="${i}">${t.name}</button>`).join('')}
      </div>
      <div class="panel-body" id="tabBody"></div>
      <div class="steps" id="stepWrap"></div>`;
    this.renderTabBody();
    this.setHint('拖拽木料，推入装配 · 左键空白处旋转视角');
    this.renderRail(progress, def.index);
    this.el.app.classList.remove('panel-open');
  }

  renderTabBody() {
    if (!this._def) return;
    const info = this._def.info;
    const tab = info.tabs[this._tab] || info.tabs[0];
    const body = $('#tabBody', this.el.panel);
    if (!body) return;
    body.innerHTML = `
      ${tab.blocks.map((b, i) => `
        <div class="block" style="animation-delay:${i * 0.05}s">
          <h4>${b.h}</h4><p>${b.p}</p>
        </div>`).join('')}
      <div class="stats">
        ${info.stats.map((s) => `<div class="stat"><span>${s.k}</span><b>${s.v}</b></div>`).join('')}
      </div>
      <div class="tags">${info.tags.map((t) => `<span class="tag">${t}</span>`).join('')}</div>
      <div class="craft">“${info.craft}”<small>匠 诀</small></div>
      <div style="height:6px"></div>`;
    const tabs = this.el.panel.querySelectorAll('[data-tab]');
    tabs.forEach((t, i) => t.classList.toggle('active', i === this._tab));
  }

  setSteps(steps) {
    this._steps = steps;
    const wrap = $('#stepWrap', this.el.panel);
    if (!wrap) return;
    const done = steps.filter((s) => s.done).length;
    const active = steps.findIndex((s) => !s.done);
    wrap.innerHTML = `
      <div class="steps-head"><b>装 配 步 序</b><span>${done} / ${steps.length}</span></div>
      ${steps.map((s, i) => `
        <div class="step ${s.done ? 'done' : ''} ${i === active ? 'active' : ''}">
          <div class="idx">${s.done ? '✓' : i + 1}</div>
          <div class="txt">${s.label}</div>
        </div>`).join('')}`;
  }

  setHint(text) {
    if (this.el.hint) this.el.hint.textContent = text;
  }

  renderRail(progress, current) {
    const items = progress.list.map((l, i) => {
      const locked = i > progress.unlocked;
      const done = progress.levels[l.id]?.done;
      return `<button data-nav="${i}" class="${current === i && this.mode === 'level' ? 'active' : ''} ${locked ? 'locked' : ''} ${done ? 'done' : ''}" title="${l.name}" ${locked ? 'disabled' : ''}>
        ${l.numeral}<i class="dot"></i>
      </button>`;
    }).join('');
    this.el.rail.innerHTML = `${items}<div class="rail-sep"></div>
      <button data-nav="gallery" class="${this.mode === 'gallery' ? 'active' : ''}" title="榫卯图谱">图</button>`;
  }

  /* --------------------------------- 图谱 --------------------------------- */
  showGallery(progress) {
    this.setAppMode('gallery');
    this.el.panel.innerHTML = `
      <div class="panel-head">
        <div class="panel-kicker">ATLAS · ${galleryInfo.subtitle}</div>
        <div class="panel-title">榫卯图谱 <small>四器四法</small></div>
        <div class="panel-seal">观</div>
        <p class="panel-lede">${galleryInfo.desc}</p>
      </div>
      <div class="panel-body">
        <div class="atlas">
          ${progress.list.map((l, i) => {
            const done = progress.levels[l.id]?.done;
            const locked = i > progress.unlocked;
            return `<button class="atlas-row" data-goto="${i}" ${locked ? 'disabled style="opacity:.45"' : ''}>
              <span class="an">${l.numeral}</span>
              <span><b>${l.name} · ${l.joint}</b><small>${l.tags.join(' / ')}</small></span>
              <span class="st">${locked ? '未解锁' : done ? '已研习' : '进入 →'}</span>
            </button>`;
          }).join('')}
        </div>
        <div class="craft">“不用一钉，以形锁力。”<small>中 国 木 作</small></div>
        <div style="height:8px"></div>
      </div>`;
    this.renderRail(progress, -1);
    this.setHint('拖拽旋转 · 滚轮缩放 · 点击左侧图谱条目进入关卡');
  }

  /* -------------------------------- 悬停木牌 ------------------------------- */
  setHoverLabel(text, x, y, show) {
    const label = this.el.label;
    if (!label) return;
    if (show && text) {
      if (label.textContent !== text) label.textContent = text;
      label.style.left = `${x}px`;
      label.style.top = `${y}px`;
      label.classList.add('show');
    } else {
      label.classList.remove('show');
    }
  }

  /* --------------------------------- 工具态 -------------------------------- */
  setToolActive(id, on) {
    const btn = this.el.toolbar.querySelector(`[data-tool="${id}"]`);
    if (!btn) return;
    btn.classList.toggle('active', !!on);
    if (id === 'sound') {
      const span = btn.querySelector('svg');
      if (span) span.outerHTML = icon(on ? 'sound' : 'mute');
    }
  }

  setRotation(state) {
    const { visible, angle = 0, aligned = false } = state;
    this.el.rotate.hidden = !visible;
    if (!visible) return;
    const deg = Math.round((angle * 180) / Math.PI);
    this.el.angle.textContent = deg === 0 ? '0°' : `${deg}°`;
    const box = this.el.angle.parentElement;
    box.classList.toggle('aligned', aligned);
    const small = box.querySelector('small');
    if (small) small.textContent = aligned ? '已对齐' : '待对齐';
  }

  /* ---------------------------------- 提示 --------------------------------- */
  toast(text, ms = 2400) {
    const t = this.el.toast;
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  /* ---------------------------------- 弹层 --------------------------------- */
  openModal(html, { className = '' } = {}) {
    this.el.modalCard.className = `modal-card ${className}`;
    this.el.modalCard.innerHTML = html;
    this.el.modal.classList.add('open');
    this.el.modal.setAttribute('aria-hidden', 'false');
  }

  closeModal() {
    this.el.modal.classList.remove('open');
    this.el.modal.setAttribute('aria-hidden', 'true');
    this.h.onModalClose?.();
  }

  showHelp() {
    this.openModal(`
      <button class="modal-close" data-close aria-label="关闭">×</button>
      <div class="modal-body" style="margin-top:6px">
        <div class="kicker">操 作 指 南</div>
        <h2 style="font-size:26px;letter-spacing:.12em">如何研习</h2>
        <div class="help-list">
          <div><span>拖拽木料</span><kbd>左键按住</kbd></div>
          <div><span>旋转视角</span><kbd>左键拖空白</kbd></div>
          <div><span>缩放</span><kbd>滚轮 / 双指</kbd></div>
          <div><span>旋转木料（燕尾榫）</span><kbd>Q / E</kbd></div>
          <div><span>重置本关</span><kbd>R</kbd></div>
          <div><span>爆炸视图</span><kbd>X</kbd></div>
          <div><span>辅助线</span><kbd>G</kbd></div>
          <div><span>声音</span><kbd>M</kbd></div>
        </div>
        <div class="modal-actions">
          <button class="btn primary" data-close>开 始 装 配</button>
        </div>
      </div>`);
  }

  showComplete({ def, isLast, hasNext, quiz, onAnswer, onNext, onGallery, onReplay }) {
    const info = def.info;
    const options = quiz.options.map((o, i) => `
      <button class="quiz-opt" data-opt="${i}">
        <span class="letter">${String.fromCharCode(65 + i)}</span>${o}
      </button>`).join('');
    const desc = isLast
      ? ending.desc
      : `你已让「${info.joint}」严丝合缝。<br/>${info.lede}`;
    this.openModal(`
      <button class="modal-close" data-close aria-label="关闭">×</button>
      <div class="modal-seal">${ending.seal}</div>
      <div class="modal-body">
        <div class="kicker">第 ${info.numeral} 关 · 完 成</div>
        <h2>${ending.title}</h2>
        <p>${desc}</p>
        <div class="quiz">
          <div class="quiz-q"><span>随 堂 一 问</span>${quiz.q}</div>
          <div id="quizOpts">${options}</div>
          <div id="quizFeed"><div class="modal-hint">选 择 答 案 后 继 续</div></div>
        </div>
        <div class="modal-actions" id="modalActions" style="display:none">
          ${hasNext ? '<button class="btn primary" data-next>下一关 →</button>' : '<button class="btn primary" data-next>进入图谱</button>'}
          <button class="btn ghost" data-replay>再看一眼</button>
          <button class="btn ghost" data-gallery>图谱</button>
        </div>
      </div>`, { className: 'complete' });

    const opts = this.el.modalCard.querySelectorAll('[data-opt]');
    let solved = false;
    opts.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (solved) return;
        const idx = Number(btn.dataset.opt);
        if (idx === quiz.answer) {
          solved = true;
          btn.classList.add('correct');
          btn.querySelector('.letter').textContent = '✓';
          const feed = this.el.modalCard.querySelector('#quizFeed');
          feed.innerHTML = `<div class="quiz-explain">${quiz.explain}</div>`;
          const actions = this.el.modalCard.querySelector('#modalActions');
          actions.style.display = 'flex';
          actions.animate?.(
            [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
            { duration: 450, easing: 'cubic-bezier(.22,.8,.26,1)' },
          );
          onAnswer?.(true);
        } else {
          btn.classList.add('wrong');
          btn.animate?.(
            [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
            { duration: 320 },
          );
          setTimeout(() => btn.classList.remove('wrong'), 900);
          onAnswer?.(false);
        }
      });
    });

    this.el.modalCard.querySelector('[data-next]')?.addEventListener('click', () => {
      this.closeModal();
      onNext?.();
    });
    this.el.modalCard.querySelector('[data-replay]')?.addEventListener('click', () => {
      this.closeModal();
      onReplay?.();
    });
    this.el.modalCard.querySelector('[data-gallery]')?.addEventListener('click', () => {
      this.closeModal();
      onGallery?.();
    });
  }

  setNavProgress(progress, current) {
    this.renderRail(progress, current);
  }

  showHintBar(show) {
    this.el.hintbar.style.opacity = show ? '1' : '0';
  }
}
