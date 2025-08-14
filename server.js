import express, { json } from "express";

import { existsSync, mkdirSync, unlinkSync, readdirSync } from "fs";
import { spawn } from "child_process";
import youtubedl from "youtube-dl-exec";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const app = express();
app.use(json());
const __dirname = dirname(fileURLToPath(import.meta.url));
app.use(express.static(join(__dirname, "public")));

const PORT = process.env.PORT || 55000;
// Ruta a ffmpeg.exe en la raíz del proyecto
const ffmpegPath = join(__dirname, "ffmpeg.exe");

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
  console.log(ffmpegPath);
  try {
    // dumpSingleJson -> produce un JSON único con info (-J)
    const output = await youtubedl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificate: true,
      preferFreeFormats: true,
      // si necesitas forzar ffmpeg:
      ffmpegLocation: "ffmpeg",
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

// DOWNLOAD VIDEO WITH ffmpeg

app.post("/api/download", async (req, res) => {
  const { url, quality } = req.body;
  console.log({ url, quality });
  if (!url)
    return res.status(400).json({ error: "No se proporcionó una URL válida" });
  if (!quality)
    return res.status(400).json({ error: "No se especificó una calidad" });

  currentProgress = { percent: 0, isDownloading: true };

  try {
    // Primero obtenemos el título para el nombre del archivo
    const infoProc = spawn("yt-dlp", [url, "--dump-json", "--no-playlist"]);

    let output = "";
    for await (const chunk of infoProc.stdout) {
      output += chunk.toString();
    }
    const info = JSON.parse(output);
    const safeTitle = info.title
      .replace(/[^\w\s.-]/gi, "")
      .trim()
      .substring(0, 100);

    const downloadsDir = join(__dirname, "downloads");
    if (!existsSync(downloadsDir)) mkdirSync(downloadsDir, { recursive: true });

    let format;
    let extension = "mp4";
    let contentType = "video/mp4";
    let qualityLabel = quality;

    switch (quality) {
      case "mp3":
        format = "bestaudio";
        extension = "mp3";
        contentType = "audio/mpeg";
        qualityLabel = "MP3";
        break;
      case "720p":
        format =
          "bestvideo[height<=720]+bestaudio[ext=m4a]/bestvideo+bestaudio";
        break;
      case "1080p":
        format =
          "bestvideo[height<=1080]+bestaudio[ext=m4a]/bestvideo+bestaudio";
        break;

      case "2k":
        //"bestvideo[height<=1440]+bestaudio";
        format =
          "bestvideo[height<=1440]+bestaudio[ext=m4a]/bestvideo+bestaudio";
        break;
      case "4k":
        //bestvideo[height<=2160]+bestaudio
        format =
          "bestvideo[height<=2160]+bestaudio[ext=m4a]/bestvideo+bestaudio";
        break;
      default:
        format =
          "bestvideo[height<=720]+bestaudio[ext=m4a]/bestvideo+bestaudio";
    }

    const fileName = `(${qualityLabel}) ${safeTitle}.${extension}`;
    const filePath = join(downloadsDir, fileName);

    const args = [
      url,
      "-f",
      format,
      "--merge-output-format",
      "mp4",
      // "--recode-video",
      // "mp4",
      "--ffmpeg-location",
      ffmpegPath,
      "-o",
      filePath,
      "--no-playlist",
      "--no-part",
      "--no-continue",
    ];

    if (quality === "mp3") {
      args.push(
        "--extract-audio",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "0"
      );
    }
    //THIS
    args.push("--postprocessor-args", "-ac 2 -ar 44100");
    console.log(`📥 Descargando: ${fileName}`);
    console.log("🔹 Ejecutando:", args.join(" "));

    const proc = spawn("yt-dlp", args);

    proc.stdout.on("data", (data) => {
      const line = data.toString();
      process.stdout.write(line);
      const match = line.match(/(\d+(?:\.\d+)?)%/);
      if (match) {
        const percent = parseFloat(match[1]);
        if (percent > currentProgress.percent) {
          currentProgress.percent = percent;
        }
      }
    });

    proc.stderr.on("data", (data) => {
      const line = data.toString();
      process.stdout.write(line);
      const match = line.match(/(\d+(?:\.\d+)?)%/);
      if (match) {
        const percent = parseFloat(match[1]);
        if (percent > currentProgress.percent) {
          currentProgress.percent = percent;
        }
      }
    });

    proc.on("error", (err) => {
      currentProgress.isDownloading = false;

      console.error("❌ Error en yt-dlp:", err);
      return res.status(500).json({ error: "Error ejecutando yt-dlp." });
    });

    proc.on("close", () => {
      currentProgress.percent = 100;
      currentProgress.isDownloading = false;

      console.log(`✅ Descarga finalizada: ${fileName}`);

      // res.setHeader(
      //   "Content-Disposition",
      //   `attachment; filename="${fileName}"`
      // );
      // res.setHeader("Content-Type", contentType);
      // res.setHeader("Content-Length", fs.statSync(filePath).size);

      return res.sendFile(filePath, (err) => {
        if (err) {
          console.error("❌ Error enviando archivo:", err);
          if (!res.headersSent) {
            res.status(500).json({ error: "Error enviando archivo." });
          }
          return;
        } else {
          currentProgress.percent = 0;
        }
        setTimeout(() => {
          if (existsSync(filePath)) unlinkSync(filePath);

          //currentProgress.percent = 0;
        }, 5000);
      });
    });
  } catch (error) {
    currentProgress.isDownloading = false;
    //console.error("❌ Error:", error.message);
    return res
      .status(500)
      .json({ error: "Error durante la descarga.", details: error.message });
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
