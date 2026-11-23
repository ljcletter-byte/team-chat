"""가족메신저 화면 시험 (가짜 Firebase 사용, 실제 서버 접속 없음)

실행: python3 -I tests/run_tests.py
필요: pip install playwright && python3 -m playwright install chromium
"""
import hashlib
import json
import mimetypes
import pathlib
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
TESTS = ROOT / "tests"
BASE = "https://app.test/team-chat/"
FAKE_FB = (TESTS / "fake-firebase.js").read_text(encoding="utf-8")
PW = "test1234"
PW_HASH = hashlib.sha256(PW.encode()).hexdigest()
NOW = int(time.time() * 1000)

# ---- 가짜 데이터 (실제 사람·대화 아님) ----
def seed():
    def user(uid, name, group, role="member"):
        return {"id": uid, "name": name, "password": PW_HASH, "role": role, "groupId": group, "createdAt": NOW - 9_000_000}
    return {
        "users": {
            "tester1": user("tester1", "가짜엄마", "family"),
            "tester2": user("tester2", "가짜아빠", "family"),
            "tester3": user("tester3", "가짜동생", "family"),
            "boss": user("boss", "가짜관리자", "family", role="admin"),
        },
        "rooms": {
            "-Room0001": {
                "title": "가짜 가족방", "createdBy": "tester2", "creatorName": "가짜아빠",
                "createdAt": NOW - 8_000_000, "lastMessage": "안녕", "lastTimestamp": NOW - 1000,
                "members": {"tester1": True, "tester2": True, "tester3": True},
                "membersInfo": {"tester1": "가짜엄마", "tester2": "가짜아빠", "tester3": "가짜동생"},
                # tester3은 나중에 들어와서 그 전 메시지는 보지 못합니다
                "membersJoinedAt": {"tester1": NOW - 8_000_000, "tester2": NOW - 8_000_000, "tester3": NOW - 2500},
                "readStatus": {"tester1": NOW - 7_000_000},
            },
        },
        "messages": {
            "-Room0001": {
                "-A0001": {"senderId": "tester2", "senderName": "가짜아빠", "text": "옛날 메시지", "timestamp": NOW - 5_000_000},
                "-A0002": {"senderId": "tester2", "senderName": "가짜아빠", "text": "안녕", "timestamp": NOW - 1000},
            }
        },
    }


INIT_SCRIPT = """
window.__alerts = [];
window.alert = (m) => { window.__alerts.push(String(m)); };
window.confirm = () => true;
window.__notifications = [];
class FakeNotification { constructor(t, o) { window.__notifications.push(t); } }
FakeNotification.permission = 'granted';
FakeNotification.requestPermission = () => Promise.resolve('granted');
window.Notification = FakeNotification;
try {
  const fakeReg = { showNotification: (t) => { window.__notifications.push(t); return Promise.resolve(); } };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
    register: () => Promise.resolve(fakeReg), ready: Promise.resolve(fakeReg) } });
} catch (e) {}
window.Audio = function () { return { play: () => Promise.resolve(), volume: 1 }; };
try { navigator.clipboard.writeText = () => Promise.resolve(); } catch (e) {}
"""

results = []
outside_requests = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("  통과  " if ok else "  실패  ") + name + (f"  ({detail})" if detail and not ok else ""))


def new_page(browser, db=None):
    ctx = browser.new_context(service_workers="block", viewport={"width": 1000, "height": 720})
    db_json = json.dumps(db if db is not None else seed(), ensure_ascii=False)
    ctx.add_init_script(INIT_SCRIPT + f"\nwindow.__FAKE_DB__ = {db_json};")

    def handle(route):
        url = route.request.url
        if url.startswith("https://www.gstatic.com/firebasejs/8.10.1/"):
            body = FAKE_FB if url.endswith("firebase-app.js") else "/* fake */"
            return route.fulfill(status=200, body=body, content_type="application/javascript")
        if url.startswith(BASE):
            rel = url[len(BASE):].split("?")[0].split("#")[0] or "index.html"
            f = (ROOT / rel).resolve()
            if ROOT in f.parents and f.is_file():
                ctype = mimetypes.guess_type(str(f))[0] or "application/octet-stream"
                return route.fulfill(status=200, body=f.read_bytes(), content_type=ctype)
            return route.fulfill(status=404, body="not found")
        if url.startswith("data:"):
            return route.continue_()
        outside_requests.append(url)
        return route.abort()

    ctx.route("**/*", handle)
    page = ctx.new_page()
    page.__errors = []
    page.on("pageerror", lambda e: page.__errors.append(str(e)))
    return ctx, page


def login(page, uid, url=BASE):
    page.goto(url)
    page.fill("#login-id", uid)
    page.fill("#login-pw", PW)
    page.evaluate("handleLogin()")
    page.wait_for_selector("#main-layout", state="visible")
    page.wait_for_timeout(300)


