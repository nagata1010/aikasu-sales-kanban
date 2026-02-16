/* ==========================================
   AIKASU Sales Manager - Application
   ========================================== */

// ==========================================
// Configuration
// ==========================================
const PHASES = [
    'リスト', 'コール中', 'アポ取得', 'アポ実施',
    '提案済み', '受注', '契約書対応中', '入金済み'
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

// 許可されたメールアドレス（ここに登録されたアドレスのみログイン可能）
const ALLOWED_EMAILS_DEFAULT = [
    'abe.keisuke@aikasu.jp',
    'kamijima.nanami@aikasu.jp',
    'intern@aikasu.jp',
    'info@aikasu.jp'
];

// Google OAuth Client ID - Google Cloud Consoleで取得して設定してください
// 設定手順: https://console.cloud.google.com/ → APIとサービス → 認証情報 → OAuth 2.0 クライアントID
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID';

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
// Storage
// ==========================================
function saveState() {
    const data = {
        deals: state.deals,
        activityLog: state.activityLog,
        allowedEmails: state.allowedEmails
    };
    localStorage.setItem('aikasu_sales_data', JSON.stringify(data));
}

function loadState() {
    try {
        const raw = localStorage.getItem('aikasu_sales_data');
        if (raw) {
            const data = JSON.parse(raw);
            state.deals = data.deals || [];
            state.activityLog = data.activityLog || [];
            state.allowedEmails = data.allowedEmails || [];
        }
    } catch (e) {
        console.error('Failed to load state:', e);
    }
    // デフォルトの許可メールアドレスを常に含める（削除されても復元される）
    ALLOWED_EMAILS_DEFAULT.forEach(email => {
        if (!state.allowedEmails.includes(email)) {
            state.allowedEmails.push(email);
        }
    });
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
// Authentication (Google OAuth)
// ==========================================

function isEmailAllowed(email) {
    if (!email) return false;
    const normalizedEmail = email.toLowerCase().trim();
    // ハードコードのデフォルトリスト + 設定画面で追加されたリストの両方をチェック
    const allAllowed = [...new Set([...ALLOWED_EMAILS_DEFAULT, ...state.allowedEmails])];
    return allAllowed.includes(normalizedEmail);
}

function initAuth() {
    const loginBtn = document.getElementById('google-login-btn');
    const logoutBtn = document.getElementById('logout-btn');

    loginBtn.addEventListener('click', handleLogin);
    logoutBtn.addEventListener('click', handleLogout);

    // Google Identity Services ライブラリの読み込みチェック
    initGoogleAuth();

    // 保存セッションの復元（メールアドレスの再検証あり）
    const savedUser = sessionStorage.getItem('aikasu_user');
    if (savedUser) {
        try {
            const user = JSON.parse(savedUser);
            // 保存されたセッションでも毎回メールアドレスを検証する
            if (isEmailAllowed(user.email)) {
                state.currentUser = user;
                showApp();
            } else {
                sessionStorage.removeItem('aikasu_user');
                showLogin();
            }
        } catch (e) {
            showLogin();
        }
    } else {
        showLogin();
    }
}

function initGoogleAuth() {
    // Google Identity Services (GIS) のスクリプトを動的に読み込み
    if (GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') {
        console.log('Google Client ID未設定: ローカル認証モードで動作します');
        return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
}

async function handleLogin() {
    // Google Identity Services が利用可能な場合
    if (GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID' && typeof google !== 'undefined' && google.accounts) {
        try {
            const client = google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CLIENT_ID,
                scope: 'email profile',
                callback: (response) => {
                    if (response.access_token) {
                        // ユーザー情報を取得
                        fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                            headers: { Authorization: `Bearer ${response.access_token}` }
                        })
                        .then(res => res.json())
                        .then(userInfo => {
                            if (!isEmailAllowed(userInfo.email)) {
                                showToast('このアカウントにはアクセス権がありません。管理者に連絡してください。', 'error');
                                return;
                            }
                            state.currentUser = {
                                name: userInfo.name,
                                email: userInfo.email,
                                photo: userInfo.picture
                            };
                            sessionStorage.setItem('aikasu_user', JSON.stringify(state.currentUser));
                            showApp();
                        })
                        .catch(() => {
                            showToast('ユーザー情報の取得に失敗しました', 'error');
                        });
                    }
                }
            });
            client.requestAccessToken();
            return;
        } catch (e) {
            console.error('Google OAuth error:', e);
            showToast('Google認証でエラーが発生しました', 'error');
            return;
        }
    }

    // Google Client ID 未設定時：ローカル認証モード（許可リストで厳格にチェック）
    const email = prompt(
        'Googleアカウントのメールアドレスを入力してください\n\n' +
        '※ Google Client ID未設定のため、ローカル認証モードです。\n' +
        '※ 許可されたメールアドレスのみログインできます。'
    );
    if (!email) return;

    const normalizedEmail = email.toLowerCase().trim();

    // 許可リストに含まれているか厳格にチェック
    if (!isEmailAllowed(normalizedEmail)) {
        showToast('このメールアドレスにはアクセス権がありません。', 'error');
        return;
    }

    const name = normalizedEmail.split('@')[0];
    state.currentUser = { name, email: normalizedEmail, photo: null };
    sessionStorage.setItem('aikasu_user', JSON.stringify(state.currentUser));
    showApp();
}

