const imageInput = document.getElementById("imageInput");
const selectBtn = document.getElementById("selectBtn");
const analyzeBtn = document.getElementById("analyzeBtn");
const previewImage = document.getElementById("previewImage");
const previewArea = document.getElementById("previewArea");
const uploadDrop = document.getElementById("uploadDrop");
const resultHint = document.getElementById("resultHint");
const resultLabel = document.getElementById("resultLabel");
const resultConfidence = document.getElementById("resultConfidence");
const resultConfidenceDetail = document.getElementById("resultConfidenceDetail");
const resultPrompt = document.getElementById("resultPrompt");
const resultDevice = document.getElementById("resultDevice");
const resultTime = document.getElementById("resultTime");
const resultTimestamp = document.getElementById("resultTimestamp");
const navLinks = document.querySelectorAll(".nav-link");
const sections = document.querySelectorAll(".section-panel");
const sectionTitle = document.getElementById("sectionTitle");
const sectionDesc = document.getElementById("sectionDesc");
const reportPreview = document.getElementById("reportPreview");
const reportPlaceholder = document.getElementById("reportPlaceholder");
const reportLabel = document.getElementById("reportLabel");
const reportConfidence = document.getElementById("reportConfidence");
const reportPrompt = document.getElementById("reportPrompt");
const doctorNameInput = document.getElementById("doctorName");
const doctorNoteInput = document.getElementById("doctorNote");
const saveReportBtn = document.getElementById("saveReport");
const exportReportBtn = document.getElementById("exportReport");
const historyList = document.getElementById("historyList");

const sysFields = {
    os: document.getElementById("sysOs"),
    version: document.getElementById("sysVersion"),
    uptime: document.getElementById("sysUptime"),
    node: document.getElementById("sysNode"),
    cpu: document.getElementById("sysCpu"),
    mem: document.getElementById("sysMem"),
    gpu: document.getElementById("sysGpu"),
    gpuMem: document.getElementById("sysGpuMem"),
};

const sectionTexts = {
    dashboard: {
        title: "仪表盘",
        desc: "查看系统与模型状态、硬件资源等信息"
    },
    image: {
        title: "图像分析",
        desc: "支持 JPG、PNG、TIF 等格式的病理图像"
    },
    reports: {
        title: "诊断报告",
        desc: "同步推理结果、书写诊断意见并管理历史记录"
    },
    settings: {
        title: "系统设置",
        desc: "配置推理硬件、导出格式与通知策略"
    }
};

let currentFile = null;
let lastResult = null;
const reportHistory = [];

navLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
        event.preventDefault();
        const target = link.dataset.target;
        if (!target) return;
        setActiveSection(target);
    });
});

function setActiveSection(target) {
    navLinks.forEach((item) => {
        item.classList.toggle("active", item.dataset.target === target);
    });
    sections.forEach((section) => {
        const tags = (section.dataset.section || "")
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
        const shouldShow = tags.includes(target);
        section.classList.toggle("hidden", !shouldShow);
    });
    const meta = sectionTexts[target];
    if (meta) {
        sectionTitle.textContent = meta.title;
        sectionDesc.textContent = meta.desc;
    }
}

setActiveSection("image");
refreshSystemStatus();
setInterval(refreshSystemStatus, 60 * 1000);

selectBtn.addEventListener("click", () => imageInput.click());

imageInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    handleFile(file);
});

["dragenter", "dragover"].forEach((eventName) => {
    uploadDrop.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        uploadDrop.classList.add("drag");
    });
});

["dragleave", "drop"].forEach((eventName) => {
    uploadDrop.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        uploadDrop.classList.remove("drag");
    });
});

uploadDrop.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files[0];
    if (file) handleFile(file);
});

function handleFile(file) {
    const validTypes = ["image/jpeg", "image/png", "image/tiff"];
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!validTypes.includes(file.type) && !["jpg", "jpeg", "png", "tif", "tiff"].includes(ext)) {
        alert("仅支持 JPG/PNG/TIF 图片");
        return;
    }
    currentFile = file;
    analyzeBtn.disabled = false;
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImage.src = e.target.result;
        previewImage.style.display = "block";
        previewArea.querySelector("p")?.remove();
    };
    reader.readAsDataURL(file);
    resultHint.textContent = "点击“开始分析”即可查看推理结果";
}

