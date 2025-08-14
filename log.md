- make a research about how to upload the project
- add animation ✅
- disabled the click event when the data is loading
- get available qualities ✅
- HANDLE ERRORS WELL---------- FOCUS ON THIS ✅
- add loader where the arrow button is ✅
- reset all fields once the file have downloaded ✅
  [youtube] Extracting URL: https://www.youtube.com/watch?v=hgYhws0AHcg
  [youtube] hgYhws0AHcg: Downloading webpage
  [youtube] hgYhws0AHcg: Downloading tv client config
  [youtube] hgYhws0AHcg: Downloading tv player API JSON
  [youtube] hgYhws0AHcg: Downloading ios player API JSON
  [youtube] hgYhws0AHcg: Downloading m3u8 information
  [info] hgYhws0AHcg: Downloading 1 format(s): 251
  [download] Destination: C:\Users\estud\Downloads\youtube-downloader\downloads\(MP3) Juice WRLD - Empty Out Your Pockets Official Fortnite Video.mp3
  [download] 100% of 2.37MiB in 00:00:01 at 1.94MiB/s  
   [ExtractAudio] Destination: C:\Users\estud\Downloads\youtube-downloader\downloads\(MP3) Juice WRLD - Empty Out Your Pockets Official Fortnite Video.mp3.mp3
  Deleting original file C:\Users\estud\Downloads\youtube-downloader\downloads\(MP3) Juice WRLD - Empty Out Your Pockets Official Fortnite Video.mp3 (pass -k to keep)
  [VideoConvertor] Converting video from mp3 to mp4; Destination: C:\Users\estud\Downloads\youtube-downloader\downloads\(MP3) Juice WRLD - Empty Out Your Pockets Official Fortnite Video.mp3.mp4
  Deleting original file C:\Users\estud\Downloads\youtube-downloader\downloads\(MP3) Juice WRLD - Empty Out Your Pockets Official Fortnite Video.mp3.mp3 (pass -k to keep)
  ✅ Descarga finalizada: (MP3) Juice WRLD - Empty Out Your Pockets Official Fortnite Video.mp3
  ❌ Error enviando archivo: [Error: ENOENT: no such file or directory, stat 'C:\Users\estud\Downloads\youtube-downloader\downloads\(MP3) Juice WRLD - Empty Out Your Pockets Official Fortnite Video.mp3'] {
  errno: -4058,
  code: 'ENOENT',
  syscall: 'stat',
  path: 'C:\\Users\\estud\\Downloads\\youtube-downloader\\downloads\\(MP3) Juice WRLD - Empty Out Your Pockets Official Fortnite Video.mp3',
  expose: false,
  statusCode: 404,
  status: 404
  }

  // Obtener información del video
  app.post("/api/info2", async (req, res) => {
  const { url } = req.body;
  if (!url)
  return res.status(400).json({ error: "No se proporcionó una URL válida" });

  try {
  const proc = spawn("yt-dlp", [url, "--dump-json", "--no-playlist"]);

      let output = "";
      proc.stdout.on("data", (data) => {
        output += data.toString();
        console.log("🔹 Datos recibidos:", data.toString());
      });
      console.log(`🔹 ${output}`);
      let qualities = ["MP3"];
      let qualityAccepted = ["720p", "1080p", "1440p", "2160p"];
      // console.log("info", info);

      proc.on("close", () => {
        let info = JSON.parse(output);
        console.log("Información del video:", info.display_id);
        info.formats.forEach((fmt) => {
          if (
            fmt.format_note &&
            qualityAccepted.includes(fmt.format_note) &&
            !qualities.includes(fmt.format_note)
          ) {
            qualities.push(fmt.format_note);
          }
          console.log({
            id: fmt.format_id,
            note: fmt.format_note,
            resolution: fmt.resolution,
            ext: fmt.ext,
            vcodec: fmt.vcodec,
            acodec: fmt.acodec,
          });
        });
        console.log("Calidades disponibles:", qualities);
        try {
          res.json({
            id: info.display_id || "",
            title: info.title || "Video sin título",
            duration: info.duration || 0,
            uploader: info.uploader || "Desconocido",
            view_count: info.view_count || 0,
            upload_date: info.upload_date || "Fecha desconocida",
            formats: info.formats || [],
            qualities,
            // title: info.title || "Video sin título",
            // duration: info.duration || 0,
            // uploader: info.uploader || "Desconocido",
            // view_count: info.view_count || 0,
            // upload_date: info.upload_date || "Fecha desconocida",
            // formats: info.formats || [],
          });
        } catch {
          res
            .status(500)
            .json({ error: "No se pudo obtener la información del video." });
        }
      });

  } catch {
  res
  .status(500)
  .json({ error: "No se pudo obtener la información del video." });
  }
  });

