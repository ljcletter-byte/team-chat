// ==========================================
// 🌟 상태 관리 변수 (Global State)
// ==========================================
let currentUser = null;
let currentRoomId = null;
let pendingRoom = null;
let scheduleListener = null;
let replyingTo = null; // 📩 답장 대상 메시지 { id, senderName, text }
let typingTimeout = null; // ⌨️ 입력 중 상태 디바운스 타임아웃
let typingListener = null; // ⌨️ 입력 중 상태 리스너
let isCurrentlyTyping = false; // ⌨️ 과도한 DB 쓰기 방지 플래그
let currentMsgQuery = null; // 📩 Query 객체 리스너 해제용 참조 변수

const SYSTEM_INVITE_CODE = "SECRET2026"; 

// ==========================================
// 🛠️ 유틸리티 함수 (Utility Functions)
// ==========================================

// HTML 특수문자 이스케이프
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Inline JS 문자열 이스케이프 (onclick 파라미터 등의 SyntaxError 방지)
function escapeJsStr(str) {
    if (!str) return '';
    return String(str)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '&quot;');
}

// 보안 강화: 역할 기반 관리자 권한 체크
function isAdminUser(user) {
    if (!user) return false;
    return user.role === 'admin' || user.role === 'super_admin';
}

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

async function sha256(message) {
    if (message === null || message === undefined) message = '';
    const msgBuffer = new TextEncoder().encode(String(message));
    if (!window.crypto || !window.crypto.subtle) {
        console.error("Crypto API를 지원하지 않는 환경입니다.");
        return String(message);
    }
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

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

// 📁 파일 확장자별 아이콘 구분
function getFileIcon(fileName) {
    if (!fileName) return '📎 파일';
    const ext = fileName.split('.').pop().toLowerCase();
    
    if (['pdf'].includes(ext)) return '📄 PDF';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '📦 압축파일';
    if (['doc', 'docx', 'txt', 'hwp'].includes(ext)) return '📝 문서';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊 엑셀';
    if (['ppt', 'pptx'].includes(ext)) return '📊 PPT';
    return '📎 파일';
}

// 📁 파일 용량 단위 변환 (Bytes -> KB/MB)
function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// 📁 파일 다운로드 핸들러
function downloadFile(base64Data, fileName) {
    try {
        const link = document.createElement('a');
        link.href = base64Data;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (e) {
        console.error("파일 다운로드 실패:", e);
        alert("파일 다운로드에 실패했습니다.");
    }
}

// 사용자의 대화방 마지막 읽은 시간 갱신
async function updateLastReadTimestamp(roomId) {
    if (!roomId || !currentUser) return;
    try {
        await database.ref(`rooms/${roomId}/readStatus/${currentUser.id}`).set(Date.now());
    } catch (e) {
        console.error("읽음 상태 갱신 실패:", e);
    }
}

// 📩 답장 미리보기 바 생성 및 초기화
function initReplyPreviewBar() {
    if (document.getElementById('reply-preview-bar')) return;
    
    const inputEl = document.getElementById('chat-input-text');
    if (!inputEl) return;

    const container = inputEl.parentElement;
    if (container) {
        const bar = document.createElement('div');
        bar.id = 'reply-preview-bar';
        bar.style = "display:none; justify-content:space-between; align-items:center; background:#EDF2F7; padding:6px 12px; font-size:12px; border-radius:6px; margin-bottom:6px; color:#4A5568;";
        bar.innerHTML = `
            <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:85%;">
                <span style="font-weight:bold; color:#3182CE;">↪ 답장: </span>
                <span id="reply-preview-text"></span>
            </div>
            <button onclick="cancelReply()" style="background:none; border:none; color:#E53E3E; cursor:pointer; font-weight:bold; padding:0 4px;">✕</button>
        `;
        container.insertBefore(bar, inputEl);
    }
}

// 📩 답장 대상 설정
function setReplyTarget(msgId, senderName, text) {
    initReplyPreviewBar();
    replyingTo = { id: msgId, senderName: senderName, text: text };
    
    const previewBar = document.getElementById('reply-preview-bar');
    const previewText = document.getElementById('reply-preview-text');
    if (previewBar && previewText) {
        previewText.innerText = `${senderName} - "${text}"`;
        previewBar.style.display = 'flex';
    }
    document.getElementById('chat-input-text')?.focus();
}

// 📩 답장 취소
function cancelReply() {
    replyingTo = null;
    const previewBar = document.getElementById('reply-preview-bar');
    if (previewBar) previewBar.style.display = 'none';
}

// ⌨️ 입력 중 상태 알림 UI 생성
function initTypingIndicatorBar() {
    if (document.getElementById('typing-indicator-bar')) return;
    
    const inputEl = document.getElementById('chat-input-text');
    if (!inputEl) return;

    const inputContainer = inputEl.parentElement;
    if (inputContainer && inputContainer.parentElement) {
        const bar = document.createElement('div');
        bar.id = 'typing-indicator-bar';
        bar.style = "display:none; font-size:11px; color:#4A5568; padding:4px 12px; font-style:italic; background:#EDF2F7; border-radius:6px; margin-bottom:6px; transition: all 0.2s ease;";
        inputContainer.parentElement.insertBefore(bar, inputContainer);
    }
}

// ⌨️ 나의 입력 중 상태 업데이트
function setTypingStatus(isTyping) {
    if (!currentRoomId || !currentUser) return;
    const typingRef = database.ref(`rooms/${currentRoomId}/typing/${currentUser.id}`);
    if (isTyping) {
        typingRef.set(currentUser.name);
    } else {
        typingRef.remove();
    }
}

// ⌨️ 키보드 입력 감지 핸들러 (최적화)
function handleTyping() {
    if (!currentRoomId || !currentUser) return;
    
    if (!isCurrentlyTyping) {
        isCurrentlyTyping = true;
        setTypingStatus(true);
    }

    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        setTypingStatus(false);
        isCurrentlyTyping = false;
    }, 2500);
}

