import express, { json } from "express";

import { existsSync, unlinkSync, readdirSync } from "fs";
//mkdirSync
//import { spawn } from "child_process"; // Not needed for Vercel deployment
import youtubedl from "youtube-dl-exec";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const app = express();
app.use(json());
const __dirname = dirname(fileURLToPath(import.meta.url));
app.use(express.static(join(__dirname, "public")));

const PORT = process.env.PORT || 55000;
// Ruta a ffmpeg.exe en la raíz del proyecto
// const ffmpegPath = join(__dirname, "ffmpeg.exe");

// Estado del progreso
let currentProgress = { percent: 0, isDownloading: false };

// Home page
app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "public", "index.html"));
});

// THIS WORKS- GET VIDEO INFO
app.post("/api/info", async (req, res) => {
  const { url } = req.body;
  if (!url)
    return res.status(400).json({ error: "No se proporcionó una URL válida" });
  // console.log(ffmpegPath); // Commented out for Vercel deployment
  try {
    // dumpSingleJson -> produce un JSON único con info (-J)
    const output = await youtubedl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificate: true,
      preferFreeFormats: true,
      // si necesitas forzar ffmpeg:
      //ffmpegLocation: ffmpegPath,
      //ffmpegLocation: "ffmpeg",
      //cookies: "/var/www/cookies_1.txt",
      cookies: "--cookies-from-browser",
      // //  proxy: "",

      //proxy: "http://nwlsdpum:tk0fit6b2qdo@107.172.163.27:6543",
      // addHeader: ["referer:youtube.com", "user-agent:googlebot"],

      // timeout: 60_000 // puedes añadir timeout si quieres
    });

    // output puede ser string (JSON) o ya objeto; parseamos de forma segura
    const info = typeof output === "string" ? JSON.parse(output) : output;
    let qualities = ["MP3"];
    let qualityAccepted = ["720p", "1080p", "1440p", "2160p"];
    console.log("Información del video:", info.display_id);
    // console.log("info", info);
    output.formats.forEach((fmt) => {
      if (
        fmt.format_note &&
        qualityAccepted.includes(fmt.format_note) &&
        !qualities.includes(fmt.format_note)
      ) {
        qualities.push(fmt.format_note);
      }
    });

    console.log("Calidades disponibles:", qualities);
    res.json({
      id: info.display_id || "",
      title: info.title || "Video sin título",
      duration: info.duration || 0,
      uploader: info.uploader || "Desconocido",
      view_count: info.view_count || 0,
      upload_date: info.upload_date || "Fecha desconocida",
      formats: info.formats || [],
      qualities,
    });
  } catch (err) {
    console.error("youtube-dl-exec error:", err);
    res.status(500).json({
      error: "No se pudo obtener la información del video.",
      details: err.message,
    });
  }
});

// Download endpoint using youtube-dl-exec (Vercel compatible)
app.post("/api/download", async (req, res) => {
  const { url, quality } = req.body;
  console.log({ url, quality });

  if (!url)
    return res.status(400).json({ error: "No se proporcionó una URL válida" });
  if (!quality)
    return res.status(400).json({ error: "No se especificó una calidad" });

  currentProgress = { percent: 0, isDownloading: true };

  try {
    // Get video info first
    const info = await youtubedl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificate: true,
      preferFreeFormats: true,
    });

    const videoInfo = typeof info === "string" ? JSON.parse(info) : info;
    const safeTitle = videoInfo.title
      .replace(/[^\w\s.-]/gi, "")
      .trim()
      .substring(0, 100);

    // Determine format and extension based on quality
    let format;
    let extension = "mp4";
    let qualityLabel = quality;

    switch (quality.toLowerCase()) {
      case "mp3":
        format = "bestaudio[ext=m4a]/bestaudio";
        extension = "mp3";
        qualityLabel = "MP3";
        break;
      case "720p":
        format =
          "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]";
        break;
      case "1080p":
        format =
          "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[height<=1080]";
        break;
      case "1440p":
      case "2k":
        format =
          "bestvideo[height<=1440][ext=mp4]+bestaudio[ext=m4a]/best[height<=1440][ext=mp4]/best[height<=1440]";
        break;
      case "2160p":
      case "4k":
        format =
          "bestvideo[height<=2160][ext=mp4]+bestaudio[ext=m4a]/best[height<=2160][ext=mp4]/best[height<=2160]";
        break;
      default:
        format =
          "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]";
    }

    const filename = `${safeTitle}_${qualityLabel}.${extension}`;

    // Get the direct download URL
    const downloadUrl = await youtubedl(url, {
      format: format,
      getUrl: true,
      noWarnings: true,
      noCheckCertificate: true,
      preferFreeFormats: true,
    });

    currentProgress = { percent: 100, isDownloading: false };

    // Extract URL from response (could be array or string)
    let finalUrl = Array.isArray(downloadUrl) ? downloadUrl[0] : downloadUrl;

    // If it's a string with multiple URLs, get the first one
    if (typeof finalUrl === "string" && finalUrl.includes("\n")) {
      finalUrl = finalUrl.split("\n")[0].trim();
    }

    console.log(
      "✅ Download URL generated:",
      finalUrl.substring(0, 100) + "..."
    );

    // Return the download URL for client-side download
    res.json({
      success: true,
      downloadUrl: finalUrl,
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
