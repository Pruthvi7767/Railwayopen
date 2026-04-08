import express from "express";
import { chromium } from "playwright";

const app = express();
app.use(express.json());

// ===== SEARCH ENGINES =====
const SEARCH_ENGINES = [
  {
    name: "DuckDuckGo",
    url: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
    selector: "a[data-testid='result-title-a']"
  },
  {
    name: "Bing",
    url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
    selector: "li.b_algo h2 a"
  },
  {
    name: "SearXNG",
    url: (q) => `https://searx.be/search?q=${encodeURIComponent(q)}`,
    selector: "a.result_header"
  }
];

// ===== HELPERS =====

// launch browser
async function launchBrowser() {
  return await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
}

// setup page
async function setupPage(browser) {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
  });

  const page = await context.newPage();

  await page.setExtraHTTPHeaders({
    "accept-language": "en-US,en;q=0.9"
  });

  return page;
}

// clean URLs
function cleanUrl(url) {
  try {
    const u = new URL(url);

    // fix Bing redirect
    if (u.hostname.includes("bing.com") && u.searchParams.get("u")) {
      return decodeURIComponent(u.searchParams.get("u"));
    }

    return url;
  } catch {
    return url;
  }
}

// filter bad links
function isValidLink(link) {
  return (
    link &&
    link.startsWith("http") &&
    !link.includes("settings") &&
    !link.includes("login") &&
    !link.includes("privacy") &&
    !link.includes("terms") &&
    !link.includes("duckduckgo.com") &&
    !link.includes("bing.com")
  );
}

// scoring
function scoreResult(data) {
  let score = 0;

  if (data.title) score += 2;
  if (data.description) score += 2;
  if (data.headings?.length > 0) score += 1;

  return score;
}

// detect real estate query
function isRealEstateQuery(query) {
  const keywords = ["flat", "rent", "buy", "house", "2bhk", "3bhk", "property"];
  return keywords.some(k => query.toLowerCase().includes(k));
}

// ===== MAIN SEARCH =====

app.post("/search", async (req, res) => {
  let { query } = req.body;

  if (!query) {
    return res.json({ success: false, error: "Query required" });
  }

  // 🔥 improve query for real estate
  if (isRealEstateQuery(query)) {
    query += " site:magicbricks.com OR site:99acres.com OR site:housing.com";
  }

  let browser;

  try {
    browser = await launchBrowser();
    const page = await setupPage(browser);

    let allLinks = [];

    // STEP 1: collect links from all engines
    for (const engine of SEARCH_ENGINES) {
      try {
        console.log(`Searching ${engine.name}...`);

        await page.goto(engine.url(query), { timeout: 20000 });
        await page.waitForTimeout(3000);

        const links = await page.evaluate((selector) => {
          return Array.from(document.querySelectorAll(selector))
            .map(el => el.closest("a") ? el.closest("a").href : el.href)
            .filter(link => link && link.startsWith("http"))
            .slice(0, 5);
        }, engine.selector);

        allLinks.push(...links);

      } catch {
        continue;
      }
    }

    // STEP 2: clean + filter + dedupe
    let links = [...new Set(allLinks)]
      .map(cleanUrl)
      .filter(isValidLink)
      .slice(0, 10);

    let results = [];

    // STEP 3: scrape each page
    for (const link of links) {
      try {
        await page.goto(link, { timeout: 20000 });
        await page.waitForTimeout(3000);

        const data = await page.evaluate(() => {
          const title = document.title;

          const description =
            document.querySelector("meta[name='description']")?.content || "";

          const headings = Array.from(document.querySelectorAll("h1, h2"))
            .map(el => el.innerText)
            .slice(0, 5);

          const images = Array.from(document.querySelectorAll("img"))
            .map(img => img.src)
            .filter(src => src.startsWith("http"))
            .slice(0, 3);

          return { title, description, headings, images };
        });

        results.push({
          source: link,
          score: scoreResult(data),
          ...data
        });

      } catch {
        continue;
      }
    }

    // STEP 4: sort + limit
    results.sort((a, b) => b.score - a.score);
    results = results.slice(0, 5);

    await browser.close();

    res.json({
      success: true,
      query,
      results
    });

  } catch (err) {
    if (browser) await browser.close();

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ===== HEALTH =====
app.get("/", (req, res) => {
  res.send("Search Engine Running 🚀");
});

// ===== START =====
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});