// ...existing code...
app.post("/api/download2", async (req, res) => {
const { url, quality } = req.body;
if (!url || !quality)
return res.status(400).json({ error: "Falta URL o calidad." });

currentProgress = { percent: 0, isDownloading: true };
try {
// Ejecutar descarga directamente y enviar el archivo al cliente
const flags = {
format: `best[height<=${quality}][ext=mp4]`,
// output: "-",
// format:
// quality === "mp3"
// ? "bestaudio"
// : `bestvideo[height<=${quality}]+bestaudio`,
extractAudio: quality === "mp3",
audioFormat: quality === "mp3" ? "mp3" : undefined,
output: "-", // salida a stdout para piping
};
const subprocess = youtubedl.exec(url, flags, {
stdio: ["ignore", "pipe", "inherit"],
});

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${Date.now()}.${
        quality === "mp3" ? "mp3" : "mp4"
      }"`
    );
    subprocess.stdout.pipe(res);
    subprocess.on(
      "close",
      () => ((currentProgress.isDownloading = false), (percent = 0))
    );

} catch (err) {
currentProgress.isDownloading = false;
console.error("Error:", err);
res.status(500).json({ error: "Error durante la descarga." });
}
});
//.......------------------------------
app.post("/api/download3", async (req, res) => {
const { url, quality } = req.body;
if (!url)
return res.status(400).json({ error: "No se proporcionó una URL válida" });
if (!quality)
return res.status(400).json({ error: "No se especificó una calidad" });

currentProgress = { percent: 0, isDownloading: true };

try {
// Obtener info del video de forma segura
const infoProc = spawn("yt-dlp", [url, "--dump-json", "--no-playlist"]);
let output = "";
let errorOutput = "";

    infoProc.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    infoProc.stderr.on("data", (chunk) => {
      errorOutput += chunk.toString();
    });

    infoProc.on("error", (err) => {
      currentProgress.isDownloading = false;
      console.error("❌ Error ejecutando yt-dlp:", err);
      console.log("❌  SOMTHING WENT WRONG");
      return res.status(500).json({ error: "Error ejecutando yt-dlp." });
    });

    infoProc.on("close", (code) => {
      if (code !== 0) {
        currentProgress.isDownloading = false;
        console.error("❌ yt-dlp terminó con error:", errorOutput);
        return res
          .status(500)
          .json({ error: "No se pudo obtener la información del video." });
      }

      let info;
      try {
        info = JSON.parse(output);
      } catch (e) {
        currentProgress.isDownloading = false;
        console.error("❌ Error parseando JSON:", e);
        return res
          .status(500)
          .json({ error: "Error parseando la información del video." });
      }

      // ...el resto de tu lógica de descarga aquí, usando 'info'...
      // Copia aquí el resto del código desde 'const safeTitle = ...' hasta el final del endpoint
      // (no repitas la obtención de infoProc)
    });

} catch (error) {
currentProgress.isDownloading = false;
console.error("❌ Error:", error.message);
res.status(500).json({ error: "Error durante la descarga." });
}
});
//**\*\*\*\***\*\***\*\*\*\***\_\_**\*\*\*\***\*\***\*\*\*\***
