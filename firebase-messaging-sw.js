// firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

// index.html에 작성하셨던 firebaseConfig 정보와 동일하게 작성해주세요
firebase.initializeApp({
    apiKey: "AIzaSyDFACFo9nn2MajusjLIi9y6Wj6QIAGuf6Sg",
    authDomain: "my-team-chat-2712e.firebaseapp.com",
    databaseURL: "https://my-team-chat-2712e-default-rtdb.firebaseio.com",
    projectId: "my-team-chat-2712e",
    storageBucket: "my-team-chat-2712e.appspot.com",
    messagingSenderId: "929450247074",
    appId: "1:929450247074:web:fda396aa756800456028fb"
});

const messaging = firebase.messaging();

// 백그라운드 메시지 수신 시 알림 팝업 생성
messaging.onBackgroundMessage((payload) => {
    console.log('[SW] 백그라운드 메시지 수신:', payload);

// 백그라운드 메시지 수신 시 알림 팝업 생성
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] 백그라운드 메시지 수신:', payload);

  // 📌 ?. 옵셔널 체이닝으로 payload.notification이 없을 때의 에러 방지
  const notificationTitle = payload.notification?.title || payload.data?.title || '새 메시지';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || '내용이 도착했습니다.',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    data: {
      url: self.location.origin + self.location.pathname
    }
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// 📌 [추가] 상단바 푸시 알림을 터치하면 메신저 앱으로 자동 이동
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});
