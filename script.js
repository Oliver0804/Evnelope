"use strict";

/* ---------------- 狀態 ---------------- */
let recipients = [];   // { senderZip, senderName, senderAddress, senderPhone, receiverZip, receiverName, receiverAddress, receiverPhone }
let editingIndex = -1; // -1 表示新增模式，否則為正在編輯的索引
let logoDataUrl = "";  // 使用者上傳的標誌（base64 data URL，僅存本機）
let layout = { horizontal: {}, vertical: {} }; // 各方向、各區塊的自訂位置（px，相對信封左上角）
let userZoom = 1;      // 使用者的預覽縮放倍率（1 = 符合畫面）
let currentScale = 1;  // 目前實際套用的預覽縮放（自動符合 × userZoom），拖曳換算用

/* ---------------- DOM ---------------- */
const $ = (id) => document.getElementById(id);
const form = $("envelopeForm");
const container = $("envelopesContainer");
const listEl = $("recipientList");
const emptyState = $("emptyState");
const countBadge = $("countBadge");
const addBtn = $("addBtn");

/* ---------------- 本機記憶（localStorage，僅存在這台電腦的瀏覽器） ---------------- */
const STORAGE_KEY = "evnelope.data.v1";

function gatherSettings() {
    return {
        orientation: currentOrientation(),
        envelopeSize: $("envelopeSize").value,
        printMode: $("printMode").value,
        customWidth: $("customWidth").value,
        customHeight: $("customHeight").value,
        senderFontSize: $("senderFontSize").value,
        receiverFontSize: $("receiverFontSize").value,
        showBorder: $("showBorder").checked,
        showStamp: $("showStamp").checked,
        logo: logoDataUrl,
        logoSize: $("logoSize").value,
        layout,
        userZoom
    };
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            recipients,
            settings: gatherSettings()
        }));
    } catch (e) {
        /* 隱私模式或空間不足時略過，不影響使用 */
    }
}

function loadState() {
    let data;
    try {
        data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch (e) {
        data = null;
    }
    if (!data) return false;

    if (Array.isArray(data.recipients)) recipients = data.recipients;

    const s = data.settings;
    if (s) {
        const orient = document.querySelector(`input[name="orientation"][value="${s.orientation}"]`);
        if (orient) orient.checked = true;
        if (s.envelopeSize) $("envelopeSize").value = s.envelopeSize;
        if (s.printMode) $("printMode").value = s.printMode;
        if (s.customWidth) $("customWidth").value = s.customWidth;
        if (s.customHeight) $("customHeight").value = s.customHeight;
        if (s.senderFontSize) $("senderFontSize").value = s.senderFontSize;
        if (s.receiverFontSize) $("receiverFontSize").value = s.receiverFontSize;
        if (typeof s.showBorder === "boolean") $("showBorder").checked = s.showBorder;
        if (typeof s.showStamp === "boolean") $("showStamp").checked = s.showStamp;
        if (s.logo) logoDataUrl = s.logo;
        if (s.logoSize) $("logoSize").value = s.logoSize;
        if (s.layout && s.layout.horizontal && s.layout.vertical) layout = s.layout;
        if (typeof s.userZoom === "number") userZoom = s.userZoom;
    }
    return true;
}

/* ---------------- 範例資料 ---------------- */
const SAMPLE_RECIPIENTS = [
    {
        senderZip: "100", senderName: "王小明",
        senderAddress: "台北市中正區忠孝東路一段100號", senderPhone: "0912345678",
        receiverZip: "407", receiverName: "李大華",
        receiverAddress: "台中市西屯區台灣大道二段200號", receiverPhone: "0987654321"
    }
];

function loadSample() {
    recipients = recipients.concat(SAMPLE_RECIPIENTS.map((r) => Object.assign({}, r)));
    render();
}

/* ---------------- 工具 ---------------- */
// 從地址開頭抽出 3~6 碼郵遞區號
function extractZip(address) {
    const m = (address || "").trim().match(/^(\d{3,6})\s*/);
    return m ? m[1] : "";
}
function stripLeadingZip(address) {
    return (address || "").replace(/^(\d{3,6})\s*/, "").trim();
}
function esc(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/* ---------------- 表單 ---------------- */
function readForm() {
    const senderAddressRaw = $("senderAddress").value.trim();
    const receiverAddressRaw = $("receiverAddress").value.trim();
    return {
        senderZip: $("senderZip").value.trim() || extractZip(senderAddressRaw),
        senderName: $("senderName").value.trim(),
        senderAddress: stripLeadingZip(senderAddressRaw),
        senderPhone: $("senderPhone").value.trim(),
        receiverZip: $("receiverZip").value.trim() || extractZip(receiverAddressRaw),
        receiverName: $("receiverName").value.trim(),
        receiverAddress: stripLeadingZip(receiverAddressRaw),
        receiverPhone: $("receiverPhone").value.trim()
    };
}

function fillForm(r) {
    $("senderZip").value = r.senderZip || "";
    $("senderName").value = r.senderName || "";
    $("senderAddress").value = r.senderAddress || "";
    $("senderPhone").value = r.senderPhone || "";
    $("receiverZip").value = r.receiverZip || "";
    $("receiverName").value = r.receiverName || "";
    $("receiverAddress").value = r.receiverAddress || "";
    $("receiverPhone").value = r.receiverPhone || "";
}

function resetForm() {
    form.reset();
    editingIndex = -1;
    addBtn.textContent = "＋ 新增到清單";
}

form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = readForm();
    if (!data.receiverName || !data.receiverAddress) {
        $("receiverName").focus();
        return;
    }
    if (editingIndex >= 0) {
        recipients[editingIndex] = data;
    } else {
        recipients.push(data);
    }
    resetForm();
    render();
    // 新增後將焦點移回收件人姓名，方便連續輸入
    $("receiverName").focus();
});

