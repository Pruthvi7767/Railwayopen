import express from "express";
import { chromium } from "playwright";

const app = express();
app.use(express.json());

// ===== CONFIG =====
const SEARCH_ENGINES = [
  {
    name: "Google",
    url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
    selector: "a h3",
    extract: (el) => el.closest("a").href
  },
  {
    name: "DuckDuckGo",
    url: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
    selector: "a[data-testid='result-title-a']",
    extract: (el) => el.href
  },
  {
    name: "SearXNG",
    url: (q) => `https://searx.be/search?q=${encodeURIComponent(q)}`,
    selector: "a.result_header",
    extract: (el) => el.href
  },
  {
    name: "Bing",
    url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
    selector: "li.b_algo h2 a",
    extract: (el) => el.href
  },
  {
    name: "Brave",
    url: (q) => `https://search.brave.com/search?q=${encodeURIComponent(q)}`,
    selector: "a",
    extract: (el) => el.href
  }
];

// ===== HELPERS =====

async function launchBrowser() {
  return await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
}

async function setupPage(browser) {
  const context = await browser.newContext({
    storageState: "auth.json",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
  });

  const page = await context.newPage();

  // BLOCK WRITE ACTIONS
  await page.route("**/*", (route) => {
    if (route.request().method() === "POST") return route.abort();
    route.continue();
  });

  await page.setExtraHTTPHeaders({
    "accept-language": "en-US,en;q=0.9"
  });

  return page;
}

// ===== MULTI SEARCH ENGINE =====

app.post("/search", async (req, res) => {
  const { query } = req.body;
  let browser;

  try {
    browser = await launchBrowser();
    const page = await setupPage(browser);

    let links = [];

    for (const engine of SEARCH_ENGINES) {
      try {
        console.log(`Trying ${engine.name}...`);

        await page.goto(engine.url(query), { timeout: 20000 });
        await page.waitForTimeout(3000);

        links = await page.evaluate((selector) => {
          return Array.from(document.querySelectorAll(selector))
            .map(el => el.closest("a") ? el.closest("a").href : el.href)
            .filter(link => link && link.startsWith("http"))
            .slice(0, 5);
        }, engine.selector);

        if (links.length > 0) {
          console.log(`${engine.name} success`);
          break;
        }

      } catch (err) {
        console.log(`${engine.name} failed`);
      }
    }

    let results = [];

    for (const link of links) {
      try {
        await page.goto(link, { timeout: 20000 });
        await page.waitForTimeout(3000);

        // scroll
        for (let i = 0; i < 3; i++) {
          await page.mouse.wheel(0, 1000);
          await page.waitForTimeout(1500);
        }

        const data = await page.evaluate(() => {
          const texts = Array.from(document.querySelectorAll("p, span"))
            .map(el => el.innerText)
            .filter(t => t.length > 40)
            .slice(0, 8);

          const images = Array.from(document.querySelectorAll("img"))
            .map(img => img.src)
            .filter(src => src.startsWith("http"))
            .slice(0, 5);

          return { texts, images };
        });

        results.push({ source: link, ...data });

      } catch {
        continue;
      }
    }

    await browser.close();

    res.json({ success: true, query, results });

  } catch (err) {
    if (browser) await browser.close();
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== FACEBOOK =====

app.post("/facebook", async (req, res) => {
  const { query } = req.body;

  const browser = await launchBrowser();
  const page = await setupPage(browser);

  await page.goto(`https://www.facebook.com/search/posts/?q=${encodeURIComponent(query)}`);
  await page.waitForTimeout(5000);

  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(2000);
  }

  const posts = await page.evaluate(() =>
    Array.from(document.querySelectorAll("div[role='article']"))
      .map(el => el.innerText)
      .slice(0, 10)
  );

  await browser.close();

  res.json({ success: true, posts });
});

// ===== INSTAGRAM =====

app.post("/instagram", async (req, res) => {
  const { tag } = req.body;

  const browser = await launchBrowser();
  const page = await setupPage(browser);

  await page.goto(`https://www.instagram.com/explore/tags/${tag}/`);
  await page.waitForTimeout(5000);

  const posts = await page.evaluate(() =>
    Array.from(document.querySelectorAll("img"))
      .map(img => img.alt)
      .slice(0, 10)
  );

  await browser.close();

  res.json({ success: true, posts });
});

// ===== OLX =====

app.post("/olx", async (req, res) => {
  const { query } = req.body;

  const browser = await launchBrowser();
  const page = await setupPage(browser);

  await page.goto(`https://www.olx.in/items/q-${query}`);
  await page.waitForTimeout(5000);

  const listings = await page.evaluate(() =>
    Array.from(document.querySelectorAll("li"))
      .map(li => li.innerText)
      .filter(t => t.length > 30)
      .slice(0, 10)
  );

  await browser.close();

  res.json({ success: true, listings });
});

// ===== START SERVER =====

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Scraper running on port ${PORT}`);
});