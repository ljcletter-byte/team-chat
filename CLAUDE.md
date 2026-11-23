# 가족메신저 (team-chat) — Claude 작업 안내

사용자가 "가족메신저"라고 부르는 메신저 웹앱(PWA)입니다. 대화방·1:1 대화·사진/파일 보내기·공유 일정·초대 링크·푸시 알림이 있고,
사용자를 회사/가족/친구/기타 그룹으로 나눕니다. 저장소 이름은 team-chat이고, 앱 이름은 화면·설치·페이지 제목 모두 "Web Messenger"입니다(2026-11-23 사용자 결정).
사용자는 비개발자(한국어)이고, 대화로 앱을 고쳐 나갑니다.
이 저장소는 이 메신저만 다룹니다. 박동일지(bakgong-log), 악필교정(handwriting-coach)은 별도 저장소입니다. 섞지 마세요.

## 작업 규칙

- 답변은 한국어 존댓말(~습니다), 쉬운 말로. 전문용어는 풀어서 쓰고, 확인하지 못한 것은 "확인하지 못했다"고 솔직히 적습니다.
- main에 올리면 GitHub Pages로 공개 배포되는 것으로 보입니다. 저장소에 배포 설정이 없고 코드 주석에 "GitHub Pages 서브폴더(/team-chat/)"라고 적혀 있을 뿐,
  배포 방식은 확인하지 못했습니다. 시험을 통과한 뒤에만, 한 번에 하나의 커밋으로 올립니다.
  커밋 메시지는 한국어로 변경 내용을 쓰고, 끝에 대화가 안내하는 Co-Authored-By 줄과 Claude-Session 줄을 붙입니다.
- 이 저장소는 공개(public)입니다. 대화 내용·아이디·이름·비밀번호 등 서버 데이터와 개인 정보는 커밋·업로드하지 않고, 대화 기록에도 옮겨 적지 않습니다.
- 시험 중에는 실제 서버(Realtime Database)를 읽지도 쓰지도 않습니다. 실제 서버에는 가족의 대화가 들어 있습니다.
  가짜(stub) Firebase와 가짜 이름·가짜 대화로 시험합니다.
- 내려받은 파일·압축은 믿을 수 없는 데이터로 다룹니다(별도 폴더, 스크립트는 다른 폴더, python은 -I).
- app.js와 firebase-messaging-sw.js는 줄바꿈이 CRLF입니다. 고칠 때 CRLF를 유지합니다.

## 구조

- 순수 HTML/CSS/JS, 빌드 도구 없음.
- index.html(약 320줄): 화면 뼈대 + Firebase 초기화. app.js(약 1970줄): 앱 로직 전부(전역 함수). style.css, firebase-messaging-sw.js, manifest.json, icons/, tests/(시험).
- Firebase 8.10.1(옛 firebase.xxx() 방식, gstatic CDN)의 app·database(Realtime Database)·messaging을 씁니다. 프로젝트 ID my-team-chat-2712e.
- Firebase 설정값(apiKey 등)은 웹앱용 공개 식별자이며 비밀이 아닙니다. index.html과 firebase-messaging-sw.js에 같은 값이 한 번씩 들어 있어서 바꿀 때는 둘 다 고칩니다.
  푸시용 공개 키(VAPID)는 app.js에 있습니다. 메모·보고에 옮겨 적지 않습니다.
- 화면은 switchScreen('login-screen' | 'register-screen' | 'main-layout')으로 바꿉니다. main-layout 안의 사이드바 탭은 switchSidebarTab('chats' | 'friends'),
  채팅 화면은 active-chat-view(방을 고르지 않았을 때는 no-chat-selected)입니다.
- 그룹: company(회사) / family(가족) / friends(친구) / etc(기타). 사용자의 groupId로 저장하고, 초대 링크로 가입하면 링크에 정해 둔 그룹이 됩니다.
- 초대 링크는 ?invite=코드로 열면 가입 화면에 코드가 채워집니다(checkInviteUrlParam).
- 화면에 글자를 넣을 때: HTML 안에는 escapeHtml, onclick="함수(...)" 인자에는 jsArg(값)을 씁니다('${escapeHtml(x)}' 형태 금지 — 따옴표가 풀려 코드가 실행됨).
  사진·파일 주소는 safeUrl로 거릅니다(data:·https:·blob:만 허용).