// ⌨️ 상대방 입력 중 상태 감지 리스너
function listenTypingStatus(roomId) {
    initTypingIndicatorBar();
    const typingBar = document.getElementById('typing-indicator-bar');

    if (typingListener && currentRoomId) {
        database.ref(`rooms/${currentRoomId}/typing`).off('value', typingListener);
    }

    typingListener = database.ref(`rooms/${roomId}/typing`).on('value', (snapshot) => {
        if (!typingBar) return;
        if (!snapshot.exists()) {
            typingBar.style.display = 'none';
            typingBar.innerText = '';
            return;
        }

        const typers = [];
        snapshot.forEach((child) => {
            if (currentUser && child.key !== currentUser.id) {
                typers.push(child.val());
            }
        });

        if (typers.length > 0) {
            const text = typers.length === 1 
                ? `💬 ${typers[0]}님이 입력 중입니다...` 
                : `💬 ${typers.join(', ')}님이 입력 중입니다...`;
            typingBar.innerText = text;
            typingBar.style.display = 'block';
        } else {
            typingBar.style.display = 'none';
            typingBar.innerText = '';
        }
    });
}

// 화면 전환
function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.style.display = 'none';
    });

    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.style.display = 'flex';
    }
}

// 사이드바 탭 전환
function switchSidebarTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));

    if (tabName === 'chats') {
        document.getElementById('tab-btn-chats')?.classList.add('active');
        document.getElementById('panel-chats')?.classList.add('active');
        loadChatRooms();
    } else {
        document.getElementById('tab-btn-friends')?.classList.add('active');
        document.getElementById('panel-friends')?.classList.add('active');
        loadFriendsList();
    }
}

// ==========================================
// 🔐 인증 관련 함수 (Auth Functions)
// ==========================================

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

        currentUser = {
            ...userData,
            groupId: userData.groupId || 'etc'
        };
        
        const userDisplay = document.getElementById('current-user-display');
        if (userDisplay) userDisplay.innerText = `${currentUser.name} 님`;

        switchScreen('main-layout');
        switchSidebarTab('chats');
        requestPushNotificationPermission();
    } catch (error) {
        console.error("로그인 오류:", error);
        alert("로그인 중 오류가 발생했습니다.");
    }
}

function handleLogout() {
    if (!confirm("로그아웃 하시겠습니까?")) return;

    if (currentRoomId) {
        setTypingStatus(false);
        if (currentMsgQuery) {
            currentMsgQuery.off();
            currentMsgQuery = null;
        }
        if (typingListener) database.ref(`rooms/${currentRoomId}/typing`).off('value', typingListener);
        currentRoomId = null;
    }

    database.ref('rooms').off();
    currentUser = null;
    isCurrentlyTyping = false;

    const idInput = document.getElementById('login-id');
    const pwInput = document.getElementById('login-pw');
    if (idInput) idInput.value = '';
    if (pwInput) pwInput.value = '';

    document.getElementById('active-chat-view').style.display = 'none';
    document.getElementById('no-chat-selected').style.display = 'flex';

    switchScreen('login-screen');
    alert("로그아웃 되었습니다.");
}

