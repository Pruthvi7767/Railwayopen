async function multiSearch(page, query) {
  let results = [];

  // DuckDuckGo
  if (await safeGoto(page, `https://duckduckgo.com/?q=${encodeURIComponent(query)}`)) {
    try {
      await page.waitForTimeout(4000);

      const ddgResults = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("a"))
          .map(a => ({
            title: a.innerText,
            link: a.href
          }))
          .filter(r =>
            r.link &&
            r.link.startsWith("http") &&
            r.title.length > 20 && // 🔥 important filter
            !r.link.includes("duckduckgo.com")
          )
          .slice(0, 5);
      });

      results.push(...ddgResults);
    } catch {}
  }

  // Bing
  if (await safeGoto(page, `https://www.bing.com/search?q=${encodeURIComponent(query)}`)) {
    try {
      await page.waitForTimeout(4000);

      const bingResults = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("a"))
          .map(a => ({
            title: a.innerText,
            link: a.href
          }))
          .filter(r =>
            r.link &&
            r.link.startsWith("http") &&
            r.title.length > 20 &&
            !r.link.includes("bing.com")
          )
          .slice(0, 5);
      });

      results.push(...bingResults);
    } catch {}
  }

  // remove duplicates
  const seen = new Set();
  let cleaned = results.filter(r => {
    if (seen.has(r.link)) return false;
    seen.add(r.link);
    return true;
  });

  // 🔥 FINAL FALLBACK (NEVER EMPTY)
  if (cleaned.length === 0) {
    return [
      {
        title: "Search results (Google)",
        link: `https://www.google.com/search?q=${encodeURIComponent(query)}`
      },
      {
        title: "Search results (DuckDuckGo)",
        link: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
      },
      {
        title: "Search results (Bing)",
        link: `https://www.bing.com/search?q=${encodeURIComponent(query)}`
      }
    ];
  }

  return cleaned.slice(0, 5);
}