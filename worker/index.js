import axios from "axios";

const SCRAPER_URL = process.env.SCRAPER_URL;

async function runJob() {
  try {
    console.log("Starting scraping job...");

    const res = await axios.post(`${SCRAPER_URL}/scrape`, {
      url: "https://example.com"
    });

    console.log("Scraped data:", res.data.data.slice(0, 100));

  } catch (err) {
    console.error("Worker error:", err.message);
  }
}

// run every 1 minute (for testing)
setInterval(runJob, 60000);

// run immediately on start
runJob();