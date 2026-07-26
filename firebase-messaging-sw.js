// Firebase SDK 스크립트 불러오기 (v8 버전)
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

// 📌 index.html 과 동일한 실제 Firebase 설정값
const firebaseConfig = {
  apiKey: "AIzaSyDfACFo9nn2MaJusjlII9y6Wj6QIGuf65g", // 👈 index.html에 적힌 실제 API Key를 넣어주세요!
  authDomain: "my-team-chat-2712e.firebaseapp.com",
  databaseURL: "https://my-team-chat-2712e-default-rtdb.firebaseio.com",
  projectId: "my-team-chat-2712e",
  storageBucket: "my-team-chat-2712e.firebasestorage.app",
  messagingSenderId: "929450247074",
  appId: "1:929450247074:web:fda396aa756800456028fb"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// 백그라운드 수신 처리
messaging.onBackgroundMessage(function(payload) {
  console.log('[Service Worker] 백그라운드 메시지 수신:', payload);

  const title = payload.notification?.title || payload.data?.title || '팀 메신저 알림';
  const options = {
    body: payload.notification?.body || payload.data?.body || '새로운 메시지가 도착했습니다.',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png'
  };

  return self.registration.showNotification(title, options);
});

// 알림 클릭 시 앱으로 이동
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});
