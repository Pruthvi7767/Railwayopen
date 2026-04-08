import axios from "axios";
import express from "express";

const app = express();

const PORT = process.env.PORT || 3000;
const SCRAPER_URL = process.env.SCRAPER_URL;

// Dummy server (keeps Railway happy)
app.get("/", (req, res) => {
  res.send("Worker running...");
});

app.listen(PORT, () => {
  console.log(`Worker server running on port ${PORT}`);
});

// Your actual job
async function runJob() {
  try {
    console.log("Starting scraping job...");

    const res = await axios.post(`${SCRAPER_URL}/scrape`, {
      url: "https://example.com"
    });

    console.log("SUCCESS ✅");
    console.log("DATA:", res.data.data.slice(0, 100));

  } catch (err) {
    console.error("Worker error:", err.message);
  }
}

// run every 1 minute
setInterval(runJob, 60000);

// run immediately
runJob();