import express from "express";
import { chromium } from "playwright";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ===== INTENT =====
function detectIntent(query) {
  const q = query.toLowerCase();

  if (q.includes("flat") || q.includes("rent") || q.includes("2bhk")) return "real_estate";
  if (q.includes("price") || q.includes("buy") || q.includes("iphone")) return "product";
  if (q.includes("who") || q.includes("what")) return "knowledge";

  return "general";
}

// ===== BROWSER =====
async function getBrowser() {
  return await chromium.launch({
    headless: true,
    args: ["--no-sandbox"]
  });
}

// ===== SAFE NAV =====
async function safeGoto(page, url) {
  try {
    await page.goto(url, { timeout: 20000 });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);
    return true;
  } catch {
    return false;
  }
}

// ===== KNOWLEDGE =====
async function quickAnswer(page, query) {
  const ok = await safeGoto(page, `https://duckduckgo.com/?q=${encodeURIComponent(query)}`);
  if (!ok) return null;

  return await page.evaluate(() => {
    const el = document.querySelector("a[data-testid='result-title-a']");
    return {
      title: el?.innerText || "",
      link: el?.href || ""
    };
  });
}

// ===== FIXED MULTI SEARCH =====
async function multiSearch(page, query) {
  let results = [];

  // DuckDuckGo
  const ddgUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
  if (await safeGoto(page, ddgUrl)) {
    try {
      await page.waitForSelector("a[data-testid='result-title-a']", { timeout: 8000 });

      const ddgResults = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("a[data-testid='result-title-a']"))
          .map(el => ({
            title: el.innerText,
            link: el.href
          }));
      });

      results.push(...ddgResults);
    } catch {}
  }

  // Bing
  const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  if (await safeGoto(page, bingUrl)) {
    try {
      await page.waitForSelector("li.b_algo h2 a", { timeout: 8000 });

      const bingResults = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("li.b_algo h2 a"))
          .map(el => ({
            title: el.innerText,
            link: el.href
          }));
      });

      results.push(...bingResults);
    } catch {}
  }

  // Clean
  const seen = new Set();

  return results
    .filter(r =>
      r.link &&
      r.link.startsWith("http") &&
      !r.link.includes("duckduckgo.com") &&
      !r.link.includes("bing.com") &&
      !r.link.includes("login") &&
      !r.link.includes("settings")
    )
    .filter(r => {
      if (seen.has(r.link)) return false;
      seen.add(r.link);
      return true;
    })
    .slice(0, 5);
}

// ===== REAL ESTATE =====
async function scrapeHousing(page) {
  const ok = await safeGoto(page, "https://housing.com/in/buy/searches/Pune");
  if (!ok) return [];

  try {
    await page.waitForSelector("article", { timeout: 10000 });

    const listings = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("article"))
        .map(el => ({
          title: el.innerText.slice(0, 120)
        }))
        .slice(0, 5);
    });

    return listings;
  } catch {
    return [];
  }
}

// ===== PRODUCTS =====
async function scrapeProducts(page, query) {
  const ok = await safeGoto(page, `https://www.amazon.in/s?k=${encodeURIComponent(query)}`);
  if (!ok) return [];

  try {
    await page.waitForSelector("h2", { timeout: 10000 });

    return await page.evaluate(() => {
      return Array.from(document.querySelectorAll("h2"))
        .map(el => ({
          title: el.innerText
        }))
        .slice(0, 5);
    });
  } catch {
    return [];
  }
}

// ===== MAIN =====
app.post("/search", async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.json({ success: false, error: "Query required" });
  }

  let browser;

  try {
    const intent = detectIntent(query);

    browser = await getBrowser();
    const page = await browser.newPage();

    let result = [];

    if (intent === "knowledge") {
      result = await quickAnswer(page, query);
    }

    else if (intent === "real_estate") {
      result = await scrapeHousing(page);

      if (!result || result.length === 0) {
        result = await multiSearch(page, query);
      }
    }

    else if (intent === "product") {
      result = await scrapeProducts(page, query);

      if (!result || result.length === 0) {
        result = await multiSearch(page, query);
      }
    }

    else {
      result = await multiSearch(page, query);
    }

    await browser.close();

    res.json({
      success: true,
      intent,
      query,
      result
    });

  } catch (err) {
    if (browser) await browser.close();

    res.json({
      success: false,
      error: err.message
    });
  }
});

// ===== HEALTH =====
app.get("/", (req, res) => {
  res.send("Final Strong System Running 🚀");
});

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});