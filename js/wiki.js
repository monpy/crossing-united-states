// Wiki — content/wiki.json のページ一覧をサイドバーに表示し、
// ハッシュ(#/slug)に応じて対応する markdown を読み込んで表示する。
// ページ追加は content/ に .md を置いて wiki.json に1行足すだけ。

(async function () {
  const MANIFEST_URL = "content/wiki.json";
  const navListEl = document.getElementById("wiki-nav-list");
  const contentEl = document.getElementById("wiki-content");
  const tocListEl = document.getElementById("toc-list");
  const tocWrapEl = document.getElementById("wiki-toc");
  const pageNavEl = document.getElementById("page-nav");

  let manifest;
  try {
    manifest = await (await fetch(MANIFEST_URL)).json();
  } catch (e) {
    contentEl.innerHTML =
      "<p>ページ一覧の読み込みに失敗しました。簡易サーバー経由で開いてください。</p>";
    console.error(e);
    return;
  }

  const pages = manifest.pages || [];

  // ---- サイドバー（ページ一覧）構築 ----
  pages.forEach((p) => {
    const a = document.createElement("a");
    a.href = `#/${p.slug}`;
    a.textContent = p.title;
    a.dataset.slug = p.slug;
    a.className = "nav-page";
    navListEl.appendChild(a);
  });

  function currentSlug() {
    const m = location.hash.match(/^#\/([^#]+)/);
    return m ? m[1] : pages[0] && pages[0].slug;
  }

  // 見出しテキストから安全なid（slug）を作る
  function slugify(text, used) {
    let base = text
      .trim()
      .toLowerCase()
      .replace(/[^\w぀-ヿ㐀-鿿＀-￯-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!base) base = "section";
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    return id;
  }

  let scrollSpyHandler = null;

  // ---- BGM（特定ページだけ自動再生） ----
  const ANTHEM_URL =
    "https://upload.wikimedia.org/wikipedia/commons/2/25/%22The_Star-Spangled_Banner%22_performed_by_the_United_States_Navy_Band.mp3";
  let anthem = null;
  let anthemPending = null;

  function clearAnthemPending() {
    if (anthemPending) {
      window.removeEventListener("click", anthemPending);
      window.removeEventListener("keydown", anthemPending);
      anthemPending = null;
    }
  }

  function handleAnthem(slug) {
    if (slug === "trump") {
      if (!anthem) {
        anthem = new Audio(ANTHEM_URL);
        anthem.loop = true;
        anthem.volume = 0.6;
      }
      const p = anthem.play();
      if (p && p.catch) {
        // 直リンクで開くなど、ユーザー操作前で自動再生が弾かれた場合は
        // 最初のクリック/キー操作で再生開始する
        p.catch(() => {
          if (anthemPending) return;
          anthemPending = () => {
            clearAnthemPending();
            if (currentSlug() === "trump") anthem.play().catch(() => {});
          };
          window.addEventListener("click", anthemPending, { once: true });
          window.addEventListener("keydown", anthemPending, { once: true });
        });
      }
    } else {
      clearAnthemPending();
      if (anthem) {
        anthem.pause();
        anthem.currentTime = 0;
      }
    }
  }

  async function render() {
    const slug = currentSlug();
    const idx = pages.findIndex((p) => p.slug === slug);
    const page = idx >= 0 ? pages[idx] : pages[0];
    if (!page) return;

    handleAnthem(page.slug);

    // サイドバーのアクティブ表示
    navListEl.querySelectorAll("a").forEach((a) =>
      a.classList.toggle("active", a.dataset.slug === page.slug)
    );

    contentEl.innerHTML = "<p>読み込み中…</p>";
    tocListEl.innerHTML = "";
    pageNavEl.innerHTML = "";

    try {
      const res = await fetch(page.file);
      if (!res.ok) throw new Error("not found");
      const md = await res.text();
      contentEl.innerHTML = window.marked.parse(md);
    } catch (e) {
      contentEl.innerHTML = `<p>「${page.title}」の読み込みに失敗しました（${page.file}）。</p>`;
      console.error(e);
      return;
    }

    buildToc();
    buildPageNav(idx);

    // ハッシュにアンカー(#/slug#anchor)があればそこへ
    const anchorMatch = location.hash.match(/^#\/[^#]+#(.+)$/);
    if (anchorMatch) {
      const target = document.getElementById(decodeURIComponent(anchorMatch[1]));
      if (target) {
        target.scrollIntoView({ behavior: "auto", block: "start" });
      }
    } else {
      window.scrollTo(0, 0);
    }

    document.body.classList.remove("sidebar-open");
  }

  // ---- ページ内目次（On this page）----
  function buildToc() {
    const headings = contentEl.querySelectorAll("h2, h3");
    const used = new Set();

    if (!headings.length) {
      tocWrapEl.classList.add("empty");
      return;
    }
    tocWrapEl.classList.remove("empty");

    headings.forEach((h) => {
      if (!h.id) h.id = slugify(h.textContent, used);
      const a = document.createElement("a");
      a.href = `${baseHash()}#${h.id}`;
      a.textContent = h.textContent;
      a.className = h.tagName === "H3" ? "toc-h3" : "toc-h2";
      a.dataset.target = h.id;
      a.addEventListener("click", (ev) => {
        ev.preventDefault();
        const el = document.getElementById(h.id);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          history.replaceState(null, "", `${baseHash()}#${h.id}`);
        }
      });
      tocListEl.appendChild(a);
    });

    setupScrollSpy(Array.from(headings));
  }

  function baseHash() {
    return `#/${currentSlug()}`;
  }

  // ---- スクロールスパイ（現在地の見出しをハイライト）----
  function setupScrollSpy(headings) {
    if (scrollSpyHandler) window.removeEventListener("scroll", scrollSpyHandler);

    const links = tocListEl.querySelectorAll("a");
    const setActive = (id) =>
      links.forEach((a) =>
        a.classList.toggle("active", a.dataset.target === id)
      );

    scrollSpyHandler = () => {
      let currentId = headings[0] && headings[0].id;
      const offset = 90;
      for (const h of headings) {
        if (h.getBoundingClientRect().top - offset <= 0) currentId = h.id;
        else break;
      }
      if (currentId) setActive(currentId);
    };
    window.addEventListener("scroll", scrollSpyHandler, { passive: true });
    scrollSpyHandler();
  }

  // ---- 前後ページのナビ ----
  function buildPageNav(idx) {
    const prev = idx > 0 ? pages[idx - 1] : null;
    const next = idx < pages.length - 1 ? pages[idx + 1] : null;

    if (prev) {
      const a = document.createElement("a");
      a.href = `#/${prev.slug}`;
      a.className = "page-nav-prev";
      a.innerHTML = `<span class="page-nav-dir">← 前のページ</span><span class="page-nav-title">${prev.title}</span>`;
      pageNavEl.appendChild(a);
    } else {
      pageNavEl.appendChild(document.createElement("span"));
    }

    if (next) {
      const a = document.createElement("a");
      a.href = `#/${next.slug}`;
      a.className = "page-nav-next";
      a.innerHTML = `<span class="page-nav-dir">次のページ →</span><span class="page-nav-title">${next.title}</span>`;
      pageNavEl.appendChild(a);
    }
  }

  window.addEventListener("hashchange", () => {
    // 同じページ内のアンカー移動だけならスクロールに任せ、再描画しない
    const slug = currentSlug();
    const active = navListEl.querySelector("a.active");
    if (active && active.dataset.slug === slug) {
      const anchorMatch = location.hash.match(/^#\/[^#]+#(.+)$/);
      if (anchorMatch) {
        const el = document.getElementById(decodeURIComponent(anchorMatch[1]));
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    render();
  });
  render();

  // サイドバー（ページ一覧）の開閉
  const burger = document.getElementById("wiki-burger");
  const backdrop = document.getElementById("wiki-backdrop");
  function setSidebar(open) {
    document.body.classList.toggle("sidebar-open", open);
    if (burger) burger.setAttribute("aria-expanded", open ? "true" : "false");
    if (backdrop) backdrop.hidden = !open;
  }
  if (burger) burger.addEventListener("click", () =>
    setSidebar(!document.body.classList.contains("sidebar-open"))
  );
  if (backdrop) backdrop.addEventListener("click", () => setSidebar(false));
  // ページを選んだら閉じる（renderでsidebar-openは外れるのでbackdropも閉じる）
  navListEl.addEventListener("click", () => setSidebar(false));
  // 旧トグル（存在すれば）も一応配線
  const legacy = document.getElementById("sidebar-toggle");
  if (legacy) legacy.addEventListener("click", () =>
    setSidebar(!document.body.classList.contains("sidebar-open"))
  );
})();