$("resetFormBtn").addEventListener("click", resetForm);

/* ---------------- 清單操作 ---------------- */
function editRecipient(i) {
    editingIndex = i;
    fillForm(recipients[i]);
    addBtn.textContent = "💾 儲存修改";
    window.scrollTo({ top: 0, behavior: "smooth" });
}
function deleteRecipient(i) {
    recipients.splice(i, 1);
    if (editingIndex === i) resetForm();
    render();
}

$("clearAllBtn").addEventListener("click", () => {
    if (recipients.length && confirm("確定要清除全部信封嗎？")) {
        recipients = [];
        resetForm();
        render();
    }
});

/* ---------------- CSV ---------------- */
const HEADER_MAP = {
    "寄件人郵遞區號": "senderZip", "寄件人姓名": "senderName", "寄件人地址": "senderAddress", "寄件人電話": "senderPhone",
    "收件人郵遞區號": "receiverZip", "收件人姓名": "receiverName", "收件人地址": "receiverAddress", "收件人電話": "receiverPhone"
};

function parseCSV(text) {
    const rows = text.replace(/\r/g, "").split("\n").filter((r) => r.trim() !== "");
    if (!rows.length) return [];
    const header = rows[0].split(",").map((h) => h.trim());
    const hasZip = header.some((h) => h.includes("郵遞區號"));
    const headerKnown = header.some((h) => HEADER_MAP[h]);

    return rows.slice(1).map((line) => {
        const cols = line.split(",").map((c) => c.trim());
        let r;
        if (headerKnown) {
            r = {};
            header.forEach((h, idx) => {
                const key = HEADER_MAP[h];
                if (key) r[key] = cols[idx] || "";
            });
        } else if (hasZip) {
            // 位置：寄zip,寄名,寄址,寄話,收zip,收名,收址,收話
            r = {
                senderZip: cols[0], senderName: cols[1], senderAddress: cols[2], senderPhone: cols[3],
                receiverZip: cols[4], receiverName: cols[5], receiverAddress: cols[6], receiverPhone: cols[7]
            };
        } else {
            // 舊格式：寄名,寄址,寄話,收名,收址,收話
            r = {
                senderName: cols[0], senderAddress: cols[1], senderPhone: cols[2],
                receiverName: cols[3], receiverAddress: cols[4], receiverPhone: cols[5]
            };
        }
        // 補完整欄位 + 自動抽郵遞區號
        return {
            senderZip: (r.senderZip || extractZip(r.senderAddress) || "").trim(),
            senderName: (r.senderName || "").trim(),
            senderAddress: stripLeadingZip(r.senderAddress).trim(),
            senderPhone: (r.senderPhone || "").trim(),
            receiverZip: (r.receiverZip || extractZip(r.receiverAddress) || "").trim(),
            receiverName: (r.receiverName || "").trim(),
            receiverAddress: stripLeadingZip(r.receiverAddress).trim(),
            receiverPhone: (r.receiverPhone || "").trim()
        };
    }).filter((r) => r.receiverName || r.receiverAddress);
}

