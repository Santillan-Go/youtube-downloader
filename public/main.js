const form = document.getElementById("downloadForm");
const urlInput = document.getElementById("urlInput");
const qualitySelect = document.getElementById("qualitySelect");
const downloadBtn = document.getElementById("downloadBtn");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const statusMessage = document.getElementById("statusMessage");
const card_info_video = document.querySelector(".card-info-video");
const progress_container = document.querySelector(".progress-container");
const container = document.querySelector(".container");
const img_arrow = document.querySelector(".img-arrow");
const loader = document.querySelector(".loader");
const next_button = document.querySelector(".next-button");
let qualityVideo = null; // Default quality
//get quality button and set a background, use the green color

const qualityButtons = document.querySelectorAll(".btn-quality");
const qualityButtonFather = document.querySelector(".quality-options");
qualityButtonFather.addEventListener("click", (e) => {
  if (e.target.classList.contains("btn-quality")) {
    document
      .querySelectorAll(".btn-quality")
      .forEach((b) => b.classList.remove("selected"));
    e.target.classList.add("selected");
    qualityVideo = e.target.textContent.trim();
  }
});
let firstLoad = true;
let isDownloading = false;
let eventSource;
let titleFile = "";
// Conectar a SSE para progreso
function initSSE() {
  eventSource = new EventSource("/api/progress");
  eventSource.onmessage = function (event) {
    const data = JSON.parse(event.data);
    updateProgress(
      data.currentProgress.percent,
      data.currentProgress.isDownloading
    );
    // if (
    //   data.downloadState.success &&
    //   !data.currentProgress.isDownloading &&
    //   data.currentProgress.percent === 100
    // ) {
    //   resetUI();
    // }
  };
}

function resetUI(withTimeout = true) {
  //reset after 5s
  if (withTimeout) {
    setTimeout(() => {
      isDownloading = false;
      downloadBtn.disabled = false;
      next_button.disabled = false;
      downloadBtn.style.display = "none";
      downloadBtn.textContent = "Descargar";
      qualityVideo = null;
      // Elimina la selección de los botones
      document
        .querySelectorAll(".btn-quality")
        .forEach((b) => b.classList.remove("selected"));
      // Vacía el contenedor de botones y lo oculta
      qualityButtonFather.innerHTML = "";
      qualityButtonFather.style.display = "none";
      // Oculta el progreso y la card
      progress_container.style.display = "none";
      card_info_video.style.display = "none";
      urlInput.value = "";
      titleFile = "";
    }, 3000);
  } else {
    isDownloading = false;
    downloadBtn.disabled = false;
    next_button.disabled = false;
    downloadBtn.style.display = "none";
    downloadBtn.textContent = "Descargar";
    qualityVideo = null;
    // Elimina la selección de los botones
    document
      .querySelectorAll(".btn-quality")
      .forEach((b) => b.classList.remove("selected"));
    // Vacía el contenedor de botones y lo oculta
    qualityButtonFather.innerHTML = "";
    qualityButtonFather.style.display = "none";
    // Oculta el progreso y la card
    progress_container.style.display = "none";
    card_info_video.style.display = "none";
    urlInput.value = "";
    titleFile = "";
  }
}
// Obtener info del video cuando se pega URL
form.addEventListener("submit", async function (event) {
  //validate if the input has text
  //cancel default event;

  event.preventDefault();
  const url = event.target.urlInput.value.trim();
  if (next_button.disabled) return;

  if ((url && url.includes("youtube.com")) || url.includes("youtu.be")) {
    await getVideoInfo(url);
    // Ya no es primera vez
  }
});

