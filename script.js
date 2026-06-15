"use strict";

/* ---------------- 狀態 ---------------- */
let recipients = [];   // { senderZip, senderName, senderAddress, senderPhone, receiverZip, receiverName, receiverAddress, receiverPhone }
let editingIndex = -1; // -1 表示新增模式，否則為正在編輯的索引

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
        senderFontSize: $("senderFontSize").value,
        receiverFontSize: $("receiverFontSize").value,
        showBorder: $("showBorder").checked,
        showStamp: $("showStamp").checked
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
    if (!data) return;

    if (Array.isArray(data.recipients)) recipients = data.recipients;

    const s = data.settings;
    if (s) {
        const orient = document.querySelector(`input[name="orientation"][value="${s.orientation}"]`);
        if (orient) orient.checked = true;
        if (s.envelopeSize) $("envelopeSize").value = s.envelopeSize;
        if (s.senderFontSize) $("senderFontSize").value = s.senderFontSize;
        if (s.receiverFontSize) $("receiverFontSize").value = s.receiverFontSize;
        if (typeof s.showBorder === "boolean") $("showBorder").checked = s.showBorder;
        if (typeof s.showStamp === "boolean") $("showStamp").checked = s.showStamp;
    }
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
function currentOrientation() {
    return document.querySelector('input[name="orientation"]:checked').value;
}
function applyContainerClasses() {
    const size = $("envelopeSize").value;
    const orientation = currentOrientation();
    container.className = "";
    container.classList.add("size-" + size, "orientation-" + orientation);
    if ($("showBorder").checked) container.classList.add("show-border");
    if ($("showStamp").checked) container.classList.add("show-stamp");
}

["envelopeSize", "showBorder", "showStamp", "senderFontSize", "receiverFontSize"].forEach((id) =>
    $(id).addEventListener("change", render)
);
document.querySelectorAll('input[name="orientation"]').forEach((el) =>
    el.addEventListener("change", render)
);
window.addEventListener("resize", scalePreview);

/* ---------------- 預覽縮放 ----------------
   信封以實際 mm 呈現，畫面通常放不下，依容器寬度自動縮小（僅縮預覽，列印不受影響）。 */
function scalePreview() {
    container.style.transform = "scale(1)";
    const pane = container.parentElement;
    const first = container.querySelector(".envelope");
    if (!first) return;
    const available = pane.clientWidth;
    const natural = first.offsetWidth + 32; // 加一點邊距
    const scale = Math.min(1, available / natural);
    container.style.transform = `scale(${scale})`;
    container.style.height = (container.scrollHeight * scale) + "px";
}

/* ---------------- 渲染 ---------------- */
function buildEnvelope(r) {
    const senderFs = $("senderFontSize").value || 14;
    const receiverFs = $("receiverFontSize").value || 22;
    const orientation = currentOrientation();

    const env = document.createElement("div");
    env.className = "envelope";

    const stamp = `<div class="stamp">郵票<br>黏貼處</div>`;

    if (orientation === "vertical") {
        // 直式：收件人郵遞區號獨立置於右上，寄件人郵遞區號置於左下
        env.innerHTML = `
            ${stamp}
            ${r.receiverZip ? `<div class="receiver-zip" style="font-size:${receiverFs}px">${esc(r.receiverZip)}</div>` : ""}
            <div class="receiver" style="font-size:${receiverFs}px">
                <span class="party-label">收件人</span>
                <div class="line name-line">${esc(r.receiverName)} 收</div>
                <div class="line addr-line">${esc(r.receiverAddress)}</div>
                ${r.receiverPhone ? `<div class="line">${esc(r.receiverPhone)}</div>` : ""}
            </div>
            <div class="sender" style="font-size:${senderFs}px">
                <span class="party-label">寄件人</span>
                <div class="line name-line">${esc(r.senderName)} 寄</div>
                <div class="line addr-line">${esc(r.senderAddress)}</div>
                ${r.senderPhone ? `<div class="line">${esc(r.senderPhone)}</div>` : ""}
            </div>
            ${r.senderZip ? `<div class="sender-zip">${esc(r.senderZip)}</div>` : ""}`;
    } else {
        // 橫式：寄件人左上、收件人中央
        const senderName = [esc(r.senderName), esc(r.senderPhone)].filter(Boolean).join("　");
        const receiverName = [esc(r.receiverName) + " 收", esc(r.receiverPhone)].filter(Boolean).join("　");
        env.innerHTML = `
            ${stamp}
            <div class="sender" style="font-size:${senderFs}px">
                <span class="party-label">寄件人</span>
                ${r.senderZip ? `<div class="line zip-line">${esc(r.senderZip)}</div>` : ""}
                <div class="line name-line">${senderName}</div>
                <div class="line addr-line">${esc(r.senderAddress)}</div>
            </div>
            <div class="receiver" style="font-size:${receiverFs}px">
                <span class="party-label">收件人</span>
                ${r.receiverZip ? `<div class="line zip-line">${esc(r.receiverZip)}</div>` : ""}
                <div class="line name-line">${receiverName}</div>
                <div class="line addr-line">${esc(r.receiverAddress)}</div>
            </div>`;
    }
    return env;
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
    container.innerHTML = "";
    recipients.forEach((r) => container.appendChild(buildEnvelope(r)));
    scalePreview();

    saveState(); // 每次變更後自動記憶到本機
}

/* ---------------- 列印 ---------------- */
$("printBtn").addEventListener("click", () => {
    if (!recipients.length) {
        alert("請先新增至少一個信封。");
        return;
    }
    container.style.transform = "scale(1)";
    container.style.height = "auto";
    window.print();
    // 列印對話框關閉後恢復預覽縮放
    setTimeout(scalePreview, 300);
});

/* ---------------- 初始 ---------------- */
loadState(); // 還原上次在這台電腦的內容與設定
render();