function handleLogout() {
    state.currentUser = null;
    sessionStorage.removeItem('aikasu_user');
    showLogin();
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
    // サイドバーナビ（PC用）
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            switchView(view);
        });
    });

    // モバイルボトムナビ
    document.querySelectorAll('.bottom-nav-item[data-view]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            switchView(view);
        });
    });

    // モバイル用「追加」ボタン
    const mobileAddBtn = document.getElementById('mobile-add-btn');
    if (mobileAddBtn) {
        mobileAddBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openDealModal();
        });
    }

    // ハンバーガーメニュー（タブレット用）
    document.getElementById('mobile-menu-btn').addEventListener('click', () => {
        openSidebar();
    });

    document.getElementById('sidebar-toggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('collapsed');
    });

    // サイドバーオーバーレイ（モバイル/タブレット用）
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) {
        overlay.addEventListener('click', closeSidebar);
    }

    // メインコンテンツクリックでサイドバー閉じる
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

    // サイドバーナビのactive更新
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const sidebarItem = document.querySelector(`.nav-item[data-view="${view}"]`);
    if (sidebarItem) sidebarItem.classList.add('active');

    // ボトムナビのactive更新
    document.querySelectorAll('.bottom-nav-item').forEach(n => n.classList.remove('active'));
    const bottomItem = document.querySelector(`.bottom-nav-item[data-view="${view}"]`);
    if (bottomItem) bottomItem.classList.add('active');

    // ビュー切替
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');

    const titles = {
        kanban: 'カンバンボード',
        list: 'リスト表示',
        report: 'レポート',
        settings: '設定'
    };
    document.getElementById('page-title').textContent = titles[view];

    // サイドバー閉じる（モバイル時）
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

        // Drag & Drop
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

    // モバイル用：フェーズインジケーター（スクロールで現在のカラムを表示）
    if (isMobile()) {
        renderPhaseIndicator(board);
    }
}

