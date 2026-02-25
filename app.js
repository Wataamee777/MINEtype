const fileInput = document.getElementById("fileInput");
const dropzone = document.getElementById("dropzone");
const fileMeta = document.getElementById("fileMeta");
const resultSection = document.getElementById("resultSection");
const fileName = document.getElementById("fileName");
const fileSize = document.getElementById("fileSize");
const fileMime = document.getElementById("fileMime");
const fileExt = document.getElementById("fileExt");
const fileHeader = document.getElementById("fileHeader");
const headerHint = document.getElementById("headerHint");
const resultList = document.getElementById("resultList");
const reason = document.getElementById("reason");
const pieChart = document.getElementById("pieChart");

const signatureRules = [
  { bytes: [0x89, 0x50, 0x4e, 0x47], exts: ["png"], note: "PNGシグネチャ" },
  { bytes: [0xff, 0xd8, 0xff], exts: ["jpg", "jpeg"], note: "JPEGシグネチャ" },
  { bytes: [0x47, 0x49, 0x46, 0x38], exts: ["gif"], note: "GIFシグネチャ" },
  { bytes: [0x25, 0x50, 0x44, 0x46], exts: ["pdf"], note: "PDFシグネチャ" },
  {
    bytes: [0x50, 0x4b, 0x03, 0x04],
    exts: ["zip", "docx", "xlsx", "pptx", "jar"],
    note: "ZIP/OOXML系シグネチャ"
  },
  { bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07], exts: ["rar"], note: "RARシグネチャ" },
  { bytes: [0x1f, 0x8b], exts: ["gz"], note: "GZIPシグネチャ" },
  { bytes: [0x49, 0x44, 0x33], exts: ["mp3"], note: "ID3タグ(MP3)シグネチャ" },
  { bytes: [0x4f, 0x67, 0x67, 0x53], exts: ["ogg", "oga", "ogv"], note: "Oggシグネチャ" },
  {
    bytes: [0x46, 0x53, 0x42, 0x35],
    exts: ["fsb", "bank", "dat"],
    note: "FMOD FSB5シグネチャ"
  },
  {
    bytes: [0x00, 0x00, 0x00],
    check: (bytes) => bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70,
    exts: ["mp4", "m4a", "mov"],
    note: "ISO BMFF(ftyp)シグネチャ"
  }
];

const mimeMap = {
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/gif": ["gif"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"],
  "application/zip": ["zip"],
  "application/x-rar-compressed": ["rar"],
  "application/gzip": ["gz"],
  "audio/mpeg": ["mp3"],
  "audio/x-fsb": ["fsb", "bank", "dat"],
  "application/octet-stream": ["bin", "dat"],
  "video/mp4": ["mp4"],
  "text/plain": ["txt", "log", "md", "csv"],
  "application/json": ["json"],
  "text/html": ["html", "htm"]
};

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (file) await processFile(file);
});

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("active");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("active");
  });
});

dropzone.addEventListener("drop", async (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (file) await processFile(file);
});

