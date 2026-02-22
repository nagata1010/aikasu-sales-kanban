/* ==========================================
   AIKASU Sales Manager - Application
   Firebase Firestore + Auth 対応版
   ========================================== */

// ==========================================
// Configuration
// ==========================================
const PHASES = [
    'リスト', '問い合わせ送付', 'コール中', 'アポ取得', 'アポ実施',
    '提案済み', '受注', '契約書対応中', '入金済み', 'クローズ'
];

const MEMBERS = ['阿部', '上島', '米井', '中村', '野口', '市原', '長田'];

const MEMBER_COLORS = {
    '阿部': '#005c91',
    '上島': '#0077b6',
    '米井': '#29cc6b',
    '中村': '#f5a623',
    '野口': '#e74c3c',
    '市原': '#9b59b6',
    '長田': '#2d8659'
};

// 商談種別タグ
const DEAL_TAGS = [
    '人材紹介',
    '先方イベント動員',
    '当社イベントブース出展',
    '新入社員研修',
    'RPO',
    'コンサルティング',
    'その他'
];

// 商談種別タグの色
const TAG_COLORS = {
    '人材紹介': '#005c91',
    '先方イベント動員': '#0077b6',
    '当社イベントブース出展': '#29cc6b',
    '新入社員研修': '#f5a623',
    'RPO': '#e74c3c',
    'コンサルティング': '#9b59b6',
    'その他': '#868e96'
};

// 架電結果タグ
const CALL_RESULTS = [
    '再架電', '受付NG', '担当NG', 'アポ取得', '不通', '対象外', '現アナ'
];

const CALL_RESULT_COLORS = {
    '再架電': '#0077b6',
    '受付NG': '#e67e22',
    '担当NG': '#e74c3c',
    'アポ取得': '#29cc6b',
    '不通': '#868e96',
    '対象外': '#6c757d',
    '現アナ': '#95a5a6'
};

// 許可されたメールアドレス（ここに登録されたアドレスのみログイン可能）
const ALLOWED_EMAILS_DEFAULT = [
    'abe.keisuke@aikasu.jp',
    'kamijima.nanami@aikasu.jp',
    'intern@aikasu.jp',
    'info@aikasu.jp'
];

// ==========================================
// Firebase Configuration
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyAqLLr8M8nuJ5-KAsdduyLhsOatxafOrSI",
    authDomain: "aikasu.firebaseapp.com",
    projectId: "aikasu",
    storageBucket: "aikasu.firebasestorage.app",
    messagingSenderId: "637392282004",
    appId: "1:637392282004:web:c03779d8362f9eae932f81",
    measurementId: "G-W0NG1QB30T"
};

// Firebase 初期化
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Firestore オフラインキャッシュ有効化
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
    if (err.code === 'failed-precondition') {
        console.log('複数タブでのオフライン永続化は利用不可。通常のキャッシュで動作します。');
    } else if (err.code === 'unimplemented') {
        console.log('このブラウザはオフライン永続化をサポートしていません。');
    }
});

// Firestoreコレクション参照
const dealsRef = db.collection('deals');
const activityRef = db.collection('activityLog');
const settingsRef = db.collection('settings');

// リアルタイムリスナー解除用
let unsubDeals = null;
let unsubActivity = null;
let unsubSettings = null;

// ==========================================
// State
// ==========================================
let state = {
    deals: [],
    activityLog: [],
    allowedEmails: [...ALLOWED_EMAILS_DEFAULT],
    currentUser: null,
    currentView: 'kanban',
    filterMember: 'all',
    reportPeriod: 'weekly',
    reportMember: 'all',
    editingDealId: null
};

// ==========================================
// Firestore CRUD
// ==========================================

// --- Deals ---
async function saveDealToFirestore(deal) {
    try {
        await dealsRef.doc(deal.id).set(deal);
    } catch (e) {
        console.error('Firestore deal save error:', e);
        saveStateToLocal(); // フォールバック
    }
}

async function deleteDealFromFirestore(dealId) {
    try {
        await dealsRef.doc(dealId).delete();
    } catch (e) {
        console.error('Firestore deal delete error:', e);
    }
}

// --- Activity Log ---
async function saveActivityToFirestore(activity) {
    try {
        await activityRef.doc(activity.id).set(activity);
    } catch (e) {
        console.error('Firestore activity save error:', e);
    }
}

// --- Settings (allowedEmails) ---
async function saveSettingsToFirestore() {
    try {
        await settingsRef.doc('allowedEmails').set({
            emails: state.allowedEmails,
            updatedAt: new Date().toISOString()
        });
    } catch (e) {
        console.error('Firestore settings save error:', e);
        saveStateToLocal();
    }
}

// --- リアルタイムリスナー ---
function startRealtimeListeners() {
    // 既存リスナーを解除
    stopRealtimeListeners();

    // Deals リスナー
    unsubDeals = dealsRef.onSnapshot(snapshot => {
        state.deals = [];
        snapshot.forEach(doc => {
            state.deals.push(doc.data());
        });
        // createdAt順にソート（新しい順）
        state.deals.sort((a, b) => {
            const aDate = a.createdAt || '';
            const bDate = b.createdAt || '';
            return aDate.localeCompare(bDate);
        });
        saveStateToLocal(); // ローカルバックアップ
        renderAll();
    }, err => {
        console.error('Deals listener error:', err);
        // オフライン時はローカルから読み込み
        loadStateFromLocal();
        renderAll();
    });

    // Activity Log リスナー
    unsubActivity = activityRef.orderBy('timestamp', 'desc').limit(500).onSnapshot(snapshot => {
        state.activityLog = [];
        snapshot.forEach(doc => {
            state.activityLog.push(doc.data());
        });
        // レポートビューが表示中なら更新
        if (state.currentView === 'report') renderReport();
        if (state.currentView === 'list') renderListView();
    }, err => {
        console.error('Activity listener error:', err);
    });

    // Settings リスナー
    unsubSettings = settingsRef.doc('allowedEmails').onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            state.allowedEmails = data.emails || [];
        }
        // デフォルトの許可メールを常に含める
        ALLOWED_EMAILS_DEFAULT.forEach(email => {
            if (!state.allowedEmails.includes(email)) {
                state.allowedEmails.push(email);
            }
        });
        if (state.currentView === 'settings') renderSettings();
    }, err => {
        console.error('Settings listener error:', err);
    });
}

function stopRealtimeListeners() {
    if (unsubDeals) { unsubDeals(); unsubDeals = null; }
    if (unsubActivity) { unsubActivity(); unsubActivity = null; }
    if (unsubSettings) { unsubSettings(); unsubSettings = null; }
}