function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const parsed = parseCSV(e.target.result);
        if (!parsed.length) {
            alert("找不到可用的資料，請確認 CSV 格式。");
            return;
        }
        recipients = recipients.concat(parsed);
        render();
    };
    reader.readAsText(file, "UTF-8");
}

$("csvPickBtn").addEventListener("click", () => $("csvFile").click());
$("csvFile").addEventListener("change", (e) => {
    handleFile(e.target.files[0]);
    e.target.value = "";
});

const dropZone = $("dropZone");
["dragenter", "dragover"].forEach((ev) =>
    dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add("dragover"); })
);
["dragleave", "drop"].forEach((ev) =>
    dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove("dragover"); })
);
dropZone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
});

/* CSV 模板下載 */
$("downloadTemplate").addEventListener("click", (e) => {
    e.preventDefault();
    const csv = "寄件人郵遞區號,寄件人姓名,寄件人地址,寄件人電話,收件人郵遞區號,收件人姓名,收件人地址,收件人電話\n" +
        "100,王小明,台北市中正區忠孝東路一段100號,0912345678,407,李大華,台中市西屯區台灣大道二段200號,0987654321\n" +
        "806,陳美玲,高雄市前鎮區中山三路300號,0922333444,220,林志強,新北市板橋區文化路一段400號,0977555666\n";
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "envelope_template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
});

/* ---------------- 設定 ---------------- */
// 各信封尺寸實際寬高（mm），用於「每封一頁」時動態設定列印紙張尺寸
const SIZE_DIMS = {
    "western-dl": "220mm 110mm",
    "western-12k": "230mm 120mm",
    "chinese-2": "176mm 125mm",
    "chinese-3": "230mm 160mm"
};

function currentOrientation() {
    return document.querySelector('input[name="orientation"]:checked').value;
}

function applyContainerClasses() {
    const size = $("envelopeSize").value;
    const orientation = currentOrientation();
    const printMode = $("printMode").value;

    container.className = "";
    container.classList.add("size-" + size, "orientation-" + orientation, "print-" + printMode);
    if ($("showBorder").checked) container.classList.add("show-border");
    if ($("showStamp").checked) container.classList.add("show-stamp");

    // 自訂尺寸：以 CSS 變數套用寬高
    if (size === "custom") {
        container.style.setProperty("--env-w", ($("customWidth").value || 220) + "mm");
        container.style.setProperty("--env-h", ($("customHeight").value || 110) + "mm");
    }
}

// 依「列印方式」與信封尺寸動態設定 @page，讓「每封一頁」可直接對齊實體信封
function updatePageStyle() {
    let el = $("dynamicPageStyle");
    if (!el) {
        el = document.createElement("style");
        el.id = "dynamicPageStyle";
        document.head.appendChild(el);
    }
    const mode = $("printMode").value;
    const size = $("envelopeSize").value;
    let pageSize = "A4";
    let margin = "8mm";

    if (mode === "single") {
        margin = "0";
        if (size === "custom") {
            pageSize = `${$("customWidth").value || 220}mm ${$("customHeight").value || 110}mm`;
        } else if (SIZE_DIMS[size]) {
            pageSize = SIZE_DIMS[size];
        }
    }
    el.textContent = `@media print { @page { size: ${pageSize}; margin: ${margin}; } }`;
}

