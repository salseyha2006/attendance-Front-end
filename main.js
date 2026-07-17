// ==========================================================================
// 1. CONFIGURATION
// ==========================================================================

function getApiUrl() {
    return localStorage.getItem('api_url') || 'https://attendance-backend-wych.onrender.com';
}

function authHeader() {
    const token = localStorage.getItem('auth_token');
    return token ? { "Authorization": `Bearer ${token}` } : {};
}

// ឆែកមើល Session Login
function checkLoginSession() {
    const role = localStorage.getItem('user_role');
    const staffId = localStorage.getItem('staff_id');
    const token = localStorage.getItem('auth_token');
    return { role, staffId, token };
}

function saveLoginSession(role, token, staffId = null) {
    localStorage.setItem('user_role', role);
    localStorage.setItem('auth_token', token);
    if (staffId) localStorage.setItem('staff_id', staffId);
}

function clearLoginSession() {
    localStorage.removeItem('user_role');
    localStorage.removeItem('staff_id');
    localStorage.removeItem('auth_token');
}

// មុខងារគណនាស្ថានភាពថ្ងៃធ្វើការ (ដូចមុន)
function getWorkDayStatus(hours) {
    if (hours >= 8.0) {
        return { text: "ពេញមួយថ្ងៃ", color: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    } else if (hours >= 4.0) {
        return { text: "កន្លះថ្ងៃ", color: "bg-amber-50 text-amber-700 border-amber-200" };
    } else if (hours > 0) {
        return { text: "ក្រោមជំនះ", color: "bg-orange-50 text-orange-700 border-orange-200" };
    } else {
        return { text: "អវត្តមាន", color: "bg-red-50 text-red-700 border-red-200" };
    }
}

// ==========================================================================
// 2. API CALLS (ជំនួស GitHub/localStorage ទាំងស្រុង)
// ==========================================================================

async function apiLoginAdmin(username, password) {
    const res = await fetch(`${getApiUrl()}/api/auth/admin-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "ចូលប្រើប្រាស់មិនជោគជ័យ");
    return data; // { token, admin }
}

async function apiLoginStaff(staffCode) {
    const res = await fetch(`${getApiUrl()}/api/auth/staff-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_code: staffCode })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "រកមិនឃើញ Staff ID");
    return data; // { token, staff }
}

async function apiGetSummary({ from, to, staffCode } = {}) {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (staffCode) params.set('staff_code', staffCode);

    const res = await fetch(`${getApiUrl()}/api/attendance/summary?${params}`, {
        headers: authHeader()
    });
    if (!res.ok) throw new Error("មិនអាចទាញទិន្នន័យវត្តមានបានទេ");
    return await res.json();
}

async function apiGetStaffList() {
    const res = await fetch(`${getApiUrl()}/api/staff`, { headers: authHeader() });
    if (!res.ok) throw new Error("មិនអាចទាញបញ្ជីបុគ្គលិកបានទេ");
    return await res.json();
}

async function apiAddStaff(payload) {
    const res = await fetch(`${getApiUrl()}/api/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "មិនអាចបន្ថែមបុគ្គលិកបានទេ");
    return data;
}

async function apiUpdateStaff(id, payload) {
    const res = await fetch(`${getApiUrl()}/api/staff/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "មិនអាចកែប្រែបានទេ");
    return data;
}

async function apiDeleteStaff(id) {
    const res = await fetch(`${getApiUrl()}/api/staff/${id}`, {
        method: "DELETE",
        headers: authHeader()
    });
    if (!res.ok) throw new Error("មិនអាចលុបបានទេ");
    return await res.json();
}