analyzeBtn.addEventListener("click", async () => {
    if (!currentFile) return;
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "分析中...";

    const formData = new FormData();
    formData.append("image", currentFile);

    try {
        const response = await fetch("/analyze", {
            method: "POST",
            body: formData,
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "分析失败");
        }
        const payload = {
            ...data.result,
            preview: data.preview,
            metadata: data.metadata,
        };
        lastResult = payload;
        updateResultView(payload);
        updateReportView(payload);
        setActiveSection("image");
        previewImage.src = `data:image/png;base64,${data.preview}`;
        previewImage.style.display = "block";
    } catch (error) {
        alert(error.message);
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = "开始分析";
    }
});

saveReportBtn.addEventListener("click", () => {
    if (!lastResult) {
        alert("请先完成一次模型推理");
        return;
    }
    const doctor = doctorNameInput.value.trim() || "匿名医生";
    const note = doctorNoteInput.value.trim() || "暂无补充说明";
    const entry = {
        ...lastResult,
        doctor,
        note,
        savedAt: new Date().toISOString(),
    };
    reportHistory.unshift(entry);
    renderHistory();
    doctorNoteInput.value = "";
    alert("已保存到诊断报告历史");
});

exportReportBtn.addEventListener("click", () => {
    if (!lastResult) {
        alert("暂无可导出的报告");
        return;
    }
    const doctor = doctorNameInput.value.trim() || "匿名医生";
    const note = doctorNoteInput.value.trim() || "";
    const payload = {
        ...lastResult,
        doctor,
        note,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `diagnosis-${payload.analysis_id || Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

function updateResultView(payload) {
    const confidenceText = formatPercent(payload.confidence);
    resultHint.textContent = "推理完成，以下为模型返回的唯一结论";
    resultLabel.textContent = payload.label;
    resultConfidence.textContent = confidenceText;
    resultConfidenceDetail.textContent = confidenceText;
    resultPrompt.textContent = payload.prompt || "无描述";
    resultDevice.textContent = payload.metadata?.device || "未知";
    resultTime.textContent = payload.metadata?.inference_time
        ? `${payload.metadata.inference_time.toFixed(2)} s`
        : "--";
    resultTimestamp.textContent = formatDate(payload.timestamp);
}

function updateReportView(payload) {
    reportLabel.textContent = payload.label;
    reportConfidence.textContent = formatPercent(payload.confidence);
    reportPrompt.textContent = payload.prompt || "无描述";
    if (payload.preview) {
        reportPreview.src = `data:image/png;base64,${payload.preview}`;
        reportPreview.style.display = "block";
        reportPlaceholder.style.display = "none";
    }
}

function renderHistory() {
    if (!reportHistory.length) {
        historyList.innerHTML = '<p class="placeholder">暂无记录</p>';
        return;
    }
    historyList.innerHTML = "";
    reportHistory.forEach((item) => {
        const card = document.createElement("div");
        card.className = "history-card";
        card.innerHTML = `
            <h4>${item.label} · ${formatPercent(item.confidence)}</h4>
            <p class="history-meta">推理时间：${formatDate(item.timestamp)} · 医生：${item.doctor}</p>
            <p class="history-note"><strong>诊断意见：</strong>${item.note}</p>
        `;
        historyList.appendChild(card);
    });
}

function formatPercent(value) {
    if (typeof value !== "number") return "--%";
    return `${(value * 100).toFixed(1)}%`;
}

function formatDate(value) {
    if (!value) return "--";
    try {
        return new Date(value).toLocaleString();
    } catch (error) {
        return value;
    }
}

async function refreshSystemStatus() {
    try {
        const response = await fetch("/status");
        if (!response.ok) return;
        const data = await response.json();
        if (sysFields.os) sysFields.os.textContent = data.os || "--";
        if (sysFields.version) sysFields.version.textContent = data.service_version || "--";
        if (sysFields.uptime) sysFields.uptime.textContent = data.uptime || "--";
        if (sysFields.node) sysFields.node.textContent = data.node || "--";
        if (sysFields.cpu) sysFields.cpu.textContent = data.cpu || "--";
        if (sysFields.mem) sysFields.mem.textContent = data.memory || "--";
        if (sysFields.gpu) sysFields.gpu.textContent = data.gpu || "--";
        if (sysFields.gpuMem) sysFields.gpuMem.textContent = data.gpu_memory || "--";
    } catch (error) {
        console.warn("无法刷新系统信息", error);
    }
}
