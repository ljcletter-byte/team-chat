// 🌟 상태 관리
let currentUser = null;
let currentRoomId = null;
let scheduleListener = null;

// 🔒 지정된 초대 코드
const SYSTEM_INVITE_CODE = "SECRET2026"; 

// SHA-256 비밀번호 암호화
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 🕒 시간 포맷 함수
function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? '오후' : '오전';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${ampm} ${hours}:${minutes}`;
}

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

// 🔐 로그인 처리 함수
async function handleLogin() {
    const idInput = document.getElementById('login-id');
    const pwInput = document.getElementById('login-pw');
    
    if (!idInput || !pwInput) return;

    const id = idInput.value.trim();
    const pw = pwInput.value.trim();

    if (!id || !pw) return alert('아이디와 비밀번호를 입력해 주세요.');

    try {
        const snapshot = await database.ref('users/' + id).once('value');
        if (!snapshot.exists()) {
            return alert('존재하지 않는 아이디입니다.');
        }

        const userData = snapshot.val();
        const hashedPassword = await sha256(pw);

        if (userData.password !== hashedPassword) {
            return alert('비밀번호가 일치하지 않습니다.');
        }

        currentUser = userData;
        alert(`${currentUser.name}님 환영합니다!`);

        switchScreen('chats-screen');
        loadChatRooms();

    } catch (error) {
        console.error("로그인 오류:", error);
        alert("로그인 중 오류가 발생했습니다.");
    }
}

// 🔒 제한된 회원가입 처리 함수
async function handleRegisterWithCode() {
    const id = document.getElementById('reg-id')?.value.trim();
    const pw = document.getElementById('reg-pw')?.value.trim();
    const name = document.getElementById('reg-name')?.value.trim();
    const inviteCode = document.getElementById('reg-invite-code')?.value.trim();

    if (!id || !pw || !name || !inviteCode) {
        return alert('모든 항목과 초대 코드를 입력해 주세요.');
    }

    if (inviteCode !== SYSTEM_INVITE_CODE) {
        return alert('유효하지 않은 가입 초대 코드입니다.');
    }

    try {
        const userRef = database.ref('users/' + id);
        const snapshot = await userRef.once('value');
        
        if (snapshot.exists()) {
            return alert('이미 존재하는 아이디입니다.');
        }

        const hashedPassword = await sha256(pw);
        await userRef.set({
            id: id,
            name: name,
            password: hashedPassword,
            role: 'member',
            createdAt: Date.now()
        });

        alert('회원가입이 완료되었습니다! 로그인해 주세요.');
        switchScreen('login-screen');
    } catch (error) {
        console.error("회원가입 오류:", error);
        alert("회원가입 처리 중 오류가 발생했습니다.");
    }
}

// 💬 대화방 입장 처리
function enterChatRoom(roomId, roomTitle) {
    if (currentRoomId) {
        database.ref(`messages/${currentRoomId}`).off();
    }

    currentRoomId = roomId;
    const titleEl = document.getElementById('chat-room-title');
    if (titleEl) titleEl.innerText = roomTitle || '대화방';

    switchScreen('chat-room-screen');
    listenMessages(currentRoomId);
}

// 💬 실시간 메시지 감시 및 화면 출력 (🎨 P2: 프로필 아바타 포함)
function listenMessages(roomId) {
    const msgBox = document.getElementById('msg-box');
    if (!msgBox) return;

    database.ref(`messages/${roomId}`).limitToLast(100).on('value', (snapshot) => {
        msgBox.innerHTML = '';
        if (!snapshot.exists()) return;

        snapshot.forEach((child) => {
            const msg = child.val();
            const isMe = msg.senderId === (currentUser ? currentUser.id : '');
            const isSystem = msg.senderId === 'system';
            const timeStr = formatTime(msg.timestamp);
            const firstChar = (msg.senderName || '알').charAt(0);

            const msgDiv = document.createElement('div');
            
            if (isSystem) {
                msgDiv.style = "display:flex; justify-content:center; margin:12px 0;";
                msgDiv.innerHTML = `
                    <div style="background:#E2E8F0; color:#4A5568; padding:6px 14px; border-radius:12px; font-size:12px; text-align:center; max-width:85%; white-space:pre-wrap; line-height:1.4;">
                        ${msg.text}
                    </div>
                `;
            } else {
                msgDiv.style = `display:flex; gap:8px; margin-bottom:14px; flex-direction:${isMe ? 'row-reverse' : 'row'};`;
                
                // 상대방일 때 아바타 생성
                const avatarHtml = isMe ? '' : `<div class="avatar avatar-sm">${firstChar}</div>`;
                
                const bubbleHtml = `
                    <div style="display:flex; flex-direction:column; align-items:${isMe ? 'flex-end' : 'flex-start'};">
                        ${!isMe ? `<span style="font-size:11px; color:#718096; margin-bottom:3px; font-weight:500;">${msg.senderName || '알 수 없음'}</span>` : ''}
                        <div style="display:flex; align-items:flex-end; gap:6px; flex-direction:${isMe ? 'row-reverse' : 'row'};">
                            <div style="background:${isMe ? '#3182CE' : '#FFFFFF'}; color:${isMe ? '#FFF' : '#2D3748'}; padding:8px 12px; border-radius:12px; max-width:200px; word-break:break-word; font-size:14px; line-height:1.4; box-shadow:0 1px 2px rgba(0,0,0,0.05); border:${isMe ? 'none' : '1px solid #E2E8F0'};">
                                ${msg.text || ''}
                            </div>
                            <span style="font-size:10px; color:#A0AEC0; white-space:nowrap;">${timeStr}</span>
                        </div>
                    </div>
                `;

                msgDiv.innerHTML = avatarHtml + bubbleHtml;
            }
            msgBox.appendChild(msgDiv);
        });
        msgBox.scrollTop = msgBox.scrollHeight;
    });
}

// ✏️ 메시지 전송
async function sendTextMessage() {
    const input = document.getElementById('chat-input-text');
    if (!input) return;

    const text = input.value.trim();
    if (!text || !currentRoomId || !currentUser) return;

    try {
        const now = Date.now();
        const messageData = {
            senderId: currentUser.id,
            senderName: currentUser.name,
            text: text,
            timestamp: now
        };

        await database.ref(`messages/${currentRoomId}`).push(messageData);
        await database.ref(`rooms/${currentRoomId}`).update({
            lastMessage: text,
            lastTimestamp: now
        });

        input.value = '';
    } catch (error) {
        console.error("메시지 전송 실패:", error);
        alert("메시지 전송에 실패했습니다.");
    }
}

// 🗓️ 공유 일정 모달 토글
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

// 공유 일정 리스너
function listenSharedSchedules() {
    const listEl = document.getElementById('schedule-list');
    if (!listEl) return;
    listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">일정 불러오는 중...</div>';

    scheduleListener = database.ref(`rooms/${currentRoomId}/schedules`).on('value', (snapshot) => {
        listEl.innerHTML = '';
        if (!snapshot.exists()) {
            listEl.innerHTML = '<div style="text-align:center; padding:40px; color:#888; font-size:13px;">등록된 공유 일정이 없습니다.<br>새로운 일정을 등록해 보세요!</div>';
            return;
        }

        snapshot.forEach((child) => {
            const sched = child.val();
            const schedId = child.key;

            const item = document.createElement('div');
            item.style = "display:flex; justify-content:space-between; align-items:center; background:white; padding:10px; border-radius:6px; border:1px solid #ddd; margin-bottom:8px;";
            item.innerHTML = `
                <div>
                    <div style="font-weight:600; color:#333; font-size:14px;">${sched.title}</div>
                    <div style="font-size:11px; color:#666; margin-top:2px;">
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

        const systemMessage = {
            senderId: 'system',
            senderName: '🗓️ 일정 알림',
            text: `📢 [공유 일정] ${currentUser.name}님이 새로운 일정을 등록했습니다.\n📌 ${title} (${date})`,
            timestamp: Date.now()
        };
        await database.ref(`messages/${currentRoomId}`).push(systemMessage);

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
    loadChatRooms();
}