def enter_room(page, room_id="-Room0001"):
    page.click(f"#room-item-{room_id}")
    page.wait_for_selector("#active-chat-view", state="visible")
    page.wait_for_timeout(300)


def send(page, text):
    page.fill("#chat-input-text", text)
    page.evaluate("sendTextMessage()")
    page.wait_for_timeout(200)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()

        print("[1] 로그인과 대화")
        ctx, page = new_page(browser)
        page.goto(BASE)
        page.fill("#login-id", "tester1"); page.fill("#login-pw", "wrong")
        page.evaluate("handleLogin()"); page.wait_for_timeout(200)
        check("틀린 비밀번호는 거절", any("일치하지" in a for a in page.evaluate("window.__alerts")))
        login(page, "tester1")
        check("로그인 후 이름 표시", "가짜엄마" in page.inner_text("#current-user-display"))
        check("방 목록에 가족방 표시", page.locator("#room-item--Room0001").count() == 1)
        badge = page.inner_text("#room-item--Room0001")
        check("안 읽은 수 2 표시", page.inner_text('#room-item--Room0001 span[style*="E53E3E"]') == "2", badge)
        page.evaluate("database.ref('messages/-Room0001').push({senderId:'tester2', senderName:'가짜아빠', text:'하나 더', timestamp: Date.now()}).then(()=>database.ref('rooms/-Room0001').update({lastMessage:'하나 더', lastTimestamp: Date.now()}))")
        page.wait_for_timeout(400)
        badge = page.inner_text("#room-item--Room0001")
        check("새 메시지가 오면 안 읽은 수 3으로 늘어남", page.inner_text('#room-item--Room0001 span[style*="E53E3E"]') == "3", badge)
        enter_room(page)
        check("메시지 보임", "안녕" in page.inner_text("#msg-box"))
        check("방에 들어가면 안 읽은 수가 사라짐",
              page.locator('#room-item--Room0001 span[style*="E53E3E"]').count() == 0)
        page.evaluate("""database.ref('messages/-Room0001').push({senderId:'tester2', senderName:'가짜아빠', type:'image',
            imageUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            timestamp: Date.now()})""")
        page.wait_for_timeout(300)
        page.locator("#msg-box img").last.click()
        page.wait_for_timeout(100)
        check("사진을 누르면 크게 보기", page.evaluate("getComputedStyle(document.getElementById('image-viewer-modal')).display") != "none")
        page.evaluate("closeImageViewer()")
        send(page, "가짜 테스트 메시지")
        check("보낸 메시지 보임", "가짜 테스트 메시지" in page.inner_text("#msg-box"))
        db = page.evaluate("__fakeDump()")
        check("방의 마지막 메시지 갱신", db["rooms"]["-Room0001"]["lastMessage"] == "가짜 테스트 메시지")
        check("화면 오류 없음", not page.__errors, "; ".join(page.__errors))
        ctx.close()

        print("[2] 위험한 글자가 든 메시지·이름")
        evil = seed()
        evil["users"]["tester2"]["name"] = "아빠');window.__pwned='name';//"
        evil["messages"]["-Room0001"]["-A0003"] = {
            "senderId": "tester2", "senderName": "아빠');window.__pwned='name2';//",
            "text": "'); window.__pwned='text'; //", "timestamp": NOW - 500}
        evil["messages"]["-Room0001"]["-A0004"] = {
            "senderId": "tester2", "senderName": "가짜아빠", "type": "file", "fileName": "a.txt",
            "fileData": "javascript:void(window.__pwned='file')", "timestamp": NOW - 400}
        evil["messages"]["-Room0001"]["-A0005"] = {
            "senderId": "tester2", "senderName": "가짜아빠", "type": "image",
            "imageUrl": "x\" onerror=\"window.__pwned='img'", "timestamp": NOW - 300}
        evil["rooms"]["-Room0001"]["title"] = "방'); window.__pwned='room'; //"
        ctx, page = new_page(browser, evil)
        page.on("dialog", lambda d: d.accept())
        login(page, "tester1")
        enter_room(page)
        page.wait_for_timeout(300)
        check("사진 주소로 코드가 실행되지 않음", page.evaluate("window.__pwned") is None, str(page.evaluate("window.__pwned")))
        for btn in page.locator("#msg-box button", has_text="답장").all():
            btn.click()
        page.wait_for_timeout(200)
        links = page.locator("#msg-box a[download]")
        hrefs = [links.nth(i).get_attribute("href") or "" for i in range(links.count())]
        if links.count():
            links.first.click()
            page.wait_for_timeout(200)
        check("답장·파일 버튼을 눌러도 코드가 실행되지 않음", page.evaluate("window.__pwned") is None, str(page.evaluate("window.__pwned")))
        check("파일 링크에 javascript: 주소가 들어가지 않음", not any(h.strip().lower().startswith("javascript") for h in hrefs), str(hrefs))
        page.locator("#msg--A0003 button", has_text="답장").click()
        page.wait_for_timeout(100)
        reply = page.evaluate("document.getElementById('reply-preview-text') && document.getElementById('reply-preview-text').innerText")
        check("답장 미리보기에 원래 글자가 그대로 보임", reply and "window.__pwned='text'" in reply, str(reply))
        # 관리자 화면의 강퇴·폐쇄 버튼
        ctx.close()
        ctx, page = new_page(browser, evil)
        login(page, "boss")
        page.evaluate("toggleAdminModal()"); page.wait_for_timeout(300)
        page.evaluate("window.confirm = () => false")
        for btn in page.locator("#admin-tab-users button").all():
            btn.click()
        page.evaluate("switchAdminTab('rooms')"); page.wait_for_timeout(300)
        for btn in page.locator("#admin-tab-rooms button").all():
            btn.click()
        page.evaluate("toggleAdminModal()")
        page.evaluate("switchSidebarTab('friends')"); page.wait_for_timeout(300)
        page.evaluate("window.confirm = () => false")
        check("관리자 화면에서도 실행되지 않음", page.evaluate("window.__pwned") is None, str(page.evaluate("window.__pwned")))
        check("화면 오류 없음", not page.__errors, "; ".join(page.__errors))
        ctx.close()

        print("[3] 방 목록 읽기 횟수")
        ctx, page = new_page(browser)
        login(page, "tester1")
        for _ in range(3):
            page.evaluate("switchSidebarTab('friends')"); page.wait_for_timeout(100)
            page.evaluate("switchSidebarTab('chats')"); page.wait_for_timeout(200)
        enter_room(page)
        page.wait_for_timeout(300)
        before = page.evaluate("window.__fakeStats.reads['once:messages/*'] || 0")
        # 다른 사람이 글자를 입력 중이라는 표시가 10번 바뀜
        for i in range(10):
            page.evaluate("database.ref('rooms/-Room0001/typing/tester2').set(" + ("'가짜아빠'" if i % 2 == 0 else "null") + ")")
            page.wait_for_timeout(30)
        page.wait_for_timeout(300)
        after = page.evaluate("window.__fakeStats.reads['once:messages/*'] || 0")
        check("입력 중 표시만 바뀔 때 메시지 전체를 다시 읽지 않음", after - before == 0, f"{after - before}번 더 읽음")
        listeners = page.evaluate("window.__fakeStats.listeners")
        check("탭을 여러 번 바꿔도 듣기가 쌓이지 않음 (전체 4개 이하)", listeners <= 4, f"듣기 {listeners}개")
        before = page.evaluate("window.__fakeStats.reads['once:messages/*'] || 0")
        page.evaluate("database.ref('messages/-Room0001').push({senderId:'tester2', senderName:'가짜아빠', text:'새 글', timestamp: Date.now()}).then(()=>database.ref('rooms/-Room0001').update({lastMessage:'새 글', lastTimestamp: Date.now()}))")
        page.wait_for_timeout(500)
        check("새 메시지는 방 목록에 반영", "새 글" in page.inner_text("#chat-list"))
        check("새 메시지가 오면 알림", len(page.evaluate("window.__notifications")) >= 1)
        check("화면 오류 없음", not page.__errors, "; ".join(page.__errors))
        ctx.close()

        print("[4] 나중에 들어온 사람")
        ctx, page = new_page(browser)
        login(page, "tester3")
        item = page.inner_text("#room-item--Room0001")
        red = page.locator('#room-item--Room0001 span[style*="E53E3E"]')
        check("들어오기 전 메시지는 안 읽은 수에 넣지 않음", red.count() == 1 and red.inner_text() == "1", item)
        enter_room(page)
        box = page.inner_text("#msg-box")
        check("들어오기 전 메시지는 보이지 않음", "옛날 메시지" not in box and "안녕" in box, box)
        ctx.close()

        print("[5] 초대 링크로 가입")
        db = seed()
        db["invites"] = {"INV-FAKE0001": {"code": "INV-FAKE0001", "groupId": "friends", "createdBy": "boss", "createdAt": NOW, "isUsed": False}}
        ctx, page = new_page(browser, db)
        page.goto(BASE + "?invite=INV-FAKE0001")
        page.wait_for_selector("#register-screen", state="visible")
        check("초대 코드 자동 입력", page.input_value("#reg-invite-code") == "INV-FAKE0001")
        page.fill("#reg-id", "newbie"); page.fill("#reg-pw", PW); page.fill("#reg-name", "가짜새친구")
        page.evaluate("handleRegisterWithCode()"); page.wait_for_timeout(300)
        d = page.evaluate("__fakeDump()")
        check("가입 + 그룹 지정", d["users"].get("newbie", {}).get("groupId") == "friends")
        check("초대 코드 사용 처리", d["invites"]["INV-FAKE0001"].get("isUsed") is True)
        page.evaluate("handleRegisterWithCode()"); page.wait_for_timeout(200)
        check("같은 아이디로 다시 가입 안 됨", "이미 존재" in page.evaluate("window.__alerts")[-1])
        ctx.close()

        print("[6] 가입 보안")
        app_js = (ROOT / "app.js").read_text(encoding="utf-8")
        check("코드 안에 공용 가입 코드가 없음", "SYSTEM_INVITE_CODE" not in app_js)

        def try_register(uid, code, name="가짜가입자"):
            db = seed()
            db["invites"] = {"INV-FAKE0002": {"code": "INV-FAKE0002", "groupId": "etc", "createdBy": "boss", "createdAt": NOW, "isUsed": False},
                             "INV-USED0003": {"code": "INV-USED0003", "groupId": "etc", "createdBy": "boss", "createdAt": NOW, "isUsed": True}}
            ctx, page = new_page(browser, db)
            page.goto(BASE)
            page.evaluate("switchScreen('register-screen')")
            page.fill("#reg-id", uid); page.fill("#reg-pw", PW); page.fill("#reg-name", name); page.fill("#reg-invite-code", code)
            page.evaluate("handleRegisterWithCode()"); page.wait_for_timeout(300)
            users = page.evaluate("__fakeDump()").get("users", {})
            alerts = page.evaluate("window.__alerts")
            ctx.close()
            return users, alerts

        users, _ = try_register("stranger", "ANYCODE")
        check("없는 초대 코드로는 가입 안 됨", "stranger" not in users)
        users, _ = try_register("stranger", "INV-USED0003")
        check("이미 쓴 초대 코드로는 가입 안 됨", "stranger" not in users)
        users, alerts = try_register("myadmin", "INV-FAKE0002")
        check("'admin'이 든 아이디는 가입 안 됨", "myadmin" not in users, str(alerts))
        users, _ = try_register("SuperAdmin1", "INV-FAKE0002")
        check("대문자 'Admin'도 가입 안 됨", "SuperAdmin1" not in users)
        users, _ = try_register("boss/password", "INV-FAKE0002")
        check("'/'가 든 아이디로 다른 사람 정보를 덮어쓰지 못함",
              users.get("boss", {}).get("password") == PW_HASH and "boss/password" not in users)
        users, _ = try_register("가짜사촌_1", "INV-FAKE0002")
        check("한글 아이디는 정상 가입", "가짜사촌_1" in users)

        # 예전부터 있던 'admin' 아이디 관리자 계정은 그대로 관리자
        db = seed()
        db["users"]["familyadmin"] = {"id": "familyadmin", "name": "가짜옛관리자", "password": PW_HASH, "groupId": "family", "createdAt": NOW}
        ctx, page = new_page(browser, db)
        login(page, "familyadmin")
        page.evaluate("openSettingsOrAdmin()"); page.wait_for_timeout(300)
        check("기존 'admin' 아이디 계정은 계속 관리자", page.is_visible("#admin-modal"))
        page.evaluate("generateInviteLink()"); page.wait_for_timeout(300)
        codes = [k for k in page.evaluate("__fakeDump()").get("invites", {})]
        check("관리자가 초대 코드를 만들 수 있음", len(codes) == 1 and codes[0].startswith("INV-") and len(codes[0]) == 14, str(codes))
        ctx.close()

        # 일반 회원은 관리자 아님
        ctx, page = new_page(browser)
        login(page, "tester1")
        page.evaluate("openSettingsOrAdmin()"); page.wait_for_timeout(200)
        check("일반 회원은 관리자 화면이 안 열림", not page.is_visible("#admin-modal"))
        ctx.close()

        browser.close()

    print("[7] 알림을 눌렀을 때 (서비스 워커)")
    out = subprocess.run(["node", str(TESTS / "sw_test.js"), str(ROOT / "firebase-messaging-sw.js")], capture_output=True, text=True)
    for line in out.stdout.strip().splitlines():
        name, _, status = line.rpartition(" ")
        check(name, status == "OK", out.stderr.strip()[:300])
    if out.returncode != 0 and not out.stdout.strip():
        check("서비스 워커 시험 실행", False, out.stderr.strip()[:300])

    check("앱 밖(실제 서버 등)으로 나간 요청 없음 — 모두 차단됨",
          not any("firebaseio" in u or "googleapis" in u for u in outside_requests),
          ", ".join(sorted(set(outside_requests))[:5]))

    failed = [r for r in results if not r[1]]
    print(f"\n결과: {len(results) - len(failed)}/{len(results)} 통과")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
