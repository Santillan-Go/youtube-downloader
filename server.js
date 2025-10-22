import express, { json } from "express";
import dotenv from "dotenv";
import { existsSync, unlinkSync, readdirSync } from "fs";
//mkdirSync
//import { spawn } from "child_process"; // Not needed for Vercel deployment
import youtubedl from "youtube-dl-exec";
import ytdl from "@distube/ytdl-core";
import { ProxyAgent } from "undici";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Load environment variables
dotenv.config();

const app = express();
app.use(json());
const __dirname = dirname(fileURLToPath(import.meta.url));
app.use(express.static(join(__dirname, "public")));

const PORT = process.env.PORT || 55000;

// List of free proxy servers (you can add your own or use environment variables)
const PROXY_LIST = [
  // Add your proxy servers here if needed, format: "http://ip:port"
  // Example: "http://proxy.example.com:8080"
  // You can also use process.env.PROXY_URL
];

// Try to use IPv6 to avoid rate limiting
const getRandomIPv6 = () => {
  const randomBlock = () =>
    Math.floor(Math.random() * 0xffff)
      .toString(16)
      .padStart(4, "0");
  return `2001:4:${randomBlock()}:${randomBlock()}::${randomBlock()}`;
};

// Configure ytdl-core with custom agent to avoid bot detection
const getYtdlOptions = () => {
  const options = {
    requestOptions: {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Ch-Ua":
          '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
      },
    },
    // Use IPv6 if available
    IPv6Block: process.env.IPV6_BLOCK || undefined,
  };

  // If proxy is available in environment variable
  if (process.env.PROXY_URL) {
    options.requestOptions.agent = new ProxyAgent(process.env.PROXY_URL);
  } else if (PROXY_LIST.length > 0) {
    // Or randomly select from proxy list
    const randomProxy =
      PROXY_LIST[Math.floor(Math.random() * PROXY_LIST.length)];
    options.requestOptions.agent = new ProxyAgent(randomProxy);
  }

  return options;
};

// Estado del progreso
let currentProgress = { percent: 0, isDownloading: false };

// Home page
app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "public", "index.html"));
});

// GET VIDEO INFO - Using ytdl-core (Vercel compatible)
app.post("/api/info", async (req, res) => {
  const { url } = req.body;
  if (!url)
    return res.status(400).json({ error: "No se proporcionó una URL válida" });

  try {
    // Validate YouTube URL
    if (!ytdl.validateURL(url)) {
      return res.status(400).json({ error: "URL de YouTube no válida" });
    }

    // Get video info using ytdl-core with custom headers
    const info = await ytdl.getInfo(url, getYtdlOptions());

    // Extract available qualities
    let qualities = ["MP3"];
    const formats = info.formats;

    // Check for video qualities
    const qualityMap = {
      720: "720p",
      1080: "1080p",
      1440: "1440p",
      2160: "2160p",
    };

    const availableQualities = new Set();
    formats.forEach((fmt) => {
      if (fmt.qualityLabel) {
        const quality = fmt.qualityLabel
          .replace("p60", "p")
          .replace("p50", "p");
        if (Object.values(qualityMap).includes(quality)) {
          availableQualities.add(quality);
        }
      }
    });

    // Add qualities in order
    ["720p", "1080p", "1440p", "2160p"].forEach((q) => {
      if (availableQualities.has(q)) {
        qualities.push(q);
      }
    });

    console.log("Información del video:", info.videoDetails.videoId);
    console.log("Calidades disponibles:", qualities);

    res.json({
      id: info.videoDetails.videoId || "",
      title: info.videoDetails.title || "Video sin título",
      duration: parseInt(info.videoDetails.lengthSeconds) || 0,
      uploader: info.videoDetails.author?.name || "Desconocido",
      view_count: parseInt(info.videoDetails.viewCount) || 0,
      upload_date: info.videoDetails.uploadDate || "Fecha desconocida",
      formats: formats,
      qualities,
    });
  } catch (err) {
    console.error("ytdl-core error:", err);
    res.status(500).json({
      error: "No se pudo obtener la información del video.",
      details: err.message,
    });
  }
});

