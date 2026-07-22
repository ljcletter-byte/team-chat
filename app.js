// ==========================================
// 🌟 상태 관리 변수 (Global State)
// ==========================================
let currentUser = null;
let currentRoomId = null;
let pendingRoom = null;
let scheduleListener = null;

const SYSTEM_INVITE_CODE = "SECRET2026"; 

// ==========================================
// 🛠️ 유틸리티 함수 (Utility Functions)
// ==========================================

// XSS 방지용 HTML 이스케이프
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// 🎨 사용자마다 고유한 파스텔 색상 생성
function getUserAvatarColor(userId) {
    if (!userId) return '#4299E1';
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

// SHA-256 암호화 (안전 버전)
async function sha256(message) {
    if (message === null || message === undefined) message = '';
    const msgBuffer = new TextEncoder().encode(String(message));
    
    // Web Crypto API 지원 여부 확인
    if (!window.crypto || !window.crypto.subtle) {
        console.error("Crypto API를 지원하지 않는 환경입니다.");
        return String(message);
    }

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

// 화면 전환 (Screen Router)
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

// ==========================================
// 🔐 인증 관련 함수 (Auth Functions)
// ==========================================

// 로그인 처리
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
        
        // 🔔 푸시 알림 권한 요청 및 토큰 등록 실행
        requestPushNotificationPermission();
    } catch (error) {
        console.error("로그인 오류:", error);
        alert("로그인 중 오류가 발생했습니다.");
    }
}

// 로그아웃 처리
function handleLogout() {
    if (!confirm("로그아웃 하시겠습니까?")) return;

    if (currentRoomId) {
        database.ref(`messages/${currentRoomId}`).off();
        currentRoomId = null;
    }

    database.ref('rooms').off();
    currentUser = null;

    const idInput = document.getElementById('login-id');
    const pwInput = document.getElementById('login-pw');
    if (idInput) idInput.value = '';
    if (pwInput) pwInput.value = '';

    switchScreen('login-screen');
    alert("로그아웃 되었습니다.");
}

// 회원가입 처리
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

// ==========================================
// 👥 사용자 & 팀원 목록 함수
// ==========================================

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

        if (currentUser) {
            const myColor = getUserAvatarColor(currentUser.id);
            const myCard = document.createElement('div');
            myCard.style = "padding:12px; margin-bottom:12px; border-bottom:2px solid #E2E8F0; display:flex; align-items:center; gap:12px;";
            myCard.innerHTML = `
                <div class="avatar" style="background:${myColor}; color:white; font-size:18px; font-weight:bold; width:44px; height:44px; border-radius:50%; display:flex; align-items:center; justify-content:center;">${escapeHtml(currentUser.name.charAt(0))}</div>
                <div>
                    <div style="font-weight:700; font-size:16px; color:#2D3748;">${escapeHtml(currentUser.name)} (나)</div>
                    <div style="font-size:12px; color:#718096;">@${escapeHtml(currentUser.id)}</div>
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
                    <div class="avatar" style="background:${userColor}; color:white; font-weight:bold; width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:15px;">${escapeHtml(user.name.charAt(0))}</div>
                    <div>
                        <div style="font-weight:600; font-size:14px; color:#2D3748; display:flex; align-items:center;">${adminBadge}${escapeHtml(user.name)}</div>
                        <div style="font-size:11px; color:#A0AEC0;">@${escapeHtml(user.id)}</div>
                    </div>
                </div>
                <button onclick="startDirectChat('${escapeHtml(user.id)}', '${escapeHtml(user.name)}')" style="background:#EBF8FF; color:#3182CE; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600;">
                    1:1 대화
                </button>
            `;
            listEl.appendChild(userDiv);
        });
    });
}

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

        if (existingRoomId) {
            enterChatRoom(existingRoomId, targetName);
            return;
        }

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

// ==========================================
// 💬 대화방 입장 및 조작 (Chat Room Actions)
// ==========================================

function attemptEnterRoom(roomId, roomTitle, roomPassword) {
    if (roomPassword) {
        pendingRoom = { id: roomId, title: roomTitle, password: roomPassword };
        const input = document.getElementById('room-enter-pw');
        if (input) input.value = '';
        const modal = document.getElementById('password-modal');
        if (modal) modal.style.display = 'flex';
    } else {
        enterChatRoom(roomId, roomTitle);
    }
}

