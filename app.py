import os
import time
from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit

app = Flask(__name__)
app.config['SECRET_KEY'] = 'soket_secret!'
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'uploads')
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Gelen dosyaların boyutunu Base64 üzerinden tahammül edebilmesi için max_http_buffer_size yüksek tutuldu (50MB)
socketio = SocketIO(app, cors_allowed_origins="*", max_http_buffer_size=50 * 1024 * 1024)

# Bellek içi veritabanı (Son 50 mesaj ve aktif kullanıcılar)
messages = []
MAX_MESSAGES = 50
clients = {}
user_counter = 1

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('connect')
def handle_connect():
    global user_counter
    username = f"Kullanıcı_{user_counter}"
    user_counter += 1
    clients[request.sid] = username
    
    # Sohbet arayüzünü kirletmemesi için otomatik sistem mesajları kapatıldı
    # emit('system_message', {'msg': f'Bağlantı başarılı: {username} olarak bağlandınız.', 'type': 'info'}, to=request.sid)
    # emit('system_message', {'msg': f'🔗 {username} ağ dalgalanmasına katıldı.'}, broadcast=True, include_self=False)
    emit('user_info', {'username': username}, to=request.sid)
    
    # Yeni bağlanan kişiye eski mesaj geçmişini gönder
    for msg in messages:
        emit('receive_message', msg, to=request.sid)

@socketio.on('disconnect')
def handle_disconnect():
    username = clients.get(request.sid, 'Bilinmeyen Kullanıcı')
    if request.sid in clients:
        del clients[request.sid]
    # emit('system_message', {'msg': f'🔌 {username} soket ağından ayrıldı.'}, broadcast=True)

@socketio.on('change_name')
def handle_change_name(data):
    old_name = clients.get(request.sid)
    new_name = data.get('new_name')
    if new_name and len(new_name) > 0:
        clients[request.sid] = new_name
        emit('user_info', {'username': new_name}, to=request.sid)
        # emit('system_message', {'msg': f'✏️ {old_name} ismini "{new_name}" olarak değiştirdi.'}, broadcast=True)

@socketio.on('send_message')
def handle_message(data):
    sender = clients.get(request.sid, 'Kullanıcı')
    msg_data = {
        'sender': sender,
        'text': data.get('text'),
        'timestamp': time.strftime('%H:%M:%S'),
        'is_file': False
    }
    
    messages.append(msg_data)
    if len(messages) > MAX_MESSAGES:
        messages.pop(0)
        
    emit('receive_message', msg_data, broadcast=True)

@socketio.on('send_file')
def handle_file(data):
    sender = clients.get(request.sid, 'Kullanıcı')
    file_name = data.get('file_name')
    file_data = data.get('file_data') # Base64 string
    file_type = data.get('file_type')
    
    msg_data = {
        'sender': sender,
        'file_name': file_name,
        'file_data': file_data,
        'file_type': file_type,
        'timestamp': time.strftime('%H:%M:%S'),
        'is_file': True
    }
    
    messages.append(msg_data)
    if len(messages) > MAX_MESSAGES:
        messages.pop(0)
        
    emit('receive_message', msg_data, broadcast=True)

if __name__ == '__main__':
    print("=========================================================")
    print("   [ SOKET MİMARİSİ VE DOSYA TRANSFER SUNUCUSU BAŞLATILDI ]")
    print("=========================================================")
    print(" >>> Tarayıcınızdan http://127.0.0.1:5000 adresine gidin. ")
    socketio.run(app, host='0.0.0.0', port=5000)