// ==========================================
// LocalStorage (フォールバック / バックアップ)
// ==========================================
function saveStateToLocal() {
    try {
        const data = {
            deals: state.deals,
            activityLog: state.activityLog,
            allowedEmails: state.allowedEmails
        };
        localStorage.setItem('aikasu_sales_data', JSON.stringify(data));
    } catch (e) {
        console.error('LocalStorage save error:', e);
    }
}

function loadStateFromLocal() {
    try {
        const raw = localStorage.getItem('aikasu_sales_data');
        if (raw) {
            const data = JSON.parse(raw);
            state.deals = data.deals || [];
            state.activityLog = data.activityLog || [];
            state.allowedEmails = data.allowedEmails || [];
        }
    } catch (e) {
        console.error('Failed to load local state:', e);
    }
    ALLOWED_EMAILS_DEFAULT.forEach(email => {
        if (!state.allowedEmails.includes(email)) {
            state.allowedEmails.push(email);
        }
    });
}

// ==========================================
// 既存LocalStorageデータをFirestoreに移行
// ==========================================
async function migrateLocalDataToFirestore() {
    const raw = localStorage.getItem('aikasu_sales_data');
    if (!raw) return;

    try {
        const data = JSON.parse(raw);
        const localDeals = data.deals || [];
        const localActivity = data.activityLog || [];
        const localEmails = data.allowedEmails || [];

        if (localDeals.length === 0 && localActivity.length === 0) return;

        // Firestoreに既存データがあるかチェック
        const existingDeals = await dealsRef.limit(1).get();
        if (!existingDeals.empty) {
            console.log('Firestoreに既存データあり。移行スキップ。');
            return;
        }

        showToast('データをクラウドに移行中...', 'info');

        // バッチ書き込み（500件ずつ）
        const batchSize = 500;

        // Deals移行
        for (let i = 0; i < localDeals.length; i += batchSize) {
            const batch = db.batch();
            const chunk = localDeals.slice(i, i + batchSize);
            chunk.forEach(deal => {
                batch.set(dealsRef.doc(deal.id), deal);
            });
            await batch.commit();
        }

        // ActivityLog移行（最新500件のみ）
        const recentActivity = localActivity.slice(0, 500);
        for (let i = 0; i < recentActivity.length; i += batchSize) {
            const batch = db.batch();
            const chunk = recentActivity.slice(i, i + batchSize);
            chunk.forEach(act => {
                batch.set(activityRef.doc(act.id), act);
            });
            await batch.commit();
        }

        // Settings移行
        if (localEmails.length > 0) {
            await settingsRef.doc('allowedEmails').set({
                emails: localEmails,
                updatedAt: new Date().toISOString()
            });
        }

        showToast(`${localDeals.length}件のデータをクラウドに移行しました！`, 'success');
    } catch (e) {
        console.error('データ移行エラー:', e);
        showToast('データ移行中にエラーが発生しました', 'error');
    }
}

// ==========================================
// Utility
// ==========================================
function isMobile() {
    return window.innerWidth <= 576;
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDateTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function isOverdue(dateStr) {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date(new Date().toDateString());
}

function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

// ==========================================
// Authentication (Firebase Auth + Google)
// ==========================================

function isEmailAllowed(email) {
    if (!email) return false;
    const normalizedEmail = email.toLowerCase().trim();
    const allAllowed = [...new Set([...ALLOWED_EMAILS_DEFAULT, ...state.allowedEmails])];
    return allAllowed.includes(normalizedEmail);
}

function initAuth() {
    const loginBtn = document.getElementById('google-login-btn');
    const logoutBtn = document.getElementById('logout-btn');

    loginBtn.addEventListener('click', handleLogin);
    logoutBtn.addEventListener('click', handleLogout);

    // Firebase Auth 状態監視
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            // ログイン中
            if (!isEmailAllowed(user.email)) {
                showToast('このアカウントにはアクセス権がありません。管理者に連絡してください。', 'error');
                auth.signOut();
                showLogin();
                return;
            }
            state.currentUser = {
                name: user.displayName || user.email.split('@')[0],
                email: user.email,
                photo: user.photoURL
            };
            showApp();

            // 既存ローカルデータをFirestoreに移行
            await migrateLocalDataToFirestore();

            // リアルタイムリスナー開始
            startRealtimeListeners();
        } else {
            // 未ログイン
            state.currentUser = null;
            stopRealtimeListeners();
            showLogin();
        }
    });
}

async function handleLogin() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({
        prompt: 'select_account'
    });

    try {
        const result = await auth.signInWithPopup(provider);
        // onAuthStateChanged が処理するため、ここでは何もしなくてOK
    } catch (e) {
        console.error('Google login error:', e);
        if (e.code === 'auth/popup-closed-by-user') {
            // ユーザーがポップアップを閉じた
            return;
        }
        if (e.code === 'auth/unauthorized-domain') {
            showToast('このドメインはFirebaseで承認されていません。Firebase ConsoleのAuthenticationでドメインを追加してください。', 'error');
            return;
        }
        showToast('ログインに失敗しました: ' + (e.message || '不明なエラー'), 'error');
    }
}

async function handleLogout() {
    try {
        stopRealtimeListeners();
        await auth.signOut();
        state.currentUser = null;
        state.deals = [];
        state.activityLog = [];
        showLogin();
    } catch (e) {
        console.error('Logout error:', e);
    }
}

function showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
}

function showApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    updateUserDisplay();
    renderAll();
}

function updateUserDisplay() {
    const user = state.currentUser;
    if (!user) return;
    document.getElementById('user-name').textContent = user.name || '';
    document.getElementById('user-email').textContent = user.email || '';
    const avatar = document.getElementById('user-avatar');
    if (user.photo) {
        avatar.innerHTML = `<img src="${user.photo}" alt="">`;
    } else {
        avatar.textContent = (user.name || 'U')[0].toUpperCase();
    }
}

// ==========================================
// Navigation
// ==========================================
function initNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            switchView(view);
        });
    });

    document.querySelectorAll('.bottom-nav-item[data-view]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            switchView(view);
        });
    });

    const mobileAddBtn = document.getElementById('mobile-add-btn');
    if (mobileAddBtn) {
        mobileAddBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openDealModal();
        });
    }

    document.getElementById('mobile-menu-btn').addEventListener('click', () => {
        openSidebar();
    });

    document.getElementById('sidebar-toggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('collapsed');
    });

    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) {
        overlay.addEventListener('click', closeSidebar);
    }

    document.querySelector('.main-content').addEventListener('click', () => {
        closeSidebar();
    });
}

function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('show');
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('show');
}