async function apiImportCsv(file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${getApiUrl()}/api/attendance/import-csv`, {
        method: "POST",
        headers: authHeader(), // កុំដាក់ Content-Type ដោយដៃ, browser គ្រប់គ្រង FormData ដោយស្វ័យប្រវត្តិ
        body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Import បរាជ័យ");
    return data;
}

// ==========================================================================
// 3. MAIN APPLICATION LOGIC & INTERFACE
// ==========================================================================

let attendanceData = [];
let currentUserRole = null;
let currentStaffId = null;
let activeStaffTab = 'home';

// Elements (ដូចមុនទាំងអស់)
const loginSection = document.getElementById('loginSection');
const staffSection = document.getElementById('staffSection');
const adminSection = document.getElementById('adminSection');
const staffManagementSection = document.getElementById('staffManagementSection');
const bottomNavbar = document.getElementById('bottomNavbar');
const staffBottomNavbar = document.getElementById('staffBottomNavbar');
const logoutBtn = document.getElementById('logoutBtn');
const searchContainer = document.getElementById('searchContainer');
const container = document.getElementById('attendanceContainer');
const summarySection = document.getElementById('summarySection');
const staffListContainer = document.getElementById('staffListContainer');
const staffProfileSection = document.getElementById('staffProfileSection');
const staffFilterContainer = document.getElementById('staffFilterContainer');

const searchInput = document.getElementById('searchStaff');
const dateFromInput = document.getElementById('filterDateFrom');
const dateToInput = document.getElementById('filterDateTo');
const clearDateBtn = document.getElementById('clearDateBtn');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const filterBanner = document.getElementById('filterBanner');
const filteredNameText = document.getElementById('filteredNameText');
const resetFilterBtn = document.getElementById('resetFilterBtn');

const fileInput = document.getElementById('csvFileInput');
const selectedFileName = document.getElementById('selectedFileName');
const apiUrlInput = document.getElementById('apiUrlInput');

const tabStaff = document.getElementById('tabStaff');
const tabAdmin = document.getElementById('tabAdmin');
const formStaff = document.getElementById('formStaff');
const formAdmin = document.getElementById('formAdmin');
const loginError = document.getElementById('loginError');

const navDashboard = document.getElementById('navDashboard');
const navStaffAttendance = document.getElementById('navStaffAttendance');
const navStaffManage = document.getElementById('navStaffManage');
const navAdmin = document.getElementById('navAdmin');
const navStaffHome = document.getElementById('navStaffHome');
const navStaffHistory = document.getElementById('navStaffHistory');
const navStaffProfile = document.getElementById('navStaffProfile');

function init() {
    if (localStorage.getItem('api_url')) apiUrlInput.value = localStorage.getItem('api_url');

    const session = checkLoginSession();
    if (session.role && session.token) {
        currentUserRole = session.role;
        currentStaffId = session.staffId;
        showDashboard();
    }
    setupEventListeners();
}

function showDashboard() {
    loginSection.classList.add('hidden');
    logoutBtn.classList.remove('hidden');

    if (currentUserRole === 'admin') {
        bottomNavbar.classList.remove('hidden');
        bottomNavbar.classList.add('flex');
        staffBottomNavbar.classList.add('hidden');
        staffBottomNavbar.classList.remove('flex');
        searchContainer.classList.remove('hidden');
        navDashboard.click();
    } else if (currentUserRole === 'staff') {
        staffSection.classList.remove('hidden');
        adminSection.classList.add('hidden');
        staffManagementSection.classList.add('hidden');

        bottomNavbar.classList.add('hidden');
        bottomNavbar.classList.remove('flex');
        staffBottomNavbar.classList.remove('hidden');
        staffBottomNavbar.classList.add('flex');

        searchContainer.classList.add('hidden');
        navStaffHome.click();
    }
}

function setActiveNav(activeButton) {
    [navDashboard, navStaffAttendance, navStaffManage, navAdmin].forEach(btn => {
        btn.className = btn === activeButton
            ? "flex flex-col items-center space-y-0.5 text-blue-600 font-bold scale-105 transition-all"
            : "flex flex-col items-center space-y-0.5 text-slate-400 font-medium transition-all";
    });
}

function setActiveStaffNav(activeButton) {
    [navStaffHome, navStaffHistory, navStaffProfile].forEach(btn => {
        btn.className = btn === activeButton
            ? "flex flex-col items-center space-y-0.5 text-blue-600 font-bold scale-105 transition-all"
            : "flex flex-col items-center space-y-0.5 text-slate-400 font-medium transition-all";
    });
}

function showSection(sectionToShow) {
    [staffSection, staffManagementSection, adminSection].forEach(sec => {
        sec.classList.toggle('hidden', sec !== sectionToShow);
    });
}

function showStaffSection(sectionToShow) {
    [staffSection, staffProfileSection].forEach(sec => {
        sec.classList.toggle('hidden', sec !== sectionToShow);
    });
}

// ទាញទិន្នន័យវត្តមាន (ពី API ថ្មី ជំនួស CSV)
async function loadData() {
    container.innerHTML = `<div class="text-center p-8 text-blue-500 text-xs font-semibold animate-pulse">⏳ កំពុងទាញទិន្នន័យ...</div>`;
    try {
        const staffCodeFilter = currentUserRole === 'staff' ? currentStaffId : null;
        attendanceData = await apiGetSummary({ staffCode: staffCodeFilter });
        filterData();
    } catch (error) {
        container.innerHTML = `<div class="bg-red-50 text-red-600 p-5 rounded-2xl text-xs font-semibold text-center border border-red-200">❌ ${error.message}</div>`;
    }
}

function filterData() {
    const searchVal = searchInput.value.trim().toLowerCase();
    let dateFromVal = dateFromInput.value;
    let dateToVal = dateToInput.value;

    if (currentUserRole === 'admin') {
        if (searchVal.length > 0) {
            clearSearchBtn.classList.remove('hidden');
            filterBanner.classList.remove('hidden');
            filteredNameText.innerText = searchInput.value;
        } else {
            clearSearchBtn.classList.add('hidden');
            filterBanner.classList.add('hidden');
        }
    } else {
        clearSearchBtn.classList.add('hidden');
        filterBanner.classList.add('hidden');

        if (activeStaffTab === 'home') {
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
            dateFromVal = todayStr;
            dateToVal = todayStr;
        }
    }

    if (dateFromVal || dateToVal) clearDateBtn.classList.remove('hidden');
    else clearDateBtn.classList.add('hidden');

    const filtered = attendanceData.filter(row => {
        const name = (row.full_name || '').toLowerCase();
        const code = (row.staff_code || '').toLowerCase();
        const rowDateStr = row.work_date;

        const matchesSearch = currentUserRole === 'staff'
            ? true // ទិន្នន័យត្រូវបានច្រោះពី server រួចហើយសម្រាប់ staff
            : (name.includes(searchVal) || code.includes(searchVal));

        let matchesDate = true;
        if (dateFromVal && rowDateStr < dateFromVal) matchesDate = false;
        if (dateToVal && rowDateStr > dateToVal) matchesDate = false;

        return matchesSearch && matchesDate;
    });

    filtered.sort((a, b) => (a.work_date < b.work_date ? 1 : -1));

    renderCards(filtered);
    renderSummary(filtered);
}

// បង្ហាញកាតវត្តមាន (ស្រប format ថ្មីពី /api/attendance/summary)
function renderCards(data) {
    container.innerHTML = '';
    if (data.length === 0) {
        container.innerHTML = `<div class="bg-white p-6 rounded-2xl text-center text-slate-400 text-xs">🔍 រកមិនឃើញទិន្នន័យវត្តមានឡើយ</div>`;
        return;
    }

    data.forEach(row => {
        const hours = parseFloat(row.total_hours) || 0;
        const status = getWorkDayStatus(hours);
        const checkIn = row.check_in ? new Date(row.check_in).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '-';
        const checkOut = row.check_out && row.check_out !== row.check_in
            ? new Date(row.check_out).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '-';

        const card = document.createElement('div');
        card.className = "bg-white p-4 rounded-2xl shadow-sm border border-slate-200/60 space-y-2.5" +
            (currentUserRole === 'admin' ? " cursor-pointer hover:border-blue-300 active:scale-[0.99] transition-all" : "");

        if (currentUserRole === 'admin') {
            card.addEventListener('click', () => {
                searchInput.value = row.full_name;
                navStaffAttendance.click();
            });
        }

        card.innerHTML = `
            <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                <div>
                    <h3 class="font-bold text-slate-800 text-sm">${row.full_name || 'មិនស្គាល់ឈ្មោះ'}</h3>
                    <p class="text-[11px] text-slate-400">${row.department || 'ទូទៅ'}</p>
                </div>
                <div class="flex items-center gap-1.5">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${status.color}">${status.text}</span>
                    <span class="bg-slate-100 text-slate-700 font-mono text-xs px-2 py-1 rounded-lg font-bold">ID: ${row.staff_code || '-'}</span>
                </div>
            </div>
            <div class="grid grid-cols-3 gap-2 text-center text-xs">
                <div class="bg-slate-50 p-2 rounded-xl">
                    <span class="text-[10px] text-slate-400 block">កាលបរិច្ឆេទ</span>
                    <span class="font-semibold text-slate-700 text-[11px]">${row.work_date || '-'}</span>
                </div>
                <div class="bg-emerald-50/60 p-2 rounded-xl">
                    <span class="text-[10px] text-emerald-600 block">ម៉ោងចូល</span>
                    <span class="font-bold text-emerald-700">${checkIn}</span>
                </div>
                <div class="bg-amber-50/60 p-2 rounded-xl">
                    <span class="text-[10px] text-amber-600 block">ម៉ោងចេញ</span>
                    <span class="font-bold text-amber-700">${checkOut}</span>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

// សង្ខេបចំនួនអវត្តមាន/វត្តមាន (ធ្វើឡើងវិញឲ្យសាមញ្ញ)
function renderSummary(data) {
    if (activeStaffTab !== undefined && currentUserRole === 'admin') {
        const totalStaff = new Set(data.map(r => r.staff_code)).size;
        const fullDay = data.filter(r => (parseFloat(r.total_hours) || 0) >= 8).length;
        summarySection.innerHTML = `
            <div class="grid grid-cols-2 gap-3">
                <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-200/60 text-center">
                    <span class="text-2xl font-bold text-blue-600">${totalStaff}</span>
                    <p class="text-[11px] text-slate-400 mt-1">បុគ្គលិកសរុប</p>
                </div>
                <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-200/60 text-center">
                    <span class="text-2xl font-bold text-emerald-600">${fullDay}</span>
                    <p class="text-[11px] text-slate-400 mt-1">ធ្វើការពេញថ្ងៃ</p>
                </div>
            </div>`;
    } else {
        summarySection.innerHTML = '';
    }
}

// គ្រប់គ្រងបុគ្គលិក (ហៅ API ជំនួស CSV)
async function renderStaffManagementList() {
    staffListContainer.innerHTML = `<div class="text-center p-6 text-blue-500 text-xs animate-pulse">⏳ កំពុងទាញបញ្ជីបុគ្គលិក...</div>`;
    try {
        const list = await apiGetStaffList();
        staffListContainer.innerHTML = '';
        list.forEach(staff => {
            const item = document.createElement('div');
            item.className = "flex justify-between items-center bg-slate-50 p-3 rounded-xl text-xs";
            item.innerHTML = `
                <div>
                    <p class="font-bold text-slate-700">${staff.full_name}</p>
                    <p class="text-slate-400">ID: ${staff.staff_code} • ${staff.department_name || 'ទូទៅ'}</p>
                </div>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${staff.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}">${staff.status}</span>
            `;
            staffListContainer.appendChild(item);
        });
    } catch (error) {
        staffListContainer.innerHTML = `<div class="text-red-500 text-xs text-center">❌ ${error.message}</div>`;
    }
}

function renderStaffProfile() {
    // ព័ត៌មានបុគ្គលិកបច្ចុប្បន្នអាចទាញពី apiGetSummary ដែលមាន full_name/department រួចហើយ
    document.getElementById('profileId').innerText = "ID: " + currentStaffId;
}

// ================= Event Listeners =================
function setupEventListeners() {
    tabStaff.addEventListener('click', () => {
        tabStaff.className = "py-2 text-xs font-bold rounded-lg bg-white text-blue-600 shadow-sm transition-all";
        tabAdmin.className = "py-2 text-xs font-bold rounded-lg text-slate-500 hover:text-slate-700 transition-all";
        formStaff.classList.remove('hidden');
        formAdmin.classList.add('hidden');
        loginError.classList.add('hidden');
    });

    tabAdmin.addEventListener('click', () => {
        tabAdmin.className = "py-2 text-xs font-bold rounded-lg bg-white text-blue-600 shadow-sm transition-all";
        tabStaff.className = "py-2 text-xs font-bold rounded-lg text-slate-500 hover:text-slate-700 transition-all";
        formAdmin.classList.remove('hidden');
        formStaff.classList.add('hidden');
        loginError.classList.add('hidden');
    });

    // Staff Login
    document.getElementById('submitStaffLogin').addEventListener('click', async () => {
        const idVal = document.getElementById('loginStaffId').value.trim().toUpperCase();
        if (!idVal) {
            loginError.className = "text-xs font-bold text-red-500 text-center";
            loginError.innerText = "⚠️ សូមបញ្ចូលលេខកូដ ID បុគ្គលិករបស់អ្នក!";
            loginError.classList.remove('hidden');
            return;
        }

        loginError.className = "text-xs font-bold text-blue-500 text-center animate-pulse";
        loginError.innerText = "⏳ កំពុងផ្ទៀងផ្ទាត់អត្តសញ្ញាណ...";
        loginError.classList.remove('hidden');

        try {
            const { token, staff } = await apiLoginStaff(idVal);
            currentUserRole = 'staff';
            currentStaffId = staff.staff_code;
            saveLoginSession('staff', token, staff.staff_code);
            loginError.classList.add('hidden');
            showDashboard();
        } catch (error) {
            loginError.className = "text-xs font-bold text-red-500 text-center";
            loginError.innerText = "❌ " + error.message;
        }
    });

    // Admin Login (ហៅ API ជំនួស check ត្រង់ front-end)
    document.getElementById('submitAdminLogin').addEventListener('click', async () => {
        const userVal = document.getElementById('loginAdminUser').value.trim();
        const passVal = document.getElementById('loginAdminPass').value.trim();

        loginError.className = "text-xs font-bold text-blue-500 text-center animate-pulse";
        loginError.innerText = "⏳ កំពុងផ្ទៀងផ្ទាត់...";
        loginError.classList.remove('hidden');

        try {
            const { token } = await apiLoginAdmin(userVal, passVal);
            currentUserRole = 'admin';
            currentStaffId = null;
            saveLoginSession('admin', token);
            loginError.classList.add('hidden');
            showDashboard();
        } catch (error) {
            loginError.className = "text-xs font-bold text-red-500 text-center";
            loginError.innerText = "❌ " + error.message;
        }
    });

    const handleLogout = () => {
        clearLoginSession();
        currentUserRole = null;
        currentStaffId = null;
        searchInput.value = '';

        loginSection.classList.remove('hidden');
        staffSection.classList.add('hidden');
        adminSection.classList.add('hidden');
        staffManagementSection.classList.add('hidden');
        staffProfileSection.classList.add('hidden');

        bottomNavbar.classList.add('hidden');
        bottomNavbar.classList.remove('flex');
        staffBottomNavbar.classList.add('hidden');
        staffBottomNavbar.classList.remove('flex');

        logoutBtn.classList.add('hidden');
        document.getElementById('loginStaffId').value = '';
        document.getElementById('loginAdminUser').value = '';
        document.getElementById('loginAdminPass').value = '';
    };

    logoutBtn.addEventListener('click', handleLogout);
    document.getElementById('staffLogoutBtn').addEventListener('click', handleLogout);

    navDashboard.addEventListener('click', () => {
        showSection(staffSection);
        summarySection.classList.remove('hidden');
        container.classList.add('hidden');
        setActiveNav(navDashboard);
        loadData();
    });

    navStaffAttendance.addEventListener('click', () => {
        showSection(staffSection);
        summarySection.classList.add('hidden');
        container.classList.remove('hidden');
        setActiveNav(navStaffAttendance);
        loadData();
    });

    navStaffManage.addEventListener('click', () => {
        showSection(staffManagementSection);
        setActiveNav(navStaffManage);
        renderStaffManagementList();
    });

    navAdmin.addEventListener('click', () => {
        showSection(adminSection);
        setActiveNav(navAdmin);
    });

    navStaffHome.addEventListener('click', () => {
        activeStaffTab = 'home';
        showStaffSection(staffSection);
        staffFilterContainer.classList.add('hidden');
        document.getElementById('sectionTitle').innerText = "សង្ខេបវត្តមានថ្ងៃនេះ";
        summarySection.classList.remove('hidden');
        container.classList.remove('hidden');
        setActiveStaffNav(navStaffHome);
        loadData();
    });

    navStaffHistory.addEventListener('click', () => {
        activeStaffTab = 'history';
        showStaffSection(staffSection);
        staffFilterContainer.classList.remove('hidden');
        document.getElementById('sectionTitle').innerText = "ប្រវត្តិនៃការចុះវត្តមាន";
        summarySection.classList.add('hidden');
        container.classList.remove('hidden');
        setActiveStaffNav(navStaffHistory);
        loadData();
    });

    navStaffProfile.addEventListener('click', () => {
        activeStaffTab = 'profile';
        showStaffSection(staffProfileSection);
        setActiveStaffNav(navStaffProfile);
        renderStaffProfile();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) selectedFileName.innerText = "📁 " + e.target.files[0].name;
    });

    document.getElementById('loadDataBtn').addEventListener('click', loadData);
    clearSearchBtn.addEventListener('click', () => { searchInput.value = ''; filterData(); });
    clearDateBtn.addEventListener('click', () => { dateFromInput.value = ''; dateToInput.value = ''; filterData(); });
    resetFilterBtn.addEventListener('click', () => { searchInput.value = ''; filterData(); });

    searchInput.addEventListener('input', filterData);
    dateFromInput.addEventListener('change', filterData);
    dateToInput.addEventListener('change', filterData);

    // Import CSV ចាស់ចូល Database ថ្មី (ជំនួស GitHub upload)
    document.getElementById('uploadBtn').addEventListener('click', async () => {
        const apiUrl = apiUrlInput.value.trim();
        const status = document.getElementById('uploadStatus');

        if (!apiUrl || !fileInput.files[0]) {
            status.className = "text-red-500 text-xs font-semibold text-center mt-1";
            status.innerText = "⚠️ សូមបំពេញ API URL និងជ្រើសរើស File CSV!";
            return;
        }

        localStorage.setItem('api_url', apiUrl);

        status.className = "text-blue-500 text-xs font-semibold text-center mt-1 animate-pulse";
        status.innerText = "⏳ កំពុង Import ទិន្នន័យទៅ Database...";

        try {
            const result = await apiImportCsv(fileInput.files[0]);
            status.className = "text-emerald-600 text-xs font-bold text-center mt-1";
            status.innerText = `✅ Import ជោគជ័យ! (${result.imported} record, រំលង ${result.skipped})`;
            setTimeout(() => { navStaffAttendance.click(); }, 1500);
        } catch (err) {
            status.className = "text-red-500 text-xs font-semibold text-center mt-1";
            status.innerText = "❌ បញ្ហា៖ " + err.message;
        }
    });
}

// Start App
init();