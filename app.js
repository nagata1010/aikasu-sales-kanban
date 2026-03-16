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
const leadsRef = db.collection('leads');
const companiesRef = db.collection('companies');
const contactsRef = db.collection('contacts');
const contractsRef = db.collection('contracts');
const dealActivitiesRef = db.collection('deal_activities');
const dealTasksRef = db.collection('deal_tasks');

// リアルタイムリスナー解除用
let unsubDeals = null;
let unsubActivity = null;
let unsubSettings = null;
let unsubLeads = null;
let unsubCompanies = null;
let unsubContacts = null;
let unsubContracts = null;
let unsubDealActivities = null;
let unsubDealTasks = null;

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
    editingDealId: null,
    leads: [],
    companies: [],
    contacts: [],
    contracts: [],
    dealActivities: [],
    dealTasks: [],
    editingLeadId: null,
    editingCompanyId: null,
    editingContactId: null,
    editingContractId: null,
    editingContactCompanyId: null
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

// --- Leads ---
async function saveLeadToFirestore(lead) {
    try {
        await leadsRef.doc(lead.id).set(lead);
    } catch (e) {
        console.error('Firestore lead save error:', e);
    }
}

async function deleteLeadFromFirestore(leadId) {
    try {
        await leadsRef.doc(leadId).delete();
    } catch (e) {
        console.error('Firestore lead delete error:', e);
    }
}

// --- Companies ---
async function saveCompanyToFirestore(company) {
    try {
        await companiesRef.doc(company.id).set(company);
    } catch (e) {
        console.error('Firestore company save error:', e);
    }
}

async function deleteCompanyFromFirestore(companyId) {
    try {
        await companiesRef.doc(companyId).delete();
    } catch (e) {
        console.error('Firestore company delete error:', e);
    }
}

// --- Contacts ---
async function saveContactToFirestore(contact) {
    try {
        await contactsRef.doc(contact.id).set(contact);
    } catch (e) {
        console.error('Firestore contact save error:', e);
    }
}

async function deleteContactFromFirestore(contactId) {
    try {
        await contactsRef.doc(contactId).delete();
    } catch (e) {
        console.error('Firestore contact delete error:', e);
    }
}

// --- Contracts ---
async function saveContractToFirestore(contract) {
    try {
        await contractsRef.doc(contract.id).set(contract);
    } catch (e) {
        console.error('Firestore contract save error:', e);
    }
}

async function deleteContractFromFirestore(contractId) {
    try {
        await contractsRef.doc(contractId).delete();
    } catch (e) {
        console.error('Firestore contract delete error:', e);
    }
}

// --- Deal Activities ---
async function saveDealActivityToFirestore(activity) {
    try {
        await dealActivitiesRef.doc(activity.id).set(activity);
    } catch (e) {
        console.error('Firestore deal activity save error:', e);
    }
}

// --- Deal Tasks ---
async function saveDealTaskToFirestore(task) {
    try {
        await dealTasksRef.doc(task.id).set(task);
    } catch (e) {
        console.error('Firestore deal task save error:', e);
    }
}

