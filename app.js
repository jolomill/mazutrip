(() => {
  const STORAGE_KEY = 'matsu-progress-v1';
  const app = document.getElementById('app');
  let config = null;

  // All interpolated values pass through escapeHtml — no raw user/config data reaches the DOM.
  function setHTML(el, html) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.deleteContents();
    el.appendChild(range.createContextualFragment(html));
  }

  // ---------- storage ----------
  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch { return {}; }
  }
  function saveProgress(p) { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); }
  function setSolved(id, payload) {
    const p = loadProgress();
    p[id] = { ...(p[id] || {}), solved: true, ts: Date.now(), ...payload };
    saveProgress(p);
  }
  function markDiscovered(id) {
    const p = loadProgress();
    if (!p[id]) { p[id] = { discovered: true }; saveProgress(p); }
  }
  function resetProgress() {
    if (confirm('確定要清除所有進度嗎？此動作無法復原。')) {
      localStorage.removeItem(STORAGE_KEY);
      navigate(null);
    }
  }

  // ---------- routing ----------
  function getStationId() {
    return new URL(window.location.href).searchParams.get('p');
  }
  function navigate(id) {
    const u = new URL(window.location.href);
    if (id) u.searchParams.set('p', id); else u.searchParams.delete('p');
    history.pushState({}, '', u.toString());
    render();
  }
  window.addEventListener('popstate', render);

  const SOLVED_ICONS = ['⭐', '🦀', '🐚', '⚓'];

  // ---------- home ----------
  function renderHome() {
    const progress = loadProgress();
    const total = config.stations.length;
    const solvedCount = config.stations.filter(s => progress[s.id]?.solved).length;
    const pct = total ? Math.round((solvedCount / total) * 100) : 0;
    const allDone = solvedCount === total && total > 0;

    const stamps = config.stations.map((s, i) => {
      const entry = progress[s.id];
      const solved = !!entry?.solved;
      const discovered = solved || !!entry?.discovered;
      const solvedIcon = SOLVED_ICONS[i % SOLVED_ICONS.length];

      let cls, inner, styleAttr = '';
      if (solved) {
        cls = 'solved';
        const photo = entry?.photo;
        if (photo) {
          styleAttr = ` style="background-image:url('${photo}');background-size:cover;background-position:center;"`;
        }
        inner = `<span class="stamp-overlay"></span>
                 <span class="stamp-name">${escapeHtml(s.name)}</span>`;
      } else if (discovered) {
        cls = 'discovered';
        inner = `<span class="stamp-island">${escapeHtml(s.island || '')}</span>
                 <span class="stamp-name">${escapeHtml(s.name)}</span>
                 <span class="stamp-solved-icon">📖</span>`;
      } else {
        cls = 'locked';
        inner = `<span class="stamp-lock">🔒</span>`;
      }

      return `
        <div class="stamp ${cls}"${styleAttr} data-id="${escapeHtml(s.id)}" data-unlocked="${discovered}"
             role="${discovered ? 'button' : 'img'}" tabindex="${discovered ? '0' : '-1'}"
             aria-label="${discovered ? escapeHtml(s.name) : '尚未解鎖，請碰 NFC 卡片'}">
          ${inner}
        </div>`;
    }).join('');

    setHTML(app, `
      <header class="app-header">
        <h1>${escapeHtml(config.title)}</h1>
        <p class="subtitle">${escapeHtml(config.subtitle || '')}</p>
        <div class="progress-track">
          <div class="progress-bar"><span style="width:${pct}%"></span></div>
          <span class="progress-label">${solvedCount}／${total}</span>
        </div>
      </header>
      ${allDone ? `<div class="finish-banner">🎉 ${escapeHtml(config.finishMessage || '全部完成！')}</div>` : ''}
      <p class="stamp-section-label">碰 NFC 卡片解鎖關卡</p>
      <div class="stamp-grid">${stamps}</div>
      <footer class="app-footer">
        <div>進度自動儲存在本機裝置</div>
        <button id="reset-btn">清除全部進度</button>
      </footer>
    `);

    app.querySelectorAll('.stamp[data-unlocked="true"]').forEach(el => {
      el.addEventListener('click', () => navigate(el.dataset.id));
      el.addEventListener('keydown', e => { if (e.key === 'Enter') navigate(el.dataset.id); });
    });
    app.querySelector('#reset-btn')?.addEventListener('click', resetProgress);
  }

  // ---------- station ----------
  function renderStation(id) {
    const station = config.stations.find(s => s.id === id);
    if (!station) {
      setHTML(app, `
        <button class="back-btn" id="back-home">← 回到首頁</button>
        <div class="msg err">找不到這個關卡（id: ${escapeHtml(id)}）。NFC 標籤可能損壞或設定有誤。</div>
      `);
      app.querySelector('#back-home')?.addEventListener('click', () => navigate(null));
      return;
    }

    markDiscovered(id);
    const progress = loadProgress();
    const already = progress[id]?.solved;
    const icon = escapeHtml(station.icon || '◉');

    let body = '';
    if (station.type === 'text') body = renderTextPuzzle(station, already);
    else if (station.type === 'choice') body = renderChoicePuzzle(station, already);
    else if (station.type === 'photo') body = renderPhotoPuzzle(station, already, progress[id]);
    else if (station.type === 'photo-compare') body = renderPhotoComparePuzzle(station, already, progress[id]);
    else if (station.type === 'sequence') body = renderSequencePuzzle(station, already, progress[id]);
    else body = `<div class="msg err">未知題型：${escapeHtml(station.type)}</div>`;

    setHTML(app, `
      <button class="back-btn" id="back-home">← 回到首頁</button>
      <div class="station-page">
        <div class="station-hero">
          <div class="stamp-badge ${already ? 'solved' : ''}">
            <span class="badge-icon">${icon}</span>
          </div>
          <div class="station-meta">
            <span class="island-tag">${escapeHtml(station.island || '')}</span>
            <h2 class="station-name">${escapeHtml(station.name)}</h2>
          </div>
        </div>
        ${station.hint ? `<p class="station-hint">${escapeHtml(station.hint)}</p>` : ''}
        ${station.question ? `<div class="question-card">${escapeHtml(station.question)}</div>` : ''}
        ${body}
      </div>
    `);

    app.querySelector('#back-home')?.addEventListener('click', () => navigate(null));
    app.querySelectorAll('.back-secondary').forEach(b => b.addEventListener('click', () => navigate(null)));
    wireStation(station, already);

    const track = app.querySelector('.ref-carousel-track');
    if (track) {
      const dots = app.querySelectorAll('.ref-dot');
      track.addEventListener('scroll', () => {
        const i = Math.round(track.scrollLeft / track.clientWidth);
        dots.forEach((d, j) => d.classList.toggle('active', i === j));
      }, { passive: true });
    }
  }

  // ---------- puzzle renderers ----------
  function renderTextPuzzle(s, already) {
    if (already) return solvedView(s);
    return `
      <div class="form">
        <input type="text" id="answer" placeholder="輸入答案…" autocomplete="off" autocapitalize="off" />
        <div id="msg"></div>
        <button class="btn" id="submit">確認答案</button>
      </div>`;
  }

  function renderChoicePuzzle(s, already) {
    if (already) return solvedView(s);
    const opts = s.options.map((opt, i) => `
      <label class="option" data-i="${i}">
        <input type="${s.multi ? 'checkbox' : 'radio'}" name="opt" value="${i}" />
        <span>${escapeHtml(opt)}</span>
      </label>
    `).join('');
    return `
      <div class="form">
        <div class="options">${opts}</div>
        <div id="msg"></div>
        <button class="btn" id="submit">確認答案</button>
      </div>`;
  }

  function renderPhotoPuzzle(s, already, entry) {
    const imgs = s.referenceImages ?? (s.referenceImage ? [{ src: s.referenceImage, label: s.referenceLabel }] : []);
    const refImg = imgs.length ? `
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px">
        ${imgs.map(img => `
          <figure class="reference-figure" style="margin:0">
            <img class="reference-image" src="${escapeHtml(img.src ?? img)}" alt="提示照片" />
            ${(img.label ?? '') ? `<figcaption class="reference-label">${escapeHtml(img.label)}</figcaption>` : ''}
          </figure>`).join('')}
      </div>` : '';

    if (already && entry?.photo) {
      return `
        ${solvedCard(s)}
        <img class="photo-preview" src="${escapeHtml(entry.photo)}" alt="打卡照片" style="margin-top:12px" />
        ${backBtn}
      `;
    }
    return `
      ${refImg}
      <div class="form">
        <label class="photo-label" for="photo">
          <span class="photo-icon">📷</span>
          <span>點此拍照或選擇照片</span>
        </label>
        <input type="file" id="photo" class="photo-input" accept="image/*" capture="environment" />
        <img id="preview" class="photo-preview" style="display:none" />
        <div id="msg"></div>
        <button class="btn" id="submit" disabled>完成打卡</button>
      </div>`;
  }

  function renderPhotoComparePuzzle(s, already, entry) {
    const refImg = `
      <figure class="reference-figure">
        <img class="reference-image" src="${escapeHtml(s.referenceImage)}" alt="${escapeHtml(s.referenceLabel || '歷史照片')}" />
        <figcaption class="reference-label">${escapeHtml(s.referenceLabel || '歷史照片')}</figcaption>
      </figure>`;

    if (already && entry?.photo) {
      return `
        ${solvedCard(s)}
        <div class="compare-heading">今昔對比</div>
        <div class="compare-grid">
          <div class="compare-item">
            <div class="compare-label">${escapeHtml(s.referenceLabel || '昔')}</div>
            <img class="compare-image" src="${escapeHtml(s.referenceImage)}" alt="${escapeHtml(s.referenceLabel || '歷史照片')}" />
          </div>
          <div class="compare-item">
            <div class="compare-label">今</div>
            <img class="compare-image" src="${escapeHtml(entry.photo)}" alt="你拍的照片" />
          </div>
        </div>
        ${backBtn}`;
    }

    return `
      ${refImg}
      <div class="form">
        <label class="photo-label" for="photo">
          <span class="photo-icon">📷</span>
          <span>找到相同角度，拍下今日的芹壁</span>
        </label>
        <input type="file" id="photo" class="photo-input" accept="image/*" capture="environment" />
        <img id="preview" class="photo-preview" style="display:none" />
        <div id="msg"></div>
        <button class="btn" id="submit" disabled>上傳今日照片</button>
      </div>`;
  }

  function renderSequencePuzzle(s, already, entry) {
    if (already && entry?.photo) {
      return `
        ${solvedCard(s)}
        <img class="photo-preview" src="${escapeHtml(entry.photo)}" alt="打卡照片" style="margin-top:12px" />
        ${backBtn}
      `;
    }

    const currentStep = entry?.step ?? 0;
    const step = s.steps[currentStep];

    const dots = s.steps.map((_, i) => {
      const cls = i < currentStep ? 'done' : i === currentStep ? 'active' : '';
      return `<span class="step-dot ${cls}"></span>`;
    }).join('');

    let stepBody = '';
    if (step.type === 'choice') {
      const opts = step.options.map((opt, i) => `
        <label class="option" data-i="${i}">
          <input type="radio" name="opt" value="${i}" />
          <span>${escapeHtml(opt)}</span>
        </label>
      `).join('');
      stepBody = `
        <div class="options">${opts}</div>
        <div id="msg"></div>
        <button class="btn" id="submit">確認答案</button>
      `;
    } else if (step.type === 'photo') {
      stepBody = `
        <label class="photo-label" for="photo">
          <span class="photo-icon">📷</span>
          <span>${escapeHtml(step.question || '拍下此刻，完成打卡')}</span>
        </label>
        <input type="file" id="photo" class="photo-input" accept="image/*" capture="environment" />
        <img id="preview" class="photo-preview" style="display:none" />
        <div id="msg"></div>
        <button class="btn" id="submit" disabled>完成打卡</button>
      `;
    }

    return `
      <div class="step-indicator">${dots}</div>
      ${step.hint ? `<p class="station-hint">${escapeHtml(step.hint)}</p>` : ''}
      <div class="question-card">${escapeHtml(step.question || '')}</div>
      <div class="form">${stepBody}</div>
    `;
  }

  function solvedCard(s) {
    return `
      <div class="reward-card">
        <div class="reward-stamp">🎖️🎖️🎖️</div>
        <div class="reward-text">${escapeHtml(s.reward || '已完成這個關卡。')}</div>
      </div>
    `;
  }
  const backBtn = `<button class="btn secondary back-secondary" style="margin-top:12px">← 回到集章冊</button>`;

  function solvedView(s) {
    return solvedCard(s) + backBtn;
  }

  // ---------- interactions ----------
  function wireStation(s, already) {
    if (already) return;

    if (s.type === 'text') {
      const input = document.getElementById('answer');
      const btn = document.getElementById('submit');
      const msg = document.getElementById('msg');
      const submit = () => {
        const val = (input.value || '').trim();
        if (!val) return;
        if (matchAnswer(val, s)) {
          setSolved(s.id, { answer: val });
          setHTML(msg, `<div class="msg ok">答對了！</div>`);
          btn.style.display = 'none';
          setTimeout(render, 800);
        } else {
          setHTML(msg, `<div class="msg err">答案不對，再想想看。</div>`);
          input.select();
        }
      };
      btn.addEventListener('click', submit);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
      input.focus();
    }

    if (s.type === 'choice') {
      const labels = app.querySelectorAll('.option');
      labels.forEach(l => l.addEventListener('click', () => {
        setTimeout(() => {
          labels.forEach(o => o.classList.toggle('selected', o.querySelector('input').checked));
        }, 0);
      }));
      document.getElementById('submit').addEventListener('click', () => {
        const checked = [...app.querySelectorAll('input[name=opt]:checked')].map(i => +i.value);
        const msg = document.getElementById('msg');
        if (!checked.length) { setHTML(msg, `<div class="msg err">請先選擇一個答案。</div>`); return; }
        if (matchChoice(checked, s)) {
          setSolved(s.id, { choice: checked });
          setHTML(msg, `<div class="msg ok">答對了！</div>`);
          setTimeout(render, 800);
        } else {
          setHTML(msg, `<div class="msg err">不太對，再試試。</div>`);
        }
      });
    }

    if (s.type === 'photo' || s.type === 'photo-compare') {
      const input = document.getElementById('photo');
      const preview = document.getElementById('preview');
      const btn = document.getElementById('submit');
      const msg = document.getElementById('msg');
      let dataUrl = null;

      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          dataUrl = await compressImage(file, 1000, 0.7);
          preview.src = dataUrl;
          preview.style.display = 'block';
          btn.disabled = false;
        } catch (e) {
          setHTML(msg, `<div class="msg err">照片讀取失敗：${escapeHtml(e.message || '')}</div>`);
        }
      });
      btn.addEventListener('click', () => {
        if (!dataUrl) return;
        try {
          setSolved(s.id, { photo: dataUrl });
          setHTML(msg, `<div class="msg ok">上傳成功！</div>`);
          setTimeout(render, 800);
        } catch (e) {
          setHTML(msg, `<div class="msg err">儲存失敗（空間不足），請換小一點的照片。</div>`);
        }
      });
    }

    if (s.type === 'sequence') {
      const entry = loadProgress()[s.id];
      const currentStep = entry?.step ?? 0;
      const step = s.steps[currentStep];

      if (step.type === 'choice') {
        const labels = app.querySelectorAll('.option');
        labels.forEach(l => l.addEventListener('click', () => {
          setTimeout(() => {
            labels.forEach(o => o.classList.toggle('selected', o.querySelector('input').checked));
          }, 0);
        }));
        document.getElementById('submit').addEventListener('click', () => {
          const checked = [...app.querySelectorAll('input[name=opt]:checked')].map(i => +i.value);
          const msg = document.getElementById('msg');
          if (!checked.length) { setHTML(msg, `<div class="msg err">請先選擇一個答案。</div>`); return; }
          const correct = step.answer === 'any' ||
            (() => { const ans = Array.isArray(step.answer) ? step.answer : [step.answer]; return ans.length === checked.length && ans.every(v => checked.includes(v)); })();
          if (correct) {
            const prog = loadProgress();
            prog[s.id] = { ...(prog[s.id] || {}), step: currentStep + 1 };
            saveProgress(prog);
            setHTML(msg, `<div class="msg ok">答對了！</div>`);
            setTimeout(render, 600);
          } else {
            setHTML(msg, `<div class="msg err">不太對，再試試。</div>`);
          }
        });
      }

      if (step.type === 'photo') {
        const input = document.getElementById('photo');
        const preview = document.getElementById('preview');
        const btn = document.getElementById('submit');
        const msg = document.getElementById('msg');
        let dataUrl = null;

        input.addEventListener('change', async () => {
          const file = input.files?.[0];
          if (!file) return;
          try {
            dataUrl = await compressImage(file, 1000, 0.7);
            preview.src = dataUrl;
            preview.style.display = 'block';
            btn.disabled = false;
          } catch (e) {
            setHTML(msg, `<div class="msg err">照片讀取失敗：${escapeHtml(e.message || '')}</div>`);
          }
        });
        btn.addEventListener('click', () => {
          if (!dataUrl) return;
          try {
            const isLast = currentStep + 1 >= s.steps.length;
            if (isLast) {
              setSolved(s.id, { photo: dataUrl });
              setHTML(msg, `<div class="msg ok">打卡成功！</div>`);
            } else {
              const prog = loadProgress();
              prog[s.id] = { ...(prog[s.id] || {}), step: currentStep + 1 };
              saveProgress(prog);
              setHTML(msg, `<div class="msg ok">好！繼續下一關。</div>`);
            }
            setTimeout(render, 800);
          } catch (e) {
            setHTML(msg, `<div class="msg err">儲存失敗（空間不足），請換小一點的照片。</div>`);
          }
        });
      }
    }
  }

  // ---------- helpers ----------
  function matchAnswer(val, s) {
    const list = Array.isArray(s.answer) ? s.answer : [s.answer];
    return list.some(a =>
      s.caseInsensitive
        ? String(a).toLowerCase().trim() === val.toLowerCase().trim()
        : String(a).trim() === val.trim()
    );
  }
  function matchChoice(picked, s) {
    const ans = (Array.isArray(s.answer) ? s.answer : [s.answer]).slice().sort((a, b) => a - b);
    const p = picked.slice().sort((a, b) => a - b);
    return ans.length === p.length && ans.every((v, i) => v === p[i]);
  }
  function compressImage(file, maxSize, quality) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = () => { img.src = reader.result; };
      reader.onerror = () => reject(new Error('讀取檔案失敗'));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) { height = height * maxSize / width; width = maxSize; }
        else if (height > maxSize) { width = width * maxSize / height; height = maxSize; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('圖片解析失敗'));
      reader.readAsDataURL(file);
    });
  }
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  }

  // ---------- boot ----------
  function render() {
    const id = getStationId();
    if (id) renderStation(id); else renderHome();
    window.scrollTo(0, 0);
  }

  fetch('puzzles.json', { cache: 'no-cache' })
    .then(r => r.json())
    .then(c => { config = c; render(); })
    .catch(e => {
      setHTML(app, `<div class="msg err" style="margin-top:40px">無法載入關卡設定：${escapeHtml(e.message)}<br><br>請用 <code>python3 -m http.server 8000</code> 啟動後再試。</div>`);
    });
})();