function switchView(view) {
    state.currentView = view;

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const sidebarItem = document.querySelector(`.nav-item[data-view="${view}"]`);
    if (sidebarItem) sidebarItem.classList.add('active');

    document.querySelectorAll('.bottom-nav-item').forEach(n => n.classList.remove('active'));
    const bottomItem = document.querySelector(`.bottom-nav-item[data-view="${view}"]`);
    if (bottomItem) bottomItem.classList.add('active');

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');

    const titles = {
        kanban: 'カンバンボード',
        list: 'リスト表示',
        report: 'レポート',
        settings: '設定'
    };
    document.getElementById('page-title').textContent = titles[view];

    closeSidebar();

    if (view === 'report') renderReport();
    if (view === 'list') renderListView();
    if (view === 'settings') renderSettings();
}

// ==========================================
// Kanban Board
// ==========================================
function renderKanban() {
    const board = document.getElementById('kanban-board');
    board.innerHTML = '';
    const filtered = getFilteredDeals();

    PHASES.forEach(phase => {
        const col = document.createElement('div');
        col.className = 'kanban-column';
        col.dataset.phase = phase;

        const deals = filtered.filter(d => d.phase === phase);
        const phaseAmount = deals.reduce((sum, d) => sum + (d.amount || 0), 0);

        col.innerHTML = `
            <div class="column-header">
                <div class="column-header-top">
                    <span>${phase}</span>
                    <span class="count">${deals.length}</span>
                </div>
                ${phaseAmount > 0 ? `<div class="column-header-amount">¥${phaseAmount.toLocaleString()}</div>` : ''}
            </div>
            <div class="column-body" data-phase="${phase}"></div>
        `;

        const body = col.querySelector('.column-body');

        body.addEventListener('dragover', (e) => {
            e.preventDefault();
            body.classList.add('drag-over');
        });
        body.addEventListener('dragleave', () => {
            body.classList.remove('drag-over');
        });
        body.addEventListener('drop', (e) => {
            e.preventDefault();
            body.classList.remove('drag-over');
            const dealId = e.dataTransfer.getData('text/plain');
            moveDealToPhase(dealId, phase);
        });

        deals.forEach(deal => {
            body.appendChild(createDealCard(deal));
        });

        if (deals.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.innerHTML = '<p>案件なし</p>';
            body.appendChild(empty);
        }

        board.appendChild(col);
    });

    if (isMobile()) {
        renderPhaseIndicator(board);
    }
}

function renderPhaseIndicator(board) {
    const existing = document.querySelector('.phase-indicator');
    if (existing) existing.remove();

    const indicator = document.createElement('div');
    indicator.className = 'phase-indicator';
    indicator.innerHTML = PHASES.map((p, i) =>
        `<span class="phase-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></span>`
    ).join('');

    const kanbanView = document.getElementById('view-kanban');
    kanbanView.insertBefore(indicator, board);

    board.addEventListener('scroll', () => {
        const colWidth = board.scrollWidth / PHASES.length;
        const activeIndex = Math.round(board.scrollLeft / colWidth);
        indicator.querySelectorAll('.phase-dot').forEach((dot, i) => {
            dot.classList.toggle('active', i === activeIndex);
        });
    });

    indicator.querySelectorAll('.phase-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            const index = parseInt(dot.dataset.index);
            const colWidth = board.scrollWidth / PHASES.length;
            board.scrollTo({ left: colWidth * index, behavior: 'smooth' });
        });
    });
}

function createDealCard(deal) {
    const card = document.createElement('div');
    card.className = 'deal-card';
    card.draggable = true;
    card.dataset.id = deal.id;

    card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', deal.id);
        card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
    });

    let html = `
        <div class="deal-card-company">
            <span>${escapeHtml(deal.company)}</span>
            <button class="card-menu-btn" onclick="openDealModal('${deal.id}')" title="編集">
                <i class="fas fa-pen"></i>
            </button>
        </div>
        <span class="deal-card-member" style="background:${MEMBER_COLORS[deal.member] || '#005c91'}">${escapeHtml(deal.member)}</span>
    `;

    // 商談種別タグ表示
    if (deal.tags && deal.tags.length > 0) {
        html += `<div class="deal-card-tags">${deal.tags.map(t =>
            `<span class="deal-tag" style="background:${TAG_COLORS[t] || '#868e96'}">${escapeHtml(t)}</span>`
        ).join('')}</div>`;
    }

    // 架電結果タグ表示
    if (deal.callResult) {
        html += `<div class="deal-card-call-result"><span class="call-result-tag" style="background:${CALL_RESULT_COLORS[deal.callResult] || '#868e96'}"><i class="fas fa-phone-alt"></i> ${escapeHtml(deal.callResult)}</span></div>`;
    }

    let infoHtml = '';
    if (deal.contact) infoHtml += `<div><i class="fas fa-user"></i> ${escapeHtml(deal.contact)}</div>`;
    if (deal.phone) infoHtml += `<div><i class="fas fa-phone"></i> ${escapeHtml(deal.phone)}</div>`;
    if (infoHtml) html += `<div class="deal-card-info">${infoHtml}</div>`;

    if (deal.amount && deal.amount > 0) {
        html += `<div class="deal-card-amount">¥${Number(deal.amount).toLocaleString()}</div>`;
    }

    if (deal.nextAction) {
        const overdue = isOverdue(deal.nextDate);
        html += `
            <div class="deal-card-action ${overdue ? 'overdue' : ''}">
                <i class="fas fa-${overdue ? 'exclamation-circle' : 'clock'}"></i>
                ${deal.nextDate ? formatDate(deal.nextDate) + ' ' : ''}${escapeHtml(deal.nextAction)}
            </div>
        `;
    }

    // メモ表示（先頭40文字まで）
    if (deal.notes) {
        const truncated = deal.notes.length > 40 ? deal.notes.substring(0, 40) + '…' : deal.notes;
        html += `<div class="deal-card-memo"><i class="fas fa-sticky-note"></i> ${escapeHtml(truncated)}</div>`;
    }

    const currentIndex = PHASES.indexOf(deal.phase);
    const hasPrev = currentIndex > 0;
    const hasNext = currentIndex < PHASES.length - 1;
    html += `
        <div class="deal-card-mobile-actions">
            <button class="mobile-phase-btn prev ${hasPrev ? '' : 'disabled'}"
                    onclick="event.stopPropagation(); ${hasPrev ? `moveDealToPhase('${deal.id}', '${PHASES[currentIndex - 1]}')` : ''}"
                    ${hasPrev ? '' : 'disabled'}>
                <i class="fas fa-chevron-left"></i> ${hasPrev ? escapeHtml(PHASES[currentIndex - 1]) : ''}
            </button>
            <button class="mobile-phase-btn next ${hasNext ? '' : 'disabled'}"
                    onclick="event.stopPropagation(); ${hasNext ? `moveDealToPhase('${deal.id}', '${PHASES[currentIndex + 1]}')` : ''}"
                    ${hasNext ? '' : 'disabled'}>
                ${hasNext ? escapeHtml(PHASES[currentIndex + 1]) : ''} <i class="fas fa-chevron-right"></i>
            </button>
        </div>
    `;

    card.innerHTML = html;

    card.addEventListener('dblclick', () => openDealModal(deal.id));
    card.addEventListener('click', (e) => {
        if (e.target.closest('.card-menu-btn') || e.target.closest('.mobile-phase-btn')) return;
        if (isMobile()) openDealModal(deal.id);
    });

    return card;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function moveDealToPhase(dealId, newPhase) {
    const deal = state.deals.find(d => d.id === dealId);
    if (!deal || deal.phase === newPhase) return;

    const oldPhase = deal.phase;
    deal.phase = newPhase;
    deal.updatedAt = new Date().toISOString();

    const activity = {
        id: generateId(),
        dealId: deal.id,
        message: `${deal.company}: ${oldPhase} → ${newPhase}`,
        member: deal.member,
        timestamp: new Date().toISOString()
    };
    state.activityLog.unshift(activity);

    // Firestoreに保存
    saveDealToFirestore(deal);
    saveActivityToFirestore(activity);

    renderKanban();
    showToast(`${deal.company} を「${newPhase}」に移動しました`);
}