async function handleRegisterWithCode() {
    const id = document.getElementById('reg-id')?.value.trim();
    const pw = document.getElementById('reg-pw')?.value.trim();
    const name = document.getElementById('reg-name')?.value.trim();
    const inviteCode = document.getElementById('reg-invite-code')?.value.trim();

    if (!id || !pw || !name || !inviteCode) {
        return alert('모든 항목과 초대 코드를 입력해 주세요.');
    }

    try {
        let isValidInvite = false;
        let assignedGroup = 'etc';

        if (inviteCode === SYSTEM_INVITE_CODE) {
            isValidInvite = true;
            assignedGroup = 'etc';
        } else {
            const inviteSnap = await database.ref(`invites/${inviteCode}`).once('value');
            if (inviteSnap.exists() && !inviteSnap.val().isUsed) {
                isValidInvite = true;
                assignedGroup = inviteSnap.val().groupId || 'etc';
                await database.ref(`invites/${inviteCode}`).update({ isUsed: true, usedBy: id });
            }
        }

        if (!isValidInvite) {
            return alert('유효하지 않거나 이미 사용된 초대 코드입니다.');
        }

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
            groupId: assignedGroup,
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
// 👥 팀원 목록 함수
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

        const isSuperAdmin = isAdminUser(currentUser);

        snapshot.forEach((child) => {
            const user = child.val();
            if (currentUser && user.id === currentUser.id) return;

            if (!isSuperAdmin && user.groupId !== currentUser.groupId) {
                return;
            }

            const userColor = getUserAvatarColor(user.id);
            const isTargetAdmin = isAdminUser(user);
            const adminBadge = isTargetAdmin ? '<span style="color:#D69E2E; font-size:12px; margin-right:4px;">👑</span>' : '';
            
            const groupMap = { company: '회사', family: '가족', friends: '친구', etc: '기타' };
            const groupName = groupMap[user.groupId] || '기타';
            
            const groupBadge = isSuperAdmin && user.groupId 
                ? `<span style="font-size:10px; background:#EDF2F7; color:#4A5568; padding:2px 6px; border-radius:4px; margin-left:4px;">${groupName}</span>` 
                : '';

            const userDiv = document.createElement('div');
            userDiv.style = "padding:10px 12px; border-bottom:1px solid #EDF2F7; display:flex; justify-content:space-between; align-items:center; background:#fff; border-radius:8px; margin-bottom:6px;";
            userDiv.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <div class="avatar" style="background:${userColor}; color:white; font-size:14px;">${escapeHtml(user.name.charAt(0))}</div>
                    <div>
                        <div style="font-weight:600; font-size:13px; color:#2D3748;">${adminBadge}${escapeHtml(user.name)} ${groupBadge}</div>
                        <div style="font-size:11px; color:#A0AEC0;">@${escapeHtml(user.id)}</div>
                    </div>
                </div>
                <button onclick="startDirectChat('${escapeJsStr(user.id)}', '${escapeJsStr(user.name)}')" style="background:#EBF8FF; color:#3182CE; border:none; padding:5px 10px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600;">
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
// 💬 대화방 입장 및 조작
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

async function verifyAndEnterRoom() {
    const inputPw = document.getElementById('room-enter-pw')?.value?.trim();
    if (!pendingRoom || !currentUser) return closePasswordModal();
    if (!inputPw) return alert("비밀번호를 입력해 주세요.");

    try {
        const hashedInputPw = await sha256(inputPw);
        if (hashedInputPw === pendingRoom.password) {
            const targetId = pendingRoom.id;
            const targetTitle = pendingRoom.title;
            closePasswordModal();
            enterChatRoom(targetId, targetTitle);
        } else {
            alert("비밀번호가 일치하지 않습니다.");
        }
    } catch (e) {
        console.error("비밀번호 검증 오류:", e);
    }
}

function closePasswordModal() {
    const modal = document.getElementById('password-modal');
    if (modal) modal.style.display = 'none';
    pendingRoom = null;
}

async function enterChatRoom(roomId, roomTitle) {
    if (!currentUser) return;

    if (currentRoomId) {
        setTypingStatus(false);
        if (currentMsgQuery) {
            currentMsgQuery.off();
            currentMsgQuery = null;
        }
        if (typingListener) database.ref(`rooms/${currentRoomId}/typing`).off('value', typingListener);
    }

    currentRoomId = roomId;
    cancelReply();
    updateLastReadTimestamp(roomId);

    document.querySelectorAll('.chat-room-item').forEach(item => {
        item.classList.remove('active-room');
    });
    const activeItem = document.getElementById(`room-item-${roomId}`);
    if (activeItem) activeItem.classList.add('active-room');

    const inputEl = document.getElementById('chat-input-text');
    if (inputEl && !inputEl.dataset.typingBound) {
        inputEl.addEventListener('input', handleTyping);
        inputEl.dataset.typingBound = "true";
    }

    try {
        const roomSnap = await database.ref(`rooms/${roomId}`).once('value');
        let displayTitle = roomTitle;
        let isOwner = false;

        if (roomSnap.exists()) {
            const room = roomSnap.val();
            if (room.createdBy === currentUser.id) isOwner = true;
            if (room.isDirect && room.membersInfo) {
                const partnerId = Object.keys(room.membersInfo).find(id => id !== currentUser.id);
                if (partnerId) displayTitle = room.membersInfo[partnerId];
            }
        }

        const titleEl = document.getElementById('chat-room-title');
        if (titleEl) titleEl.innerText = displayTitle || '대화방';

        const headerActions = document.getElementById('chat-header-actions');
        if (headerActions) {
            const actionBtnHtml = isOwner ? `
                <button onclick="deleteChatRoom('${currentRoomId}')" style="background:#FFF5F5; color:#E53E3E; border:1px solid #FEB2B2; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;">
                    🗑️ 삭제
                </button>
            ` : `
                <button onclick="leaveChatRoom()" style="background:#EDF2F7; color:#4A5568; border:none; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;">
                    🚪 나가기
                </button>
            `;

            headerActions.innerHTML = `
                <button onclick="toggleInviteMemberModal()" style="background:#EBF8FF; color:#3182CE; border:none; padding:4px 8px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600;">
                    ➕ 초대
                </button>
                <button onclick="toggleScheduleModal()" style="background:#EBF8FF; color:#3182CE; border:none; padding:4px 8px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600;">
                    🗓️ 일정
                </button>
                ${actionBtnHtml}
            `;
        }

        document.getElementById('no-chat-selected').style.display = 'none';
        document.getElementById('active-chat-view').style.display = 'flex';

        listenMessages(currentRoomId);
        listenTypingStatus(currentRoomId);
    } catch (err) {
        console.error("방 진입 실패:", err);
    }
}

// 📩 메시지 수신 및 렌더링 (텍스트, 사진, 문서/파일 통합 지원)
function listenMessages(roomId) {
    const msgBox = document.getElementById('msg-box');
    if (!msgBox) return;

    if (currentMsgQuery) {
        currentMsgQuery.off();
        currentMsgQuery = null;
    }

    currentMsgQuery = database.ref(`messages/${roomId}`).limitToLast(100);

    currentMsgQuery.on('value', (snapshot) => {
        if (currentRoomId === roomId) {
            updateLastReadTimestamp(roomId);
        }

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
                        ${escapeHtml(msg.text || msg.content || '')}
                    </div>
                `;
                lastSenderId = 'system';
            } else {
                msgDiv.style = `display:flex; gap:8px; margin-bottom:${isContinuous ? '4px' : '10px'}; flex-direction:${isMe ? 'row-reverse' : 'row'};`;
                
                let avatarHtml = '';
                if (!isMe) {
                    if (!isContinuous) {
                        avatarHtml = `<div class="avatar" style="background:${userColor}; color:white; font-size:13px;">${escapeHtml((msg.senderName || '알').charAt(0))}</div>`;
                    } else {
                        avatarHtml = `<div style="width:38px; flex-shrink:0;"></div>`;
                    }
                }

                let replyQuoteHtml = '';
                if (msg.replyTo) {
                    replyQuoteHtml = `
                        <div style="background:${isMe ? 'rgba(255,255,255,0.2)' : '#EDF2F7'}; padding:4px 8px; border-radius:6px; font-size:11px; margin-bottom:4px; border-left:3px solid ${isMe ? '#FFF' : '#3182CE'}; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                            <span style="font-weight:bold;">↪ ${escapeHtml(msg.replyTo.senderName)}</span>: ${escapeHtml(msg.replyTo.text)}
                        </div>
                    `;
                }

                let contentHtml = '';
                const imgSrc = msg.imageUrl || (msg.type === 'image' ? msg.content : null);

                if (imgSrc) {
                    // 📷 이미지 메시지
                    contentHtml = `<img src="${imgSrc}" style="max-width:200px; max-height:200px; border-radius:12px; border:1px solid #E2E8F0; cursor:pointer; display:block;" onclick="openImageViewer(this.src)" title="클릭하여 원본 보기">`;
                } else if (msg.type === 'file') {
                    // 📁 문서/파일 메시지 (PDF, ZIP, Office 등)
                    const fileIcon = getFileIcon(msg.fileName);
                    const sizeStr = formatFileSize(msg.fileSize);
                    
                    contentHtml = `
                        <div style="background:${isMe ? '#2B6CB0' : '#EDF2F7'}; color:${isMe ? '#FFF' : '#2D3748'}; padding:10px 12px; border-radius:12px; min-width:200px; max-width:250px; box-shadow:0 1px 2px rgba(0,0,0,0.05); border:${isMe ? 'none' : '1px solid #CBD5E0'};">
                            <div style="font-weight:600; font-size:12px; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
                                <span>${fileIcon}</span>
                                <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:170px;" title="${escapeHtml(msg.fileName)}">${escapeHtml(msg.fileName || '첨부파일')}</span>
                            </div>
                            <div style="font-size:10px; color:${isMe ? '#E2E8F0' : '#718096'}; display:flex; justify-content:space-between; align-items:center; margin-top:8px; border-top:1px solid ${isMe ? 'rgba(255,255,255,0.2)' : '#CBD5E0'}; padding-top:6px;">
                                <span>${sizeStr}</span>
                                <button onclick="downloadFile('${msg.fileData}', '${escapeJsStr(msg.fileName)}')" style="background:${isMe ? '#FFF' : '#3182CE'}; color:${isMe ? '#2B6CB0' : '#FFF'}; border:none; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:3px;">
                                    ⬇️ 다운로드
                                </button>
                            </div>
                        </div>
                    `;
                } else {
                    // 💬 일반 텍스트 메시지
                    contentHtml = `
                        <div style="background:${isMe ? '#3182CE' : '#FFFFFF'}; color:${isMe ? '#FFF' : '#2D3748'}; padding:8px 12px; border-radius:12px; max-width:220px; word-break:break-word; font-size:13px; line-height:1.4; box-shadow:0 1px 2px rgba(0,0,0,0.05); border:${isMe ? 'none' : '1px solid #E2E8F0'};">
                            ${replyQuoteHtml}
                            ${escapeHtml(msg.text || msg.content || '')}
                        </div>
                    `;
                }

                const safeSenderName = escapeJsStr(msg.senderName || '알 수 없음');
                const safeText = escapeJsStr(msg.fileName ? `[파일] ${msg.fileName}` : (msg.text || '사진 메시지'));
                
                const replyBtnHtml = `
                    <button onclick="setReplyTarget('${msgId}', '${safeSenderName}', '${safeText}')" title="답장" style="background:none; border:none; color:#A0AEC0; cursor:pointer; font-size:11px; padding:2px;" onmouseover="this.style.color='#3182CE'" onmouseout="this.style.color='#A0AEC0'">
                        <i class="fa-solid fa-reply"></i>
                    </button>
                `;

                const deleteBtnHtml = isMe ? `
                    <button onclick="deleteMessage('${msgId}')" title="메시지 삭제" style="background:none; border:none; color:#A0AEC0; cursor:pointer; font-size:11px; padding:2px;" onmouseover="this.style.color='#E53E3E'" onmouseout="this.style.color='#A0AEC0'">
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
                                <div style="display:flex; gap:2px;">
                                    ${replyBtnHtml}
                                    ${deleteBtnHtml}
                                </div>
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
}

function deleteMessage(msgId) {
    if (!currentRoomId || !msgId) return;

    if (confirm("이 메시지를 삭제하시겠습니까?")) {
        database.ref(`messages/${currentRoomId}/${msgId}`).remove()
            .catch((error) => console.error("메시지 삭제 오류:", error));
    }
}

async function deleteChatRoom(roomId) {
    const targetRoomId = roomId || currentRoomId;
    if (!targetRoomId) return;
    if (!confirm("정말로 이 대화방을 삭제하시겠습니까?")) return;

    try {
        setTypingStatus(false);
        await database.ref(`messages/${targetRoomId}`).remove();
        await database.ref(`rooms/${targetRoomId}`).remove();

        alert("대화방이 삭제되었습니다.");
        
        if (currentRoomId === targetRoomId) {
            currentRoomId = null;
            document.getElementById('active-chat-view').style.display = 'none';
            document.getElementById('no-chat-selected').style.display = 'flex';
        }
        loadChatRooms();
    } catch (error) {
        console.error("방 삭제 오류:", error);
    }
}

async function leaveChatRoom() {
    if (!currentRoomId || !currentUser) return;
    if (!confirm("대화방에서 나가시겠습니까?")) return;

    try {
        const roomId = currentRoomId;
        setTypingStatus(false);

        await database.ref(`messages/${roomId}`).push({
            senderId: 'system',
            senderName: '시스템',
            text: `📢 [${currentUser.name}]님이 대화방에서 퇴장하셨습니다.`,
            timestamp: Date.now()
        });

        await database.ref(`rooms/${roomId}/members/${currentUser.id}`).remove();
        await database.ref(`rooms/${roomId}/membersInfo/${currentUser.id}`).remove();

        if (currentMsgQuery) {
            currentMsgQuery.off();
            currentMsgQuery = null;
        }
        if (typingListener) database.ref(`rooms/${roomId}/typing`).off('value', typingListener);
        currentRoomId = null;

        document.getElementById('active-chat-view').style.display = 'none';
        document.getElementById('no-chat-selected').style.display = 'flex';
        loadChatRooms();
    } catch (error) {
        console.error("방 나가기 실패:", error);
    }
}

async function sendTextMessage() {
    const input = document.getElementById('chat-input-text');
    if (!input) return;

    const text = input.value.trim();
    if (!text || !currentRoomId || !currentUser) return;

    try {
        setTypingStatus(false);
        isCurrentlyTyping = false;
        if (typingTimeout) clearTimeout(typingTimeout);

        const now = Date.now();
        const msgPayload = {
            senderId: currentUser.id,
            senderName: currentUser.name,
            text: text,
            timestamp: now
        };

        if (replyingTo) {
            msgPayload.replyTo = {
                id: replyingTo.id,
                senderName: replyingTo.senderName,
                text: replyingTo.text
            };
        }

        await database.ref(`messages/${currentRoomId}`).push(msgPayload);

        await database.ref(`rooms/${currentRoomId}`).update({
            lastMessage: text,
            lastTimestamp: now
        });

        input.value = '';
        cancelReply();
    } catch (error) {
        console.error("메시지 전송 실패:", error);
    }
}

function triggerImageUpload() {
    const fileInput = document.getElementById('chat-image-input');
    if (fileInput) fileInput.click();
}

function sendImageMessage(fileInput) {
    const inputEl = fileInput && fileInput.files ? fileInput : document.getElementById('chat-image-input');
    if (!inputEl || !inputEl.files || !inputEl.files.length) return;

    const file = inputEl.files[0];
    if (!file || !currentRoomId || !currentUser) return alert("대화방에 먼저 입장해 주세요.");

    if (file.size > 2 * 1024 * 1024) {
        alert("이미지는 2MB 이하만 전송 가능합니다.");
        inputEl.value = '';
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
                type: 'image',
                imageUrl: base64Image,
                content: base64Image,
                timestamp: now
            });

            await database.ref(`rooms/${currentRoomId}`).update({
                lastMessage: "📷 사진을 보냈습니다.",
                lastTimestamp: now
            });

            inputEl.value = '';
        } catch (err) {
            console.error("이미지 전송 실패:", err);
        }
    };
    reader.readAsDataURL(file);
}

// 📁 문서/파일 첨부 버튼 트리거
function triggerFileUpload() {
    const fileInput = document.getElementById('chat-file-input');
    if (fileInput) fileInput.click();
}

// 📁 문서/파일 전송 핸들러 (PDF, ZIP, Office 등)
function sendFileMessage(fileInput) {
    const inputEl = fileInput && fileInput.files ? fileInput : document.getElementById('chat-file-input');
    if (!inputEl || !inputEl.files || !inputEl.files.length) return;

    const file = inputEl.files[0];
    if (!file || !currentRoomId || !currentUser) return alert("대화방에 먼저 입장해 주세요.");

    if (file.size > 5 * 1024 * 1024) {
        alert("일반 파일은 최대 5MB 이하만 전송 가능합니다.");
        inputEl.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = async function (e) {
        const base64Data = e.target.result;
        const now = Date.now();

        try {
            await database.ref(`messages/${currentRoomId}`).push({
                senderId: currentUser.id,
                senderName: currentUser.name,
                type: 'file',
                fileName: file.name,
                fileSize: file.size,
                fileData: base64Data,
                timestamp: now
            });

            await database.ref(`rooms/${currentRoomId}`).update({
                lastMessage: `📁 파일: ${file.name}`,
                lastTimestamp: now
            });

            inputEl.value = '';
        } catch (err) {
            console.error("파일 전송 실패:", err);
            alert("파일 전송 중 오류가 발생했습니다.");
        }
    };
    reader.readAsDataURL(file);
}

// ==========================================
// 📋 대화방 목록 및 상단 고정 (Pin Room)
// ==========================================

async function togglePinRoom(roomId, event) {
    if (event) event.stopPropagation();
    if (!currentUser || !roomId) return;

    try {
        const pinRef = database.ref(`rooms/${roomId}/pinnedBy/${currentUser.id}`);
        const snap = await pinRef.once('value');

        if (snap.exists() && snap.val() === true) {
            await pinRef.remove();
        } else {
            await pinRef.set(true);
        }
    } catch (e) {
        console.error("상단 고정 실패:", e);
    }
}

// 대화방 목록 렌더링 성능 최적화 (Promise.all 병렬 처리)
function loadChatRooms() {
    const chatListEl = document.getElementById('chat-list');
    if (!chatListEl) return;

    chatListEl.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">대화방 목록 불러오는 중...</div>';

    database.ref('rooms').on('value', async (snapshot) => {
        chatListEl.innerHTML = '';
        if (!snapshot.exists()) {
            chatListEl.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">개설된 대화방이 없습니다.</div>';
            return;
        }

        const isSuperAdmin = isAdminUser(currentUser);

        const rawList = [];
        snapshot.forEach((child) => {
            rawList.push({ key: child.key, val: child.val() });
        });

        rawList.sort((a, b) => {
            const isPinnedA = a.val.pinnedBy && currentUser && a.val.pinnedBy[currentUser.id] ? 1 : 0;
            const isPinnedB = b.val.pinnedBy && currentUser && b.val.pinnedBy[currentUser.id] ? 1 : 0;

            if (isPinnedA !== isPinnedB) {
                return isPinnedB - isPinnedA;
            }
            return (b.val.lastTimestamp || 0) - (a.val.lastTimestamp || 0);
        });

        const roomDataPromises = rawList.map(async (item) => {
            const room = item.val;
            const roomId = item.key;

            const isMember = room.membersInfo && currentUser && room.membersInfo[currentUser.id];
            const isMemberOld = room.members && currentUser && room.members[currentUser.id];
            const isPart = room.participants && currentUser && (
                Array.isArray(room.participants) ? room.participants.includes(currentUser.id) : room.participants[currentUser.id]
            );
            const isJoined = isMember || isMemberOld || isPart;

            if (!isSuperAdmin && !isJoined) {
                return null;
            }

            let unreadCount = 0;
            const lastRead = (room.readStatus && currentUser && room.readStatus[currentUser.id]) || 0;

            const msgSnap = await database.ref(`messages/${roomId}`).once('value');
            if (msgSnap.exists()) {
                msgSnap.forEach((msgChild) => {
                    const msg = msgChild.val();
                    if (msg.senderId !== 'system' && msg.senderId !== currentUser?.id && msg.timestamp > lastRead) {
                        unreadCount++;
                    }
                });
            }

            return { room, roomId, unreadCount, isJoined };
        });

        const processedRooms = (await Promise.all(roomDataPromises)).filter(Boolean);

        if (processedRooms.length === 0) {
            chatListEl.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">참여 중인 대화방이 없습니다.</div>';
            return;
        }

        processedRooms.forEach(({ room, roomId, unreadCount, isJoined }) => {
            const isPinned = room.pinnedBy && currentUser && room.pinnedBy[currentUser.id];

            const unreadBadgeHtml = unreadCount > 0 
                ? `<span style="background:#E53E3E; color:white; font-size:11px; font-weight:bold; padding:2px 6px; border-radius:10px; margin-left:6px; flex-shrink:0;">${unreadCount > 99 ? '99+' : unreadCount}</span>` 
                : '';

            const timeStr = formatTime(room.lastTimestamp);
            const isLocked = !!room.password;

            let displayTitle = room.title || '대화방';
            if (room.isDirect && room.membersInfo && currentUser) {
                const partnerId = Object.keys(room.membersInfo).find(id => id !== currentUser.id);
                if (partnerId) displayTitle = room.membersInfo[partnerId];
            }

            const adminBadge = (isSuperAdmin && !isJoined) 
                ? '<span style="font-size:10px; background:#EDF2F7; color:#718096; padding:2px 5px; border-radius:4px; font-weight:normal;">관전</span>' 
                : '';

            const firstChar = displayTitle.charAt(0);
            const roomColor = getUserAvatarColor(roomId);

            const roomDiv = document.createElement('div');
            roomDiv.className = `chat-room-item ${currentRoomId === roomId ? 'active-room' : ''}`;
            roomDiv.id = `room-item-${roomId}`;
            roomDiv.setAttribute("data-title", displayTitle);
            roomDiv.style = `padding:10px 12px; border-bottom:1px solid #E2E8F0; cursor:pointer; display:flex; align-items:center; gap:10px; background:${isPinned ? '#F7FAFC' : '#fff'};`;

            roomDiv.onclick = () => attemptEnterRoom(roomId, displayTitle, room.password);

            roomDiv.innerHTML = `
                <div class="avatar" style="background:${roomColor}; color:white; font-size:14px; position:relative;">
                    ${escapeHtml(firstChar)}
                </div>
                <div style="flex:1; overflow:hidden;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                        <span style="font-weight:600; font-size:13px; color:#2D3748; display:flex; align-items:center; gap:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                            ${isPinned ? '<span style="color:#DD6B20; font-size:12px;">📌</span>' : ''}
                            ${escapeHtml(displayTitle)} ${adminBadge}
                            ${isLocked ? '<i class="fa-solid fa-lock" style="font-size:11px; color:#E53E3E;"></i>' : ''}
                        </span>
                        <div style="display:flex; align-items:center; gap:4px;">
                            <span style="font-size:10px; color:#A0AEC0; flex-shrink:0;">${timeStr}</span>
                            <button onclick="togglePinRoom('${roomId}', event)" title="${isPinned ? '상단 고정 해제' : '상단 고정'}" style="background:none; border:none; color:${isPinned ? '#DD6B20' : '#CBD5E0'}; cursor:pointer; font-size:12px; padding:0 2px;" onmouseover="this.style.color='#DD6B20'" onmouseout="this.style.color='${isPinned ? '#DD6B20' : '#CBD5E0'}'">
                                📌
                            </button>
                        </div>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:12px; color:#718096; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;">
                            ${escapeHtml(room.lastMessage || '')}
                        </span>
                        ${unreadBadgeHtml}
                    </div>
                </div>
            `;
            chatListEl.appendChild(roomDiv);
        });
    });
}

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

        const isSuperAdmin = isAdminUser(currentUser);

        let count = 0;
        snapshot.forEach((child) => {
            const user = child.val();
            const myId = currentUser ? currentUser.id : null;

            if (!user || user.id === myId) return;

            if (!isSuperAdmin && user.groupId !== currentUser.groupId) {
                return;
            }

            count++;
            const item = document.createElement('label');
            item.style = "display:flex; align-items:center; gap:8px; font-size:12px; margin-bottom:6px; cursor:pointer;";
            
            const isAdmin = isAdminUser(user);
            const adminBadge = isAdmin ? '👑 ' : '';

            item.innerHTML = `
                <input type="checkbox" value="${escapeHtml(user.id)}" data-name="${escapeHtml(user.name)}" class="create-room-friend-checkbox">
                <span>${adminBadge}${escapeHtml(user.name)} (@${escapeHtml(user.id)})</span>
            `;
            listEl.appendChild(item);
        });

        if (count === 0) {
            listEl.innerHTML = '<div style="font-size:12px; color:#888; text-align:center;">같은 그룹에 초대 가능한 팀원이 없습니다.</div>';
        }
    });
}

async function createRoomWithFriends() {
    const titleInput = document.getElementById('new-room-title');
    const pwInput = document.getElementById('new-room-password');

    const roomTitle = titleInput?.value.trim();
    const roomPassword = pwInput?.value.trim();

    if (!roomTitle) return alert("대화방 이름을 입력해 주세요.");

    const checkedBoxes = document.querySelectorAll('.create-room-friend-checkbox:checked');
    const myId = currentUser ? currentUser.id : 'unknown';
    const myName = currentUser ? currentUser.name : '사용자';

    const membersObj = {};
    const membersInfoObj = {};

    membersObj[myId] = true;
    membersInfoObj[myId] = myName;

    checkedBoxes.forEach(box => {
        const userId = box.value;
        const userName = box.getAttribute('data-name') || userId;
        membersObj[userId] = true;
        membersInfoObj[userId] = userName;
    });

    try {
        const now = Date.now();
        const newRoomRef = database.ref('rooms').push();
        let hashedPw = roomPassword ? await sha256(roomPassword) : null;

        const roomData = {
            title: roomTitle,
            createdBy: myId,
            creatorName: myName,
            createdAt: now,
            lastMessage: "대화방이 생성되었습니다.",
            lastTimestamp: now,
            members: membersObj,
            membersInfo: membersInfoObj,
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
        loadChatRooms();
    } catch (error) {
        console.error("방 생성 실패:", error);
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

    if (modal.classList.contains('hidden')) {
        modal.classList.remove('hidden');
        listenSharedSchedules();
    } else {
        modal.classList.add('hidden');
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
            listEl.innerHTML = '<div style="text-align:center; padding:30px; color:#888; font-size:12px;">등록된 공유 일정이 없습니다.</div>';
            return;
        }

        snapshot.forEach((child) => {
            const sched = child.val();
            const schedId = child.key;

            const item = document.createElement('div');
            item.style = "display:flex; justify-content:space-between; align-items:center; background:white; padding:8px 10px; border-radius:6px; border:1px solid #ddd; margin-bottom:6px;";
            item.innerHTML = `
                <div>
                    <div style="font-weight:600; color:#333; font-size:13px;">${escapeHtml(sched.title)}</div>
                    <div style="font-size:11px; color:#666; margin-top:2px;">
                        <i class="fa-regular fa-calendar" style="margin-right:4px;"></i>${escapeHtml(sched.date)} 
                        <span style="margin-left:6px; color:#3182CE;">by ${escapeHtml(sched.creatorName)}</span>
                    </div>
                </div>
                <button onclick="deleteSharedSchedule('${schedId}')" style="background:none; border:none; color:#E53E3E; cursor:pointer; font-size:12px; padding:4px;"><i class="fa-regular fa-trash-can"></i></button>
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
// 🔲 모달 및 UI 제어 함수
// ==========================================

function toggleFindAccountModal() {
    const modal = document.getElementById('find-account-modal');
    if (modal) modal.style.display = (modal.style.display === 'flex') ? 'none' : 'flex';
}

function openImageViewer(src) {
    const modal = document.getElementById('image-viewer-modal');
    const img = document.getElementById('image-viewer-img');
    if (modal && img) {
        img.src = src;
        modal.style.display = 'flex';
    } else {
        window.open(src, '_blank');
    }
}

function closeImageViewer() {
    const modal = document.getElementById('image-viewer-modal');
    if (modal) modal.style.display = 'none';
}

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
    if (!currentUser) return alert("로그인이 필요합니다.");

    const newPw = document.getElementById('new-password-input')?.value.trim();
    const confirmPw = document.getElementById('new-password-confirm')?.value.trim();

    if (!newPw || !confirmPw) return alert("새 비밀번호를 입력해 주세요.");
    if (newPw !== confirmPw) return alert("새 비밀번호가 일치하지 않습니다.");
    if (newPw.length < 4) return alert("비밀번호는 최소 4자리 이상이어야 합니다.");

    try {
        const hashedPw = await sha256(newPw);
        await database.ref(`users/${currentUser.id}`).update({ password: hashedPw });
        currentUser.password = hashedPw;

        alert("비밀번호가 성공적으로 변경되었습니다!");
        toggleChangePwModal();
    } catch (error) {
        console.error("비밀번호 변경 오류:", error);
    }
}

// ==========================================
// 👑 관리자 센터
// ==========================================

function openSettingsOrAdmin() {
    if (!currentUser) return alert("로그인이 필요합니다.");
    if (isAdminUser(currentUser)) {
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

    if (isHidden) switchAdminTab('users');
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

    listEl.innerHTML = '<div style="text-align:center; padding:15px; color:#888;">회원 목록 불러오는 중...</div>';

    database.ref('users').once('value', (snapshot) => {
        listEl.innerHTML = '';
        if (!snapshot.exists()) {
            listEl.innerHTML = '<div style="text-align:center; padding:15px; color:#888;">등록된 회원이 없습니다.</div>';
            return;
        }

        snapshot.forEach((child) => {
            const user = child.val();
            const isMe = currentUser && user.id === currentUser.id;
            const isTargetAdmin = isAdminUser(user);
            const userGroup = user.groupId || 'etc';

            const item = document.createElement('div');
            item.style = "display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #EDF2F7; font-size:12px;";
            
            item.innerHTML = `
                <div>
                    <span style="font-weight:600; color:#2D3748;">${isTargetAdmin ? '👑 ' : ''}${escapeHtml(user.name)}</span>
                    <span style="font-size:10px; color:#A0AEC0;">(@${escapeHtml(user.id)})</span>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <select onchange="changeUserGroup('${escapeJsStr(user.id)}', this.value)" style="padding:3px 5px; font-size:11px; border-radius:4px; border:1px solid #CBD5E0; background:#fff; color:#4A5568;">
                        <option value="company" ${userGroup === 'company' ? 'selected' : ''}>🏢 회사</option>
                        <option value="family" ${userGroup === 'family' ? 'selected' : ''}>🏠 가족</option>
                        <option value="friends" ${userGroup === 'friends' ? 'selected' : ''}>🎓 친구</option>
                        <option value="etc" ${userGroup === 'etc' ? 'selected' : ''}>🌐 기타</option>
                    </select>

                    ${(isMe || isTargetAdmin) 
                        ? '<span style="font-size:10px; color:#CBD5E0;">(본인/관리자)</span>' 
                        : `<button onclick="adminKickUser('${escapeJsStr(user.id)}', '${escapeJsStr(user.name)}')" style="background:#FFF5F5; color:#E53E3E; border:1px solid #FEB2B2; padding:3px 6px; border-radius:4px; font-size:11px; cursor:pointer;">🚫 강퇴</button>`
                    }
                </div>
            `;
            listEl.appendChild(item);
        });
    });
}

async function adminKickUser(targetUserId, targetUserName) {
    if (!confirm(`정말로 [${targetUserName}] 계정을 삭제하시겠습니까?`)) return;
    try {
        await database.ref(`users/${targetUserId}`).remove();
        alert(`[${targetUserName}] 계정이 삭제되었습니다.`);
        loadAdminUsersList();
    } catch (error) {
        console.error("계정 삭제 오류:", error);
    }
}

function loadAdminRoomsList() {
    const listEl = document.getElementById('admin-tab-rooms');
    if (!listEl) return;

    database.ref('rooms').once('value', (snapshot) => {
        listEl.innerHTML = '';
        if (!snapshot.exists()) return listEl.innerHTML = '<div style="text-align:center; padding:15px; color:#888;">개설된 대화방이 없습니다.</div>';

        snapshot.forEach((child) => {
            const room = child.val();
            const roomId = child.key;

            const item = document.createElement('div');
            item.style = "display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid #EDF2F7; font-size:12px;";
            item.innerHTML = `
                <div style="overflow:hidden; padding-right:8px;">
                    <div style="font-weight:600; color:#2D3748; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(room.title || '1:1 대화방')}</div>
                </div>
                <button onclick="adminDeleteRoom('${roomId}', '${escapeJsStr(room.title || '대화방')}')" style="background:#FFF5F5; color:#E53E3E; border:1px solid #FEB2B2; padding:3px 6px; border-radius:4px; font-size:11px; cursor:pointer;">
                    🗑️ 폐쇄
                </button>
            `;
            listEl.appendChild(item);
        });
    });
}

async function adminDeleteRoom(roomId, roomTitle) {
    if (!confirm(`[${roomTitle}] 대화방을 강제로 폐쇄하시겠습니까?`)) return;
    try {
        await database.ref(`messages/${roomId}`).remove();
        await database.ref(`rooms/${roomId}`).remove();
        alert("대화방이 강제 폐쇄되었습니다.");
        loadAdminRoomsList();
        loadChatRooms();
    } catch (error) {
        console.error("대화방 삭제 오류:", error);
    }
}

// ==========================================
// 🔔 푸시 알림 & 대화방 초대
// ==========================================

let messaging = null;
try { messaging = firebase.messaging(); } catch (e) {}

async function requestPushNotificationPermission() {
    if (!messaging || !currentUser) return;
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
            const token = await messaging.getToken({ serviceWorkerRegistration: registration });
            if (token) {
                await database.ref(`users/${currentUser.id}/pushToken`).set(token);
            }
        }
    } catch (error) {
        console.error("푸시 알림 오류:", error);
    }
}

function toggleInviteMemberModal() {
    const modal = document.getElementById('invite-member-modal');
    if (!modal || !currentRoomId) return;

    const isHidden = modal.style.display === 'none' || modal.style.display === '';
    modal.style.display = isHidden ? 'flex' : 'none';

    if (isHidden) loadFriendsToInvite();
}

async function loadFriendsToInvite() {
    const listEl = document.getElementById('invite-friends-list');
    if (!listEl) return;
    listEl.innerHTML = '<div style="font-size:12px; color:#888; text-align:center;">목록 불러오는 중...</div>';

    try {
        const roomSnap = await database.ref(`rooms/${currentRoomId}`).once('value');
        if (!roomSnap.exists()) return;
        const room = roomSnap.val();
        const currentMembers = room.membersInfo || room.members || {};

        const usersSnap = await database.ref('users').once('value');
        listEl.innerHTML = '';

        if (!usersSnap.exists()) return;

        let count = 0;
        usersSnap.forEach((child) => {
            const user = child.val();
            const isAlreadyMember = Array.isArray(currentMembers) 
                ? currentMembers.includes(user.id) 
                : !!currentMembers[user.id];

            if (!isAlreadyMember) {
                count++;
                const item = document.createElement('label');
                item.style = "display:flex; align-items:center; gap:8px; font-size:12px; margin-bottom:6px; cursor:pointer;";
                item.innerHTML = `
                    <input type="checkbox" class="invite-friend-checkbox" value="${escapeHtml(user.id)}" data-name="${escapeHtml(user.name)}">
                    <span>${escapeHtml(user.name)} (@${escapeHtml(user.id)})</span>
                `;
                listEl.appendChild(item);
            }
        });

        if (count === 0) {
            listEl.innerHTML = '<div style="font-size:12px; color:#888; text-align:center;">모든 팀원이 대화방에 있습니다.</div>';
        }
    } catch (err) {
        console.error("초대 목록 로딩 오류:", err);
    }
}

async function inviteSelectedFriends() {
    if (!currentRoomId || !currentUser) return;

    const checkedBoxes = document.querySelectorAll('.invite-friend-checkbox:checked');
    if (checkedBoxes.length === 0) return alert("초대할 팀원을 선택해 주세요.");

    try {
        const roomRef = database.ref(`rooms/${currentRoomId}`);
        const invitedNames = [];
        const updateMembersInfo = {};

        checkedBoxes.forEach(box => {
            const userId = box.value;
            const userName = box.getAttribute('data-name');
            updateMembersInfo[`membersInfo/${userId}`] = userName;
            updateMembersInfo[`members/${userId}`] = true;
            invitedNames.push(userName);
        });

        await roomRef.update(updateMembersInfo);

        const namesStr = invitedNames.join(', ');
        await database.ref(`messages/${currentRoomId}`).push({
            senderId: 'system',
            senderName: '시스템',
            text: `📢 [${currentUser.name}]님이 [${namesStr}]님을 초대했습니다.`,
            timestamp: Date.now()
        });

        alert(`${invitedNames.length}명의 팀원을 초대했습니다!`);
        toggleInviteMemberModal();
    } catch (error) {
        console.error("친구 초대 실패:", error);
    }
}

// ==========================================
// 📩 팀원 초대 링크 생성 & 검증 (Admin 전용)
// ==========================================

async function generateInviteLink() {
    if (!currentUser) return alert("로그인이 필요합니다.");

    if (!isAdminUser(currentUser)) {
        return alert("초대 링크 생성을 위한 관리자 권한이 없습니다.");
    }

    try {
        const selectedGroup = document.getElementById('invite-group-select')?.value || 'etc';
        
        const groupNames = { company: '회사', family: '가족', friends: '친구', etc: '기타' };
        const groupLabel = groupNames[selectedGroup] || '기타';

        const randomCode = Math.random().toString(36).substring(2, 10).toUpperCase();
        const inviteCode = `INV-${randomCode}`;

        await database.ref(`invites/${inviteCode}`).set({
            code: inviteCode,
            groupId: selectedGroup,
            createdBy: currentUser.id,
            createdAt: Date.now(),
            isUsed: false
        });

        const baseUrl = window.location.origin + window.location.pathname;
        const inviteUrl = `${baseUrl}?invite=${inviteCode}`;

        await navigator.clipboard.writeText(inviteUrl);
        alert(`🎉 [${groupLabel}] 그룹 초대 링크가 복사되었습니다!\n\n📌 초대 코드: ${inviteCode}\n🏷️ 소속 그룹: ${groupLabel}\n🔗 초대 링크: ${inviteUrl}`);

    } catch (error) {
        console.error("초대 링크 생성 오류:", error);
        alert("초대 링크 생성 실패: 데이터베이스 연결을 확인해 주세요.");
    }
}

function checkInviteUrlParam() {
    const urlParams = new URLSearchParams(window.location.search);
    const inviteCode = urlParams.get('invite');

    if (inviteCode) {
        const inviteInput = document.getElementById('reg-invite-code');
        if (inviteInput) {
            inviteInput.value = inviteCode;
        }
        switchScreen('register-screen');
        alert(`💌 초대 코드가 자동으로 입력되었습니다! (${inviteCode})\n비밀번호와 이름을 입력해 주세요.`);
    }
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', checkInviteUrlParam);
} else {
    checkInviteUrlParam();
}

async function changeUserGroup(targetUserId, newGroup) {
    if (!currentUser) return;
    
    if (!isAdminUser(currentUser)) return alert("권한이 없습니다.");

    try {
        await database.ref(`users/${targetUserId}`).update({
            groupId: newGroup
        });

        const groupNames = { company: '회사', family: '가족', friends: '친구', etc: '기타' };
        alert(`✅ @${targetUserId} 님의 그룹이 [${groupNames[newGroup]}] (으)로 변경되었습니다.`);

        if (typeof loadFriendsList === 'function') loadFriendsList();
    } catch (error) {
        console.error("그룹 변경 오류:", error);
        alert("그룹 변경 실패: 데이터베이스 연결을 확인해 주세요.");
    }
}