// Obtener información del video
async function getVideoInfo(url) {
  try {
    showStatus("Obteniendo información...", "loading");
    const response = await fetch("/api/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    next_button.setAttribute("disabled", true);
    next_button.disabled = true;
    const data = await response.json();
    console.log(data);
    if (response.ok) {
      let imgUrl = `https://img.youtube.com/vi/${data.id}/mqdefault.jpg`;

      card_info_video.style.display = "flex";
      qualityButtonFather.style.display = "flex";
      downloadBtn.style.display = "block";
      downloadBtn.style.visibility = "visible";
      card_info_video.innerHTML = "";
      qualityButtonFather.innerHTML = "";
      statusMessage.style.display = "block";
      QualitiesButton({ data });
      titleFile = data.title
        .replace(/[^\w\s.-]/gi, "")
        .trim()
        .substring(0, 100);
      const contentInfo = ContentCardInfoVideo({ data, imgUrl });
      card_info_video.innerHTML = contentInfo;

      img_arrow.style.display = "block";
      img_arrow.style.visibility = "visible";
      loader.style.display = "none";
      hideStatus();
      next_button.setAttribute("disabled", false);

      //next_button.setAttribute("disabled", false);
      next_button.disabled = false;
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    next_button.setAttribute("disabled", false);
    next_button.disabled = false;

    //next_button.setAttribute("disabled", false);
    // next_button.disabled = false;
    showStatus("Error: " + error.message, "error");
  }
}

// Manejar envío del formulario
downloadBtn.addEventListener("click", async function (e) {
  e.preventDefault();

  if (isDownloading) return;

  const url = urlInput.value.trim();
  //const quality = qualitySelect.value;

  if (!url || !qualityVideo) {
    showStatus("Completa todos los campos", "error");
    return;
  }
  if (qualityVideo == "MP3") {
    qualityVideo = "mp3";
  }

  await startDownload(url, qualityVideo);
});

// Iniciar descarga
async function startDownload(url, quality) {
  try {
    next_button.disabled = true;
    isDownloading = true;
    downloadBtn.disabled = true;
    downloadBtn.style.visibility = "hidden";
    downloadBtn.style.display = "none";

    showStatus("Obteniendo enlace de descarga...", "loading");
    progress_container.style.display = "block";
    updateProgress(30, true);

    if (typeof quality !== "string") {
      console.warn("La calidad debe ser una cadena");
      quality = `${quality}`;
    }

    const response = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, quality }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Error en la descarga");
    }

    const data = await response.json();
    updateProgress(70, true);

    if (data.success && data.downloadUrl) {
      // Update filename with proper extension
      const filename =
        data.filename || `${titleFile}.${quality === "mp3" ? "mp3" : "mp4"}`;

      showStatus("¡Preparando descarga...", "loading");
      updateProgress(90, true);

      // Create download link
      const a = document.createElement("a");
      a.href = data.downloadUrl;
      a.download = filename;
      a.target = "_blank";
      a.rel = "noopener noreferrer";

      // Try to trigger download
      document.body.appendChild(a);
      a.click();

      // Clean up
      setTimeout(() => {
        document.body.removeChild(a);
      }, 100);

      updateProgress(100, false);
      showStatus(
        "¡Descarga iniciada! El video se está descargando.",
        "success"
      );
    } else {
      throw new Error("No se pudo generar el enlace de descarga");
    }

    resetUI();
  } catch (error) {
    showStatus("Error: " + error.message, "error");
    console.error("Download error:", error);
    progress_container.style.display = "none";

    // Re-enable buttons on error
    setTimeout(() => {
      isDownloading = false;
      downloadBtn.disabled = false;
      downloadBtn.style.display = "block";
      downloadBtn.style.visibility = "visible";
      next_button.disabled = false;
    }, 2000);
  } finally {
    isDownloading = false;
    downloadBtn.disabled = false;
  }
}

//updateProgress(50, true);
// Inicializar progreso
// Actualizar progreso
function updateProgress(percent, downloading) {
  const safePercent = Math.min(100, Math.max(0, percent || 0));
  // progressBar.style.width = safePercent + "%";
  // progressText.textContent = Math.round(safePercent) + "%";
  // main.js
  progressBar.style.width = safePercent + "%";
  document.getElementById("progressPercent").textContent = safePercent + "%";
  if (downloading && safePercent > 0) {
    showStatus(`Descargando...`, "loading");
  }
}

// Mostrar mensaje de estado
function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.style.display = "block";
  statusMessage.className = `status-message status-${type}`;

  //
  if (type === "loading") {
    img_arrow.style.display = "none";
    img_arrow.style.visibility = "hidden";
    loader.style.display = "grid";
    loader.style.visibility = "visible";
  } else {
    img_arrow.style.display = "block";
    img_arrow.style.visibility = "visible";
    loader.style.display = "none";
  }

  if (type === "success") {
    setTimeout(() => hideStatus(), 5000);
  }
}

// Ocultar mensaje de estado
function hideStatus() {
  statusMessage.style.display = "none";
}

// Formatear duración
function formatDuration(seconds) {
  if (!seconds) return "Desconocido";
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

// Formatear números
function formatNumber(num) {
  if (!num) return "Desconocido";
  return new Intl.NumberFormat("es-ES").format(num);
}

// Inicializar cuando cargue la página
document.addEventListener("DOMContentLoaded", function () {
  initSSE();
});

//COMPONENTS
function ContentCardInfoVideo({ imgUrl, data }) {
  return `  <div class="card-info-thumb fade-slide">
                <img src=${imgUrl} alt="YouTube logo" />
              </div>
              <div class="card-info-details fade-slide">
                <h1 class="card-info-title">Información del video</h1>
                <p id="videoTitle">
                  <span class="card-info-label">Título:</span>
                  <span class="card-info-value">${data.title}</span>
                </p>
                <p id="videoChannel">
                  <span class="card-info-label">Canal:</span>
                  <span class="card-info-value">${data.uploader}</span>
                </p>
                <p id="videoDuration">
                  <span class="card-info-label">Duración:</span>
                  <span class="card-info-value"> ${formatDuration(
                    data.duration
                  )}</span>
                </p>
                <p id="videoViews">
                  <span class="card-info-label">Vistas:</span>
                  <span class="card-info-value">${formatNumber(
                    data.view_count
                  )}</span>
                </p>
              </div>`;
}

function QualitiesButton({ data }) {
  data.qualities.forEach((quality, index) => {
    const button = document.createElement("button");
    button.className = "btn-quality";
    button.textContent = quality;
    button.classList.add("fade-slide-btn");
    button.style.animationDelay = `${index * 0.1}s`;
    button.addEventListener("click", () => {
      // Quitar la clase 'selected' de todos
      qualityButtons.forEach((b) => b.classList.remove("selected"));
      // Agregar la clase solo al botón clickeado
      button.classList.add("selected");
      // Guardar el valor seleccionado
      qualityVideo = button.textContent.trim();
    });

    qualityButtonFather.appendChild(button);
  });
}