function getFilteredDeals() {
    if (state.filterMember === 'all') return state.deals;
    return state.deals.filter(d => d.member === state.filterMember);
}

// ==========================================
// Deal CRUD
// ==========================================
function initDealModal() {
    document.getElementById('add-deal-btn').addEventListener('click', () => openDealModal());
    document.getElementById('modal-close').addEventListener('click', closeDealModal);
    document.getElementById('modal-cancel').addEventListener('click', closeDealModal);
    document.getElementById('modal-save').addEventListener('click', saveDeal);
    document.getElementById('modal-delete').addEventListener('click', deleteDeal);

    document.getElementById('deal-modal').addEventListener('click', (e) => {
        if (e.target.id === 'deal-modal') closeDealModal();
    });

    document.getElementById('activity-modal-close').addEventListener('click', () => {
        document.getElementById('activity-modal').classList.remove('show');
    });
}

function openDealModal(dealId = null) {
    state.editingDealId = dealId;
    const modal = document.getElementById('deal-modal');
    const title = document.getElementById('modal-title');
    const deleteBtn = document.getElementById('modal-delete');

    if (dealId) {
        const deal = state.deals.find(d => d.id === dealId);
        if (!deal) return;
        title.textContent = '案件編集';
        deleteBtn.style.display = 'flex';
        document.getElementById('deal-company').value = deal.company || '';
        document.getElementById('deal-member').value = deal.member || '';
        document.getElementById('deal-phase').value = deal.phase || 'リスト';
        document.getElementById('deal-contact').value = deal.contact || '';
        document.getElementById('deal-phone').value = deal.phone || '';
        document.getElementById('deal-email').value = deal.email || '';
        document.getElementById('deal-next-action').value = deal.nextAction || '';
        document.getElementById('deal-next-date').value = deal.nextDate || '';
        document.getElementById('deal-amount').value = deal.amount || '';
        document.getElementById('deal-notes').value = deal.notes || '';
        setDealTags(deal.tags || []);
        setCallResult(deal.callResult || '');
    } else {
        title.textContent = '案件追加';
        deleteBtn.style.display = 'none';
        document.getElementById('deal-company').value = '';
        document.getElementById('deal-member').value = '';
        document.getElementById('deal-phase').value = 'リスト';
        document.getElementById('deal-contact').value = '';
        document.getElementById('deal-phone').value = '';
        document.getElementById('deal-email').value = '';
        document.getElementById('deal-next-action').value = '';
        document.getElementById('deal-next-date').value = '';
        document.getElementById('deal-amount').value = '';
        document.getElementById('deal-notes').value = '';
        setDealTags([]);
        setCallResult('');
    }

    modal.classList.add('show');
    document.getElementById('deal-company').focus();
}

function closeDealModal() {
    document.getElementById('deal-modal').classList.remove('show');
    state.editingDealId = null;
}