/* ---------------- 標誌 Logo ---------------- */
function updateLogoUI() {
    const has = !!logoDataUrl;
    $("logoPreview").hidden = !has;
    $("logoSizeRow").hidden = !has;
    $("logoRemoveBtn").hidden = !has;
    if (has) $("logoPreviewImg").src = logoDataUrl;
}

$("logoPickBtn").addEventListener("click", () => $("logoFile").click());
$("logoFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        logoDataUrl = ev.target.result;
        updateLogoUI();
        render();
    };
    reader.readAsDataURL(file);
});
$("logoRemoveBtn").addEventListener("click", () => {
    logoDataUrl = "";
    updateLogoUI();
    render();
});
$("logoSize").addEventListener("input", render);

// 切換自訂尺寸欄位與列印方式說明
function updateSettingsUI() {
    $("customSizeRow").hidden = $("envelopeSize").value !== "custom";
    $("printModeHint").textContent = $("printMode").value === "single"
        ? "紙張會自動設成信封尺寸，請將實體信封放入印表機。"
        : "信封會自動排在 A4 上，適合先印出再裝入信封或校稿。";
}

["envelopeSize", "showBorder", "showStamp", "senderFontSize", "receiverFontSize",
    "printMode", "customWidth", "customHeight"].forEach((id) =>
    $(id).addEventListener("input", () => { updateSettingsUI(); render(); })
);
document.querySelectorAll('input[name="orientation"]').forEach((el) =>
    el.addEventListener("change", render)
);
window.addEventListener("resize", scalePreview);

/* ---------------- 預覽縮放 ----------------
   信封以實際 mm 呈現，畫面通常放不下，先自動縮到符合畫面，再乘上使用者的縮放倍率
   （僅縮預覽，列印不受影響）。 */
function scalePreview() {
    container.style.transform = "scale(1)";
    container.style.width = "";
    container.style.height = "";
    if (!container.querySelector(".envelope")) {
        $("zoomBar").hidden = true;
        return;
    }
    $("zoomBar").hidden = false;

    const pane = container.parentElement;            // .preview-scroll
    const available = pane.clientWidth - 4;
    const naturalW = container.scrollWidth;
    const naturalH = container.scrollHeight;
    const fit = Math.min(1, available / naturalW);
    currentScale = fit * userZoom;

    container.style.transform = `scale(${currentScale})`;
    container.style.transformOrigin = "top left";
    container.style.width = (naturalW * currentScale) + "px";
    container.style.height = (naturalH * currentScale) + "px";

    $("zoomVal").textContent = Math.round(userZoom * 100) + "%";
    $("zoomRange").value = Math.round(userZoom * 100);
}

/* ---------------- 預覽縮放控制 ---------------- */
function setZoom(pct) {
    userZoom = Math.min(2, Math.max(0.3, pct / 100));
    scalePreview();
    saveState();
}
$("zoomRange").addEventListener("input", (e) => setZoom(+e.target.value));
$("zoomIn").addEventListener("click", () => setZoom(Math.round(userZoom * 100) + 10));
$("zoomOut").addEventListener("click", () => setZoom(Math.round(userZoom * 100) - 10));
$("zoomFit").addEventListener("click", () => setZoom(100));
$("resetLayout").addEventListener("click", () => {
    const o = currentOrientation();
    if (Object.keys(layout[o] || {}).length === 0) return;
    if (confirm("確定要把目前方向的版面位置重設回預設嗎？")) {
        layout[o] = {};
        render();
    }
});

// Ctrl + 滾輪：縮放整個預覽
container.parentElement.addEventListener("wheel", (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom(Math.round(userZoom * 100) + (e.deltaY < 0 ? 8 : -8));
}, { passive: false });

