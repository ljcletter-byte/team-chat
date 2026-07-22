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

    const notificationTitle = payload.notification.title || '새 메시지';
    const notificationOptions = {
        body: payload.notification.body || '내용이 도착했습니다.',
        icon: 'https://cdn-icons-png.flaticon.com/512/732/732200.png' // 푸시 아이콘
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});