async function deleteDealTaskFromFirestore(taskId) {
    try {
        await dealTasksRef.doc(taskId).delete();
    } catch (e) {
        console.error('Firestore deal task delete error:', e);
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

    // Leads リスナー
    unsubLeads = leadsRef.onSnapshot(snapshot => {
        state.leads = [];
        snapshot.forEach(doc => {
            state.leads.push(doc.data());
        });
        state.leads.sort((a, b) => {
            const aDate = a.createdAt || '';
            const bDate = b.createdAt || '';
            return bDate.localeCompare(aDate);
        });
        if (state.currentView === 'leads') renderLeadsView();
    }, err => {
        console.error('Leads listener error:', err);
    });

    // Companies リスナー
    unsubCompanies = companiesRef.onSnapshot(snapshot => {
        state.companies = [];
        snapshot.forEach(doc => {
            state.companies.push(doc.data());
        });
        state.companies.sort((a, b) => {
            const aName = a.name || '';
            const bName = b.name || '';
            return aName.localeCompare(bName, 'ja');
        });
        if (state.currentView === 'companies') renderCompaniesView();
    }, err => {
        console.error('Companies listener error:', err);
    });

    // Contacts リスナー
    unsubContacts = contactsRef.onSnapshot(snapshot => {
        state.contacts = [];
        snapshot.forEach(doc => {
            state.contacts.push(doc.data());
        });
        state.contacts.sort((a, b) => {
            const aName = a.name || '';
            const bName = b.name || '';
            return aName.localeCompare(bName, 'ja');
        });
        if (state.currentView === 'companies') renderCompaniesView();
    }, err => {
        console.error('Contacts listener error:', err);
    });

    // Contracts リスナー
    unsubContracts = contractsRef.onSnapshot(snapshot => {
        state.contracts = [];
        snapshot.forEach(doc => {
            state.contracts.push(doc.data());
        });
        state.contracts.sort((a, b) => {
            const aDate = a.createdAt || '';
            const bDate = b.createdAt || '';
            return bDate.localeCompare(aDate);
        });
        if (state.currentView === 'contracts') renderContractsView();
    }, err => {
        console.error('Contracts listener error:', err);
    });

    // Deal Activities リスナー
    unsubDealActivities = dealActivitiesRef.orderBy('timestamp', 'desc').limit(500).onSnapshot(snapshot => {
        state.dealActivities = [];
        snapshot.forEach(doc => {
            state.dealActivities.push(doc.data());
        });
    }, err => {
        console.error('Deal Activities listener error:', err);
    });

    // Deal Tasks リスナー
    unsubDealTasks = dealTasksRef.orderBy('createdAt', 'desc').limit(500).onSnapshot(snapshot => {
        state.dealTasks = [];
        snapshot.forEach(doc => {
            state.dealTasks.push(doc.data());
        });
        if (state.currentView === 'dashboard') renderDashboard();
    }, err => {
        console.error('Deal Tasks listener error:', err);
    });
}

function stopRealtimeListeners() {
    if (unsubDeals) { unsubDeals(); unsubDeals = null; }
    if (unsubActivity) { unsubActivity(); unsubActivity = null; }
    if (unsubSettings) { unsubSettings(); unsubSettings = null; }
    if (unsubLeads) { unsubLeads(); unsubLeads = null; }
    if (unsubCompanies) { unsubCompanies(); unsubCompanies = null; }
    if (unsubContacts) { unsubContacts(); unsubContacts = null; }
    if (unsubContracts) { unsubContracts(); unsubContracts = null; }
    if (unsubDealActivities) { unsubDealActivities(); unsubDealActivities = null; }
    if (unsubDealTasks) { unsubDealTasks(); unsubDealTasks = null; }
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
        settings: '設定',
        leads: 'リード管理',
        companies: '企業・連絡先',
        contracts: '契約管理',
        dashboard: 'ダッシュボード'
    };
    document.getElementById('page-title').textContent = titles[view] || view;

    closeSidebar();

    if (view === 'report') renderReport();
    if (view === 'list') renderListView();
    if (view === 'settings') renderSettings();
    if (view === 'leads') renderLeadsView();
    if (view === 'companies') renderCompaniesView();
    if (view === 'contracts') renderContractsView();
    if (view === 'dashboard') renderDashboard();
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

    // Populate company-id select from state.companies
    const companySelect = document.getElementById('company-id');
    if (companySelect) {
        companySelect.innerHTML = '<option value="">-- 企業を選択 --</option>' +
            state.companies.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
    }

    // Reset tabs to show basic tab
    document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.modal-tab-content').forEach(t => t.classList.remove('active'));
    const basicTab = document.querySelector('.modal-tab[data-tab="basic"]');
    const basicContent = document.getElementById('tab-basic');
    if (basicTab) basicTab.classList.add('active');
    if (basicContent) basicContent.classList.add('active');

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

        // New fields
        const expectedRevenueEl = document.getElementById('expected-revenue');
        if (expectedRevenueEl) expectedRevenueEl.value = deal.expectedRevenue || '';
        const probabilityEl = document.getElementById('probability');
        if (probabilityEl) probabilityEl.value = deal.probability || '';
        const expectedCloseDateEl = document.getElementById('expected-close-date');
        if (expectedCloseDateEl) expectedCloseDateEl.value = deal.expectedCloseDate || '';

        const approvalRequiredYes = document.getElementById('approval-required-yes');
        const approvalRequiredNo = document.getElementById('approval-required-no');
        if (approvalRequiredYes && approvalRequiredNo) {
            if (deal.approvalRequired) {
                approvalRequiredYes.checked = true;
            } else {
                approvalRequiredNo.checked = true;
            }
        }
        const approvalFields = document.getElementById('approval-fields');
        if (approvalFields) approvalFields.style.display = deal.approvalRequired ? 'block' : 'none';

        const approvalStatusEl = document.getElementById('approval-status');
        if (approvalStatusEl) approvalStatusEl.value = deal.approvalStatus || '';
        const approverEl = document.getElementById('approver');
        if (approverEl) approverEl.value = deal.approver || '';
        const approvalDateEl = document.getElementById('approval-date');
        if (approvalDateEl) approvalDateEl.value = deal.approvalDate || '';

        const budgetConfirmedEl = document.getElementById('budget-confirmed');
        if (budgetConfirmedEl) budgetConfirmedEl.checked = !!deal.budgetConfirmed;

        const lossReasonEl = document.getElementById('loss-reason');
        if (lossReasonEl) lossReasonEl.value = deal.lossReason || '';
        const lossDetailEl = document.getElementById('loss-detail');
        if (lossDetailEl) lossDetailEl.value = deal.lossDetail || '';
        const competitorEl = document.getElementById('competitor');
        if (competitorEl) competitorEl.value = deal.competitor || '';

        if (companySelect) companySelect.value = deal.companyId || '';

        // Update weighted revenue display
        const weightedDisplay = document.getElementById('weighted-revenue-display');
        if (weightedDisplay) {
            const rev = Number(deal.expectedRevenue) || 0;
            const prob = Number(deal.probability) || 0;
            weightedDisplay.textContent = '¥' + Math.round(rev * prob / 100).toLocaleString();
        }

        // Load deal tasks and activities
        renderDealTasks(dealId);
        renderDealActivities(dealId);

        // Load playbook checks
        renderPlaybookChecks(deal);
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

        // Clear new fields
        const expectedRevenueEl = document.getElementById('expected-revenue');
        if (expectedRevenueEl) expectedRevenueEl.value = '';
        const probabilityEl = document.getElementById('probability');
        if (probabilityEl) probabilityEl.value = '';
        const expectedCloseDateEl = document.getElementById('expected-close-date');
        if (expectedCloseDateEl) expectedCloseDateEl.value = '';
        const approvalRequiredNo = document.getElementById('approval-required-no');
        if (approvalRequiredNo) approvalRequiredNo.checked = true;
        const approvalFields = document.getElementById('approval-fields');
        if (approvalFields) approvalFields.style.display = 'none';
        const approvalStatusEl = document.getElementById('approval-status');
        if (approvalStatusEl) approvalStatusEl.value = '';
        const approverEl = document.getElementById('approver');
        if (approverEl) approverEl.value = '';
        const approvalDateEl = document.getElementById('approval-date');
        if (approvalDateEl) approvalDateEl.value = '';
        const budgetConfirmedEl = document.getElementById('budget-confirmed');
        if (budgetConfirmedEl) budgetConfirmedEl.checked = false;
        const lossReasonEl = document.getElementById('loss-reason');
        if (lossReasonEl) lossReasonEl.value = '';
        const lossDetailEl = document.getElementById('loss-detail');
        if (lossDetailEl) lossDetailEl.value = '';
        const competitorEl = document.getElementById('competitor');
        if (competitorEl) competitorEl.value = '';
        if (companySelect) companySelect.value = '';
        const weightedDisplay = document.getElementById('weighted-revenue-display');
        if (weightedDisplay) weightedDisplay.textContent = '¥0';

        // Clear deal tasks and activities containers
        const taskList = document.getElementById('deal-task-list');
        if (taskList) taskList.innerHTML = '<p style="color:#adb5bd;text-align:center;">案件を保存してからタスクを追加できます</p>';
        const actList = document.getElementById('deal-activity-list');
        if (actList) actList.innerHTML = '<p style="color:#adb5bd;text-align:center;">案件を保存してからアクティビティを追加できます</p>';
        const playbookContainer = document.getElementById('playbook-checks');
        if (playbookContainer) playbookContainer.innerHTML = '';
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

    const expectedRevenueEl = document.getElementById('expected-revenue');
    const probabilityEl = document.getElementById('probability');
    const expectedCloseDateEl = document.getElementById('expected-close-date');
    const approvalRequiredYes = document.getElementById('approval-required-yes');
    const approvalStatusEl = document.getElementById('approval-status');
    const approverEl = document.getElementById('approver');
    const approvalDateEl = document.getElementById('approval-date');
    const budgetConfirmedEl = document.getElementById('budget-confirmed');
    const lossReasonEl = document.getElementById('loss-reason');
    const lossDetailEl = document.getElementById('loss-detail');
    const competitorEl = document.getElementById('competitor');
    const companyIdEl = document.getElementById('company-id');

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
        updatedAt: new Date().toISOString(),
        expectedRevenue: expectedRevenueEl ? (expectedRevenueEl.value ? Number(expectedRevenueEl.value) : 0) : 0,
        probability: probabilityEl ? (probabilityEl.value ? Number(probabilityEl.value) : 0) : 0,
        expectedCloseDate: expectedCloseDateEl ? expectedCloseDateEl.value || '' : '',
        approvalRequired: approvalRequiredYes ? approvalRequiredYes.checked : false,
        approvalStatus: approvalStatusEl ? approvalStatusEl.value || '' : '',
        approver: approverEl ? approverEl.value || '' : '',
        approvalDate: approvalDateEl ? approvalDateEl.value || '' : '',
        budgetConfirmed: budgetConfirmedEl ? budgetConfirmedEl.checked : false,
        lossReason: lossReasonEl ? lossReasonEl.value || '' : '',
        lossDetail: lossDetailEl ? lossDetailEl.value || '' : '',
        competitor: competitorEl ? competitorEl.value || '' : '',
        companyId: companyIdEl ? companyIdEl.value || '' : ''
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
// Deal Modal Tabs
// ==========================================
function initDealModalTabs() {
    document.querySelectorAll('.modal-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            if (!targetTab) return;
            document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const content = document.getElementById('tab-' + targetTab);
            if (content) content.classList.add('active');
        });
    });

    // Approval required radio toggle
    const approvalYes = document.getElementById('approval-required-yes');
    const approvalNo = document.getElementById('approval-required-no');
    const approvalFields = document.getElementById('approval-fields');
    if (approvalYes && approvalNo && approvalFields) {
        approvalYes.addEventListener('change', () => {
            approvalFields.style.display = approvalYes.checked ? 'block' : 'none';
        });
        approvalNo.addEventListener('change', () => {
            approvalFields.style.display = approvalYes.checked ? 'block' : 'none';
        });
    }

    // Auto-calculate weighted revenue
    const expectedRevenueEl = document.getElementById('expected-revenue');
    const probabilityEl = document.getElementById('probability');
    const weightedDisplay = document.getElementById('weighted-revenue-display');
    if (expectedRevenueEl && probabilityEl && weightedDisplay) {
        const calcWeighted = () => {
            const rev = Number(expectedRevenueEl.value) || 0;
            const prob = Number(probabilityEl.value) || 0;
            weightedDisplay.textContent = '¥' + Math.round(rev * prob / 100).toLocaleString();
        };
        expectedRevenueEl.addEventListener('input', calcWeighted);
        probabilityEl.addEventListener('input', calcWeighted);
    }
}