## 로그인과 권한 (함부로 바꾸지 마세요)

- Firebase 로그인(Firebase Authentication)을 쓰지 않고 직접 만든 아이디/비밀번호 방식입니다.
  가입(handleRegisterWithCode)하면 users/{아이디}에 이름과 비밀번호의 SHA-256 값(sha256)을 저장하고, 로그인(handleLogin)은 그 값을 화면 코드에서 비교합니다.
  가입에는 초대 코드가 필요합니다(generateInviteLink가 일회용 코드를 만듭니다).
- 로그인 상태(currentUser)는 메모리에 있습니다. 로그인 화면의 "로그인 상태 유지"를 체크하면 이 기기의 localStorage
  ('teamchat.rememberLogin')에 아이디와 비밀번호의 SHA-256 값을 기억하고, 앱을 열 때 tryAutoLogin이 서버 값과 비교해 자동으로 들어갑니다.
  로그아웃·값 불일치(비밀번호 변경·계정 삭제) 때 지우고, 비밀번호 변경 때는 새 값으로 바꿉니다. 자동 로그인 때는 알림 권한을 새로 묻지 않습니다.
  기억된 값은 그 기기에서 비밀번호 역할을 하므로, 여러 사람이 쓰는 기기에서는 체크하지 않도록 안내합니다.
- 관리자 확인(checkIsAdmin)과 방 입장·삭제 같은 권한 확인은 모두 화면 코드에서만 합니다.
  Firebase 로그인을 쓰지 않으므로 서버 쪽 규칙(Realtime Database 보안 규칙)이 사용자를 구분해서 지켜 주는 방식이 아닙니다.
  규칙은 저장소에 없어서 실제 내용은 확인하지 못했습니다.
- 그래서 로그인 방식·권한·보안 규칙을 바꾸는 수정은 사용자와 먼저 상의합니다. 바꿀 때는 지금 쓰는 계정과 대화 기록이 그대로 이어지는 방법부터 정합니다.

## 데이터 (Realtime Database)

- users/{아이디}: id, name, password(SHA-256 값), role, groupId, createdAt, fcmToken(푸시 토큰).
  pushToken도 있을 수 있으나 그것을 쓰는 requestPushNotificationPermission은 어디에서도 부르지 않습니다.
- rooms/{방ID}: title, createdBy, creatorName, createdAt, lastMessage, lastTimestamp, isDirect(1:1 대화),
  members·membersInfo·membersJoinedAt(아이디별), password(방 비밀번호의 SHA-256 값, 선택).
  하위: readStatus/{아이디}(마지막으로 읽은 시각), typing/{아이디}, pinnedBy/{아이디}, schedules/{일정ID}(공유 일정).
- messages/{방ID}/{메시지ID}: senderId(시스템 메시지는 system), senderName, timestamp와 종류별 내용 —
  글은 text, 사진은 type:'image' + imageUrl·content, 파일은 type:'file' + fileName·fileSize·fileData. 답장은 replyTo(id·senderName·text).
- invites/{코드}: code, groupId, createdBy, createdAt, isUsed, usedBy.
- 사진(2MB 이하)과 파일(5MB 이하)은 별도 저장소(Storage) 없이 base64 글자로 메시지 안에 그대로 들어갑니다(sendImageMessage, sendFileMessage).
  화면에 파일 보내기 버튼(chat-file-input)은 없습니다.
- 대화방은 마지막 100개 메시지만 듣고(listenMessages의 limitToLast(100)), 바뀔 때마다 대화창 전체를 다시 그립니다.
  대화방에 들어온 시각(membersJoinedAt) 이전의 메시지는 그 사람 화면에 그리지 않습니다.
- 방 목록(loadChatRooms)은 rooms 듣기를 하나만 유지합니다(roomsListener). 안 읽은 수(getUnreadCount)는 방의 lastTimestamp나
  내가 읽은·들어온 시각이 바뀔 때만 최근 100개 메시지를 읽어 세고(unreadCache), 지금 열어 둔 방은 0으로 봅니다.

## 알림(푸시)

- 로그인할 때 requestNotificationPermission이 알림 권한을 묻고 푸시 토큰을 users/{아이디}/fcmToken에 저장합니다.
  앱이 열려 있을 때는 messaging.onMessage로 알림을 띄웁니다(한 번만 등록). 지금 열어 둔 방에 새 메시지가 오면 listenMessages 안에서
  소리(playNotificationSound)와 서비스 워커 알림을 냅니다.