/* ---------------- 拖曳排版 ---------------- */
let dragState = null;
container.addEventListener("pointerdown", (e) => {
    const el = e.target.closest("[data-drag]");
    if (!el) return;
    e.preventDefault();
    const env = el.closest(".envelope");
    const elRect = el.getBoundingClientRect();
    const envRect = env.getBoundingClientRect();
    const sx = (elRect.left - envRect.left) / currentScale;
    const sy = (elRect.top - envRect.top) / currentScale;
    dragState = {
        key: el.dataset.drag,
        orient: currentOrientation(),
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startX: sx, startY: sy,
        curX: sx, curY: sy,
        moved: false
    };
    document.querySelectorAll(`[data-drag="${dragState.key}"]`)
        .forEach((n) => n.classList.add("dragging"));
});
window.addEventListener("pointermove", (e) => {
    if (!dragState) return;
    const dx = (e.clientX - dragState.startMouseX) / currentScale;
    const dy = (e.clientY - dragState.startMouseY) / currentScale;
    if (Math.abs(dx) + Math.abs(dy) > 1) dragState.moved = true;
    dragState.curX = Math.max(0, dragState.startX + dx);
    dragState.curY = Math.max(0, dragState.startY + dy);
    document.querySelectorAll(`[data-drag="${dragState.key}"]`)
        .forEach((el) => applyPosToEl(el, dragState.curX, dragState.curY));
});
window.addEventListener("pointerup", () => {
    if (!dragState) return;
    document.querySelectorAll(`[data-drag="${dragState.key}"]`)
        .forEach((n) => n.classList.remove("dragging"));
    if (dragState.moved) {
        layout[dragState.orient][dragState.key] = { x: dragState.curX, y: dragState.curY };
        saveState();
    }
    dragState = null;
});

/* 滾輪縮放單一區塊文字（Logo 則調整高度） */
container.addEventListener("wheel", (e) => {
    if (e.ctrlKey) return; // 留給整體縮放
    const el = e.target.closest("[data-drag]");
    if (!el) return;
    e.preventDefault();
    const step = e.deltaY < 0 ? 1 : -1;
    if (e.target.classList.contains("sender-logo")) {
        bumpInput("logoSize", step, 4, 40);
    } else if (el.dataset.drag === "sender" || el.dataset.drag === "senderZip") {
        bumpInput("senderFontSize", step, 8, 48);
    } else {
        bumpInput("receiverFontSize", step, 8, 48);
    }
    render();
}, { passive: false });

function bumpInput(id, step, min, max) {
    const el = $(id);
    el.value = Math.min(max, Math.max(min, (+el.value || min) + step));
}

/* ---------------- 浮動列印按鈕 ---------------- */
$("floatingPrint").addEventListener("click", () => doPrint());
window.addEventListener("scroll", () => {
    $("floatingPrint").classList.toggle("visible", window.scrollY > 90);
});

/* ---------------- 渲染 ---------------- */
function buildEnvelope(r) {
    const senderFs = $("senderFontSize").value || 14;
    const receiverFs = $("receiverFontSize").value || 22;
    const orientation = currentOrientation();

    const env = document.createElement("div");
    env.className = "envelope";

    const stamp = `<div class="stamp">郵票<br>黏貼處</div>`;
    const logoH = $("logoSize").value || 12;
    const logoHtml = logoDataUrl
        ? `<img class="sender-logo" src="${logoDataUrl}" style="height:${logoH}mm" alt="logo">`
        : "";

    if (orientation === "vertical") {
        // 直式：收件人郵遞區號獨立置於右上，寄件人郵遞區號置於左下
        env.innerHTML = `
            ${stamp}
            ${r.receiverZip ? `<div class="receiver-zip" data-drag="receiverZip" style="font-size:${receiverFs}px">${esc(r.receiverZip)}</div>` : ""}
            <div class="receiver" data-drag="receiver" style="font-size:${receiverFs}px">
                <span class="party-label">收件人</span>
                <div class="line name-line">${esc(r.receiverName)} 收</div>
                <div class="line addr-line">${esc(r.receiverAddress)}</div>
                ${r.receiverPhone ? `<div class="line">${esc(r.receiverPhone)}</div>` : ""}
            </div>
            <div class="sender" data-drag="sender" style="font-size:${senderFs}px">
                ${logoHtml}
                <span class="party-label">寄件人</span>
                <div class="line name-line">${esc(r.senderName)} 寄</div>
                <div class="line addr-line">${esc(r.senderAddress)}</div>
                ${r.senderPhone ? `<div class="line">${esc(r.senderPhone)}</div>` : ""}
            </div>
            ${r.senderZip ? `<div class="sender-zip" data-drag="senderZip">${esc(r.senderZip)}</div>` : ""}`;
    } else {
        // 橫式：寄件人左上、收件人中央
        const senderName = [esc(r.senderName), esc(r.senderPhone)].filter(Boolean).join("　");
        const receiverName = [esc(r.receiverName) + " 收", esc(r.receiverPhone)].filter(Boolean).join("　");
        env.innerHTML = `
            ${stamp}
            <div class="sender" data-drag="sender" style="font-size:${senderFs}px">
                ${logoHtml}
                <span class="party-label">寄件人</span>
                ${r.senderZip ? `<div class="line zip-line">${esc(r.senderZip)}</div>` : ""}
                <div class="line name-line">${senderName}</div>
                <div class="line addr-line">${esc(r.senderAddress)}</div>
            </div>
            <div class="receiver" data-drag="receiver" style="font-size:${receiverFs}px">
                <span class="party-label">收件人</span>
                ${r.receiverZip ? `<div class="line zip-line">${esc(r.receiverZip)}</div>` : ""}
                <div class="line name-line">${receiverName}</div>
                <div class="line addr-line">${esc(r.receiverAddress)}</div>
            </div>`;
    }

    // 套用使用者拖曳後的自訂位置
    const pos = layout[orientation] || {};
    env.querySelectorAll("[data-drag]").forEach((el) => {
        const p = pos[el.dataset.drag];
        if (p) applyPosToEl(el, p.x, p.y);
    });

    return env;
}