// ==========================================
// Playbook Checks
// ==========================================
const PLAYBOOK_ITEMS = {
    'リスト': ['企業情報調査完了', 'キーマン特定'],
    'コール中': ['初回コール実施', '資料送付'],
    'アポ取得': ['訪問日確定', '提案資料準備'],
    'アポ実施': ['ヒアリングシート記入', '課題特定'],
    '提案済み': ['提案書提出', '見積書提出', 'フォロー実施'],
    '受注': ['契約条件合意', '契約書作成依頼']
};

function renderPlaybookChecks(deal) {
    const container = document.getElementById('playbook-checks');
    if (!container) return;

    const phase = deal.phase || '';
    const items = PLAYBOOK_ITEMS[phase] || [];
    const checks = deal.playbookChecks || [];

    if (items.length === 0) {
        container.innerHTML = '<p style="color:#adb5bd;text-align:center;">このフェーズにはプレイブック項目がありません</p>';
        return;
    }

    container.innerHTML = items.map(item => {
        const checked = checks.includes(item);
        return `
            <label class="playbook-check-item" style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;">
                <input type="checkbox" class="playbook-checkbox" value="${escapeHtml(item)}" ${checked ? 'checked' : ''}>
                <span>${escapeHtml(item)}</span>
            </label>
        `;
    }).join('');

    container.querySelectorAll('.playbook-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            if (!state.editingDealId) return;
            const d = state.deals.find(x => x.id === state.editingDealId);
            if (!d) return;
            const checkedItems = [];
            container.querySelectorAll('.playbook-checkbox:checked').forEach(c => {
                checkedItems.push(c.value);
            });
            d.playbookChecks = checkedItems;
            d.updatedAt = new Date().toISOString();
            saveDealToFirestore(d);
        });
    });
}

// ==========================================
// Deal Tasks (inline in deal modal)
// ==========================================
function renderDealTasks(dealId) {
    const container = document.getElementById('deal-task-list');
    if (!container) return;

    const tasks = state.dealTasks.filter(t => t.dealId === dealId);
    if (tasks.length === 0) {
        container.innerHTML = '<p style="color:#adb5bd;text-align:center;">タスクがありません</p>';
        return;
    }

    container.innerHTML = tasks.map(t => `
        <div class="deal-task-item" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #eee;">
            <input type="checkbox" class="deal-task-checkbox" data-task-id="${escapeHtml(t.id)}" ${t.completed ? 'checked' : ''}>
            <span style="${t.completed ? 'text-decoration:line-through;color:#adb5bd;' : ''}flex:1;">${escapeHtml(t.title || '')}</span>
            <span style="font-size:0.75rem;color:#868e96;">${t.dueDate ? formatDate(t.dueDate) : ''}</span>
            <button class="deal-task-delete-btn" data-task-id="${escapeHtml(t.id)}" style="background:none;border:none;color:#e74c3c;cursor:pointer;font-size:0.8rem;" title="削除"><i class="fas fa-trash-alt"></i></button>
        </div>
    `).join('');

    container.querySelectorAll('.deal-task-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            const taskId = cb.dataset.taskId;
            const task = state.dealTasks.find(t => t.id === taskId);
            if (task) {
                task.completed = cb.checked;
                task.completedAt = cb.checked ? new Date().toISOString() : '';
                saveDealTaskToFirestore(task);
                renderDealTasks(dealId);
            }
        });
    });

    container.querySelectorAll('.deal-task-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const taskId = btn.dataset.taskId;
            if (!confirm('このタスクを削除しますか？')) return;
            deleteDealTaskFromFirestore(taskId);
            state.dealTasks = state.dealTasks.filter(t => t.id !== taskId);
            renderDealTasks(dealId);
        });
    });
}

function initDealTaskAdd() {
    const addBtn = document.getElementById('deal-task-add-btn');
    if (!addBtn) return;
    addBtn.addEventListener('click', () => {
        if (!state.editingDealId) {
            showToast('先に案件を保存してください', 'error');
            return;
        }
        const titleInput = document.getElementById('deal-task-title');
        const dueDateInput = document.getElementById('deal-task-due-date');
        const title = titleInput ? titleInput.value.trim() : '';
        if (!title) {
            showToast('タスク名を入力してください', 'error');
            return;
        }
        const task = {
            id: generateId(),
            dealId: state.editingDealId,
            title: title,
            dueDate: dueDateInput ? dueDateInput.value || '' : '',
            completed: false,
            completedAt: '',
            createdAt: new Date().toISOString()
        };
        state.dealTasks.push(task);
        saveDealTaskToFirestore(task);
        if (titleInput) titleInput.value = '';
        if (dueDateInput) dueDateInput.value = '';
        renderDealTasks(state.editingDealId);
        showToast('タスクを追加しました');
    });
}

// ==========================================
// Deal Activities (inline in deal modal)
// ==========================================
function renderDealActivities(dealId) {
    const container = document.getElementById('deal-activity-list');
    if (!container) return;

    const activities = state.dealActivities.filter(a => a.dealId === dealId);
    if (activities.length === 0) {
        container.innerHTML = '<p style="color:#adb5bd;text-align:center;">アクティビティがありません</p>';
        return;
    }

    const typeIcons = {
        'call': 'fa-phone',
        'email': 'fa-envelope',
        'meeting': 'fa-users',
        'visit': 'fa-building',
        'note': 'fa-sticky-note',
        'other': 'fa-comment'
    };

    container.innerHTML = activities.map(a => {
        const icon = typeIcons[a.type] || 'fa-comment';
        return `
            <div class="deal-activity-item" style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid #eee;">
                <i class="fas ${icon}" style="color:#0077b6;margin-top:3px;width:16px;text-align:center;"></i>
                <div style="flex:1;">
                    <div style="font-size:0.85rem;">${escapeHtml(a.detail || '')}</div>
                    <div style="font-size:0.75rem;color:#868e96;">${formatDateTime(a.timestamp)} ${a.member ? '- ' + escapeHtml(a.member) : ''}</div>
                </div>
            </div>
        `;
    }).join('');
}

