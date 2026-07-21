// 🌟 상태 관리
let currentUser = null;
let currentRoomId = null;
let pendingRoom = null;
let scheduleListener = null;

const SYSTEM_INVITE_CODE = "SECRET2026"; 

// 🎨 사용자마다 고유한 파스텔 색상을 생성해주는 함수
function getUserAvatarColor(userId) {
    const colors = [
        '#4299E1', '#48BB78', '#ED8936', '#9F7AEA', '#ED64A6', 
        '#38B2AC', '#667EEA', '#F6AD55', '#FC8181', '#68D391'
    ];
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

// SHA-256 암호화
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

// 화면 전환
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
    }
}

// 🔐 로그인
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

// 회원가입
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

// 👥 실시간 친구 목록 (깨진 아이콘 보정 + 아바타 색상 반영)
function loadFriendsList() {
    const listEl = document.getElementById('friends-list');
    if (!listEl) return;

    listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">팀원 목록 불러오는 중...</div>';

    database.ref('users').once('value', (snapshot) => {
        listEl.innerHTML = '';
        if (!snapshot.exists()) {
            listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">등록된 팀원이 없습니다.</div>';
            return;
        }

        // 로그인된 본인 프로필
        if (currentUser) {
            const myColor = getUserAvatarColor(currentUser.id);
            const myCard = document.createElement('div');
            myCard.style = "padding:12px; margin-bottom:12px; border-bottom:2px solid #E2E8F0; display:flex; align-items:center; gap:12px;";
            myCard.innerHTML = `
                <div class="avatar" style="background:${myColor}; color:white; font-size:18px; font-weight:bold; width:44px; height:44px; border-radius:50%; display:flex; align-items:center; justify-content:center;">${currentUser.name.charAt(0)}</div>
                <div>
                    <div style="font-weight:700; font-size:16px; color:#2D3748;">${currentUser.name} (나)</div>
                    <div style="font-size:12px; color:#718096;">@${currentUser.id}</div>
                </div>
            `;
            listEl.appendChild(myCard);
        }

        const titleHeader = document.createElement('div');
        titleHeader.style = "font-size:12px; font-weight:700; color:#A0AEC0; margin:8px 4px;";
        titleHeader.innerText = "팀원 목록";
        listEl.appendChild(titleHeader);

        snapshot.forEach((child) => {
            const user = child.val();
            if (currentUser && user.id === currentUser.id) return;

            const userColor = getUserAvatarColor(user.id);
            const isTargetAdmin = user.role === 'admin' || user.id.includes('admin');
            const adminBadge = isTargetAdmin ? '<span style="color:#D69E2E; font-size:12px; margin-right:4px;">👑</span>' : '';

            const userDiv = document.createElement('div');
            userDiv.style = "padding:10px 12px; border-bottom:1px solid #EDF2F7; display:flex; justify-content:space-between; align-items:center; background:#fff; border-radius:8px; margin-bottom:6px;";
            userDiv.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <div class="avatar" style="background:${userColor}; color:white; font-weight:bold; width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:15px;">${user.name.charAt(0)}</div>
                    <div>
                        <div style="font-weight:600; font-size:14px; color:#2D3748; display:flex; align-items:center;">${adminBadge}${user.name}</div>
                        <div style="font-size:11px; color:#A0AEC0;">@${user.id}</div>
                    </div>
                </div>
                <button onclick="startDirectChat('${user.id}', '${user.name}')" style="background:#EBF8FF; color:#3182CE; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600;">
                    1:1 대화
                </button>
            `;
            listEl.appendChild(userDiv);
        });
    });
}

// 💬 1:1 대화 시작하기 (중복 방 개설 방지 로직 포함)
async function startDirectChat(targetId, targetName) {
    if (!currentUser) return;

    try {
        const snapshot = await database.ref('rooms').once('value');
        let existingRoomId = null;

        if (snapshot.exists()) {
            snapshot.forEach((child) => {
                const room = child.val();
                if (room.isDirect && room.members) {
                    if (room.members[currentUser.id] && room.members[targetId]) {
                        existingRoomId = child.key;
                    }
                }
            });
        }

        // 이미 생성된 1:1 방이 있다면 바로 입장
        if (existingRoomId) {
            enterChatRoom(existingRoomId, targetName);
            return;
        }

        // 신규 1:1 방 생성
        const now = Date.now();
        const newRoomRef = database.ref('rooms').push();
        const membersObj = {};
        membersObj[currentUser.id] = true;
        membersObj[targetId] = true;

        const membersInfoObj = {};
        membersInfoObj[currentUser.id] = currentUser.name;
        membersInfoObj[targetId] = targetName;

        await newRoomRef.set({
            title: `${currentUser.name}, ${targetName}`,
            createdBy: currentUser.id,
            createdAt: now,
            lastMessage: "1:1 대화방이 생성되었습니다.",
            lastTimestamp: now,
            isDirect: true,
            members: membersObj,
            membersInfo: membersInfoObj
        });

        enterChatRoom(newRoomRef.key, targetName);
    } catch (err) {
        console.error("1:1 대화 연결 실패:", err);
    }
}

// 대화방 입장 검증
function attemptEnterRoom(roomId, roomTitle, roomPassword) {
    if (roomPassword) {
        pendingRoom = { id: roomId, title: roomTitle, password: roomPassword };
        document.getElementById('room-enter-pw').value = '';
        document.getElementById('password-modal').style.display = 'flex';
    } else {
        enterChatRoom(roomId, roomTitle);
    }
}

function verifyAndEnterRoom() {
    const inputPw = document.getElementById('room-enter-pw').value.trim();
    if (!pendingRoom) return;

    if (inputPw === pendingRoom.password) {
        closePasswordModal();
        enterChatRoom(pendingRoom.id, pendingRoom.title);
    } else {
        alert("비밀번호가 일치하지 않습니다.");
        document.getElementById('room-enter-pw').value = '';
    }
}

function closePasswordModal() {
    document.getElementById('password-modal').style.display = 'none';
    pendingRoom = null;
}

// 💬 대화방 입장 (동적 방 이름 적용)
async function enterChatRoom(roomId, roomTitle) {
    if (currentRoomId) {
        database.ref(`messages/${currentRoomId}`).off();
    }

    currentRoomId = roomId;

    try {
        const roomSnap = await database.ref(`rooms/${roomId}`).once('value');
        let displayTitle = roomTitle;

        if (roomSnap.exists()) {
            const room = roomSnap.val();
            // 1:1 방일 경우 내 이름이 아닌 상대방 이름으로 헤더 표시
            if (room.isDirect && room.membersInfo) {
                const partnerId = Object.keys(room.membersInfo).find(id => id !== currentUser.id);
                if (partnerId) {
                    displayTitle = room.membersInfo[partnerId];
                }
            }
        }

        const titleEl = document.getElementById('chat-room-title');
        if (titleEl) titleEl.innerText = displayTitle || '대화방';

        switchScreen('chat-room-screen');
        listenMessages(currentRoomId);
    } catch (err) {
        console.error("방 진입 실패:", err);
    }
}

// 💬 실시간 메시지 감시 (연속 메시지 프로필 생략 UI)
function listenMessages(roomId) {
    const msgBox = document.getElementById('msg-box');
    if (!msgBox) return;

    database.ref(`messages/${roomId}`).limitToLast(100).on('value', (snapshot) => {
        msgBox.innerHTML = '';
        if (!snapshot.exists()) return;

        let lastSenderId = null;

        snapshot.forEach((child) => {
            const msg = child.val();
            const isMe = msg.senderId === (currentUser ? currentUser.id : '');
            const isSystem = msg.senderId === 'system';
            const timeStr = formatTime(msg.timestamp);
            const userColor = getUserAvatarColor(msg.senderId || 'unknown');
            const isContinuous = (lastSenderId === msg.senderId) && !isSystem;

            const msgDiv = document.createElement('div');
            
            if (isSystem) {
                msgDiv.style = "display:flex; justify-content:center; margin:10px 0;";
                msgDiv.innerHTML = `
                    <div style="background:#EDF2F7; color:#4A5568; padding:5px 12px; border-radius:12px; font-size:11px; text-align:center; max-width:85%;">
                        ${msg.text}
                    </div>
                `;
                lastSenderId = 'system';
            } else {
                msgDiv.style = `display:flex; gap:8px; margin-bottom:${isContinuous ? '4px' : '10px'}; flex-direction:${isMe ? 'row-reverse' : 'row'};`;
                
                // 연속 메시지일 때 상대방 아바타 영역 숨김
                let avatarHtml = '';
                if (!isMe) {
                    if (!isContinuous) {
                        avatarHtml = `<div class="avatar" style="background:${userColor}; color:white; font-size:13px; font-weight:bold; width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0;">${(msg.senderName || '알').charAt(0)}</div>`;
                    } else {
                        avatarHtml = `<div style="width:34px; flex-shrink:0;"></div>`;
                    }
                }

                let contentHtml = '';
                if (msg.imageUrl) {
                    contentHtml = `<img src="${msg.imageUrl}" style="max-width:180px; border-radius:12px; border:1px solid #E2E8F0; cursor:pointer;" onclick="window.open('${msg.imageUrl}')">`;
                } else {
                    contentHtml = `
                        <div style="background:${isMe ? '#3182CE' : '#FFFFFF'}; color:${isMe ? '#FFF' : '#2D3748'}; padding:8px 12px; border-radius:12px; max-width:210px; word-break:break-word; font-size:14px; line-height:1.4; box-shadow:0 1px 2px rgba(0,0,0,0.05); border:${isMe ? 'none' : '1px solid #E2E8F0'};">
                            ${msg.text || ''}
                        </div>
                    `;
                }

                const bubbleHtml = `
                    <div style="display:flex; flex-direction:column; align-items:${isMe ? 'flex-end' : 'flex-start'};">
                        ${(!isMe && !isContinuous) ? `<span style="font-size:11px; color:#718096; margin-bottom:3px; font-weight:500;">${msg.senderName || '알 수 없음'}</span>` : ''}
                        <div style="display:flex; align-items:flex-end; gap:5px; flex-direction:${isMe ? 'row-reverse' : 'row'};">
                            ${contentHtml}
                            <span style="font-size:10px; color:#A0AEC0; white-space:nowrap;">${timeStr}</span>
                        </div>
                    </div>
                `;

                msgDiv.innerHTML = avatarHtml + bubbleHtml;
                lastSenderId = msg.senderId;
            }
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
        const now = Date.now();
        await database.ref(`messages/${currentRoomId}`).push({
            senderId: currentUser.id,
            senderName: currentUser.name,
            text: text,
            timestamp: now
        });

        await database.ref(`rooms/${currentRoomId}`).update({
            lastMessage: text,
            lastTimestamp: now
        });

        input.value = '';
    } catch (error) {
        console.error("메시지 전송 실패:", error);
    }
}

// 이미지 전송
function sendImageMessage(fileInput) {
    const file = fileInput.files[0];
    if (!file || !currentRoomId || !currentUser) return;

    if (file.size > 1024 * 1024) {
        alert("이미지는 1MB 이하로 선택해 주세요.");
        fileInput.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = async function (e) {
        const base64Image = e.target.result;
        const now = Date.now();

        try {
            await database.ref(`messages/${currentRoomId}`).push({
                senderId: currentUser.id,
                senderName: currentUser.name,
                imageUrl: base64Image,
                timestamp: now
            });

            await database.ref(`rooms/${currentRoomId}`).update({
                lastMessage: "📷 사진을 보냈습니다.",
                lastTimestamp: now
            });

            fileInput.value = '';
        } catch (err) {
            console.error("이미지 전송 실패:", err);
        }
    };
    reader.readAsDataURL(file);
}

// 📋 대화방 목록 불러오기 (1:1 방은 상대방 이름 표시)
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
            const isLocked = !!room.password;

            let displayTitle = room.title || '대화방';
            
            // 1:1 대화방이면 상대방 이름 가져오기
            if (room.isDirect && room.membersInfo && currentUser) {
                const partnerId = Object.keys(room.membersInfo).find(id => id !== currentUser.id);
                if (partnerId) {
                    displayTitle = room.membersInfo[partnerId];
                }
            }

            const firstChar = displayTitle.charAt(0);
            const roomColor = getUserAvatarColor(roomId);

            const roomDiv = document.createElement('div');
            roomDiv.className = "chat-room-item";
            roomDiv.setAttribute("data-title", displayTitle);
            roomDiv.style = "padding:12px 16px; border-bottom:1px solid #E2E8F0; cursor:pointer; display:flex; gap:12px; align-items:center; background:#fff;";
            
            roomDiv.onclick = () => attemptEnterRoom(roomId, displayTitle, room.password);
            
            roomDiv.innerHTML = `
                <div class="avatar" style="background:${roomColor}; color:white; font-weight:bold; width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:16px; flex-shrink:0;">${firstChar}</div>
                <div style="flex:1; overflow:hidden;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span style="font-weight:600; font-size:15px; color:#2D3748; display:flex; align-items:center; gap:6px;">
                            ${displayTitle}
                            ${isLocked ? '<i class="fa-solid fa-lock" style="font-size:12px; color:#E53E3E;"></i>' : ''}
                        </span>
                        <span style="font-size:11px; color:#A0AEC0;">${timeStr}</span>
                    </div>
                    <div style="font-size:13px; color:#718096; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${room.lastMessage || '이전 메시지가 없습니다.'}</div>
                </div>
            `;
            chatListEl.appendChild(roomDiv);
        });
    });
}

// 방 생성
async function createNewChatRoom() {
    if (!currentUser) return alert("로그인이 필요합니다.");

    const titleInput = document.getElementById('new-room-title');
    const pwInput = document.getElementById('new-room-password');

    const roomTitle = titleInput ? titleInput.value.trim() : '';
    const roomPassword = pwInput ? pwInput.value.trim() : '';

    if (!roomTitle) return alert("대화방 이름을 입력해 주세요.");

    try {
        const now = Date.now();
        const newRoomRef = database.ref('rooms').push();
        
        const roomData = {
            title: roomTitle,
            createdBy: currentUser.id,
            creatorName: currentUser.name,
            createdAt: now,
            lastMessage: "대화방이 생성되었습니다.",
            lastTimestamp: now
        };

        if (roomPassword) {
            roomData.password = roomPassword;
        }

        await newRoomRef.set(roomData);

        await database.ref(`messages/${newRoomRef.key}`).push({
            senderId: 'system',
            senderName: '시스템',
            text: `📢 [${currentUser.name}]님이 대화방을 개설했습니다.`,
            timestamp: now
        });

        alert("새 대화방이 개설되었습니다!");
        if (titleInput) titleInput.value = '';
        if (pwInput) pwInput.value = '';
        toggleCreateRoomModal();
        loadChatRooms();
    } catch (error) {
        console.error("방 생성 실패:", error);
    }
}

// 방 필터링
function filterChatRooms() {
    const query = document.getElementById('chat-search-input')?.value.toLowerCase().trim() || '';
    const items = document.querySelectorAll('.chat-room-item');

    items.forEach((item) => {
        const title = item.getAttribute('data-title').toLowerCase();
        item.style.display = title.includes(query) ? 'flex' : 'none';
    });
}

// 일정 공유
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

function listenSharedSchedules() {
    const listEl = document.getElementById('schedule-list');
    if (!listEl) return;
    listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">일정 불러오는 중...</div>';

    scheduleListener = database.ref(`rooms/${currentRoomId}/schedules`).on('value', (snapshot) => {
        listEl.innerHTML = '';
        if (!snapshot.exists()) {
            listEl.innerHTML = '<div style="text-align:center; padding:40px; color:#888; font-size:13px;">등록된 공유 일정이 없습니다.</div>';
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
                        <span style="margin-left:6px; color:#3182CE;">by ${sched.creatorName}</span>
                    </div>
                </div>
                <button onclick="deleteSharedSchedule('${schedId}')" style="background:none; border:none; color:#E53E3E; cursor:pointer; font-size:12px; padding:5px;"><i class="fa-regular fa-trash-can"></i></button>
            `;
            listEl.appendChild(item);
        });
    });
}

