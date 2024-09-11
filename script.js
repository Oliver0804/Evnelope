
function readCSV(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const rows = text.split('\n').map(row => row.split(','));
        const headers = rows[0]; // CSV 標題行
        const recipients = rows.slice(1).map(row => ({
            senderName: row[0],
            senderAddress: row[1],
            senderPhone: row[2],
            receiverName: row[3],
            receiverAddress: row[4],
            receiverPhone: row[5]
        }));
        generateEnvelopes(recipients);
    };
    reader.readAsText(file);
}
function generateEnvelopes(recipients) {
    const envelopesContainer = document.getElementById('envelopesContainer');
    envelopesContainer.innerHTML = ''; // 清除之前的內容

    const senderFontSize = document.getElementById('senderFontSize').value || 14;
    const receiverFontSize = document.getElementById('receiverFontSize').value || 18;

    recipients.forEach(recipient => {
        const envelope = document.createElement('div');
        envelope.classList.add('envelope');

        // 確認寄件人電話是否存在
        const senderPhone = recipient.senderPhone ? recipient.senderPhone : '';

        // 設定寄件人 (左上角)
        const sender = document.createElement('div');
        sender.id = 'sender';
        sender.style.fontSize = `${senderFontSize}px`;
        sender.innerHTML = `<div><strong>寄件者</strong></div><div>${recipient.senderName} ${senderPhone}</div><div>${recipient.senderAddress}</div>`;

        // 確認收件人電話是否存在
        const receiverPhone = recipient.receiverPhone ? recipient.receiverPhone : '';

        // 設定收件人 (右下角)
        const receiver = document.createElement('div');
        receiver.id = 'receiver';
        receiver.style.fontSize = `${receiverFontSize}px`;
        receiver.style.textAlign = 'left'; // 文字靠左對齊
        receiver.style.float = 'right'; // 整體位置靠右
        receiver.innerHTML = `<div><strong>收件者</strong></div><div>${recipient.receiverName} ${receiverPhone}</div><div>${recipient.receiverAddress}</div>`;

        // 將寄件人和收件人資訊加入信封
        envelope.appendChild(sender);
        envelope.appendChild(receiver);

        envelopesContainer.appendChild(envelope);
    });
}

function printEnvelopes() {
    window.print();
}

document.getElementById('csvFile').addEventListener('change', readCSV);