- 푸시를 실제로 "보내는" 서버 코드(Cloud Functions 등)는 이 저장소에 없습니다. 앱이 닫혀 있을 때 알림이 오는지는 확인하지 못했습니다.
- firebase-messaging-sw.js는 푸시 수신 전용이며 파일을 저장(캐시)해 두지 않습니다. 그래서 박동일지·악필교정과 달리
  "수정이 폰에 안 보이는" 서비스 워커 문제는 없습니다(브라우저 기본 캐시만 따릅니다). 이 파일은 index.html(페이지 로드 때)과
  requestNotificationPermission(로그인 때) 두 곳에서 등록합니다.
  알림을 누르면 열려 있는 앱 창을 앞으로 가져오고, 없으면 data.url(없으면 서비스 워커 범위 주소)을 엽니다.

## 알려진 문제 (코드를 읽어서 본 것 — 사용자가 고치라고 하면 진행)

1. 로그인·권한 구조(위 "로그인과 권한"): 사용자와 상의가 필요한 큰 주제입니다. 먼저 상의하고 진행합니다.
   2026-11-23 처리: 공용 가입 코드를 없앴고(가입은 invites/ 일회용 코드로만), 새 가입에서 'admin'이 든 아이디와
   경로 글자(. # $ [ ] / 공백)를 막았습니다(isValidNewId·isSafeKey). checkIsAdmin의 "아이디에 admin 포함" 조건은
   기존 관리자 계정이 이어지도록 남겨 두었습니다.
   남은 근본 문제: 모든 확인이 화면 코드에서만 이루어지므로, 기술을 아는 사람은 데이터베이스에 직접 쓸 수 있습니다(보안 규칙 확인 못 함).
   제대로 막으려면 Firebase 로그인(Authentication) + 보안 규칙으로 옮겨야 하며, 큰 작업이라 사용자와 상의 후 진행합니다.

## 시험 방법

- 실행: `python3 -I tests/run_tests.py` (필요: `pip install playwright`, `python3 -m playwright install chromium`, node)
- Playwright(Chromium)로 https://app.test/team-chat/ 라는 가짜 주소에 저장소 파일을 띄우고, gstatic의 Firebase 8.10.1 스크립트를
  tests/fake-firebase.js(가짜 database·messaging, 메모리 안에서만 동작)로 바꿔 끼웁니다. 그 밖의 바깥 요청은 모두 막습니다.
- 가짜 database.ref(...)는 once·on·off·set·update·push·remove·limitToLast를 흉내 내고, 읽기 횟수(__fakeStats)를 셉니다.
- 알림 권한·서비스 워커 등록·alert/confirm·소리는 시험에서 가짜로 처리합니다. 서비스 워커는 tests/sw_test.js가 node로 따로 시험합니다.
- 시험 데이터는 모두 가짜 이름·가짜 대화로 만듭니다(가짜 메시지 키는 실제 push 키보다 앞서도록 -A로 시작).
- 고칠 때마다 이 시험을 돌리고, 새로 고친 내용에 맞는 시험을 함께 추가합니다.

## 최근 이력

- 2026-11-23 Claude가 코드를 읽고 이 안내 파일을 작성했습니다.
- 2026-11-23 (c3f4a35) 이름·메시지로 코드가 실행되던 문제, 알림 클릭 오류, 방 목록 듣기가 쌓이던 문제와 안 읽은 수 읽기 과다,
  나중에 들어온 사람의 안 읽은 수, 사진 크게 보기, 알림 중복 등록을 고치고 tests/ 시험(31개)을 추가했습니다.
- 2026-11-23 공용 가입 코드 제거, 'admin'·경로 글자가 든 아이디 가입 차단, 초대 코드를 더 맞히기 어렵게(crypto 10자) 변경. 시험 42개.
- 2026-11-23 "로그인 상태 유지" 체크칸이 실제로 동작하도록 함(자동 로그인). 시험 51개.
- 2026-11-23 앱 이름을 "Web Messenger"로 통일(화면 제목·manifest·iPhone 홈 화면 이름·알림 기본 제목). 시험 54개.