function renderPhaseIndicator(board) {
    // 既存インジケーターを削除
    const existing = document.querySelector('.phase-indicator');
    if (existing) existing.remove();

    const indicator = document.createElement('div');
    indicator.className = 'phase-indicator';
    indicator.innerHTML = PHASES.map((p, i) =>
        `<span class="phase-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></span>`
    ).join('');

    // カンバンビューの先頭に挿入
    const kanbanView = document.getElementById('view-kanban');
    kanbanView.insertBefore(indicator, board);

    // スクロール連動
    board.addEventListener('scroll', () => {
        const colWidth = board.scrollWidth / PHASES.length;
        const activeIndex = Math.round(board.scrollLeft / colWidth);
        indicator.querySelectorAll('.phase-dot').forEach((dot, i) => {
            dot.classList.toggle('active', i === activeIndex);
        });
    });

    // ドットタップでスクロール
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

    // モバイル用：フェーズ移動ボタン（前へ・次へ）
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

    // タップで編集（モバイルではdblclickが使いにくいのでシングルタップ対応）
    card.addEventListener('dblclick', () => openDealModal(deal.id));
    card.addEventListener('click', (e) => {
        // ボタンクリックは除外
        if (e.target.closest('.card-menu-btn') || e.target.closest('.mobile-phase-btn')) return;
        // モバイルの場合のみシングルタップで開く
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

    addActivity(deal.id, `${deal.company}: ${oldPhase} → ${newPhase}`, deal.member);
    saveState();
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

    // Activity modal
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
    }

    modal.classList.add('show');
    document.getElementById('deal-company').focus();
}

function closeDealModal() {
    document.getElementById('deal-modal').classList.remove('show');
    state.editingDealId = null;
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
        nextAction: document.getElementById('deal-next-action').value.trim(),
        nextDate: document.getElementById('deal-next-date').value,
        amount: document.getElementById('deal-amount').value ? Number(document.getElementById('deal-amount').value) : 0,
        notes: document.getElementById('deal-notes').value.trim(),
        updatedAt: new Date().toISOString()
    };

    if (state.editingDealId) {
        const deal = state.deals.find(d => d.id === state.editingDealId);
        if (deal) {
            const oldPhase = deal.phase;
            Object.assign(deal, data);
            if (oldPhase !== data.phase) {
                addActivity(deal.id, `${company}: ${oldPhase} → ${data.phase}`, member);
            } else {
                addActivity(deal.id, `${company}: 情報更新`, member);
            }
            showToast('案件を更新しました');
        }
    } else {
        const newDeal = {
            id: generateId(),
            ...data,
            createdAt: new Date().toISOString()
        };
        state.deals.push(newDeal);
        addActivity(newDeal.id, `${company}: 新規追加（${data.phase}）`, member);
        showToast('案件を追加しました');
    }

    saveState();
    closeDealModal();
    renderAll();
}

function deleteDeal() {
    if (!state.editingDealId) return;
    const deal = state.deals.find(d => d.id === state.editingDealId);
    if (!deal) return;
    if (!confirm(`「${deal.company}」を削除しますか？`)) return;

    state.deals = state.deals.filter(d => d.id !== state.editingDealId);
    addActivity(null, `${deal.company}: 削除`, deal.member);
    saveState();
    closeDealModal();
    renderAll();
    showToast('案件を削除しました');
}