// 📋 대화방 목록 불러오기 (🎨 P2: 방 아이콘/아바타 적용)
function loadChatRooms() {
    const chatListEl = document.getElementById('chat-list');
    if (!chatListEl) return;

    chatListEl.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">대화방 목록 불러오는 중...</div>';

    database.ref('rooms').on('value', (snapshot) => {
        chatListEl.innerHTML = '';
        if (!snapshot.exists()) {
            chatListEl.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">개설된 대화방이 없습니다.</div>';
            return;
        }

        snapshot.forEach((child) => {
            const room = child.val();
            const roomId = child.key;
            const timeStr = formatTime(room.lastTimestamp);
            const firstChar = (room.title || '방').charAt(0);

            const roomDiv = document.createElement('div');
            roomDiv.style = "padding:12px 16px; border-bottom:1px solid #E2E8F0; cursor:pointer; display:flex; gap:12px; align-items:center; background:#fff;";
            roomDiv.onclick = () => enterChatRoom(roomId, room.title || '대화방');
            
            roomDiv.innerHTML = `
                <div class="avatar" style="background:#EBF8FF; color:#3182CE;">${firstChar}</div>
                <div style="flex:1; overflow:hidden;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span style="font-weight:600; font-size:15px; color:#2D3748;">${room.title || '대화방'}</span>
                        <span style="font-size:11px; color:#A0AEC0;">${timeStr}</span>
                    </div>
                    <div style="font-size:13px; color:#718096; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${room.lastMessage || '이전 메시지가 없습니다.'}</div>
                </div>
            `;
            chatListEl.appendChild(roomDiv);
        });
    });
}

// 대화방 개설
async function createNewChatRoom() {
    if (!currentUser) return alert("로그인이 필요합니다.");

    const roomTitleInput = document.getElementById('new-room-title');
    const roomTitle = roomTitleInput ? roomTitleInput.value.trim() : '';

    if (!roomTitle) return alert("대화방 이름을 입력해 주세요.");

    try {
        const now = Date.now();
        const newRoomRef = database.ref('rooms').push();
        await newRoomRef.set({
            title: roomTitle,
            createdBy: currentUser.id,
            creatorName: currentUser.name,
            createdAt: now,
            lastMessage: "대화방이 생성되었습니다.",
            lastTimestamp: now
        });

        await database.ref(`messages/${newRoomRef.key}`).push({
            senderId: 'system',
            senderName: '시스템',
            text: `📢 [${currentUser.name}]님이 대화방을 개설했습니다.`,
            timestamp: now
        });

        alert("새 대화방이 개설되었습니다!");
        if (roomTitleInput) roomTitleInput.value = '';
        toggleCreateRoomModal();
        loadChatRooms();
    } catch (error) {
        console.error("방 생성 실패:", error);
        alert("대화방 개설에 실패했습니다.");
    }
}

// 방 생성 모달 토글
function toggleCreateRoomModal() {
    const modal = document.getElementById('create-room-modal');
    if (!modal) return;
    modal.style.display = (modal.style.display === 'flex') ? 'none' : 'flex';
}