async function processFile(file) {
  const headerBytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const asciiHint = detectAsciiHint(headerBytes);

  fileMeta.hidden = false;
  resultSection.hidden = false;
  fileName.textContent = file.name;
  fileSize.textContent = `${file.size.toLocaleString()} bytes`;
  fileMime.textContent = file.type || "(不明)";
  fileExt.textContent = ext || "(なし)";
  fileHeader.textContent = [...headerBytes.slice(0, 16)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
  headerHint.textContent = asciiHint || "(ヘッダー中に有意な文字列ヒントなし)";

  const analysis = analyzeFile(file.type, ext, headerBytes, asciiHint);
  reason.textContent = analysis.reason;
  renderResults(analysis.rankings);
  drawPie(analysis.rankings);
}

function detectAsciiHint(bytes) {
  const ascii = [...bytes]
    .map((v) => (v >= 32 && v <= 126 ? String.fromCharCode(v) : " "))
    .join("");

  const found = [];
  if (ascii.includes("FSB5")) found.push("FSB5(FMOD)ヘッダー");
  if (ascii.toLowerCase().includes("fmod")) found.push("'fmod' 文字列");
  if (ascii.includes("OggS")) found.push("OggS");
  if (ascii.includes("ftyp")) found.push("ftyp");

  const extTokens = ascii.match(/\.[a-z0-9]{2,5}/gi) || [];
  if (extTokens.length > 0) {
    const uniqueTokens = [...new Set(extTokens.map((v) => v.toLowerCase()))].slice(0, 3);
    found.push(`拡張子っぽい記述: ${uniqueTokens.join(", ")}`);
  }

  return found.join(" / ");
}

function analyzeFile(mimeType, ext, bytes, asciiHint) {
  const scores = new Map();
  const reasons = [];

  const addScore = (extension, value, why) => {
    scores.set(extension, (scores.get(extension) || 0) + value);
    if (why) reasons.push(`${extension}: ${why}(+${value})`);
  };

  for (const rule of signatureRules) {
    const matched = rule.bytes.every((v, i) => bytes[i] === v) && (!rule.check || rule.check(bytes));
    if (matched) {
      for (const candidateExt of rule.exts) {
        addScore(candidateExt, 60 / rule.exts.length, `ヘッダー一致(${rule.note})`);
      }
    }
  }

  if (mimeType && mimeMap[mimeType]) {
    for (const candidateExt of mimeMap[mimeType]) {
      addScore(candidateExt, 28 / mimeMap[mimeType].length, `MIME一致(${mimeType})`);
    }
  }

  if (asciiHint.includes("FSB5") || asciiHint.includes("fmod")) {
    addScore("dat", 14, "ヘッダー文字列ヒント(FMOD系)");
    addScore("bank", 14, "ヘッダー文字列ヒント(FMOD系)");
    addScore("fsb", 20, "ヘッダー文字列ヒント(FMOD系)");
  }

  if (ext) {
    addScore(ext, 8, "拡張子一致(参考値)");
  }

  if (scores.size === 0) {
    addScore("bin", 100, "判定情報不足のため汎用バイナリ");
  }

  const total = [...scores.values()].reduce((sum, v) => sum + v, 0);
  const rankings = [...scores.entries()]
    .map(([extension, score]) => ({
      extension,
      probability: Number(((score / total) * 100).toFixed(1))
    }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 6);

  return {
    rankings,
    reason: reasons.length
      ? `判定理由: ${reasons.slice(0, 10).join(" / ")}`
      : "判定理由: 一致情報が少ないため、低信頼の推定です。"
  };
}

function renderResults(rankings) {
  resultList.innerHTML = "";
  rankings.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `.${item.extension} : ${item.probability}%`;
    resultList.appendChild(li);
  });
}

function drawPie(rankings) {
  const ctx = pieChart.getContext("2d");
  const colors = ["#60a5fa", "#34d399", "#f472b6", "#f59e0b", "#c084fc", "#fb7185"];

  ctx.clearRect(0, 0, pieChart.width, pieChart.height);
  const centerX = pieChart.width / 2;
  const centerY = pieChart.height / 2;
  const radius = 130;

  let startAngle = -Math.PI / 2;
  rankings.forEach((item, index) => {
    const portion = item.probability / 100;
    const endAngle = startAngle + portion * Math.PI * 2;

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = colors[index % colors.length];
    ctx.fill();

    startAngle = endAngle;
  });

  ctx.fillStyle = "#e2e8f0";
  ctx.font = "15px sans-serif";
  rankings.forEach((item, index) => {
    ctx.fillStyle = colors[index % colors.length];
    ctx.fillRect(18, 18 + index * 24, 14, 14);
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`.${item.extension} ${item.probability}%`, 38, 30 + index * 24);
  });
}
