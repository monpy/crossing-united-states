// Wiki — content/wiki.json のページ一覧をサイドバーに表示し、
// ハッシュ(#/slug)に応じて対応する markdown を読み込んで表示する。
// ページ追加は content/ に .md を置いて wiki.json に1行足すだけ。

(async function () {
  const MANIFEST_URL = "content/wiki.json";
  const navEl = document.getElementById("wiki-nav");
  const contentEl = document.getElementById("wiki-content");

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

  // サイドバー構築
  pages.forEach((p) => {
    const a = document.createElement("a");
    a.href = `#/${p.slug}`;
    a.textContent = p.title;
    a.dataset.slug = p.slug;
    navEl.appendChild(a);
  });

  function currentSlug() {
    const m = location.hash.match(/^#\/(.+)$/);
    return m ? m[1] : (pages[0] && pages[0].slug);
  }

  async function render() {
    const slug = currentSlug();
    const page = pages.find((p) => p.slug === slug) || pages[0];
    if (!page) return;

    // アクティブ表示
    navEl.querySelectorAll("a").forEach((a) =>
      a.classList.toggle("active", a.dataset.slug === page.slug)
    );

    contentEl.innerHTML = "<p>読み込み中…</p>";
    try {
      const res = await fetch(page.file);
      if (!res.ok) throw new Error("not found");
      const md = await res.text();
      contentEl.innerHTML = window.marked.parse(md);
    } catch (e) {
      contentEl.innerHTML = `<p>「${page.title}」の読み込みに失敗しました（${page.file}）。</p>`;
      console.error(e);
    }
    // ページ先頭へスクロール
    contentEl.scrollTop = 0;
    window.scrollTo(0, 0);
    // モバイルではサイドバーを閉じる
    document.body.classList.remove("sidebar-open");
  }

  window.addEventListener("hashchange", render);
  render();

  // モバイル用サイドバー開閉
  const toggle = document.getElementById("sidebar-toggle");
  toggle.addEventListener("click", () =>
    document.body.classList.toggle("sidebar-open")
  );
})();
