document.addEventListener('DOMContentLoaded', () => {
    const logArea = document.getElementById('logArea');
    
    // İsim Değiştirme Modal Elementleri
    const nameModal = document.getElementById('nameModal');
    const cancelNameBtn = document.getElementById('cancelNameBtn');
    const saveNameBtn = document.getElementById('saveNameBtn');
    const newNameInput = document.getElementById('newNameInput');
    
    let activeClientForModal = null; // 1 veya 2 (hangi istemcinin ismini değiştiriyoruz)
    const clientCallbacks = {};      // Modal'dan dönen ismi doğru istemciye atamak için

    // --- GLOOBAL LOG FONKSİYONU ---
    
    function logSocketEvent(clientId, direction, eventName, details, logType='system') {
        if (!logArea) return;
        const div = document.createElement('div');
        div.className = `log-entry ${logType}-log`;
        
        const now = new Date();
        const timeStr = now.getHours().toString().padStart(2, '0') + ':' + 
                        now.getMinutes().toString().padStart(2, '0') + ':' + 
                        now.getSeconds().toString().padStart(2, '0');
        
        // Hangi istemciden çıktığı/geldiğini daha net görmek için başlıklar eklendi
        let directionIcon = '';
        if (direction === 'C->S') directionIcon = `[İstemci ${clientId} ⬆️]`;
        else if (direction === 'S->C') directionIcon = `[İstemci ${clientId} ⬇️]`;
        else directionIcon = `[Sistem ⚙️]`;

        let detailStr = typeof details === 'object' ? JSON.stringify(details, null, 2) : details;

        div.innerHTML = `
            <span class="log-time">${timeStr}</span>
            <span class="log-event">${directionIcon} ${eventName}</span>
            <span class="log-detail">${detailStr}</span>
        `;
        
        logArea.appendChild(div);
        setTimeout(() => {
            logArea.scrollTop = logArea.scrollHeight;
        }, 50);
    }

    // --- MODAL ETKİLEŞİMLERİ (ORTAK) ---
    cancelNameBtn.addEventListener('click', () => {
        nameModal.style.display = 'none';
        activeClientForModal = null;
    });

    saveNameBtn.addEventListener('click', () => {
        const newName = newNameInput.value.trim();
        if(newName && activeClientForModal) {
            // İlgili istemcinin callback metodunu çağırarak ismini değiştirmesini emrediyoruz
            if (clientCallbacks[activeClientForModal]) {
                clientCallbacks[activeClientForModal](newName);
            }
        }
        nameModal.style.display = 'none';
    });

    newNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveNameBtn.click();
        }
    });


    // --- İSTEMCİ (CLIENT) FABRİKA FONKSİYONU ---
    // Bu fonksiyon ile tek ekranda N adet istemci ayağa kaldırılabilir.
    
    function initClient(clientId) {
        // Her fonksiyon çağrısı GÜNYÜZÜNE YENİ BİR BAĞLANTI (socket) doğurur.
        // Böylece sunucu bunları farklı iki kişi (tarayıcı) zanneder.
        const socket = io();

        // İlgili istemciye ait DOM elementleri
        const currentUserSpan = document.getElementById(`currentUser${clientId}`);
        const messageArea = document.getElementById(`messageArea${clientId}`);
        const chatForm = document.getElementById(`chatForm${clientId}`);
        const messageInput = document.getElementById(`messageInput${clientId}`);
        const fileInput = document.getElementById(`fileInput${clientId}`);
        const filePreview = document.getElementById(`filePreview${clientId}`);
        const fileNameDisplay = document.getElementById(`fileNameDisplay${clientId}`);
        const removeFileBtn = document.getElementById(`removeFileBtn${clientId}`);
        const sendBtn = document.getElementById(`sendBtn${clientId}`);
        const changeNameBtn = document.getElementById(`changeNameBtn${clientId}`);
        
        let currentUsername = "";
        let selectedFile = null;

        // Modal tetiklenince (Global modal, kaydet deyince buraya düşecek)
        clientCallbacks[clientId] = (newName) => {
            if (newName !== currentUsername) {
                const payload = { new_name: newName };
                socket.emit('change_name', payload);
                logSocketEvent(clientId, 'C->S', 'change_name', payload, 'client');
            }
        };

        // Bu buton bizim hangi istemci modunu açtığımızı belirtir
        changeNameBtn.addEventListener('click', () => {
            activeClientForModal = clientId;
            newNameInput.value = currentUsername;
            nameModal.style.display = 'flex';
            newNameInput.focus();
        });

        // --- SOKET DİNLEYİCİLERİ ---
        
        socket.on('connect', () => {
            messageArea.innerHTML = ''; // İlgili chat alanını sıfırla
            if (clientId === 1 && logArea) { 
                logArea.innerHTML = ''; 
                // Sistem başlangıç logunu temizledikten sonra geri atalım
                logSocketEvent(0, 'SYSTEM', 'Sistem Mesajı', 'Ağ dinleniyor... İletişim başladı.', 'system');
            }
            
            // Bağlanır bağlanmaz sunucu kimliklerini kesin atamak için isim değiştirmeyi zorla
            socket.emit('change_name', { new_name: `Kullanıcı ${clientId}` });
        });

        socket.on('disconnect', () => {
            appendSystemMessage("Bağlantı koptu. Yeniden aranıyor...");
        });

        socket.on('user_info', (data) => {
            currentUsername = data.username;
            currentUserSpan.textContent = currentUsername;
            // user_info logunu kaldırdık (kalabalıklığı önlemek için)
        });

        socket.on('system_message', (data) => {
            appendSystemMessage(data.msg);
            // system_message logunu kaldırdık (sadece operasyonlar loglansın)
        });

        socket.on('receive_message', (data) => {
            appendMessage(data);
            
            // Kendi gönderdiği mesaja tekrar "geldi" logu atmasın, sadece DİĞER kullanıcıdan gelenler loglansın
            if (data.sender !== currentUsername) {
                logSocketEvent(clientId, 'S->C', 'receive_message', {
                    sender: data.sender,
                    is_file: data.is_file,
                    content_preview: data.is_file ? data.file_name : data.text
                }, 'server');
            }
        });

        // --- DOSYA VE MESAJ GÖNDERİM EVENTLERİ ---

        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = messageInput.value.trim();
            
            if (selectedFile) {
                sendBtn.disabled = true;
                sendBtn.textContent = "⚙️";
                
                const reader = new FileReader();
                reader.onload = function(event) {
                    const base64Data = event.target.result;
                    const eventPayload = {
                        file_name: selectedFile.name,
                        file_type: selectedFile.type,
                        file_data: base64Data
                    };
                    socket.emit('send_file', eventPayload);
                    logSocketEvent(clientId, 'C->S', 'send_file', {file_name: selectedFile.name, size: selectedFile.size}, 'client');
                    
                    clearFileSelection();
                    sendBtn.disabled = false;
                    sendBtn.textContent = "Gönder";
                };
                reader.readAsDataURL(selectedFile);
            }
            
            if (text !== "") {
                const payload = { text: text };
                socket.emit('send_message', payload);
                logSocketEvent(clientId, 'C->S', 'send_message', payload, 'client');
                messageInput.value = "";
            }
        });

        // Dosya Seçimi
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                selectedFile = e.target.files[0];
                const MAX_MB = 10;
                if(selectedFile.size > MAX_MB * 1024 * 1024) {
                    alert(`Lütfen ${MAX_MB}MB'dan daha küçük bir dosya seçin.`);
                    clearFileSelection();
                    return;
                }
                fileNameDisplay.textContent = "📎 " + selectedFile.name;
                filePreview.style.display = 'flex';
            }
        });

        removeFileBtn.addEventListener('click', (e) => {
            e.preventDefault();
            clearFileSelection();
        });

        function clearFileSelection() {
            selectedFile = null;
            fileInput.value = "";
            filePreview.style.display = 'none';
        }

        // --- YARDIMCI FONKSİYONLAR (Her İstemci İçin İzole) ---

        function appendSystemMessage(msg) {
            const firstSysMsg = messageArea.querySelector('.system-message');
            // Eğer "bağlanılıyor" varsa onu kaldır
            if (firstSysMsg && firstSysMsg.textContent.includes('bağlanıyor')) {
                firstSysMsg.remove();
            }
            const div = document.createElement('div');
            div.className = 'system-message';
            div.textContent = msg;
            messageArea.appendChild(div);
            scrollToBottom();
        }

        function appendMessage(data) {
            // Bu istemcinin currentUsername'ine mi ait?
            const isSelf = data.sender === currentUsername;
            
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${isSelf ? 'self' : 'other'}`;
            
            let contentHtml = '';
            
            contentHtml += `<div class="message-sender">${isSelf ? 'Sen' : data.sender}</div>`;
            contentHtml += `<div class="message-bubble">`;
            
            if (data.is_file) {
                if (data.file_type && data.file_type.startsWith('image/')) {
                    contentHtml += `
                        <div class="file-attachment">
                            <img src="${data.file_data}" alt="${data.file_name}" />
                            <a href="${data.file_data}" download="${data.file_name}" class="file-download-btn">⬇️ (${data.file_name})</a>
                        </div>
                    `;
                } else {
                    contentHtml += `
                        <div class="file-attachment">
                            <div>📄 <b>${data.file_name}</b></div>
                            <a href="${data.file_data}" download="${data.file_name}" class="file-download-btn">⬇️ İndir</a>
                        </div>
                    `;
                }
            } else {
                // XSS koruması için text tipinde aktarım
                const tempDiv = document.createElement('div');
                tempDiv.textContent = data.text;
                contentHtml += `<span>${tempDiv.innerHTML}</span>`;
            }
            
            contentHtml += `<div class="message-time">${data.timestamp}</div>`;
            contentHtml += `</div>`; 
            
            messageDiv.innerHTML = contentHtml;
            messageArea.appendChild(messageDiv);
            scrollToBottom();
        }

        function scrollToBottom() {
            setTimeout(() => {
                messageArea.scrollTop = messageArea.scrollHeight;
            }, 50);
        }
    }

    // Arayüz yüklendiğinde iki tane izole istemciyi çalıştırıyoruz
    // İstemci 1 (Sol Panel)
    initClient(1);
    
    // İstemci 2 (Sağ Panel)
    initClient(2);

});