// 將某區塊定位到信封內的指定座標（px，相對信封左上角）
function applyPosToEl(el, x, y) {
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.right = "auto";
    el.style.bottom = "auto";
    el.style.transform = "none";
}

function renderList() {
    listEl.innerHTML = "";
    recipients.forEach((r, i) => {
        const li = document.createElement("li");
        li.className = "recipient-item";
        li.innerHTML = `
            <div class="ri-main">
                <div class="ri-to">
                    ${r.receiverZip ? `<span class="ri-zip">${esc(r.receiverZip)}</span>` : ""}${esc(r.receiverName) || "（未填收件人）"}
                </div>
                <div class="ri-addr">${esc(r.receiverAddress)}</div>
                <div class="ri-from">寄件人：${esc(r.senderName) || "—"}</div>
            </div>
            <div class="ri-actions">
                <button class="icon-btn" data-edit="${i}">編輯</button>
                <button class="icon-btn danger" data-del="${i}">刪除</button>
            </div>`;
        listEl.appendChild(li);
    });
    listEl.querySelectorAll("[data-edit]").forEach((b) =>
        b.addEventListener("click", () => editRecipient(+b.dataset.edit))
    );
    listEl.querySelectorAll("[data-del]").forEach((b) =>
        b.addEventListener("click", () => deleteRecipient(+b.dataset.del))
    );
}

function render() {
    countBadge.textContent = recipients.length;
    emptyState.style.display = recipients.length ? "none" : "block";
    renderList();

    applyContainerClasses();
    updatePageStyle();
    container.innerHTML = "";
    recipients.forEach((r) => container.appendChild(buildEnvelope(r)));
    scalePreview();

    saveState(); // 每次變更後自動記憶到本機
}

/* ---------------- 列印 ---------------- */
function doPrint() {
    if (!recipients.length) {
        alert("請先新增至少一個信封。");
        return;
    }
    container.style.transform = "scale(1)";
    container.style.width = "auto";
    container.style.height = "auto";
    window.print();
    // 列印對話框關閉後恢復預覽縮放
    setTimeout(scalePreview, 300);
}
$("printBtn").addEventListener("click", doPrint);

/* ---------------- 初始 ---------------- */
$("loadSample").addEventListener("click", loadSample);

const hadSaved = loadState(); // 還原上次在這台電腦的內容與設定
if (!hadSaved && recipients.length === 0) {
    recipients = SAMPLE_RECIPIENTS.map((r) => Object.assign({}, r)); // 首次造訪載入範例
}
updateSettingsUI(); // 依還原的設定切換自訂尺寸欄位與說明
updateLogoUI();     // 還原標誌預覽
render();
