// 🌟 상태 관리 (State Management)
let currentUser = null;
let currentRoomId = null;
let scheduleListener = null;

// 안전한 화면 전환 함수
function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        if (screen) {
            screen.classList.remove('active');
            screen.style.display = 'none';
        }
    });

    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
        targetScreen.style.display = 'flex';
    } else {
        console.warn(`[경고] ID가 '${screenId}'인 화면을 찾을 수 없습니다.`);
    }
}

// SHA-256 비밀번호 암호화
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 💬 실시간 메시지 감시 및 화면 출력
function listenMessages(roomId) {
    const msgBox = document.getElementById('msg-box');
    if (!msgBox) return;

    database.ref(`messages/${roomId}`).limitToLast(100).on('value', (snapshot) => {
        msgBox.innerHTML = '';
        if (!snapshot.exists()) return;

        snapshot.forEach((child) => {
            const msg = child.val();
            const isMe = msg.senderId === (currentUser ? currentUser.id : '');

            const msgDiv = document.createElement('div');
            msgDiv.style = `display:flex; flex-direction:column; align-items:${isMe ? 'flex-end' : 'flex-start'}; margin-bottom:10px;`;
            msgDiv.innerHTML = `
                <span style="font-size:11px; color:#888; margin-bottom:2px;">${msg.senderName || '알 수 없음'}</span>
                <div style="background:${isMe ? 'var(--primary-color)' : '#E9ECEF'}; color:${isMe ? '#fff' : '#333'}; padding:8px 12px; border-radius:12px; max-width:70%; word-break:break-word; font-size:14px;">
                    ${msg.text || ''}
                </div>
            `;
            msgBox.appendChild(msgDiv);
        });
        msgBox.scrollTop = msgBox.scrollHeight;
    });
}

// 메시지 전송
async function sendTextMessage() {
    const input = document.getElementById('chat-input-text');
    if (!input) return;

    const text = input.value.trim();
    if (!text || !currentRoomId || !currentUser) return;

    try {
        const messageData = {
            senderId: currentUser.id,
            senderName: currentUser.name,
            text: text,
            timestamp: Date.now()
        };

        await database.ref(`messages/${currentRoomId}`).push(messageData);
        await database.ref(`rooms/${currentRoomId}`).update({
            lastMessage: text,
            lastTimestamp: Date.now()
        });

        input.value = '';
    } catch (error) {
        console.error("메시지 전송 실패:", error);
        alert("메시지 전송에 실패했습니다.");
    }
}

// 🗓️ 공유 일정 모달 켜고 끄기
function toggleScheduleModal() {
    const modal = document.getElementById('schedule-modal');
    if (!currentRoomId || !modal) return;

    if (modal.classList.contains('hidden')) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        listenSharedSchedules();
    } else {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        if (scheduleListener) {
            database.ref(`rooms/${currentRoomId}/schedules`).off('value', scheduleListener);
            scheduleListener = null;
        }
    }
}

// 공유 일정 실시간 리스너
function listenSharedSchedules() {
    const listEl = document.getElementById('schedule-list');
    if (!listEl) return;
    listEl.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-sub);">일정 불러오는 중...</div>';

    scheduleListener = database.ref(`rooms/${currentRoomId}/schedules`).on('value', (snapshot) => {
        listEl.innerHTML = '';
        if (!snapshot.exists()) {
            listEl.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-sub); font-size:13px;">등록된 공유 일정이 없습니다.<br>새로운 일정을 등록해 보세요!</div>';
            return;
        }

        snapshot.forEach((child) => {
            const sched = child.val();
            const schedId = child.key;

            const item = document.createElement('div');
            item.style = "display:flex; justify-content:space-between; align-items:center; background:white; padding:10px; border-radius:6px; border:1px solid var(--border-color); margin-bottom:8px;";
            item.innerHTML = `
                <div>
                    <div style="font-weight:600; color:var(--text-main); font-size:14px;">${sched.title}</div>
                    <div style="font-size:11px; color:var(--text-sub); margin-top:2px;">
                        <i class="fa-regular fa-calendar" style="margin-right:4px;"></i>${sched.date} 
                        <span style="margin-left:6px; color:#4A90E2;">by ${sched.creatorName}</span>
                    </div>
                </div>
                <button onclick="deleteSharedSchedule('${schedId}')" style="background:none; border:none; color:#E53E3E; cursor:pointer; font-size:12px; padding:5px;"><i class="fa-regular fa-trash-can"></i></button>
            `;
            listEl.appendChild(item);
        });
    });
}

// 공유 일정 추가
async function addSharedSchedule() {
    const titleInput = document.getElementById('sched-title');
    const dateInput = document.getElementById('sched-date');

    const title = titleInput.value.trim();
    const date = dateInput.value;

    if (!title || !date) return alert('일정 제목과 날짜를 모두 입력해 주세요.');

    const newSchedule = {
        title: title,
        date: date,
        creatorId: currentUser.id,
        creatorName: currentUser.name,
        createdAt: Date.now()
    };

    try {
        await database.ref(`rooms/${currentRoomId}/schedules`).push(newSchedule);
        titleInput.value = '';
        dateInput.value = '';
        toggleScheduleModal();
    } catch (error) {
        console.error("일정 등록 실패:", error);
        alert("일정 등록에 실패했습니다.");
    }
}

// 공유 일정 삭제
async function deleteSharedSchedule(schedId) {
    if (!confirm("이 일정을 삭제하시겠습니까?")) return;
    try {
        await database.ref(`rooms/${currentRoomId}/schedules/${schedId}`).remove();
    } catch (error) {
        console.error("일정 삭제 실패:", error);
    }
}

// 대화방 나가기
function leaveChatRoom() {
    if (currentRoomId) {
        database.ref(`messages/${currentRoomId}`).off();
    }
    currentRoomId = null;
    switchScreen('chats-screen');
}