// 비동기(async) 키워드 적용 및 비밀번호 검증 개선
async function verifyAndEnterRoom() {
    const inputPw = document.getElementById('room-enter-pw')?.value?.trim();
    
    if (!pendingRoom) {
        alert("방 정보가 올바르지 않습니다.");
        closePasswordModal();
        return;
    }

    if (!currentUser) {
        alert("로그인이 필요합니다. 다시 로그인해 주세요.");
        closePasswordModal();
        switchScreen('login-screen');
        return;
    }
    
    if (!inputPw) {
        return alert("비밀번호를 입력해 주세요.");
    }

    try {
        const hashedInputPw = await sha256(inputPw);

        if (hashedInputPw === pendingRoom.password) {
            const targetId = pendingRoom.id;
            const targetTitle = pendingRoom.title;
            closePasswordModal();
            enterChatRoom(targetId, targetTitle);
        } else {
            alert("비밀번호가 일치하지 않습니다.");
            const input = document.getElementById('room-enter-pw');
            if (input) input.value = '';
        }
    } catch (e) {
        console.error("비밀번호 검증 오류:", e);
        alert("비밀번호 확인 중 오류가 발생했습니다.");
    }
}

function closePasswordModal() {
    const modal = document.getElementById('password-modal');
    if (modal) modal.style.display = 'none';
    pendingRoom = null;
}

async function enterChatRoom(roomId, roomTitle) {
    if (!currentUser) {
        alert("로그인 상태가 아닙니다. 다시 로그인해 주세요.");
        switchScreen('login-screen');
        return;
    }

    if (currentRoomId) {
        database.ref(`messages/${currentRoomId}`).off();
    }

    currentRoomId = roomId;

    try {
        const roomSnap = await database.ref(`rooms/${roomId}`).once('value');
        let displayTitle = roomTitle;
        let isOwner = false;

        if (roomSnap.exists()) {
            const room = roomSnap.val();
            
            if (room.createdBy === currentUser.id) {
                isOwner = true;
            }

            if (room.isDirect && room.membersInfo) {
                const partnerId = Object.keys(room.membersInfo).find(id => id !== currentUser.id);
                if (partnerId) {
                    displayTitle = room.membersInfo[partnerId];
                }
            }
        }

        const titleEl = document.getElementById('chat-room-title');
        if (titleEl) titleEl.innerText = displayTitle || '대화방';

        if (headerRight) {
            const actionBtnHtml = isOwner ? `
                <button onclick="deleteChatRoom('${currentRoomId}')" style="background:#FFF5F5; color:#E53E3E; border:1px solid #FEB2B2; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;">
                    🗑️ 방 삭제
                </button>
            ` : `
                <button onclick="leaveChatRoom()" style="background:#EDF2F7; color:#4A5568; border:none; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;">
                    🚪 나가기
                </button>
            `;

            headerRight.innerHTML = `
                <button onclick="toggleInviteMemberModal()" style="background:#EBF8FF; color:#3182CE; border:none; padding:4px 8px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600;">
                    ➕ 초대
                </button>
                <button onclick="toggleScheduleModal()" style="background:#EBF8FF; color:#3182CE; border:none; padding:4px 8px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600;">
                    🗓️ 일정
                </button>
                ${actionBtnHtml}
            `;
        }

        switchScreen('chat-room-screen');
        listenMessages(currentRoomId);
    } catch (err) {
        console.error("방 진입 실패:", err);
    }
}