// Download endpoint using ytdl-core (Vercel compatible)
app.post("/api/download", async (req, res) => {
  const { url, quality } = req.body;
  console.log({ url, quality });

  if (!url)
    return res.status(400).json({ error: "No se proporcionó una URL válida" });
  if (!quality)
    return res.status(400).json({ error: "No se especificó una calidad" });

  currentProgress = { percent: 0, isDownloading: true };

  try {
    // Validate YouTube URL
    if (!ytdl.validateURL(url)) {
      return res.status(400).json({ error: "URL de YouTube no válida" });
    }

    // Get video info with custom headers
    const info = await ytdl.getInfo(url, getYtdlOptions());
    const videoInfo = info.videoDetails;

    const safeTitle = videoInfo.title
      .replace(/[^\w\s.-]/gi, "")
      .trim()
      .substring(0, 100);

    // Determine format based on quality
    let format;
    let extension = "mp4";
    let qualityLabel = quality;
    let filterOptions = {};

    switch (quality.toLowerCase()) {
      case "mp3":
        filterOptions = { quality: "highestaudio" };
        extension = "mp3";
        qualityLabel = "MP3";
        break;
      case "720p":
        filterOptions = {
          quality: "highestvideo",
          filter: (format) =>
            format.height === 720 && format.hasVideo && format.hasAudio,
        };
        break;
      case "1080p":
        filterOptions = {
          quality: "highestvideo",
          filter: (format) =>
            format.height === 1080 && format.hasVideo && format.hasAudio,
        };
        break;
      case "1440p":
      case "2k":
        filterOptions = {
          quality: "highestvideo",
          filter: (format) =>
            format.height === 1440 && format.hasVideo && format.hasAudio,
        };
        break;
      case "2160p":
      case "4k":
        filterOptions = {
          quality: "highestvideo",
          filter: (format) =>
            format.height === 2160 && format.hasVideo && format.hasAudio,
        };
        break;
      default:
        filterOptions = { quality: "highest" };
    }

    // Get the best format matching the quality
    const formats = ytdl.filterFormats(
      info.formats,
      filterOptions.filter ? filterOptions : filterOptions.quality
    );

    if (!formats || formats.length === 0) {
      return res.status(404).json({
        error: "No se encontró un formato compatible para esta calidad",
        details: "Intenta con otra calidad",
      });
    }

    const selectedFormat = formats[0];
    const downloadUrl = selectedFormat.url;
    const filename = `${safeTitle}_${qualityLabel}.${extension}`;

    currentProgress = { percent: 100, isDownloading: false };

    console.log("✅ Download URL generated for quality:", quality);

    // Return the download URL for client-side download
    res.json({
      success: true,
      downloadUrl: downloadUrl,
      filename: filename,
      title: videoInfo.title,
      quality: qualityLabel,
    });
  } catch (error) {
    currentProgress.isDownloading = false;
    console.error("❌ Error:", error.message);
    return res.status(500).json({
      error: "Error durante la descarga.",
      details: error.message,
    });
  }
});

// Progress SSE
app.get("/api/progress", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  res.write(`data: ${JSON.stringify({ currentProgress })}\n\n`);

  const interval = setInterval(() => {
    res.write(`data: ${JSON.stringify({ currentProgress })}\n\n`);
  }, 500);

  req.on("close", () => clearInterval(interval));
});

// Clean all downloads
(function cleanup() {
  const dir = join(__dirname, "downloads");
  if (existsSync(dir)) {
    readdirSync(dir).forEach((file) => {
      unlinkSync(join(dir, file));
    });
  }
})();

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor en http://localhost:${PORT}`);
  //console.log(`📂 Descargas: ${join(__dirname, "downloads")}`);
});