function initDealActivityAdd() {
    const addBtn = document.getElementById('activity-add-btn');
    if (!addBtn) return;
    addBtn.addEventListener('click', () => {
        if (!state.editingDealId) {
            showToast('先に案件を保存してください', 'error');
            return;
        }
        const typeSelect = document.getElementById('activity-type');
        const detailInput = document.getElementById('activity-detail');
        const detail = detailInput ? detailInput.value.trim() : '';
        if (!detail) {
            showToast('アクティビティ内容を入力してください', 'error');
            return;
        }
        const activity = {
            id: generateId(),
            dealId: state.editingDealId,
            type: typeSelect ? typeSelect.value || 'other' : 'other',
            detail: detail,
            member: state.currentUser ? state.currentUser.name : '',
            timestamp: new Date().toISOString()
        };
        state.dealActivities.unshift(activity);
        saveDealActivityToFirestore(activity);
        if (detailInput) detailInput.value = '';
        renderDealActivities(state.editingDealId);
        showToast('アクティビティを追加しました');
    });
}

// ==========================================
// Lead Management
// ==========================================
function initLeadModal() {
    const openBtn = document.getElementById('add-lead-btn');
    if (openBtn) openBtn.addEventListener('click', () => openLeadModal());
    const closeBtn = document.getElementById('lead-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeLeadModal);
    const cancelBtn = document.getElementById('lead-modal-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeLeadModal);
    const saveBtn = document.getElementById('lead-modal-save');
    if (saveBtn) saveBtn.addEventListener('click', saveLead);
    const deleteBtn = document.getElementById('lead-modal-delete');
    if (deleteBtn) deleteBtn.addEventListener('click', deleteLead);
    const convertBtn = document.getElementById('lead-convert-btn');
    if (convertBtn) convertBtn.addEventListener('click', convertLeadToDeal);
    const leadModal = document.getElementById('lead-modal');
    if (leadModal) {
        leadModal.addEventListener('click', (e) => {
            if (e.target.id === 'lead-modal') closeLeadModal();
        });
    }
}

function openLeadModal(leadId = null) {
    state.editingLeadId = leadId;
    const modal = document.getElementById('lead-modal');
    if (!modal) return;
    const title = document.getElementById('lead-modal-title');
    const deleteBtn = document.getElementById('lead-modal-delete');
    const convertBtn = document.getElementById('lead-convert-btn');

    if (leadId) {
        const lead = state.leads.find(l => l.id === leadId);
        if (!lead) return;
        if (title) title.textContent = 'リード編集';
        if (deleteBtn) deleteBtn.style.display = 'flex';
        if (convertBtn) convertBtn.style.display = lead.status !== '商談化' ? 'flex' : 'none';

        const fields = {
            'lead-company': lead.company || '',
            'lead-contact': lead.contact || '',
            'lead-phone': lead.phone || '',
            'lead-email': lead.email || '',
            'lead-source': lead.source || '',
            'lead-status': lead.status || '未対応',
            'lead-member': lead.member || '',
            'lead-notes': lead.notes || ''
        };
        Object.entries(fields).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        });
    } else {
        if (title) title.textContent = 'リード追加';
        if (deleteBtn) deleteBtn.style.display = 'none';
        if (convertBtn) convertBtn.style.display = 'none';
        ['lead-company', 'lead-contact', 'lead-phone', 'lead-email', 'lead-source', 'lead-notes'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const statusEl = document.getElementById('lead-status');
        if (statusEl) statusEl.value = '未対応';
        const memberEl = document.getElementById('lead-member');
        if (memberEl) memberEl.value = '';
    }

    modal.classList.add('show');
}

function closeLeadModal() {
    const modal = document.getElementById('lead-modal');
    if (modal) modal.classList.remove('show');
    state.editingLeadId = null;
}

function saveLead() {
    const companyEl = document.getElementById('lead-company');
    const company = companyEl ? companyEl.value.trim() : '';
    if (!company) {
        showToast('企業名を入力してください', 'error');
        return;
    }

    const data = {
        company: company,
        contact: (document.getElementById('lead-contact') || {}).value || '',
        phone: (document.getElementById('lead-phone') || {}).value || '',
        email: (document.getElementById('lead-email') || {}).value || '',
        source: (document.getElementById('lead-source') || {}).value || '',
        status: (document.getElementById('lead-status') || {}).value || '未対応',
        member: (document.getElementById('lead-member') || {}).value || '',
        notes: (document.getElementById('lead-notes') || {}).value || '',
        updatedAt: new Date().toISOString()
    };

    if (state.editingLeadId) {
        const lead = state.leads.find(l => l.id === state.editingLeadId);
        if (lead) {
            Object.assign(lead, data);
            saveLeadToFirestore(lead);
            showToast('リードを更新しました');
        }
    } else {
        const newLead = {
            id: generateId(),
            ...data,
            createdAt: new Date().toISOString()
        };
        state.leads.push(newLead);
        saveLeadToFirestore(newLead);
        showToast('リードを追加しました');
    }

    closeLeadModal();
    renderLeadsView();
}

function deleteLead() {
    if (!state.editingLeadId) return;
    const lead = state.leads.find(l => l.id === state.editingLeadId);
    if (!lead) return;
    if (!confirm(`「${lead.company}」のリードを削除しますか？`)) return;

    state.leads = state.leads.filter(l => l.id !== state.editingLeadId);
    deleteLeadFromFirestore(state.editingLeadId);
    closeLeadModal();
    renderLeadsView();
    showToast('リードを削除しました');
}

function convertLeadToDeal() {
    if (!state.editingLeadId) return;
    const lead = state.leads.find(l => l.id === state.editingLeadId);
    if (!lead) return;
    if (!confirm(`「${lead.company}」を商談に変換しますか？`)) return;

    const newDeal = {
        id: generateId(),
        company: lead.company || '',
        member: lead.member || '',
        phase: 'リスト',
        contact: lead.contact || '',
        phone: lead.phone || '',
        email: lead.email || '',
        tags: [],
        callResult: '',
        nextAction: '',
        nextDate: '',
        amount: 0,
        notes: lead.notes || '',
        expectedRevenue: 0,
        probability: 0,
        expectedCloseDate: '',
        approvalRequired: false,
        approvalStatus: '',
        approver: '',
        approvalDate: '',
        budgetConfirmed: false,
        lossReason: '',
        lossDetail: '',
        competitor: '',
        companyId: '',
        playbookChecks: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    state.deals.push(newDeal);
    saveDealToFirestore(newDeal);

    const activity = {
        id: generateId(),
        dealId: newDeal.id,
        message: `${lead.company}: リードから商談化`,
        member: lead.member || '',
        timestamp: new Date().toISOString()
    };
    state.activityLog.unshift(activity);
    saveActivityToFirestore(activity);

    // Mark lead as 商談化
    lead.status = '商談化';
    lead.updatedAt = new Date().toISOString();
    saveLeadToFirestore(lead);

    closeLeadModal();
    renderLeadsView();
    renderAll();
    showToast(`「${lead.company}」を商談に変換しました`);
}

function renderLeadsView() {
    const container = document.getElementById('leads-table-body');
    if (!container) return;

    const searchEl = document.getElementById('leads-search');
    const statusFilterEl = document.getElementById('leads-status-filter');
    const searchTerm = searchEl ? searchEl.value.toLowerCase() : '';
    const statusFilter = statusFilterEl ? statusFilterEl.value : 'all';

    let leads = [...state.leads];

    if (searchTerm) {
        leads = leads.filter(l =>
            (l.company || '').toLowerCase().includes(searchTerm) ||
            (l.contact || '').toLowerCase().includes(searchTerm) ||
            (l.member || '').toLowerCase().includes(searchTerm)
        );
    }

    if (statusFilter !== 'all') {
        leads = leads.filter(l => l.status === statusFilter);
    }

    const statusColors = {
        '未対応': '#e74c3c',
        '対応中': '#f5a623',
        '商談化': '#29cc6b',
        '対象外': '#868e96'
    };

    container.innerHTML = leads.map(l => `
        <tr>
            <td><strong>${escapeHtml(l.company || '')}</strong></td>
            <td>${escapeHtml(l.contact || '-')}</td>
            <td>${escapeHtml(l.source || '-')}</td>
            <td><span style="background:${statusColors[l.status] || '#868e96'};color:#fff;padding:2px 8px;border-radius:4px;font-size:0.75rem;">${escapeHtml(l.status || '未対応')}</span></td>
            <td>${l.member ? `<span class="deal-card-member" style="background:${MEMBER_COLORS[l.member] || '#005c91'}">${escapeHtml(l.member)}</span>` : '-'}</td>
            <td>${formatDate(l.updatedAt || l.createdAt)}</td>
            <td>
                <div class="action-btns">
                    <button onclick="openLeadModal('${l.id}')" title="編集"><i class="fas fa-pen"></i></button>
                </div>
            </td>
        </tr>
    `).join('');

    if (leads.length === 0) {
        container.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#adb5bd;">リードがありません</td></tr>';
    }

    // Wire up search and filter events
    if (searchEl && !searchEl.dataset.wired) {
        searchEl.addEventListener('input', () => renderLeadsView());
        searchEl.dataset.wired = 'true';
    }
    if (statusFilterEl && !statusFilterEl.dataset.wired) {
        statusFilterEl.addEventListener('change', () => renderLeadsView());
        statusFilterEl.dataset.wired = 'true';
    }
}

// ==========================================
// Company Management
// ==========================================
function initCompanyModal() {
    const openBtn = document.getElementById('add-company-btn');
    if (openBtn) openBtn.addEventListener('click', () => openCompanyModal());
    const closeBtn = document.getElementById('company-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeCompanyModal);
    const cancelBtn = document.getElementById('company-modal-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeCompanyModal);
    const saveBtn = document.getElementById('company-modal-save');
    if (saveBtn) saveBtn.addEventListener('click', saveCompany);
    const deleteBtn = document.getElementById('company-modal-delete');
    if (deleteBtn) deleteBtn.addEventListener('click', deleteCompany);
    const companyModal = document.getElementById('company-modal');
    if (companyModal) {
        companyModal.addEventListener('click', (e) => {
            if (e.target.id === 'company-modal') closeCompanyModal();
        });
    }
    // Add contact button inside company modal
    const addContactBtn = document.getElementById('company-add-contact-btn');
    if (addContactBtn) {
        addContactBtn.addEventListener('click', () => {
            if (state.editingCompanyId) {
                openContactModal(null, state.editingCompanyId);
            } else {
                showToast('先に企業を保存してください', 'error');
            }
        });
    }
}

function openCompanyModal(companyId = null) {
    state.editingCompanyId = companyId;
    const modal = document.getElementById('company-modal');
    if (!modal) return;
    const title = document.getElementById('company-modal-title');
    const deleteBtn = document.getElementById('company-modal-delete');

    if (companyId) {
        const company = state.companies.find(c => c.id === companyId);
        if (!company) return;
        if (title) title.textContent = '企業編集';
        if (deleteBtn) deleteBtn.style.display = 'flex';

        const fields = {
            'company-name': company.name || '',
            'company-industry': company.industry || '',
            'company-employee-count': company.employeeCount || '',
            'company-address': company.address || '',
            'company-website': company.website || '',
            'company-phone': company.phone || '',
            'company-notes': company.notes || ''
        };
        Object.entries(fields).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        });

        renderCompanyContacts(companyId);
    } else {
        if (title) title.textContent = '企業追加';
        if (deleteBtn) deleteBtn.style.display = 'none';
        ['company-name', 'company-industry', 'company-employee-count', 'company-address', 'company-website', 'company-phone', 'company-notes'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const contactsList = document.getElementById('company-contacts-list');
        if (contactsList) contactsList.innerHTML = '<p style="color:#adb5bd;text-align:center;">企業を保存してから連絡先を追加できます</p>';
    }

    modal.classList.add('show');
}

function closeCompanyModal() {
    const modal = document.getElementById('company-modal');
    if (modal) modal.classList.remove('show');
    state.editingCompanyId = null;
}

function saveCompany() {
    const nameEl = document.getElementById('company-name');
    const name = nameEl ? nameEl.value.trim() : '';
    if (!name) {
        showToast('企業名を入力してください', 'error');
        return;
    }

    const data = {
        name: name,
        industry: (document.getElementById('company-industry') || {}).value || '',
        employeeCount: (document.getElementById('company-employee-count') || {}).value || '',
        address: (document.getElementById('company-address') || {}).value || '',
        website: (document.getElementById('company-website') || {}).value || '',
        phone: (document.getElementById('company-phone') || {}).value || '',
        notes: (document.getElementById('company-notes') || {}).value || '',
        updatedAt: new Date().toISOString()
    };

    if (state.editingCompanyId) {
        const company = state.companies.find(c => c.id === state.editingCompanyId);
        if (company) {
            Object.assign(company, data);
            saveCompanyToFirestore(company);
            showToast('企業情報を更新しました');
        }
    } else {
        const newCompany = {
            id: generateId(),
            ...data,
            createdAt: new Date().toISOString()
        };
        state.companies.push(newCompany);
        saveCompanyToFirestore(newCompany);
        state.editingCompanyId = newCompany.id;
        showToast('企業を追加しました');
    }

    closeCompanyModal();
    renderCompaniesView();
}

function deleteCompany() {
    if (!state.editingCompanyId) return;
    const company = state.companies.find(c => c.id === state.editingCompanyId);
    if (!company) return;
    if (!confirm(`「${company.name}」を削除しますか？関連する連絡先も確認してください。`)) return;

    state.companies = state.companies.filter(c => c.id !== state.editingCompanyId);
    deleteCompanyFromFirestore(state.editingCompanyId);
    closeCompanyModal();
    renderCompaniesView();
    showToast('企業を削除しました');
}

function renderCompaniesView() {
    const container = document.getElementById('companies-grid');
    if (!container) return;

    const searchEl = document.getElementById('companies-search');
    const searchTerm = searchEl ? searchEl.value.toLowerCase() : '';

    let companies = [...state.companies];

    if (searchTerm) {
        companies = companies.filter(c =>
            (c.name || '').toLowerCase().includes(searchTerm) ||
            (c.industry || '').toLowerCase().includes(searchTerm)
        );
    }

    container.innerHTML = companies.map(c => {
        const contactCount = state.contacts.filter(ct => ct.companyId === c.id).length;
        const dealCount = state.deals.filter(d => d.companyId === c.id).length;

        return `
            <div class="entity-card" onclick="openCompanyModal('${c.id}')">
                <div class="entity-card-header">
                    <h4>${escapeHtml(c.name || '')}</h4>
                </div>
                <div class="entity-card-body">
                    ${c.industry ? `<div><i class="fas fa-industry" style="width:16px;color:#868e96;"></i> ${escapeHtml(c.industry)}</div>` : ''}
                    ${c.employeeCount ? `<div><i class="fas fa-users" style="width:16px;color:#868e96;"></i> ${escapeHtml(String(c.employeeCount))}名</div>` : ''}
                    <div><i class="fas fa-address-book" style="width:16px;color:#868e96;"></i> 連絡先: ${contactCount}件</div>
                    <div><i class="fas fa-briefcase" style="width:16px;color:#868e96;"></i> 商談: ${dealCount}件</div>
                </div>
            </div>
        `;
    }).join('');

    if (companies.length === 0) {
        container.innerHTML = '<p style="text-align:center;padding:40px;color:#adb5bd;">企業が登録されていません</p>';
    }

    if (searchEl && !searchEl.dataset.wired) {
        searchEl.addEventListener('input', () => renderCompaniesView());
        searchEl.dataset.wired = 'true';
    }
}

// ==========================================
// Contact Management
// ==========================================
function initContactModal() {
    const closeBtn = document.getElementById('contact-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeContactModal);
    const cancelBtn = document.getElementById('contact-modal-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeContactModal);
    const saveBtn = document.getElementById('contact-modal-save');
    if (saveBtn) saveBtn.addEventListener('click', saveContact);
    const deleteBtn = document.getElementById('contact-modal-delete');
    if (deleteBtn) deleteBtn.addEventListener('click', deleteContact);
    const contactModal = document.getElementById('contact-modal');
    if (contactModal) {
        contactModal.addEventListener('click', (e) => {
            if (e.target.id === 'contact-modal') closeContactModal();
        });
    }
}

function openContactModal(contactId = null, companyId = null) {
    state.editingContactId = contactId;
    state.editingContactCompanyId = companyId;
    const modal = document.getElementById('contact-modal');
    if (!modal) return;
    const title = document.getElementById('contact-modal-title');
    const deleteBtn = document.getElementById('contact-modal-delete');

    if (contactId) {
        const contact = state.contacts.find(c => c.id === contactId);
        if (!contact) return;
        if (title) title.textContent = '連絡先編集';
        if (deleteBtn) deleteBtn.style.display = 'flex';

        const fields = {
            'contact-name': contact.name || '',
            'contact-position': contact.position || '',
            'contact-phone': contact.phone || '',
            'contact-email': contact.email || '',
            'contact-notes': contact.notes || ''
        };
        Object.entries(fields).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        });
    } else {
        if (title) title.textContent = '連絡先追加';
        if (deleteBtn) deleteBtn.style.display = 'none';
        ['contact-name', 'contact-position', 'contact-phone', 'contact-email', 'contact-notes'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    }

    modal.classList.add('show');
}

function closeContactModal() {
    const modal = document.getElementById('contact-modal');
    if (modal) modal.classList.remove('show');
    state.editingContactId = null;
}

function saveContact() {
    const nameEl = document.getElementById('contact-name');
    const name = nameEl ? nameEl.value.trim() : '';
    if (!name) {
        showToast('連絡先名を入力してください', 'error');
        return;
    }

    const data = {
        name: name,
        companyId: state.editingContactCompanyId || '',
        position: (document.getElementById('contact-position') || {}).value || '',
        phone: (document.getElementById('contact-phone') || {}).value || '',
        email: (document.getElementById('contact-email') || {}).value || '',
        notes: (document.getElementById('contact-notes') || {}).value || '',
        updatedAt: new Date().toISOString()
    };

    if (state.editingContactId) {
        const contact = state.contacts.find(c => c.id === state.editingContactId);
        if (contact) {
            Object.assign(contact, data);
            saveContactToFirestore(contact);
            showToast('連絡先を更新しました');
        }
    } else {
        const newContact = {
            id: generateId(),
            ...data,
            createdAt: new Date().toISOString()
        };
        state.contacts.push(newContact);
        saveContactToFirestore(newContact);
        showToast('連絡先を追加しました');
    }

    closeContactModal();
    // Refresh company contacts if company modal is open
    if (state.editingCompanyId) {
        renderCompanyContacts(state.editingCompanyId);
    }
    renderCompaniesView();
}

function deleteContact() {
    if (!state.editingContactId) return;
    const contact = state.contacts.find(c => c.id === state.editingContactId);
    if (!contact) return;
    if (!confirm(`「${contact.name}」を削除しますか？`)) return;

    state.contacts = state.contacts.filter(c => c.id !== state.editingContactId);
    deleteContactFromFirestore(state.editingContactId);
    closeContactModal();
    if (state.editingCompanyId) {
        renderCompanyContacts(state.editingCompanyId);
    }
    renderCompaniesView();
    showToast('連絡先を削除しました');
}

function renderCompanyContacts(companyId) {
    const container = document.getElementById('company-contacts-list');
    if (!container) return;

    const contacts = state.contacts.filter(c => c.companyId === companyId);
    if (contacts.length === 0) {
        container.innerHTML = '<p style="color:#adb5bd;text-align:center;">連絡先が登録されていません</p>';
        return;
    }

    container.innerHTML = contacts.map(c => `
        <div class="contact-item" style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #eee;border-radius:6px;margin-bottom:4px;cursor:pointer;" onclick="openContactModal('${c.id}', '${companyId}')">
            <div style="width:32px;height:32px;border-radius:50%;background:#0077b6;color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.8rem;">${escapeHtml((c.name || 'U')[0])}</div>
            <div style="flex:1;">
                <div style="font-weight:600;font-size:0.85rem;">${escapeHtml(c.name || '')}</div>
                <div style="font-size:0.75rem;color:#868e96;">${escapeHtml(c.position || '')} ${c.phone ? '/ ' + escapeHtml(c.phone) : ''}</div>
            </div>
        </div>
    `).join('');
}

// ==========================================
// Contract Management
// ==========================================
function initContractModal() {
    const openBtn = document.getElementById('add-contract-btn');
    if (openBtn) openBtn.addEventListener('click', () => openContractModal());
    const closeBtn = document.getElementById('contract-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeContractModal);
    const cancelBtn = document.getElementById('contract-modal-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeContractModal);
    const saveBtn = document.getElementById('contract-modal-save');
    if (saveBtn) saveBtn.addEventListener('click', saveContract);
    const deleteBtn = document.getElementById('contract-modal-delete');
    if (deleteBtn) deleteBtn.addEventListener('click', deleteContract);
    const contractModal = document.getElementById('contract-modal');
    if (contractModal) {
        contractModal.addEventListener('click', (e) => {
            if (e.target.id === 'contract-modal') closeContractModal();
        });
    }
}

function openContractModal(contractId = null) {
    state.editingContractId = contractId;
    const modal = document.getElementById('contract-modal');
    if (!modal) return;
    const title = document.getElementById('contract-modal-title');
    const deleteBtn = document.getElementById('contract-modal-delete');

    // Populate company select
    const companySelect = document.getElementById('contract-company-id');
    if (companySelect) {
        companySelect.innerHTML = '<option value="">-- 企業を選択 --</option>' +
            state.companies.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
    }

    // Populate deal select
    const dealSelect = document.getElementById('contract-deal-id');
    if (dealSelect) {
        dealSelect.innerHTML = '<option value="">-- 商談を選択 --</option>' +
            state.deals.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.company)} - ${escapeHtml(d.phase)}</option>`).join('');
    }

    if (contractId) {
        const contract = state.contracts.find(c => c.id === contractId);
        if (!contract) return;
        if (title) title.textContent = '契約編集';
        if (deleteBtn) deleteBtn.style.display = 'flex';

        const fields = {
            'contract-title': contract.title || '',
            'contract-company-id': contract.companyId || '',
            'contract-deal-id': contract.dealId || '',
            'contract-amount': contract.amount || '',
            'contract-start-date': contract.startDate || '',
            'contract-end-date': contract.endDate || '',
            'contract-renewal-date': contract.renewalDate || '',
            'contract-status': contract.status || '',
            'contract-type': contract.type || '',
            'contract-notes': contract.notes || ''
        };
        Object.entries(fields).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        });
    } else {
        if (title) title.textContent = '契約追加';
        if (deleteBtn) deleteBtn.style.display = 'none';
        ['contract-title', 'contract-amount', 'contract-start-date', 'contract-end-date', 'contract-renewal-date', 'contract-notes'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        if (companySelect) companySelect.value = '';
        if (dealSelect) dealSelect.value = '';
        const statusEl = document.getElementById('contract-status');
        if (statusEl) statusEl.value = '';
        const typeEl = document.getElementById('contract-type');
        if (typeEl) typeEl.value = '';
    }

    modal.classList.add('show');
}

function closeContractModal() {
    const modal = document.getElementById('contract-modal');
    if (modal) modal.classList.remove('show');
    state.editingContractId = null;
}

function saveContract() {
    const titleEl = document.getElementById('contract-title');
    const contractTitle = titleEl ? titleEl.value.trim() : '';
    if (!contractTitle) {
        showToast('契約タイトルを入力してください', 'error');
        return;
    }

    const data = {
        title: contractTitle,
        companyId: (document.getElementById('contract-company-id') || {}).value || '',
        dealId: (document.getElementById('contract-deal-id') || {}).value || '',
        amount: document.getElementById('contract-amount') && document.getElementById('contract-amount').value ? Number(document.getElementById('contract-amount').value) : 0,
        startDate: (document.getElementById('contract-start-date') || {}).value || '',
        endDate: (document.getElementById('contract-end-date') || {}).value || '',
        renewalDate: (document.getElementById('contract-renewal-date') || {}).value || '',
        status: (document.getElementById('contract-status') || {}).value || '',
        type: (document.getElementById('contract-type') || {}).value || '',
        notes: (document.getElementById('contract-notes') || {}).value || '',
        updatedAt: new Date().toISOString()
    };

    if (state.editingContractId) {
        const contract = state.contracts.find(c => c.id === state.editingContractId);
        if (contract) {
            Object.assign(contract, data);
            saveContractToFirestore(contract);
            showToast('契約を更新しました');
        }
    } else {
        const newContract = {
            id: generateId(),
            ...data,
            createdAt: new Date().toISOString()
        };
        state.contracts.push(newContract);
        saveContractToFirestore(newContract);
        showToast('契約を追加しました');
    }

    closeContractModal();
    renderContractsView();
}

function deleteContract() {
    if (!state.editingContractId) return;
    const contract = state.contracts.find(c => c.id === state.editingContractId);
    if (!contract) return;
    if (!confirm(`「${contract.title}」の契約を削除しますか？`)) return;

    state.contracts = state.contracts.filter(c => c.id !== state.editingContractId);
    deleteContractFromFirestore(state.editingContractId);
    closeContractModal();
    renderContractsView();
    showToast('契約を削除しました');
}

function renderContractsView() {
    const container = document.getElementById('contracts-table-body');
    if (!container) return;

    const searchEl = document.getElementById('contracts-search');
    const statusFilterEl = document.getElementById('contracts-status-filter');
    const searchTerm = searchEl ? searchEl.value.toLowerCase() : '';
    const statusFilter = statusFilterEl ? statusFilterEl.value : 'all';

    let contracts = [...state.contracts];

    if (searchTerm) {
        contracts = contracts.filter(c => {
            const company = state.companies.find(comp => comp.id === c.companyId);
            const companyName = company ? company.name : '';
            return (c.title || '').toLowerCase().includes(searchTerm) ||
                   companyName.toLowerCase().includes(searchTerm);
        });
    }

    if (statusFilter !== 'all') {
        contracts = contracts.filter(c => c.status === statusFilter);
    }

    const statusColors = {
        '有効': '#29cc6b',
        '期限切れ': '#e74c3c',
        '更新待ち': '#f5a623',
        '解約': '#868e96',
        '交渉中': '#0077b6'
    };

    container.innerHTML = contracts.map(c => {
        const company = state.companies.find(comp => comp.id === c.companyId);
        const companyName = company ? company.name : '-';

        return `
            <tr>
                <td><strong>${escapeHtml(c.title || '')}</strong></td>
                <td>${escapeHtml(companyName)}</td>
                <td>${c.amount ? '¥' + Number(c.amount).toLocaleString() : '-'}</td>
                <td>${c.startDate ? formatDate(c.startDate) : '-'} ~ ${c.endDate ? formatDate(c.endDate) : '-'}</td>
                <td>${c.renewalDate ? formatDate(c.renewalDate) : '-'}</td>
                <td><span style="background:${statusColors[c.status] || '#868e96'};color:#fff;padding:2px 8px;border-radius:4px;font-size:0.75rem;">${escapeHtml(c.status || '-')}</span></td>
                <td>
                    <div class="action-btns">
                        <button onclick="openContractModal('${c.id}')" title="編集"><i class="fas fa-pen"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    if (contracts.length === 0) {
        container.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#adb5bd;">契約がありません</td></tr>';
    }

    if (searchEl && !searchEl.dataset.wired) {
        searchEl.addEventListener('input', () => renderContractsView());
        searchEl.dataset.wired = 'true';
    }
    if (statusFilterEl && !statusFilterEl.dataset.wired) {
        statusFilterEl.addEventListener('change', () => renderContractsView());
        statusFilterEl.dataset.wired = 'true';
    }
}

// ==========================================
// Dashboard
// ==========================================
function renderDashboard() {
    renderDashboardForecast();
    renderDashboardPipeline();
    renderDashboardTasks();
    renderDashboardLeads();
    renderDashboardRenewals();
    renderDashboardMonthly();
}

function renderDashboardForecast() {
    const container = document.getElementById('dashboard-forecast');
    if (!container) return;

    const deals = state.deals.filter(d => d.phase !== 'クローズ');
    const totalWeighted = deals.reduce((sum, d) => {
        const rev = Number(d.expectedRevenue) || Number(d.amount) || 0;
        const prob = Number(d.probability) || 0;
        return sum + Math.round(rev * prob / 100);
    }, 0);

    const ranges = [
        { label: '10-30%', min: 10, max: 30 },
        { label: '40-60%', min: 40, max: 60 },
        { label: '70-90%', min: 70, max: 90 },
        { label: '100%', min: 100, max: 100 }
    ];

    const rangeCounts = ranges.map(r => {
        const count = deals.filter(d => {
            const prob = Number(d.probability) || 0;
            return prob >= r.min && prob <= r.max;
        }).length;
        return { ...r, count };
    });

    container.innerHTML = `
        <div style="text-align:center;margin-bottom:16px;">
            <div style="font-size:0.85rem;color:#868e96;">加重売上予測合計</div>
            <div style="font-size:1.8rem;font-weight:700;color:#005c91;">¥${totalWeighted.toLocaleString()}</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
            ${rangeCounts.map(r => `
                <div style="text-align:center;padding:8px;background:#f8f9fa;border-radius:6px;">
                    <div style="font-size:0.75rem;color:#868e96;">${r.label}</div>
                    <div style="font-size:1.2rem;font-weight:600;">${r.count}件</div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderDashboardPipeline() {
    const container = document.getElementById('dashboard-pipeline');
    if (!container) return;

    const deals = state.deals.filter(d => d.phase !== 'クローズ');
    const ranges = [
        { label: '10-30%', min: 10, max: 30, color: '#e74c3c' },
        { label: '40-60%', min: 40, max: 60, color: '#f5a623' },
        { label: '70-90%', min: 70, max: 90, color: '#0077b6' },
        { label: '100%', min: 100, max: 100, color: '#29cc6b' }
    ];

    const rangeCounts = ranges.map(r => {
        const count = deals.filter(d => {
            const prob = Number(d.probability) || 0;
            return prob >= r.min && prob <= r.max;
        }).length;
        return { ...r, count };
    });

    const maxCount = Math.max(...rangeCounts.map(r => r.count), 1);

    container.innerHTML = `
        <div style="display:flex;align-items:flex-end;gap:12px;height:120px;padding:0 8px;">
            ${rangeCounts.map(r => {
                const height = Math.max((r.count / maxCount) * 100, 4);
                return `
                    <div style="flex:1;text-align:center;">
                        <div style="font-size:0.75rem;font-weight:600;margin-bottom:4px;">${r.count}</div>
                        <div style="height:${height}px;background:${r.color};border-radius:4px 4px 0 0;"></div>
                        <div style="font-size:0.7rem;color:#868e96;margin-top:4px;">${r.label}</div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderDashboardTasks() {
    const container = document.getElementById('dashboard-tasks');
    if (!container) return;

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    const pendingTasks = state.dealTasks.filter(t => !t.completed);
    const overdueTasks = pendingTasks.filter(t => t.dueDate && t.dueDate < todayStr);

    container.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div style="text-align:center;padding:12px;background:#f8f9fa;border-radius:6px;">
                <div style="font-size:0.75rem;color:#868e96;">未完了タスク</div>
                <div style="font-size:1.5rem;font-weight:700;color:#0077b6;">${pendingTasks.length}</div>
            </div>
            <div style="text-align:center;padding:12px;background:${overdueTasks.length > 0 ? '#fef2f2' : '#f8f9fa'};border-radius:6px;">
                <div style="font-size:0.75rem;color:#868e96;">期限超過</div>
                <div style="font-size:1.5rem;font-weight:700;color:${overdueTasks.length > 0 ? '#e74c3c' : '#29cc6b'};">${overdueTasks.length}</div>
            </div>
        </div>
    `;
}

function renderDashboardLeads() {
    const container = document.getElementById('dashboard-leads');
    if (!container) return;

    const statuses = ['未対応', '対応中', '商談化', '対象外'];
    const statusColors = {
        '未対応': '#e74c3c',
        '対応中': '#f5a623',
        '商談化': '#29cc6b',
        '対象外': '#868e96'
    };

    container.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
            ${statuses.map(s => {
                const count = state.leads.filter(l => l.status === s).length;
                return `
                    <div style="text-align:center;padding:8px;background:#f8f9fa;border-radius:6px;">
                        <div style="font-size:0.7rem;color:${statusColors[s]};font-weight:600;">${s}</div>
                        <div style="font-size:1.2rem;font-weight:700;">${count}</div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderDashboardRenewals() {
    const container = document.getElementById('dashboard-renewals');
    if (!container) return;

    const now = new Date();
    const thirtyDaysLater = new Date(now);
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
    const todayStr = now.toISOString().slice(0, 10);
    const futureStr = thirtyDaysLater.toISOString().slice(0, 10);

    const upcoming = state.contracts.filter(c => {
        return c.renewalDate && c.renewalDate >= todayStr && c.renewalDate <= futureStr;
    });

    if (upcoming.length === 0) {
        container.innerHTML = '<p style="color:#adb5bd;text-align:center;font-size:0.85rem;">30日以内に更新予定の契約はありません</p>';
        return;
    }

    container.innerHTML = upcoming.map(c => {
        const company = state.companies.find(comp => comp.id === c.companyId);
        const companyName = company ? company.name : '-';
        return `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #eee;font-size:0.85rem;">
                <span>${escapeHtml(c.title || '')} <span style="color:#868e96;">(${escapeHtml(companyName)})</span></span>
                <span style="color:#f5a623;font-weight:600;">${formatDate(c.renewalDate)}</span>
            </div>
        `;
    }).join('');
}

function renderDashboardMonthly() {
    const container = document.getElementById('dashboard-monthly');
    if (!container) return;

    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
            label: `${d.getMonth() + 1}月`,
            year: d.getFullYear(),
            month: d.getMonth()
        });
    }

    const wonPhases = ['受注', '契約書対応中', '入金済み'];
    const monthlyCounts = months.map(m => {
        const count = state.deals.filter(d => {
            if (!wonPhases.includes(d.phase)) return false;
            const updated = new Date(d.updatedAt || d.createdAt);
            return updated.getFullYear() === m.year && updated.getMonth() === m.month;
        }).length;
        return { ...m, count };
    });

    const maxCount = Math.max(...monthlyCounts.map(m => m.count), 1);

    container.innerHTML = `
        <div style="display:flex;align-items:flex-end;gap:8px;height:100px;padding:0 4px;">
            ${monthlyCounts.map(m => {
                const height = Math.max((m.count / maxCount) * 80, 4);
                return `
                    <div style="flex:1;text-align:center;">
                        <div style="font-size:0.7rem;font-weight:600;margin-bottom:2px;">${m.count}</div>
                        <div style="height:${height}px;background:#0077b6;border-radius:4px 4px 0 0;"></div>
                        <div style="font-size:0.65rem;color:#868e96;margin-top:2px;">${m.label}</div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// ==========================================
// Mobile More Menu
// ==========================================
function initMobileMoreMenu() {
    const moreBtn = document.querySelector('.bottom-nav-item[data-view="more-menu"]');
    if (moreBtn) {
        moreBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const menu = document.getElementById('mobile-more-menu');
            if (menu) {
                menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
            }
        });
    }

    document.querySelectorAll('.more-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            if (view) {
                switchView(view);
                const menu = document.getElementById('mobile-more-menu');
                if (menu) menu.style.display = 'none';
            }
        });
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
    if (state.currentView === 'leads') renderLeadsView();
    if (state.currentView === 'companies') renderCompaniesView();
    if (state.currentView === 'contracts') renderContractsView();
    if (state.currentView === 'dashboard') renderDashboard();
}

// ==========================================
// Initialize
// ==========================================
function init() {
    loadStateFromLocal(); // ローカルデータをまず読み込み（オフライン対応）
    initAuth();           // Firebase Auth 初期化（onAuthStateChangedでリスナー開始）
    initNavigation();
    initDealModal();
    initDealModalTabs();
    initDealTaskAdd();
    initDealActivityAdd();
    initFilters();
    initSettings();
    initLeadModal();
    initCompanyModal();
    initContactModal();
    initContractModal();
    initMobileMoreMenu();

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeDealModal();
            closeLeadModal();
            closeCompanyModal();
            closeContactModal();
            closeContractModal();
            document.getElementById('activity-modal').classList.remove('show');
        }
    });
}

// Start
document.addEventListener('DOMContentLoaded', init);