function listenMessages(roomId) {
    const msgBox = document.getElementById('msg-box');
    if (!msgBox) return;

    const msgRef = database.ref(`messages/${roomId}`);
    msgRef.off();

    msgRef.limitToLast(100).on('value', (snapshot) => {
        msgBox.innerHTML = '';
        if (!snapshot.exists()) return;

        let lastSenderId = null;

        snapshot.forEach((child) => {
            const msg = child.val();
            const msgId = child.key;
            const isMe = msg.senderId === (currentUser ? currentUser.id : '');
            const isSystem = msg.senderId === 'system';
            const timeStr = formatTime(msg.timestamp);
            const userColor = getUserAvatarColor(msg.senderId || 'unknown');
            const isContinuous = (lastSenderId === msg.senderId) && !isSystem;

            const msgDiv = document.createElement('div');
            msgDiv.id = `msg-${msgId}`;
            
            if (isSystem) {
                msgDiv.style = "display:flex; justify-content:center; margin:10px 0;";
                msgDiv.innerHTML = `
                    <div style="background:#EDF2F7; color:#4A5568; padding:5px 12px; border-radius:12px; font-size:11px; text-align:center; max-width:85%;">
                        ${escapeHtml(msg.text || '')}
                    </div>
                `;
                lastSenderId = 'system';
            } else {
                msgDiv.style = `display:flex; gap:8px; margin-bottom:${isContinuous ? '4px' : '10px'}; flex-direction:${isMe ? 'row-reverse' : 'row'};`;
                
                let avatarHtml = '';
                if (!isMe) {
                    if (!isContinuous) {
                        avatarHtml = `<div class="avatar" style="background:${userColor}; color:white; font-size:13px; font-weight:bold; width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0;">${escapeHtml((msg.senderName || '알').charAt(0))}</div>`;
                    } else {
                        avatarHtml = `<div style="width:34px; flex-shrink:0;"></div>`;
                    }
                }

                let contentHtml = '';
                if (msg.imageUrl) {
                    contentHtml = `<img src="${msg.imageUrl}" style="max-width:180px; border-radius:12px; border:1px solid #E2E8F0; cursor:pointer;" onclick="openImageViewer(this.src)">`;
                } else {
                    contentHtml = `
                        <div style="background:${isMe ? '#3182CE' : '#FFFFFF'}; color:${isMe ? '#FFF' : '#2D3748'}; padding:8px 12px; border-radius:12px; max-width:210px; word-break:break-word; font-size:14px; line-height:1.4; box-shadow:0 1px 2px rgba(0,0,0,0.05); border:${isMe ? 'none' : '1px solid #E2E8F0'};">
                            ${escapeHtml(msg.text || '')}
                        </div>
                    `;
                }

                const deleteBtnHtml = isMe ? `
                    <button onclick="deleteMessage('${msgId}')" title="메시지 삭제" style="background:none; border:none; color:#A0AEC0; cursor:pointer; font-size:11px; padding:2px; margin-top:2px; transition:color 0.2s;" onmouseover="this.style.color='#E53E3E'" onmouseout="this.style.color='#A0AEC0'">
                        <i class="fa-regular fa-trash-can"></i>
                    </button>
                ` : '';

                const bubbleHtml = `
                    <div style="display:flex; flex-direction:column; align-items:${isMe ? 'flex-end' : 'flex-start'};">
                        ${(!isMe && !isContinuous) ? `<span style="font-size:11px; color:#718096; margin-bottom:3px; font-weight:500;">${escapeHtml(msg.senderName || '알 수 없음')}</span>` : ''}
                        <div style="display:flex; align-items:flex-end; gap:5px; flex-direction:${isMe ? 'row-reverse' : 'row'};">
                            ${contentHtml}
                            <div style="display:flex; flex-direction:column; align-items:${isMe ? 'flex-end' : 'flex-start'}; gap:1px;">
                                <span style="font-size:10px; color:#A0AEC0; white-space:nowrap;">${timeStr}</span>
                                ${deleteBtnHtml}
                            </div>
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

    msgRef.on('child_removed', (snapshot) => {
        const deletedMsgId = snapshot.key;
        const targetEl = document.getElementById(`msg-${deletedMsgId}`);
        if (targetEl) targetEl.remove();
    });
}

function deleteMessage(msgId) {
    if (!currentRoomId || !msgId) return;

    if (confirm("이 메시지를 삭제하시겠습니까?")) {
        database.ref(`messages/${currentRoomId}/${msgId}`).remove()
            .then(() => {
                const targetEl = document.getElementById(`msg-${msgId}`);
                if (targetEl) targetEl.remove();
            })
            .catch((error) => {
                console.error("메시지 삭제 오류:", error);
                alert("메시지 삭제에 실패했습니다.");
            });
    }
}

async function deleteChatRoom(roomId) {
    const targetRoomId = roomId || currentRoomId;
    if (!targetRoomId) return;

    if (!confirm("정말로 이 대화방을 완전히 삭제하시겠습니까?\n모든 대화 내용이 사라집니다.")) return;

    try {
        await database.ref(`messages/${targetRoomId}`).remove();
        await database.ref(`rooms/${targetRoomId}`).remove();

        alert("대화방이 삭제되었습니다.");
        
        if (currentRoomId === targetRoomId) {
            currentRoomId = null;
            switchScreen('chats-screen');
            loadChatRooms();
        }
    } catch (error) {
        console.error("방 삭제 오류:", error);
        alert("대화방 삭제 중 오류가 발생했습니다.");
    }
}

async function leaveChatRoom() {
    if (!currentRoomId || !currentUser) {
        switchScreen('chats-screen');
        return;
    }

    if (!confirm("대화방에서 나가시겠습니까?")) return;

    try {
        const roomId = currentRoomId;

        await database.ref(`messages/${roomId}`).push({
            senderId: 'system',
            senderName: '시스템',
            text: `📢 [${currentUser.name}]님이 대화방에서 퇴장하셨습니다.`,
            timestamp: Date.now()
        });

        await database.ref(`rooms/${roomId}/members/${currentUser.id}`).remove();

        database.ref(`messages/${roomId}`).off();
        currentRoomId = null;

        switchScreen('chats-screen');
        loadChatRooms();
    } catch (error) {
        console.error("방 나가기 실패:", error);
        switchScreen('chats-screen');
    }
}

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

function sendImageMessage(fileInput) {
    if (!fileInput || !fileInput.files.length) return;
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

// ==========================================
// 📋 대화방 목록 및 생성 (Rooms Management)
// ==========================================

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
                <div class="avatar" style="background:${roomColor}; color:white; font-weight:bold; width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:16px; flex-shrink:0;">${escapeHtml(firstChar)}</div>
                <div style="flex:1; overflow:hidden;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span style="font-weight:600; font-size:15px; color:#2D3748; display:flex; align-items:center; gap:6px;">
                            ${escapeHtml(displayTitle)}
                            ${isLocked ? '<i class="fa-solid fa-lock" style="font-size:12px; color:#E53E3E;"></i>' : ''}
                        </span>
                        <span style="font-size:11px; color:#A0AEC0;">${timeStr}</span>
                    </div>
                    <div style="font-size:13px; color:#718096; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(room.lastMessage || '이전 메시지가 없습니다.')}</div>
                </div>
            `;
            chatListEl.appendChild(roomDiv);
        });
    });
}

// 방 생성 모달 토글 및 친구 목록 자동 불러오기
function toggleCreateRoomModal() {
    const modal = document.getElementById('create-room-modal');
    if (!modal) return;

    const isHidden = modal.style.display === 'none' || modal.style.display === '';
    modal.style.display = isHidden ? 'flex' : 'none';

    if (isHidden) {
        const titleInput = document.getElementById('new-room-title');
        const pwInput = document.getElementById('new-room-password');
        if (titleInput) titleInput.value = '';
        if (pwInput) pwInput.value = '';

        loadFriendsForCreateRoom();
    }
}

// 방 생성 모달 내 친구 목록 출력
function loadFriendsForCreateRoom() {
    const listEl = document.getElementById('create-room-friends-list');
    if (!listEl) return;

    listEl.innerHTML = '<div style="font-size:12px; color:#888; text-align:center;">목록 불러오는 중...</div>';

    database.ref('users').once('value').then((snapshot) => {
        listEl.innerHTML = '';
        if (!snapshot.exists()) {
            listEl.innerHTML = '<div style="font-size:12px; color:#888; text-align:center;">초대할 친구가 없습니다.</div>';
            return;
        }

        let count = 0;
        snapshot.forEach((child) => {
            const user = child.val();
            const myId = currentUser ? currentUser.id : null;

            if (user && user.id !== myId) {
                count++;
                const item = document.createElement('label');
                item.style = "display:flex; align-items:center; gap:8px; font-size:13px; margin-bottom:6px; cursor:pointer;";
                item.innerHTML = `
                    <input type="checkbox" class="create-room-friend-checkbox" value="${escapeHtml(user.id)}">
                    <span>${escapeHtml(user.name)} (@${escapeHtml(user.id)})</span>
                `;
                listEl.appendChild(item);
            }
        });

        if (count === 0) {
            listEl.innerHTML = '<div style="font-size:12px; color:#888; text-align:center;">초대할 친구가 없습니다.</div>';
        }
    }).catch((err) => {
        console.error("친구 목록 로딩 오류:", err);
        listEl.innerHTML = '<div style="font-size:12px; color:#E53E3E; text-align:center;">목록을 가져오지 못했습니다.</div>';
    });
}

// 선택된 친구들과 함께 방 생성
async function createRoomWithFriends() {
    const titleInput = document.getElementById('new-room-title');
    const pwInput = document.getElementById('new-room-password');

    const roomTitle = titleInput?.value.trim();
    const roomPassword = pwInput?.value.trim();

    if (!roomTitle) return alert("대화방 이름을 입력해 주세요.");

    const checkedBoxes = document.querySelectorAll('.create-room-friend-checkbox:checked');
    const myId = currentUser ? currentUser.id : 'unknown';
    const myName = currentUser ? currentUser.name : '사용자';

    const selectedMembers = [myId];
    checkedBoxes.forEach(box => selectedMembers.push(box.value));

    try {
        const now = Date.now();
        const newRoomRef = database.ref('rooms').push();

        let hashedPw = null;
        if (roomPassword && roomPassword.length > 0) {
            hashedPw = await sha256(roomPassword);
        }

        const roomData = {
            title: roomTitle,
            createdBy: myId,
            creatorName: myName,
            createdAt: now,
            lastMessage: "대화방이 생성되었습니다.",
            lastTimestamp: now,
            members: selectedMembers,
            password: hashedPw
        };

        await newRoomRef.set(roomData);

        await database.ref(`messages/${newRoomRef.key}`).push({
            senderId: 'system',
            senderName: '시스템',
            text: `📢 [${myName}]님이 대화방을 개설했습니다.`,
            timestamp: now
        });

        alert("새 대화방이 개설되었습니다!");
        toggleCreateRoomModal();
        if (typeof loadChatRooms === 'function') loadChatRooms();
    } catch (error) {
        console.error("방 생성 실패:", error);
        alert("방 생성 중 오류가 발생했습니다.");
    }
}

function filterChatRooms() {
    const query = document.getElementById('chat-search-input')?.value.toLowerCase().trim() || '';
    const items = document.querySelectorAll('.chat-room-item');

    items.forEach((item) => {
        const title = item.getAttribute('data-title')?.toLowerCase() || '';
        item.style.display = title.includes(query) ? 'flex' : 'none';
    });
}

// ==========================================
// 📅 공유 일정 기능 (Schedules)
// ==========================================

function toggleScheduleModal() {
    const modal = document.getElementById('schedule-modal');
    if (!currentRoomId || !modal) return;

    if (modal.classList.contains('hidden') || modal.style.display === 'none') {
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
                    <div style="font-weight:600; color:#333; font-size:14px;">${escapeHtml(sched.title)}</div>
                    <div style="font-size:11px; color:#666; margin-top:2px;">
                        <i class="fa-regular fa-calendar" style="margin-right:4px;"></i>${escapeHtml(sched.date)} 
                        <span style="margin-left:6px; color:#3182CE;">by ${escapeHtml(sched.creatorName)}</span>
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
    if (!titleInput || !dateInput) return;

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

// ==========================================
// 🔲 모달 및 UI 제어 함수 (Modals & Theme)
// ==========================================

function toggleFindAccountModal() {
    const modal = document.getElementById('find-account-modal');
    if (modal) modal.style.display = (modal.style.display === 'flex') ? 'none' : 'flex';
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');

    const appEl = document.getElementById('app');
    const screens = document.querySelectorAll('.screen');
    
    if (isDark) {
        if (appEl) appEl.style.backgroundColor = '#1a202c';
        screens.forEach(s => s.style.backgroundColor = '#1a202c');
    } else {
        if (appEl) appEl.style.backgroundColor = '#ffffff';
        screens.forEach(s => s.style.backgroundColor = '#ffffff');
    }

    const icon = document.getElementById('dark-mode-icon');
    if (icon) {
        icon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }
}

function openImageViewer(src) {
    const modal = document.getElementById('image-viewer-modal');
    const img = document.getElementById('image-viewer-img');
    if (modal && img) {
        img.src = src;
        modal.style.display = 'flex';
    }
}

function closeImageViewer() {
    const modal = document.getElementById('image-viewer-modal');
    if (modal) modal.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('theme') === 'dark') {
        toggleDarkMode();
    }
});

// ==========================================
// 🔑 비밀번호 변경 관련 함수
// ==========================================

function toggleChangePwModal() {
    const modal = document.getElementById('change-pw-modal');
    if (!modal) return;
    
    const isHidden = modal.style.display === 'none' || modal.style.display === '';
    modal.style.display = isHidden ? 'flex' : 'none';

    if (isHidden) {
        const input1 = document.getElementById('new-password-input');
        const input2 = document.getElementById('new-password-confirm');
        if (input1) input1.value = '';
        if (input2) input2.value = '';
    }
}

async function handleChangePassword() {
    if (!currentUser) {
        alert("로그인이 필요합니다.");
        return;
    }

    const newPw = document.getElementById('new-password-input')?.value.trim();
    const confirmPw = document.getElementById('new-password-confirm')?.value.trim();

    if (!newPw || !confirmPw) {
        return alert("새 비밀번호와 비밀번호 확인을 모두 입력해 주세요.");
    }

    if (newPw !== confirmPw) {
        return alert("새 비밀번호가 서로 일치하지 않습니다.");
    }

    if (newPw.length < 4) {
        return alert("비밀번호는 최소 4자리 이상이어야 합니다.");
    }

    try {
        const hashedPw = await sha256(newPw);

        await database.ref(`users/${currentUser.id}`).update({
            password: hashedPw
        });

        currentUser.password = hashedPw;

        alert("비밀번호가 성공적으로 변경되었습니다!");
        toggleChangePwModal();
    } catch (error) {
        console.error("비밀번호 변경 오류:", error);
        alert("비밀번호 변경 중 오류가 발생했습니다.");
    }
}

// ==========================================
// 👑 관리자 센터 (Admin Dashboard) 로직
// ==========================================

function openSettingsOrAdmin() {
    if (!currentUser) return alert("로그인이 필요합니다.");

    const isAdmin = currentUser.role === 'admin' || currentUser.id.includes('admin');

    if (isAdmin) {
        toggleAdminModal();
    } else {
        toggleChangePwModal();
    }
}

function toggleAdminModal() {
    const modal = document.getElementById('admin-modal');
    if (!modal) return;

    const isHidden = modal.style.display === 'none' || modal.style.display === '';
    modal.style.display = isHidden ? 'flex' : 'none';

    if (isHidden) {
        switchAdminTab('users');
    }
}

function switchAdminTab(tabName) {
    const usersTab = document.getElementById('admin-tab-users');
    const roomsTab = document.getElementById('admin-tab-rooms');
    const usersBtn = document.getElementById('admin-tab-users-btn');
    const roomsBtn = document.getElementById('admin-tab-rooms-btn');

    if (tabName === 'users') {
        if (usersTab) usersTab.style.display = 'block';
        if (roomsTab) roomsTab.style.display = 'none';
        if (usersBtn) { usersBtn.style.background = '#3182CE'; usersBtn.style.color = '#FFF'; }
        if (roomsBtn) { roomsBtn.style.background = '#EDF2F7'; roomsBtn.style.color = '#4A5568'; }
        loadAdminUsersList();
    } else {
        if (usersTab) usersTab.style.display = 'none';
        if (roomsTab) roomsTab.style.display = 'block';
        if (roomsBtn) { roomsBtn.style.background = '#3182CE'; roomsBtn.style.color = '#FFF'; }
        if (usersBtn) { usersBtn.style.background = '#EDF2F7'; usersBtn.style.color = '#4A5568'; }
        loadAdminRoomsList();
    }
}

function loadAdminUsersList() {
    const listEl = document.getElementById('admin-tab-users');
    if (!listEl) return;

    database.ref('users').once('value', (snapshot) => {
        listEl.innerHTML = '';
        if (!snapshot.exists()) {
            listEl.innerHTML = '<div style="text-align:center; padding:15px; color:#888;">등록된 회원이 없습니다.</div>';
            return;
        }

        snapshot.forEach((child) => {
            const user = child.val();
            const isMe = user.id === currentUser.id;
            const isTargetAdmin = user.role === 'admin' || user.id.includes('admin');

            const item = document.createElement('div');
            item.style = "display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid #EDF2F7; font-size:13px;";
            item.innerHTML = `
                <div>
                    <div style="font-weight:600; color:#2D3748;">
                        ${isTargetAdmin ? '👑 ' : ''}${escapeHtml(user.name)} 
                        <span style="font-size:11px; color:#A0AEC0;">(@${escapeHtml(user.id)})</span>
                    </div>
                </div>
                ${!isMe && !isTargetAdmin ? `
                    <button onclick="adminKickUser('${escapeHtml(user.id)}', '${escapeHtml(user.name)}')" style="background:#FFF5F5; color:#E53E3E; border:1px solid #FEB2B2; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:600;">
                        🚫 계정 삭제
                    </button>
                ` : '<span style="font-size:11px; color:#CBD5E0;">(본인/관리자)</span>'}
            `;
            listEl.appendChild(item);
        });
    });
}

async function adminKickUser(targetUserId, targetUserName) {
    if (!confirm(`정말로 [${targetUserName}] 계정을 시스템에서 삭제하시겠습니까?\n이 작업은 취소할 수 없습니다.`)) return;

    try {
        await database.ref(`users/${targetUserId}`).remove();
        alert(`[${targetUserName}] 계정이 성공적으로 삭제되었습니다.`);
        loadAdminUsersList();
        if (typeof loadFriendsList === 'function') loadFriendsList();
    } catch (error) {
        console.error("계정 삭제 오류:", error);
        alert("계정 삭제 중 오류가 발생했습니다.");
    }
}

function loadAdminRoomsList() {
    const listEl = document.getElementById('admin-tab-rooms');
    if (!listEl) return;

    database.ref('rooms').once('value', (snapshot) => {
        listEl.innerHTML = '';
        if (!snapshot.exists()) {
            listEl.innerHTML = '<div style="text-align:center; padding:15px; color:#888;">개설된 대화방이 없습니다.</div>';
            return;
        }

        snapshot.forEach((child) => {
            const room = child.val();
            const roomId = child.key;

            const item = document.createElement('div');
            item.style = "display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid #EDF2F7; font-size:13px;";
            item.innerHTML = `
                <div style="overflow:hidden; padding-right:8px;">
                    <div style="font-weight:600; color:#2D3748; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(room.title || '1:1 대화방')}</div>
                    <div style="font-size:10px; color:#A0AEC0;">생성자: ${escapeHtml(room.creatorName || room.createdBy || '알 수 없음')}</div>
                </div>
                <button onclick="adminDeleteRoom('${roomId}', '${escapeHtml(room.title || '대화방')}')" style="background:#FFF5F5; color:#E53E3E; border:1px solid #FEB2B2; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:600; flex-shrink:0;">
                    🗑️ 방 강제 폐쇄
                </button>
            `;
            listEl.appendChild(item);
        });
    });
}

async function adminDeleteRoom(roomId, roomTitle) {
    if (!confirm(`[${roomTitle}] 대화방을 강제로 폐쇄하고 모든 대화 기록을 삭제하시겠습니까?`)) return;

    try {
        await database.ref(`messages/${roomId}`).remove();
        await database.ref(`rooms/${roomId}`).remove();

        alert("대화방이 강제 폐쇄되었습니다.");
        loadAdminRoomsList();
        if (typeof loadChatRooms === 'function') loadChatRooms();
    } catch (error) {
        console.error("대화방 삭제 오류:", error);
        alert("대화방 폐쇄 처리 중 오류가 발생했습니다.");
    }
}

// ==========================================
// 🔔 푸시 알림 (Push Notification) 시스템
// ==========================================

let messaging = null;
try {
    messaging = firebase.messaging();
} catch (e) {
    console.log("이 브라우저는 FCM 푸시 알림을 지원하지 않습니다.");
}

async function requestPushNotificationPermission() {
    if (!messaging || !currentUser) return;

    try {
        const permission = await Notification.requestPermission();

        if (permission === 'granted') {
            console.log("알림 권한이 승인되었습니다.");
            
            // 💡 현재 저장소 경로(./firebase-messaging-sw.js)로 서비스 워커 등록 지정
            const registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
            const token = await messaging.getToken({ serviceWorkerRegistration: registration });

            if (token) {
                await database.ref(`users/${currentUser.id}/pushToken`).set(token);
                console.log("푸시 토큰 저장 완료:", token);
            }
        } else {
            console.log("알림 권한이 거부되었습니다.");
        }
    } catch (error) {
        console.error("푸시 알림 설정 중 오류 발생:", error);
    }
}

if (messaging) {
    messaging.onMessage((payload) => {
        console.log("포그라운드 메시지 도착:", payload);
        
        const title = payload.notification?.title || "새 메시지";
        const body = payload.notification?.body || "새 메시지가 도착했습니다.";

        if (Notification.permission === 'granted') {
            new Notification(title, {
                body: body,
                icon: 'https://cdn-icons-png.flaticon.com/512/732/732200.png'
            });
        }
    });
}

// ==========================================
// 👥 대화방 친구 초대 (Invite Members)
// ==========================================

// 초대 모달 토글 및 안 들어와 있는 친구 목록 불러오기
function toggleInviteMemberModal() {
    const modal = document.getElementById('invite-member-modal');
    if (!modal || !currentRoomId) return;

    const isHidden = modal.style.display === 'none' || modal.style.display === '';
    modal.style.display = isHidden ? 'flex' : 'none';

    if (isHidden) {
        loadFriendsToInvite();
    }
}

// 현재 방에 없는 친구 목록만 필터링해서 출력
async function loadFriendsToInvite() {
    const listEl = document.getElementById('invite-friends-list');
    if (!listEl) return;

    listEl.innerHTML = '<div style="font-size:12px; color:#888; text-align:center;">친구 목록 불러오는 중...</div>';

    try {
        // 1. 현재 대화방 데이터 가져오기
        const roomSnap = await database.ref(`rooms/${currentRoomId}`).once('value');
        if (!roomSnap.exists()) return;
        const room = roomSnap.val();
        
        // 현재 방에 있는 멤버 ID 리스트/객체
        const currentMembers = room.membersInfo || room.members || {};

        // 2. 전체 유저 가져오기
        const usersSnap = await database.ref('users').once('value');
        listEl.innerHTML = '';

        if (!usersSnap.exists()) {
            listEl.innerHTML = '<div style="font-size:12px; color:#888; text-align:center;">초대 가능한 친구가 없습니다.</div>';
            return;
        }

        let count = 0;
        usersSnap.forEach((child) => {
            const user = child.val();
            // 이미 방에 있는 유저는 제외
            const isAlreadyMember = Array.isArray(currentMembers) 
                ? currentMembers.includes(user.id) 
                : !!currentMembers[user.id];

            if (!isAlreadyMember) {
                count++;
                const item = document.createElement('label');
                item.style = "display:flex; align-items:center; gap:8px; font-size:13px; margin-bottom:8px; cursor:pointer;";
                item.innerHTML = `
                    <input type="checkbox" class="invite-friend-checkbox" value="${escapeHtml(user.id)}" data-name="${escapeHtml(user.name)}">
                    <span>${escapeHtml(user.name)} (@${escapeHtml(user.id)})</span>
                `;
                listEl.appendChild(item);
            }
        });

        if (count === 0) {
            listEl.innerHTML = '<div style="font-size:12px; color:#888; text-align:center; padding:10px;">모든 친구가 이미 대화방에 있습니다.</div>';
        }
    } catch (err) {
        console.error("초대 목록 로딩 오류:", err);
        listEl.innerHTML = '<div style="font-size:12px; color:#E53E3E; text-align:center;">목록을 불러오지 못했습니다.</div>';
    }
}

// 선택한 친구 대화방에 초대 처리
async function inviteSelectedFriends() {
    if (!currentRoomId || !currentUser) return;

    const checkedBoxes = document.querySelectorAll('.invite-friend-checkbox:checked');
    if (checkedBoxes.length === 0) {
        return alert("초대할 친구를 최소 한 명 이상 선택해 주세요.");
    }

    try {
        const roomRef = database.ref(`rooms/${currentRoomId}`);
        const roomSnap = await roomRef.once('value');
        if (!roomSnap.exists()) return;

        const invitedNames = [];
        const updateMembersInfo = {};

        checkedBoxes.forEach(box => {
            const userId = box.value;
            const userName = box.getAttribute('data-name');
            
            // membersInfo 객체에 추가
            updateMembersInfo[`membersInfo/${userId}`] = userName;
            // members 배열/객체 형태 대응
            updateMembersInfo[`members/${userId}`] = true;
            
            invitedNames.push(userName);
        });

        // 1. 방 정보에 멤버 업데이트
        await roomRef.update(updateMembersInfo);

        // 2. 대화방에 시스템 초대 메시지 전송
        const namesStr = invitedNames.join(', ');
        await database.ref(`messages/${currentRoomId}`).push({
            senderId: 'system',
            senderName: '시스템',
            text: `📢 [${currentUser.name}]님이 [${namesStr}]님을 대화방에 초대했습니다.`,
            timestamp: Date.now()
        });

        alert(`${invitedNames.length}명의 친구를 초대했습니다!`);
        toggleInviteMemberModal();
    } catch (error) {
        console.error("친구 초대 실패:", error);
        alert("친구 초대 중 오류가 발생했습니다.");
    }
}