// ==========================================
// Activity Log
// ==========================================
function addActivity(dealId, message, member) {
    state.activityLog.unshift({
        id: generateId(),
        dealId,
        message,
        member,
        timestamp: new Date().toISOString()
    });
    // Keep last 500 entries
    if (state.activityLog.length > 500) {
        state.activityLog = state.activityLog.slice(0, 500);
    }
}

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

    // Calculate date range
    const now = new Date();
    const periodDays = period === 'weekly' ? 7 : 30;
    const periodStart = new Date(now);
    periodStart.setDate(periodStart.getDate() - periodDays);

    // Activities in period
    const periodActivities = state.activityLog.filter(a => {
        const aDate = new Date(a.timestamp);
        if (aDate < periodStart) return false;
        if (member !== 'all' && a.member !== member) return false;
        return true;
    });

    // Phase counts
    const phaseCounts = {};
    PHASES.forEach(p => phaseCounts[p] = 0);
    deals.forEach(d => { if (phaseCounts[d.phase] !== undefined) phaseCounts[d.phase]++; });

    // KPIs
    const totalDeals = deals.length;
    const totalActions = periodActivities.length;
    const wonDeals = deals.filter(d => d.phase === '受注' || d.phase === '契約書対応中' || d.phase === '入金済み').length;
    const winRate = totalDeals > 0 ? Math.round((wonDeals / totalDeals) * 100) : 0;
    const totalAmount = deals.filter(d => d.phase === '受注' || d.phase === '契約書対応中' || d.phase === '入金済み').reduce((s, d) => s + (d.amount || 0), 0);
    const appointmentRate = (() => {
        const callCount = deals.filter(d => PHASES.indexOf(d.phase) >= 1).length; // コール中 or beyond
        const appoCount = deals.filter(d => PHASES.indexOf(d.phase) >= 2).length; // アポ取得 or beyond
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

    // Thresholds (per week baseline)
    const weekFactor = periodDays / 7;
    const minActions = Math.round(10 * weekFactor);
    const goodActions = Math.round(25 * weekFactor);

    // Quantity assessment
    let quantityStatus, quantityLabel;
    if (actionCount < minActions) { quantityStatus = 'red'; quantityLabel = '要改善'; }
    else if (actionCount < goodActions) { quantityStatus = 'yellow'; quantityLabel = '普通'; }
    else { quantityStatus = 'blue'; quantityLabel = '良好'; }

    // Quality assessment
    let qualityStatus, qualityLabel;
    if (conversionRate < 5) { qualityStatus = 'red'; qualityLabel = '要改善'; }
    else if (conversionRate < 20) { qualityStatus = 'yellow'; qualityLabel = '普通'; }
    else { qualityStatus = 'blue'; qualityLabel = '良好'; }

    // Overall
    let overallStatus, overallLabel;
    if (quantityStatus === 'red' || qualityStatus === 'red') {
        overallStatus = 'red'; overallLabel = '要介入';
    } else if (quantityStatus === 'yellow' || qualityStatus === 'yellow') {
        overallStatus = 'yellow'; overallLabel = '注意';
    } else {
        overallStatus = 'blue'; overallLabel = '順調';
    }

    // Advice
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

    // Find critical issues
    const issues = [];
    const positives = [];

    // Low activity members
    MEMBERS.forEach(m => {
        const mActs = activities.filter(a => a.member === m);
        const weekFactor = periodDays / 7;
        if (mActs.length < Math.round(5 * weekFactor)) {
            issues.push(`<span class="highlight-red">${m}の行動量が著しく低い</span>`);
        }
    });

    // Pipeline issues
    const listCount = deals.filter(d => d.phase === 'リスト').length;
    const callCount = deals.filter(d => d.phase === 'コール中').length;
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
    saveState();
    renderSettings();
    showToast('メールアドレスを追加しました');
}

function removeAllowedEmail(index) {
    state.allowedEmails.splice(index, 1);
    saveState();
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

function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            if (data.deals) state.deals = data.deals;
            if (data.activityLog) state.activityLog = data.activityLog;
            if (data.allowedEmails) state.allowedEmails = data.allowedEmails;
            saveState();
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
function loadSampleData() {
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

    state.deals = [];
    state.activityLog = [];

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

        state.deals.push(deal);

        // Add some activity for this deal
        const actCount = Math.floor(Math.random() * 4) + 1;
        for (let j = 0; j < actCount; j++) {
            const actPhase = PHASES[Math.min(phaseIndex, Math.floor(Math.random() * (phaseIndex + 1)))];
            const nextPhase = PHASES[Math.min(PHASES.length - 1, PHASES.indexOf(actPhase) + 1)];
            state.activityLog.push({
                id: generateId(),
                dealId: deal.id,
                message: `${company}: ${actPhase} → ${nextPhase}`,
                member,
                timestamp: daysAgo(Math.floor(Math.random() * daysOffset))
            });
        }
    });

    // Sort activity log by timestamp
    state.activityLog.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    saveState();
    renderAll();
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

    // Report period tabs
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
    loadState();
    initAuth();
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