async function addSharedSchedule() {
    const titleInput = document.getElementById('sched-title');
    const dateInput = document.getElementById('sched-date');

    const title = titleInput.value.trim();
    const date = dateInput.value;

    if (!title || !date) return alert('일정 제목과 날짜를 입력해 주세요.');

    try {
        await database.ref(`rooms/${currentRoomId}/schedules`).push({
            title: title,
            date: date,
            creatorId: currentUser.id,
            creatorName: currentUser.name,
            createdAt: Date.now()
        });

        await database.ref(`messages/${currentRoomId}`).push({
            senderId: 'system',
            senderName: '🗓️ 일정 알림',
            text: `📢 [공유 일정] ${currentUser.name}님이 일정을 등록했습니다.\n📌 ${title} (${date})`,
            timestamp: Date.now()
        });

        titleInput.value = '';
        dateInput.value = '';
        toggleScheduleModal();
    } catch (error) {
        console.error("일정 등록 실패:", error);
    }
}

async function deleteSharedSchedule(schedId) {
    if (!confirm("이 일정을 삭제하시겠습니까?")) return;
    try {
        await database.ref(`rooms/${currentRoomId}/schedules/${schedId}`).remove();
    } catch (error) {
        console.error("일정 삭제 실패:", error);
    }
}

function leaveChatRoom() {
    if (currentRoomId) {
        database.ref(`messages/${currentRoomId}`).off();
    }
    currentRoomId = null;
    switchScreen('chats-screen');
    loadChatRooms();
}

function toggleCreateRoomModal() {
    const modal = document.getElementById('create-room-modal');
    if (modal) modal.style.display = (modal.style.display === 'flex') ? 'none' : 'flex';
}

function toggleFindAccountModal() {
    const modal = document.getElementById('find-account-modal');
    if (modal) modal.style.display = (modal.style.display === 'flex') ? 'none' : 'flex';
}