// タグ選択のヘルパー
function getDealTags() {
    const checkboxes = document.querySelectorAll('.tag-checkbox:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

function setDealTags(tags) {
    document.querySelectorAll('.tag-checkbox').forEach(cb => {
        cb.checked = tags.includes(cb.value);
    });
}

// 架電結果のヘルパー
function getCallResult() {
    const selected = document.querySelector('.call-result-radio:checked');
    return selected ? selected.value : '';
}

function setCallResult(value) {
    document.querySelectorAll('.call-result-radio').forEach(r => {
        r.checked = r.value === value;
    });
}

function saveDeal() {
    const company = document.getElementById('deal-company').value.trim();
    const member = document.getElementById('deal-member').value;
    if (!company) { showToast('企業名を入力してください', 'error'); return; }
    if (!member) { showToast('担当者を選択してください', 'error'); return; }

    const data = {
        company,
        member,
        phase: document.getElementById('deal-phase').value,
        contact: document.getElementById('deal-contact').value.trim(),
        phone: document.getElementById('deal-phone').value.trim(),
        email: document.getElementById('deal-email').value.trim(),
        tags: getDealTags(),
        callResult: getCallResult(),
        nextAction: document.getElementById('deal-next-action').value.trim(),
        nextDate: document.getElementById('deal-next-date').value,
        amount: document.getElementById('deal-amount').value ? Number(document.getElementById('deal-amount').value) : 0,
        notes: document.getElementById('deal-notes').value.trim(),
        updatedAt: new Date().toISOString()
    };

    let activity;

    if (state.editingDealId) {
        const deal = state.deals.find(d => d.id === state.editingDealId);
        if (deal) {
            const oldPhase = deal.phase;
            Object.assign(deal, data);

            if (oldPhase !== data.phase) {
                activity = { id: generateId(), dealId: deal.id, message: `${company}: ${oldPhase} → ${data.phase}`, member, timestamp: new Date().toISOString() };
            } else {
                activity = { id: generateId(), dealId: deal.id, message: `${company}: 情報更新`, member, timestamp: new Date().toISOString() };
            }
            state.activityLog.unshift(activity);

            saveDealToFirestore(deal);
            saveActivityToFirestore(activity);
            showToast('案件を更新しました');
        }
    } else {
        const newDeal = {
            id: generateId(),
            ...data,
            createdAt: new Date().toISOString()
        };
        state.deals.push(newDeal);
        activity = { id: generateId(), dealId: newDeal.id, message: `${company}: 新規追加（${data.phase}）`, member, timestamp: new Date().toISOString() };
        state.activityLog.unshift(activity);

        saveDealToFirestore(newDeal);
        saveActivityToFirestore(activity);
        showToast('案件を追加しました');
    }

    closeDealModal();
    renderAll();
}

function deleteDeal() {
    if (!state.editingDealId) return;
    const deal = state.deals.find(d => d.id === state.editingDealId);
    if (!deal) return;
    if (!confirm(`「${deal.company}」を削除しますか？`)) return;

    state.deals = state.deals.filter(d => d.id !== state.editingDealId);

    const activity = { id: generateId(), dealId: null, message: `${deal.company}: 削除`, member: deal.member, timestamp: new Date().toISOString() };
    state.activityLog.unshift(activity);

    deleteDealFromFirestore(state.editingDealId);
    saveActivityToFirestore(activity);

    closeDealModal();
    renderAll();
    showToast('案件を削除しました');
}

// ==========================================
// Activity Log
// ==========================================
// addActivity は直接呼ばず、各操作で activity オブジェクトを作って saveActivityToFirestore する

// ==========================================
// List View
// ==========================================
function renderListView() {
    const tbody = document.getElementById('list-table-body');
    const searchTerm = (document.getElementById('list-search').value || '').toLowerCase();
    const sortBy = document.getElementById('list-sort').value;

    let deals = getFilteredDeals();

    if (searchTerm) {
        deals = deals.filter(d =>
            d.company.toLowerCase().includes(searchTerm) ||
            d.member.toLowerCase().includes(searchTerm) ||
            (d.contact && d.contact.toLowerCase().includes(searchTerm))
        );
    }

    deals.sort((a, b) => {
        switch (sortBy) {
            case 'updated': return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
            case 'created': return new Date(b.createdAt) - new Date(a.createdAt);
            case 'company': return a.company.localeCompare(b.company, 'ja');
            case 'phase': return PHASES.indexOf(a.phase) - PHASES.indexOf(b.phase);
            default: return 0;
        }
    });

    tbody.innerHTML = deals.map(d => `
        <tr>
            <td><strong>${escapeHtml(d.company)}</strong></td>
            <td><span class="deal-card-member" style="background:${MEMBER_COLORS[d.member] || '#005c91'}">${escapeHtml(d.member)}</span></td>
            <td><span class="phase-badge">${escapeHtml(d.phase)}</span></td>
            <td>${escapeHtml(d.contact || '-')}</td>
            <td>${escapeHtml(d.nextAction || '-')}${d.nextDate ? ' (' + formatDate(d.nextDate) + ')' : ''}</td>
            <td>${formatDate(d.updatedAt || d.createdAt)}</td>
            <td>
                <div class="action-btns">
                    <button onclick="openDealModal('${d.id}')" title="編集"><i class="fas fa-pen"></i></button>
                    <button onclick="showDealActivity('${d.id}')" title="履歴"><i class="fas fa-history"></i></button>
                </div>
            </td>
        </tr>
    `).join('');

    if (deals.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:#adb5bd;">該当する案件がありません</td></tr>`;
    }
}

function showDealActivity(dealId) {
    const deal = state.deals.find(d => d.id === dealId);
    if (!deal) return;
    const logs = state.activityLog.filter(a => a.dealId === dealId);
    const container = document.getElementById('deal-activity-log');
    container.innerHTML = logs.length > 0 ? logs.map(a => `
        <div class="activity-log-item">
            <div class="activity-log-dot"></div>
            <div>
                <div class="activity-log-text">${escapeHtml(a.message)}</div>
                <div class="activity-log-time">${formatDateTime(a.timestamp)}</div>
            </div>
        </div>
    `).join('') : '<p style="color:#adb5bd;text-align:center;">ログがありません</p>';
    document.getElementById('activity-modal').classList.add('show');
}

// ==========================================
// Report / Analytics
// ==========================================
function renderReport() {
    const period = state.reportPeriod;
    const member = state.reportMember;

    let deals = state.deals;
    if (member !== 'all') deals = deals.filter(d => d.member === member);

    const now = new Date();
    const periodDays = period === 'weekly' ? 7 : 30;
    const periodStart = new Date(now);
    periodStart.setDate(periodStart.getDate() - periodDays);

    const periodActivities = state.activityLog.filter(a => {
        const aDate = new Date(a.timestamp);
        if (aDate < periodStart) return false;
        if (member !== 'all' && a.member !== member) return false;
        return true;
    });

    const phaseCounts = {};
    PHASES.forEach(p => phaseCounts[p] = 0);
    deals.forEach(d => { if (phaseCounts[d.phase] !== undefined) phaseCounts[d.phase]++; });

    const totalDeals = deals.length;
    const totalActions = periodActivities.length;
    const wonDeals = deals.filter(d => d.phase === '受注' || d.phase === '契約書対応中' || d.phase === '入金済み').length;
    const winRate = totalDeals > 0 ? Math.round((wonDeals / totalDeals) * 100) : 0;
    const totalAmount = deals.filter(d => d.phase === '受注' || d.phase === '契約書対応中' || d.phase === '入金済み').reduce((s, d) => s + (d.amount || 0), 0);
    const appointmentRate = (() => {
        const callCount = deals.filter(d => PHASES.indexOf(d.phase) >= 1).length;
        const appoCount = deals.filter(d => PHASES.indexOf(d.phase) >= 2).length;
        return callCount > 0 ? Math.round((appoCount / callCount) * 100) : 0;
    })();

    renderKPIs(totalDeals, totalActions, winRate, appointmentRate, totalAmount, periodDays);
    renderAssessment(deals, periodActivities, member, periodDays);
    renderFunnel(phaseCounts);
    renderMemberComparison(member);
    renderTimeline(periodActivities);
    renderExecutiveSummary(deals, periodActivities, totalDeals, wonDeals, totalActions, periodDays, member);
}

function renderKPIs(totalDeals, totalActions, winRate, appoRate, totalAmount, periodDays) {
    const grid = document.getElementById('kpi-grid');
    const kpis = [
        { label: '総案件数', value: totalDeals, color: 'blue' },
        { label: `行動数（${periodDays}日間）`, value: totalActions, color: totalActions < 10 ? 'red' : totalActions < 30 ? 'yellow' : 'blue' },
        { label: '受注率', value: winRate + '%', color: winRate < 10 ? 'red' : winRate < 25 ? 'yellow' : 'blue' },
        { label: 'アポ獲得率', value: appoRate + '%', color: appoRate < 15 ? 'red' : appoRate < 30 ? 'yellow' : 'blue' },
        { label: '受注金額合計', value: '¥' + totalAmount.toLocaleString(), color: 'blue' }
    ];

    grid.innerHTML = kpis.map(k => `
        <div class="kpi-card ${k.color}">
            <div class="kpi-label">${k.label}</div>
            <div class="kpi-value">${k.value}</div>
        </div>
    `).join('');
}

function renderAssessment(deals, activities, member, periodDays) {
    const grid = document.getElementById('assessment-grid');
    const assessments = [];

    if (member === 'all') {
        MEMBERS.forEach(m => {
            const memberDeals = deals.filter(d => d.member === m);
            const memberActivities = activities.filter(a => a.member === m);
            assessments.push(analyzeMember(m, memberDeals, memberActivities, periodDays));
        });
    } else {
        assessments.push(analyzeMember(member, deals, activities, periodDays));
    }

    grid.innerHTML = assessments.map(a => `
        <div class="assessment-card status-${a.overallStatus}">
            <div class="assessment-card-header">
                <span class="assessment-card-title">${escapeHtml(a.name)}</span>
                <span class="status-indicator ${a.overallStatus}">
                    <i class="fas fa-circle" style="font-size:8px;"></i>
                    ${a.overallLabel}
                </span>
            </div>
            <div class="assessment-metric">
                <span class="metric-label">行動量</span>
                <span class="metric-value">
                    <span class="status-indicator ${a.quantityStatus}" style="padding:2px 8px;">
                        ${a.quantityLabel}（${a.actionCount}件）
                    </span>
                </span>
            </div>
            <div class="assessment-metric">
                <span class="metric-label">行動の質（転換率）</span>
                <span class="metric-value">
                    <span class="status-indicator ${a.qualityStatus}" style="padding:2px 8px;">
                        ${a.qualityLabel}（${a.conversionRate}%）
                    </span>
                </span>
            </div>
            <div class="assessment-metric">
                <span class="metric-label">案件数</span>
                <span class="metric-value">${a.dealCount}件</span>
            </div>
            <div class="assessment-metric">
                <span class="metric-label">受注・入金数</span>
                <span class="metric-value">${a.wonCount}件</span>
            </div>
            <div class="assessment-advice">
                <i class="fas fa-lightbulb"></i> ${a.advice}
            </div>
        </div>
    `).join('');
}

function analyzeMember(name, deals, activities, periodDays) {
    const actionCount = activities.length;
    const dealCount = deals.length;
    const wonCount = deals.filter(d => ['受注', '契約書対応中', '入金済み'].includes(d.phase)).length;
    const appoCount = deals.filter(d => PHASES.indexOf(d.phase) >= 2).length;
    const conversionRate = dealCount > 0 ? Math.round((wonCount / dealCount) * 100) : 0;
    const appoRate = dealCount > 0 ? Math.round((appoCount / dealCount) * 100) : 0;

    const weekFactor = periodDays / 7;
    const minActions = Math.round(10 * weekFactor);
    const goodActions = Math.round(25 * weekFactor);

    let quantityStatus, quantityLabel;
    if (actionCount < minActions) { quantityStatus = 'red'; quantityLabel = '要改善'; }
    else if (actionCount < goodActions) { quantityStatus = 'yellow'; quantityLabel = '普通'; }
    else { quantityStatus = 'blue'; quantityLabel = '良好'; }

    let qualityStatus, qualityLabel;
    if (conversionRate < 5) { qualityStatus = 'red'; qualityLabel = '要改善'; }
    else if (conversionRate < 20) { qualityStatus = 'yellow'; qualityLabel = '普通'; }
    else { qualityStatus = 'blue'; qualityLabel = '良好'; }

    let overallStatus, overallLabel;
    if (quantityStatus === 'red' || qualityStatus === 'red') {
        overallStatus = 'red'; overallLabel = '要介入';
    } else if (quantityStatus === 'yellow' || qualityStatus === 'yellow') {
        overallStatus = 'yellow'; overallLabel = '注意';
    } else {
        overallStatus = 'blue'; overallLabel = '順調';
    }

    let advice;
    if (quantityStatus === 'red' && qualityStatus === 'red') {
        advice = '行動量・質ともに改善が必要です。まず行動量を増やし、ロープレ等で質を高めましょう。';
    } else if (quantityStatus === 'red') {
        advice = '行動量が不足しています。コール数・訪問数を増やす施策を検討してください。';
    } else if (qualityStatus === 'red') {
        advice = '行動の質に課題があります。トークスクリプトの見直しやロープレ練習を推奨します。';
    } else if (quantityStatus === 'yellow') {
        advice = '行動量をもう少し増やせば、さらに成果が期待できます。';
    } else if (qualityStatus === 'yellow') {
        advice = '転換率が平均的です。提案力を強化することで受注率が向上する可能性があります。';
    } else {
        advice = '行動量・質ともに良好です。この調子を維持してください。';
    }

    return {
        name, actionCount, dealCount, wonCount, conversionRate, appoRate,
        quantityStatus, quantityLabel, qualityStatus, qualityLabel,
        overallStatus, overallLabel, advice
    };
}

function renderExecutiveSummary(deals, activities, totalDeals, wonDeals, totalActions, periodDays, member) {
    const container = document.getElementById('executive-summary');
    const periodLabel = periodDays === 7 ? '今週' : '今月';

    const issues = [];
    const positives = [];

    MEMBERS.forEach(m => {
        const mActs = activities.filter(a => a.member === m);
        const weekFactor = periodDays / 7;
        if (mActs.length < Math.round(5 * weekFactor)) {
            issues.push(`<span class="highlight-red">${m}の行動量が著しく低い</span>`);
        }
    });

    const listCount = deals.filter(d => d.phase === 'リスト').length;
    if (listCount > totalDeals * 0.5 && totalDeals > 5) {
        issues.push('<span class="highlight-yellow">リストに滞留している案件が多い（コール着手が遅れている可能性）</span>');
    }

    if (wonDeals > 0) {
        positives.push(`<span class="highlight-blue">${periodLabel}の受注は${wonDeals}件</span>`);
    }

    if (totalActions > 30) {
        positives.push(`<span class="highlight-blue">チーム全体の行動量は${totalActions}件で活発</span>`);
    }

    const memberTitle = member === 'all' ? 'チーム全体' : member;
    let summaryHtml = `<h4>📊 ${memberTitle}の${periodLabel}エグゼクティブサマリー</h4><div class="summary-text">`;

    summaryHtml += `総案件数 <strong>${totalDeals}件</strong>、${periodLabel}の行動数 <strong>${totalActions}件</strong>。`;

    if (issues.length > 0) {
        summaryHtml += '<br><br><strong>課題：</strong><br>' + issues.map(i => `・${i}`).join('<br>');
    }
    if (positives.length > 0) {
        summaryHtml += '<br><br><strong>好調点：</strong><br>' + positives.map(p => `・${p}`).join('<br>');
    }

    if (issues.length === 0 && positives.length === 0) {
        summaryHtml += '<br>特筆すべき事項はありません。データが蓄積されると、より詳細な分析が表示されます。';
    }

    summaryHtml += '</div>';
    container.innerHTML = summaryHtml;
}

function renderFunnel(phaseCounts) {
    const container = document.getElementById('funnel-chart');
    const max = Math.max(...Object.values(phaseCounts), 1);

    let html = '';
    for (let i = 0; i < PHASES.length; i++) {
        const phase = PHASES[i];
        const count = phaseCounts[phase];
        const width = Math.max((count / max) * 100, 2);

        html += `
            <div class="funnel-bar-row">
                <span class="funnel-label">${phase}</span>
                <div class="funnel-bar-track">
                    <div class="funnel-bar" style="width:${width}%"></div>
                </div>
                <span class="funnel-bar-value">${count}</span>
            </div>
        `;

        if (i < PHASES.length - 1) {
            const nextPhase = PHASES[i + 1];
            const nextCount = phaseCounts[nextPhase];
            const conversion = count > 0 ? Math.round((nextCount / count) * 100) : 0;
            html += `<div class="funnel-conversion">↓ ${conversion}%</div>`;
        }
    }

    container.innerHTML = html;
}

function renderMemberComparison(selectedMember) {
    const container = document.getElementById('member-comparison');
    const section = document.getElementById('member-comparison-section');

    if (selectedMember !== 'all') {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';

    const maxDeals = Math.max(...MEMBERS.map(m => state.deals.filter(d => d.member === m).length), 1);

    container.innerHTML = MEMBERS.map(m => {
        const mDeals = state.deals.filter(d => d.member === m);
        const won = mDeals.filter(d => ['受注', '契約書対応中', '入金済み'].includes(d.phase)).length;
        const barWidth = (mDeals.length / maxDeals) * 100;
        const amount = mDeals.filter(d => ['受注', '契約書対応中', '入金済み'].includes(d.phase)).reduce((s, d) => s + (d.amount || 0), 0);

        return `
            <div class="member-card">
                <div class="member-card-header">
                    <div class="member-card-avatar" style="background:${MEMBER_COLORS[m]}">${m[0]}</div>
                    <span class="member-card-name">${m}</span>
                </div>
                <div class="member-card-stats">
                    <div class="member-stat">
                        <span class="stat-label">案件数</span>
                        <span class="stat-value">${mDeals.length}</span>
                    </div>
                    <div class="member-bar-track">
                        <div class="member-bar-fill" style="width:${barWidth}%;background:${MEMBER_COLORS[m]}"></div>
                    </div>
                    <div class="member-stat">
                        <span class="stat-label">受注数</span>
                        <span class="stat-value">${won}</span>
                    </div>
                    <div class="member-stat">
                        <span class="stat-label">受注金額</span>
                        <span class="stat-value">¥${amount.toLocaleString()}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderTimeline(activities) {
    const container = document.getElementById('activity-timeline');
    const recent = activities.slice(0, 20);

    if (recent.length === 0) {
        container.innerHTML = '<p style="color:#adb5bd;text-align:center;padding:20px;">この期間のアクティビティはありません</p>';
        return;
    }

    container.innerHTML = recent.map(a => `
        <div class="timeline-item">
            <span class="timeline-time">${formatDateTime(a.timestamp)}</span>
            <span class="timeline-content">
                <strong>${escapeHtml(a.member || '')}</strong> ${escapeHtml(a.message)}
            </span>
        </div>
    `).join('');
}

// ==========================================
// Settings
// ==========================================
function initSettings() {
    document.getElementById('add-email-btn').addEventListener('click', addAllowedEmail);
    document.getElementById('new-email-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addAllowedEmail();
    });
    document.getElementById('export-data-btn').addEventListener('click', exportData);
    document.getElementById('import-data-btn').addEventListener('click', () => {
        document.getElementById('import-file-input').click();
    });
    document.getElementById('import-file-input').addEventListener('change', importData);
    document.getElementById('load-sample-btn').addEventListener('click', loadSampleData);
}

function renderSettings() {
    const list = document.getElementById('allowed-emails-list');
    list.innerHTML = state.allowedEmails.map((email, i) => `
        <div class="email-item">
            <span>${escapeHtml(email)}</span>
            <button onclick="removeAllowedEmail(${i})" title="削除"><i class="fas fa-times"></i></button>
        </div>
    `).join('');

    if (state.allowedEmails.length === 0) {
        list.innerHTML = '<p style="color:#adb5bd;font-size:0.85rem;">メールアドレスが未登録の場合、全てのGoogleアカウントでログインが可能です。</p>';
    }
}

function addAllowedEmail() {
    const input = document.getElementById('new-email-input');
    const email = input.value.trim().toLowerCase();
    if (!email || !email.includes('@')) {
        showToast('有効なメールアドレスを入力してください', 'error');
        return;
    }
    if (state.allowedEmails.includes(email)) {
        showToast('このメールアドレスは既に登録されています', 'warning');
        return;
    }
    state.allowedEmails.push(email);
    input.value = '';
    saveSettingsToFirestore();
    renderSettings();
    showToast('メールアドレスを追加しました');
}

function removeAllowedEmail(index) {
    state.allowedEmails.splice(index, 1);
    saveSettingsToFirestore();
    renderSettings();
    showToast('メールアドレスを削除しました');
}

function exportData() {
    const data = {
        deals: state.deals,
        activityLog: state.activityLog,
        allowedEmails: state.allowedEmails,
        exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aikasu_sales_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('データをエクスポートしました');
}

async function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const data = JSON.parse(ev.target.result);

            if (data.deals) {
                state.deals = data.deals;
                // Firestoreにバッチ書き込み
                const batchSize = 500;
                for (let i = 0; i < data.deals.length; i += batchSize) {
                    const batch = db.batch();
                    data.deals.slice(i, i + batchSize).forEach(deal => {
                        batch.set(dealsRef.doc(deal.id), deal);
                    });
                    await batch.commit();
                }
            }
            if (data.activityLog) {
                state.activityLog = data.activityLog;
                const recentActivity = data.activityLog.slice(0, 500);
                const batchSize = 500;
                for (let i = 0; i < recentActivity.length; i += batchSize) {
                    const batch = db.batch();
                    recentActivity.slice(i, i + batchSize).forEach(act => {
                        batch.set(activityRef.doc(act.id), act);
                    });
                    await batch.commit();
                }
            }
            if (data.allowedEmails) {
                state.allowedEmails = data.allowedEmails;
                await saveSettingsToFirestore();
            }

            renderAll();
            showToast('データをインポートしました');
        } catch (err) {
            showToast('データの読み込みに失敗しました', 'error');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

// ==========================================
// Sample Data
// ==========================================
async function loadSampleData() {
    if (state.deals.length > 0 && !confirm('既存データを上書きしてサンプルデータを読み込みますか？')) return;

    const companies = [
        'アクメ株式会社', 'ブルースカイ商事', 'クリエイトジャパン', 'デルタソリューションズ',
        'エコテック株式会社', 'フジヤマ産業', 'グローバルネット', 'ハーモニーコーポレーション',
        'イノベーション・ラボ', 'ジャパンクリエイト', 'カイゼン・パートナーズ', 'ライフデザイン',
        'マーケットプロ', 'ネオジャパン', 'オプティマス株式会社', 'パシフィック・トレード',
        'クオリティファースト', 'ライジングスター', 'サクラテクノロジー', 'テクノビジョン',
        'ユニバーサルシステムズ', 'ベンチャーワークス', 'ワイズカンパニー', 'ゼニス・グループ',
        'エース・コーポレーション', 'ブレインネット', 'コスモメディア', 'ダイナミック商事',
        'エクセル・グローバル', 'フロンティア・テック', 'グランド・ビジネス', 'ヒューマンリソース',
        'インパクト・ジャパン', 'ジョイフル・カンパニー', 'キングスター', 'ルミナス・コーポ'
    ];

    const contacts = [
        '田中太郎', '山田花子', '佐藤一郎', '鈴木美咲', '高橋健太', '伊藤真理',
        '渡辺大輔', '中島あゆみ', '小林正義', '加藤恵子', '吉田誠', '山口裕子'
    ];

    const actions = [
        '再度電話する', '提案書送付', '見積もり作成', '契約書送付', '訪問日程調整',
        'メール返信待ち', 'ニーズヒアリング', '社内稟議待ち', 'サンプル送付'
    ];

    // 既存データをFirestoreから削除
    showToast('サンプルデータを準備中...', 'info');

    // 既存deals削除
    const existingDeals = await dealsRef.get();
    const deleteBatch1 = db.batch();
    existingDeals.forEach(doc => deleteBatch1.delete(doc.ref));
    if (!existingDeals.empty) await deleteBatch1.commit();

    // 既存activity削除
    const existingActs = await activityRef.get();
    const batchSize = 500;
    const actDocs = existingActs.docs;
    for (let i = 0; i < actDocs.length; i += batchSize) {
        const batch = db.batch();
        actDocs.slice(i, i + batchSize).forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }

    state.deals = [];
    state.activityLog = [];

    const newDeals = [];
    const newActivities = [];

    companies.forEach((company, i) => {
        const member = MEMBERS[i % MEMBERS.length];
        const phaseIndex = Math.floor(Math.random() * PHASES.length);
        const phase = PHASES[phaseIndex];
        const contact = contacts[Math.floor(Math.random() * contacts.length)];
        const daysOffset = Math.floor(Math.random() * 30);
        const createdDate = daysAgo(daysOffset);
        const amount = phase === '受注' || phase === '契約書対応中' || phase === '入金済み'
            ? (Math.floor(Math.random() * 50) + 5) * 10000
            : Math.floor(Math.random() * 30) * 10000;

        const deal = {
            id: generateId(),
            company,
            member,
            phase,
            contact,
            phone: `03-${String(Math.floor(Math.random() * 9000) + 1000)}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
            email: `${contact.toLowerCase().replace(/[^a-z]/g, '')}@example.com`,
            nextAction: phaseIndex < 6 ? actions[Math.floor(Math.random() * actions.length)] : '',
            nextDate: phaseIndex < 6 ? new Date(Date.now() + (Math.random() * 14 - 3) * 86400000).toISOString().slice(0, 10) : '',
            amount,
            notes: '',
            createdAt: createdDate,
            updatedAt: daysAgo(Math.max(0, daysOffset - Math.floor(Math.random() * 5)))
        };

        newDeals.push(deal);

        const actCount = Math.floor(Math.random() * 4) + 1;
        for (let j = 0; j < actCount; j++) {
            const actPhase = PHASES[Math.min(phaseIndex, Math.floor(Math.random() * (phaseIndex + 1)))];
            const nextPhase = PHASES[Math.min(PHASES.length - 1, PHASES.indexOf(actPhase) + 1)];
            newActivities.push({
                id: generateId(),
                dealId: deal.id,
                message: `${company}: ${actPhase} → ${nextPhase}`,
                member,
                timestamp: daysAgo(Math.floor(Math.random() * daysOffset))
            });
        }
    });

    // Firestoreにバッチ書き込み
    for (let i = 0; i < newDeals.length; i += batchSize) {
        const batch = db.batch();
        newDeals.slice(i, i + batchSize).forEach(deal => {
            batch.set(dealsRef.doc(deal.id), deal);
        });
        await batch.commit();
    }

    newActivities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    for (let i = 0; i < newActivities.length; i += batchSize) {
        const batch = db.batch();
        newActivities.slice(i, i + batchSize).forEach(act => {
            batch.set(activityRef.doc(act.id), act);
        });
        await batch.commit();
    }

    showToast('サンプルデータを読み込みました（36件）');
}

// ==========================================
// Filters & Events
// ==========================================
function initFilters() {
    document.getElementById('filter-member').addEventListener('change', (e) => {
        state.filterMember = e.target.value;
        renderKanban();
        if (state.currentView === 'list') renderListView();
    });

    document.getElementById('list-search').addEventListener('input', () => renderListView());
    document.getElementById('list-sort').addEventListener('change', () => renderListView());

    document.querySelectorAll('.period-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.reportPeriod = tab.dataset.period;
            renderReport();
        });
    });

    document.getElementById('report-member').addEventListener('change', (e) => {
        state.reportMember = e.target.value;
        renderReport();
    });
}

// ==========================================
// Render All
// ==========================================
function renderAll() {
    renderKanban();
    if (state.currentView === 'list') renderListView();
    if (state.currentView === 'report') renderReport();
    if (state.currentView === 'settings') renderSettings();
}

// ==========================================
// Initialize
// ==========================================
function init() {
    loadStateFromLocal(); // ローカルデータをまず読み込み（オフライン対応）
    initAuth();           // Firebase Auth 初期化（onAuthStateChangedでリスナー開始）
    initNavigation();
    initDealModal();
    initFilters();
    initSettings();

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeDealModal();
            document.getElementById('activity-modal').classList.remove('show');
        }
    });
}

// Start
document.addEventListener('DOMContentLoaded', init);
