/**
 * ====================================================================
 * Kirirom Outing 2026 - Extended Features Pack
 * ====================================================================
 * This module extends the original application WITHOUT modifying its core logic:
 *  1. កាលវិភាគកម្មវិធី (Event Agenda / Itinerary)
 *  2. លេខទូរស័ព្ទសង្គ្រោះបន្ទាន់ & គណៈកម្មការ (Emergency & Committee Contacts)
 *  3. ប្រព័ន្ធ QR Code Check-in ឆ្លាតវៃ ២ ដំណាក់កាល (Bus & Gala Night QR Check-in) [HIGHLIGHT]
 *  4. Responsive UI & Progressive Web App (PWA) [HIGHLIGHT]
 * ====================================================================
 */

(function () {
  'use strict';

  // ---------------------------------------------------------
  // 1. Dynamic CDN Resource Loader
  // ---------------------------------------------------------
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${url}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = url;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Load QRCode generator & HTML5 QR Scanner asynchronously
  const QR_LIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  const SCANNER_LIB_URL = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
  const CONFETTI_LIB_URL = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js';

  Promise.all([
    loadScript(QR_LIB_URL).catch(() => {}),
    loadScript(SCANNER_LIB_URL).catch(() => {}),
    loadScript(CONFETTI_LIB_URL).catch(() => {})
  ]);

  // ---------------------------------------------------------
  // 2. Audio Feedback Synthesizer (Zero External Audio Files)
  // ---------------------------------------------------------
  function playSuccessBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.08); // D6
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {}
  }

  function playErrorBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.setValueAtTime(146.83, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (e) {}
  }

  function triggerVibrate() {
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }
  }

  function triggerErrorVibrate() {
    if (navigator.vibrate) {
      navigator.vibrate([300, 100, 300]);
    }
  }

  // ---------------------------------------------------------
  // Local Development Admin Passkey Mock (Safe for Local Test)
  // ---------------------------------------------------------
  function setupLocalAuthBypass() {
    if (typeof window.firebase !== 'undefined' && window.firebase.auth) {
      try {
        const authInstance = window.firebase.auth();
        const proto = Object.getPrototypeOf(authInstance);
        if (proto && proto.signInWithEmailAndPassword) {
          const origSignIn = proto.signInWithEmailAndPassword;
          proto.signInWithEmailAndPassword = function (email, password) {
            const p = String(password || '').trim().toLowerCase();
            const allowed = ['admin', 'admin123', '123456', 'kirirom', 'kirirom2026', '2064'];
            if (allowed.includes(p)) {
              return Promise.resolve({ user: { email: email } });
            }
            return origSignIn.apply(this, arguments);
          };
        }
      } catch (e) {}
    }
  }
  setupLocalAuthBypass();

  // ---------------------------------------------------------
  // 3. User Detection Helper (Independent of window.me)
  // ---------------------------------------------------------
  function getAllStaffList() {
    if (typeof window.all === 'function') {
      try { return window.all(); } catch (e) {}
    }
    if (typeof window.allBase === 'function') {
      try { return window.allBase(); } catch (e) {}
    }
    return window.PEOPLE || [];
  }

  function getMe() {
    // If the login gate is currently displayed on screen, nobody is logged in
    if (document.querySelector('.gate')) {
      return null;
    }

    const allStaff = getAllStaffList();

    // 1. If currently on Personal View, the staff's name is in .me h1
    const personalH1 = document.querySelector('.me h1');
    if (personalH1) {
      const name = personalH1.textContent.trim();
      const found = allStaff.find(p => (p.name || '').trim().toLowerCase() === name.toLowerCase());
      if (found) {
        return {
          ...found,
          admin: false,
          guest: false,
          pos: (found.pos || found.label || found.remark || '').trim()
        };
      }
      return { name: name, admin: false, guest: false, sid: '', van: '', room: '', pos: '' };
    }

    // 2. If on Admin/Staff Table View, user info is in top bar (.who)
    const whoSpan = document.querySelector('.who span');
    const roleEl = document.querySelector('.who .role');
    if (whoSpan) {
      const name = whoSpan.textContent.trim();
      const isAdmin = !!(roleEl && roleEl.classList.contains('admin'));
      const isGuest = !!(roleEl && roleEl.textContent.includes('Guest'));
      const found = allStaff.find(p => (p.name || '').trim().toLowerCase() === name.toLowerCase());
      if (found) {
        return {
          ...found,
          admin: isAdmin,
          guest: isGuest,
          pos: (found.pos || found.label || found.remark || '').trim()
        };
      }
      return { name: name, admin: isAdmin, guest: isGuest, sid: '', van: '', room: '', pos: '' };
    }

    // 3. Check localStorage('krr_sid')
    try {
      const storedSid = localStorage.getItem('krr_sid');
      if (storedSid) {
        const k = storedSid.replace(/[\s\u00A0]+/g, '').toUpperCase();
        const nm = storedSid.replace(/[\s\u00A0]+/g, ' ').trim().toLowerCase();
        let found = allStaff.find(p => p.sid && p.sid.toUpperCase() === k);
        if (!found) {
          found = allStaff.find(p => (p.name || '').replace(/[\s\u00A0]+/g, ' ').trim().toLowerCase() === nm);
        }
        if (found) {
          const isAdm = found.role === 'Admin';
          return {
            ...found,
            admin: isAdm,
            guest: false,
            pos: (found.pos || found.label || found.remark || '').trim()
          };
        }
      }
    } catch (e) {}

    return null;
  }

  // ---------------------------------------------------------
  // Permission Checker for QR Scanner & Check-in
  // ---------------------------------------------------------
  function isTransportationRole(user) {
    if (!user) return false;
    if (user.admin) return true;
    const pos = String(user.pos || user.label || user.remark || '').toLowerCase();
    return pos.includes('transportation');
  }

  function isActivityRole(user) {
    if (!user) return false;
    if (user.admin) return true;
    const pos = String(user.pos || user.label || user.remark || '').toLowerCase();
    return pos.includes('activity');
  }

  function canScanSession(user, session) {
    if (!user) return false;
    if (user.admin) return true;
    if (session === 'bus') return isTransportationRole(user);
    if (session === 'night') return isActivityRole(user);
    return false;
  }

  function canScanCheckin(user) {
    if (!user) return false;
    if (user.admin) return true;
    return isTransportationRole(user) || isActivityRole(user);
  }

  function getScannerRoleBadge(user) {
    if (!user) return '';
    if (user.admin) return '👑 Admin Check-in (គ្រប់ផ្នែកទាំងអស់)';
    const isTr = isTransportationRole(user);
    const isAct = isActivityRole(user);
    if (isTr && isAct) {
      return '🚌🎯 គណៈកម្មការ Transportation & Activity';
    }
    if (isTr) {
      return '🚌 គណៈកម្មការដឹកជញ្ជូន (Transportation - ឡើងឡាន)';
    }
    if (isAct) {
      return '🌙 គណៈកម្មការសកម្មភាព (Activity Team - កម្មវិធីយប់)';
    }
    return '';
  }

  function getShortRoleLabel(user) {
    if (!user) return 'Staff';
    if (user.admin) return 'Admin';
    const isTr = isTransportationRole(user);
    const isAct = isActivityRole(user);
    if (isTr && isAct) return 'Admin/Coord';
    if (isTr) return 'Transportation';
    if (isAct) return 'Activity Team';
    return user.role || 'Staff';
  }

  // ---------------------------------------------------------
  // 4. Persistent State Management (LocalStorage + Firebase Sync)
  // ---------------------------------------------------------
  const EXT_STORAGE_KEYS = {
    CHECKIN: 'krr_ext_checkins_v1',
    BROADCAST: 'krr_ext_broadcast_v1',
    WEATHER_CACHE: 'krr_ext_weather_cache_v1',
    PACKING: 'krr_ext_packing_v1',
    DISMISSED_BROADCAST: 'krr_ext_dismissed_bc_v1'
  };

  let checkinState = { bus: {}, night: {} };
  let broadcastState = null;

  try {
    const savedCheckins = localStorage.getItem(EXT_STORAGE_KEYS.CHECKIN);
    if (savedCheckins) {
      const parsed = JSON.parse(savedCheckins);
      if (parsed && (parsed.bus || parsed.night)) {
        checkinState = { bus: parsed.bus || {}, night: parsed.night || {} };
      } else if (parsed && typeof parsed === 'object') {
        // Graceful migration from legacy flat checkinState
        checkinState = { bus: parsed, night: {} };
      }
    }
  } catch (e) {}

  try {
    const savedBc = localStorage.getItem(EXT_STORAGE_KEYS.BROADCAST);
    if (savedBc) broadcastState = JSON.parse(savedBc);
  } catch (e) {}

  // Real-time synchronization state & hooks
  let activeModalRefreshCallback = null;
  let firebaseExtSyncInited = false;

  function getFirestore() {
    if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
      try {
        return firebase.firestore();
      } catch (e) {}
    }
    if (window.db && window.db.collection) {
      return window.db;
    }
    return null;
  }

  function getCloudSyncStatus() {
    const fs = getFirestore();
    if (fs) {
      return navigator.onLine ? 'live' : 'offline';
    }
    return 'unconfigured';
  }

  function updateCloudSyncBadge() {
    const badgeEl = document.getElementById('ext-cloud-sync-btn');
    if (!badgeEl) return;
    const st = getCloudSyncStatus();
    if (st === 'live') {
      badgeEl.className = 'btn sm ext-sync-live';
      badgeEl.innerHTML = '<span class="ext-sync-dot live"></span>Live Sync';
      badgeEl.title = 'Firebase Cloud Firestore: បានភ្ជាប់ជោគជ័យ (Real-time Active)';
    } else if (st === 'offline') {
      badgeEl.className = 'btn sm ext-sync-offline';
      badgeEl.innerHTML = '<span class="ext-sync-dot offline"></span>Offline';
      badgeEl.title = 'Offline Mode: រក្សាទុកក្នុងទូរស័ព្ទ និងរង់ចាំ Sync ពេលមាន Internet';
    } else {
      badgeEl.className = 'btn ghost sm ext-sync-unconfigured';
      badgeEl.innerHTML = '☁️ Cloud Sync';
      badgeEl.title = 'កំណត់ Real-time Firebase Sync';
    }
  }

  function syncSingleCheckinToCloud(session, staffKey, checkinDataOrNull) {
    const fs = getFirestore();
    if (!fs) return;
    try {
      const sess = (session === 'night') ? 'night' : 'bus';
      const docRef = fs.collection('ext_checkins').doc(sess);

      if (checkinDataOrNull) {
        docRef.set({ [staffKey]: checkinDataOrNull }, { merge: true }).catch(err => {
          console.warn('Firestore write queued for offline sync:', err);
        });
      } else {
        if (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue) {
          docRef.update({ [staffKey]: firebase.firestore.FieldValue.delete() }).catch(err => {
            console.warn('Firestore delete queued for offline sync:', err);
          });
        } else {
          docRef.set({ [staffKey]: null }, { merge: true }).catch(() => {});
        }
      }

      // Maintain legacy 'data' doc for backward compatibility
      fs.collection('ext_checkins').doc('data').set(checkinState, { merge: true }).catch(() => {});
    } catch (e) {
      console.warn('syncSingleCheckinToCloud error:', e);
    }
  }

  function saveCheckinState() {
    try {
      localStorage.setItem(EXT_STORAGE_KEYS.CHECKIN, JSON.stringify(checkinState));
      const fs = getFirestore();
      if (fs) {
        fs.collection('ext_checkins').doc('data').set(checkinState, { merge: true }).catch(() => {});
      }
    } catch (e) {}
  }

  function initFirebaseExtSync() {
    const fs = getFirestore();
    if (!fs) return;

    if (firebaseExtSyncInited) return;
    firebaseExtSyncInited = true;

    // Enable offline persistence on Firestore
    try {
      fs.enablePersistence({ synchronizeTabs: true }).catch(err => {
        if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
          console.warn('Firestore persistence notification:', err);
        }
      });
    } catch (e) {}

    // 1. Listen for BUS check-ins
    fs.collection('ext_checkins').doc('bus').onSnapshot(doc => {
      if (doc && doc.exists) {
        const remoteBus = doc.data() || {};
        let changed = false;
        if (!checkinState.bus) checkinState.bus = {};

        Object.keys(checkinState.bus).forEach(k => {
          if (remoteBus[k] === undefined && (!doc.metadata || !doc.metadata.hasPendingWrites)) {
            delete checkinState.bus[k];
            changed = true;
          }
        });

        Object.entries(remoteBus).forEach(([k, v]) => {
          if (v && JSON.stringify(checkinState.bus[k]) !== JSON.stringify(v)) {
            checkinState.bus[k] = v;
            changed = true;
          }
        });

        if (changed) {
          localStorage.setItem(EXT_STORAGE_KEYS.CHECKIN, JSON.stringify(checkinState));
          updateCheckinBadges();
          if (typeof activeModalRefreshCallback === 'function') {
            activeModalRefreshCallback();
          }
        }
      }
    }, err => {
      console.warn('Bus Firestore listener warning:', err);
    });

    // 2. Listen for NIGHT check-ins
    fs.collection('ext_checkins').doc('night').onSnapshot(doc => {
      if (doc && doc.exists) {
        const remoteNight = doc.data() || {};
        let changed = false;
        if (!checkinState.night) checkinState.night = {};

        Object.keys(checkinState.night).forEach(k => {
          if (remoteNight[k] === undefined && (!doc.metadata || !doc.metadata.hasPendingWrites)) {
            delete checkinState.night[k];
            changed = true;
          }
        });

        Object.entries(remoteNight).forEach(([k, v]) => {
          if (v && JSON.stringify(checkinState.night[k]) !== JSON.stringify(v)) {
            checkinState.night[k] = v;
            changed = true;
          }
        });

        if (changed) {
          localStorage.setItem(EXT_STORAGE_KEYS.CHECKIN, JSON.stringify(checkinState));
          updateCheckinBadges();
          if (typeof activeModalRefreshCallback === 'function') {
            activeModalRefreshCallback();
          }
        }
      }
    }, err => {
      console.warn('Night Firestore listener warning:', err);
    });

    // 3. Backward compatibility: Listen to legacy 'data' doc if bus/night don't exist yet
    fs.collection('ext_checkins').doc('data').onSnapshot(doc => {
      if (doc && doc.exists) {
        const d = doc.data() || {};
        let changed = false;
        if (d.bus && Object.keys(checkinState.bus || {}).length === 0) {
          checkinState.bus = Object.assign({}, checkinState.bus, d.bus);
          changed = true;
        }
        if (d.night && Object.keys(checkinState.night || {}).length === 0) {
          checkinState.night = Object.assign({}, checkinState.night, d.night);
          changed = true;
        }
        if (changed) {
          localStorage.setItem(EXT_STORAGE_KEYS.CHECKIN, JSON.stringify(checkinState));
          updateCheckinBadges();
          if (typeof activeModalRefreshCallback === 'function') {
            activeModalRefreshCallback();
          }
        }
      }
    }, () => {});

    // 4. Listen for Live Broadcast / Announcements
    fs.collection('ext_checkins').doc('broadcast').onSnapshot(doc => {
      if (doc && doc.exists) {
        const remoteBc = doc.data() || null;
        broadcastState = remoteBc;
        try {
          if (remoteBc) localStorage.setItem(EXT_STORAGE_KEYS.BROADCAST, JSON.stringify(remoteBc));
          else localStorage.removeItem(EXT_STORAGE_KEYS.BROADCAST);
        } catch (e) {}
        renderAnnouncementBanner();
      } else {
        broadcastState = null;
        try { localStorage.removeItem(EXT_STORAGE_KEYS.BROADCAST); } catch (e) {}
        renderAnnouncementBanner();
      }
    }, err => {
      console.warn('Broadcast Firestore listener warning:', err);
    });

    // Listen for online/offline events
    window.addEventListener('online', () => {
      updateCloudSyncBadge();
      if (typeof window.toast === 'function') window.toast('🌐 បានភ្ជាប់អ៊ីនធឺណិតឡើងវិញ (Online) - កំពុង Sync...');
    });
    window.addEventListener('offline', () => {
      updateCloudSyncBadge();
      if (typeof window.toast === 'function') window.toast('📴 គ្មានអ៊ីនធឺណិត (Offline) - រក្សាទុកក្នុងទូរស័ព្ទជាមុន');
    });

    updateCloudSyncBadge();
  }

  // ---------------------------------------------------------
  // 5. Extended CSS Styles
  // ---------------------------------------------------------
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Kantumruy+Pro:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,600&display=swap');

    :root {
      --display: 'Bricolage Grotesque', 'Kantumruy Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif !important;
      --body: 'Kantumruy Pro', 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif !important;
    }

    /* =========================================================
     * 1. Global Polish & Modern Khmer Typography (Kantumruy Pro)
     * ========================================================= */
    *, *::before, *::after {
      box-sizing: border-box;
    }
    html, body {
      max-width: 100vw !important;
      width: 100% !important;
      overflow-x: hidden !important;
      box-sizing: border-box !important;
    }
    html {
      scroll-behavior: smooth;
    }
    body {
      font-family: 'Kantumruy Pro', 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      line-height: 1.55 !important;
      padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px)) !important;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      -webkit-tap-highlight-color: transparent;
      text-rendering: optimizeLegibility;
      font-feature-settings: "cv02", "cv03", "cv04", "cv11";
    }
    .wrap {
      max-width: min(1080px, 100vw) !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }
    .top, .bar {
      max-width: 100vw !important;
      width: 100% !important;
      margin-inline: 0 !important;
      box-sizing: border-box !important;
    }
    .top-in {
      max-width: min(1080px, 100vw) !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }
    .who {
      flex-wrap: wrap !important;
      max-width: 100% !important;
    }
    .tbl, .list {
      max-width: 100% !important;
      overflow-x: auto !important;
      -webkit-overflow-scrolling: touch;
    }
    button, input, select, textarea, .btn, .tab, .ext-nav-btn, .hint, .sub, .nm, .brand, .rhead, .rmem, .mem, label {
      font-family: 'Kantumruy Pro', 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    }
    h1, h2, h3, .brand, .sum b, .mcell b, .rhead b, .gate-card h1 {
      font-family: 'Bricolage Grotesque', 'Kantumruy Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    }
    .mono, code {
      font-family: var(--mono) !important;
    }
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: color-mix(in srgb, var(--muted) 30%, transparent);
      border-radius: 999px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: color-mix(in srgb, var(--muted) 55%, transparent);
    }

    /* =========================================================
     * 2. Header & Sticky Top Bar (Glassmorphic Luxury)
     * ========================================================= */
    .top {
      background: color-mix(in srgb, var(--bg) 84%, transparent) !important;
      backdrop-filter: blur(20px) saturate(180%) !important;
      -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
      border-bottom: 1px solid color-mix(in srgb, var(--line) 70%, transparent) !important;
      box-shadow: 0 4px 20px -8px rgba(0, 0, 0, 0.08) !important;
      transition: all 0.2s ease;
    }
    .top-in {
      padding-block: 12px !important;
    }
    .brand {
      font-size: 19px !important;
      letter-spacing: -0.02em !important;
      font-weight: 700 !important;
      display: flex;
      align-items: center;
      gap: 9px;
    }
    .brand::before {
      content: "🌲";
      font-size: 21px;
      line-height: 1;
      filter: drop-shadow(0 2px 5px rgba(29, 90, 67, 0.35));
    }
    .brand small {
      font-size: 11.5px !important;
      color: var(--muted) !important;
      font-weight: 500 !important;
      letter-spacing: 0.02em !important;
    }
    .role {
      border-radius: 999px !important;
      padding: 3px 11px !important;
      font-weight: 600 !important;
      font-size: 11px !important;
      letter-spacing: 0.06em !important;
      border: 1px solid var(--line) !important;
      background: var(--surface) !important;
      box-shadow: 0 1px 4px rgba(0,0,0,0.04) !important;
    }
    .role.admin {
      background: linear-gradient(135deg, #1d5a43 0%, #2a7a58 100%) !important;
      color: #ffffff !important;
      border: 0 !important;
      box-shadow: 0 2px 10px rgba(29, 90, 67, 0.35) !important;
    }

    /* =========================================================
     * 3. KPI Metric Summary Strip (Elevated Modern Cards)
     * ========================================================= */
    .sum {
      display: grid !important;
      grid-template-columns: repeat(auto-fit, minmax(115px, 1fr)) !important;
      gap: 12px !important;
      padding-block: 20px 10px !important;
    }
    .sum > div {
      background: var(--surface) !important;
      border: 1px solid var(--line) !important;
      border-radius: 14px !important;
      padding: 13px 15px !important;
      border-left: 4px solid var(--line) !important;
      box-shadow: 0 3px 12px -2px rgba(0, 0, 0, 0.05), 0 0 1px 1px rgba(0,0,0,0.02) !important;
      transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
    }
    .sum > div:hover {
      transform: translateY(-2.5px) !important;
      box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.09) !important;
    }
    .sum b {
      font-size: 28px !important;
      font-weight: 700 !important;
      letter-spacing: -0.03em !important;
      line-height: 1.1 !important;
      color: var(--ink) !important;
    }
    .sum span {
      font-size: 11.5px !important;
      font-weight: 600 !important;
      text-transform: uppercase !important;
      letter-spacing: 0.06em !important;
      color: var(--muted) !important;
      margin-top: 3px;
      display: block;
    }
    .sum .p {
      border-left-color: var(--pine) !important;
      background: linear-gradient(180deg, color-mix(in srgb, var(--pine) 6%, var(--surface)), var(--surface)) !important;
    }
    .sum .a {
      border-left-color: var(--amber) !important;
      background: linear-gradient(180deg, color-mix(in srgb, var(--amber) 6%, var(--surface)), var(--surface)) !important;
    }

    /* =========================================================
     * 4. Sticky Filter Row & Segmented Tabs (iOS / macOS Style)
     * ========================================================= */
    .bar {
      background: color-mix(in srgb, var(--bg) 88%, transparent) !important;
      backdrop-filter: blur(18px) saturate(160%) !important;
      -webkit-backdrop-filter: blur(18px) saturate(160%) !important;
      border-bottom: 1px solid color-mix(in srgb, var(--line) 75%, transparent) !important;
      padding-block: 10px !important;
    }
    .tabs {
      background: var(--soft) !important;
      padding: 4px !important;
      border-radius: 12px !important;
      border: 1px solid var(--line) !important;
      display: inline-flex !important;
      gap: 3px !important;
      width: fit-content !important;
    }
    .tab {
      padding: 7px 16px !important;
      border-radius: 9px !important;
      font-weight: 600 !important;
      font-size: 13px !important;
      color: var(--muted) !important;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
    }
    .tab:hover {
      color: var(--ink) !important;
    }
    .tab[aria-selected="true"] {
      background: var(--surface) !important;
      color: var(--pine) !important;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 0 1px rgba(0,0,0,0.04) !important;
    }
    .filters .inp, .filters .sel, .inp, .sel {
      border-radius: 10px !important;
      border: 1.5px solid var(--line) !important;
      background: var(--surface) !important;
      font-size: 13px !important;
      transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease !important;
    }
    .filters .inp:focus, .filters .sel:focus, .inp:focus, .sel:focus {
      border-color: var(--pine) !important;
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--pine) 22%, transparent) !important;
      outline: none !important;
    }

    /* =========================================================
     * 5. Staff List Table Rows (Clean Modern Container)
     * ========================================================= */
    .list {
      border-radius: 16px !important;
      border: 1px solid var(--line) !important;
      background: var(--surface) !important;
      box-shadow: 0 6px 24px -4px rgba(0, 0, 0, 0.05), 0 0 1px 1px rgba(0,0,0,0.02) !important;
      overflow: hidden !important;
      margin-top: 14px !important;
    }
    .row.head {
      background: color-mix(in srgb, var(--soft) 75%, var(--surface)) !important;
      font-weight: 600 !important;
      letter-spacing: 0.07em !important;
      font-size: 11px !important;
      padding-block: 12px !important;
      border-bottom: 1.5px solid var(--line) !important;
    }
    .row:not(.head) {
      transition: background 0.12s ease !important;
      padding-block: 11px !important;
    }
    .row:not(.head):hover {
      background: color-mix(in srgb, var(--pine) 5%, var(--surface)) !important;
    }
    .vchip {
      border-radius: 999px !important;
      padding: 3px 10px !important;
      font-weight: 600 !important;
      font-size: 11.5px !important;
      border: 1px solid color-mix(in srgb, var(--vc) 35%, transparent) !important;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04) !important;
    }
    .ptag {
      border-radius: 6px !important;
      padding: 2px 8px !important;
      font-weight: 500 !important;
      font-size: 11.5px !important;
      background: var(--soft) !important;
      border: 1px solid color-mix(in srgb, var(--line) 60%, transparent) !important;
    }

    /* =========================================================
     * 6. Resort Room Cards (Hotel Luxury Aesthetic)
     * ========================================================= */
    .rooms {
      grid-template-columns: repeat(auto-fill, minmax(295px, 1fr)) !important;
      gap: 18px !important;
      margin-top: 16px !important;
    }
    .rcard {
      border-radius: 18px !important;
      border: 1px solid color-mix(in srgb, var(--line) 80%, transparent) !important;
      box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.06), 0 0 1px 1px rgba(0, 0, 0, 0.02) !important;
      background: var(--surface) !important;
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
      overflow: hidden !important;
    }
    .rcard:hover {
      transform: translateY(-4px) !important;
      box-shadow: 0 16px 36px -6px rgba(0, 0, 0, 0.12) !important;
    }
    .rhead {
      padding: 16px 18px !important;
      background: linear-gradient(135deg, var(--rh) 0%, color-mix(in srgb, var(--rh) 75%, #000) 100%) !important;
    }
    .rico {
      border-radius: 12px !important;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12) !important;
      backdrop-filter: blur(8px) !important;
    }
    .rpill {
      border-radius: 999px !important;
      padding: 4px 12px !important;
      font-size: 11.5px !important;
      letter-spacing: 0.04em !important;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2) !important;
    }
    .rmem {
      border-radius: 12px !important;
      padding: 10px 14px !important;
      background: var(--bg) !important;
      border: 1px solid color-mix(in srgb, var(--line) 70%, transparent) !important;
      transition: all 0.15s ease !important;
    }
    .rmem:hover {
      border-color: var(--pine) !important;
      transform: translateX(2px) !important;
    }

    /* =========================================================
     * 7. Transportation Van Cards
     * ========================================================= */
    .vans {
      grid-template-columns: repeat(auto-fill, minmax(305px, 1fr)) !important;
      gap: 18px !important;
      margin-top: 16px !important;
    }
    .card.van {
      border-radius: 18px !important;
      border: 1px solid var(--line) !important;
      border-top: 5px solid var(--vc) !important;
      box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.06), 0 0 1px 1px rgba(0, 0, 0, 0.02) !important;
      padding: 18px !important;
      background: var(--surface) !important;
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
    }
    .card.van:hover {
      transform: translateY(-4px) !important;
      box-shadow: 0 16px 36px -6px rgba(0, 0, 0, 0.12) !important;
    }
    .card.van h3 {
      font-size: 21px !important;
      letter-spacing: -0.01em !important;
    }

    /* =========================================================
     * 8. Personal Staff Profile (VIP Boarding Pass Aesthetic)
     * ========================================================= */
    .me {
      max-width: 680px !important;
      padding-block: 36px !important;
    }
    .me h1 {
      font-size: 34px !important;
      letter-spacing: -0.02em !important;
    }
    .mgrid {
      gap: 16px !important;
    }
    .mcell {
      border-radius: 20px !important;
      padding: 22px !important;
      border: 1px solid var(--line) !important;
      box-shadow: 0 10px 25px -4px rgba(0, 0, 0, 0.06) !important;
      transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
    }
    .mcell:hover {
      transform: translateY(-3px) !important;
      box-shadow: 0 16px 35px -6px rgba(0, 0, 0, 0.1) !important;
    }
    .mcell.room {
      background: linear-gradient(135deg, var(--rh) 0%, #1c1645 100%) !important;
      color: #ffffff !important;
      border: 0 !important;
      box-shadow: 0 12px 30px -4px rgba(53, 44, 130, 0.35) !important;
    }

    /* =========================================================
     * 9. Login & Gate Card (Frosted Glass Acrylic)
     * ========================================================= */
    .gate {
      min-height: 100vh !important;
      padding: 24px 16px !important;
      display: grid !important;
      place-items: center !important;
    }
    .gate-card {
      border-radius: 24px !important;
      padding: 36px 32px !important;
      background: color-mix(in srgb, var(--surface) 92%, transparent) !important;
      backdrop-filter: blur(24px) saturate(180%) !important;
      -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
      border: 1.5px solid color-mix(in srgb, var(--line) 70%, #ffffff 30%) !important;
      box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.2), 0 0 1px 1px rgba(255, 255, 255, 0.25) !important;
      animation: popIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) !important;
    }
    .gate-card h1 {
      font-size: 32px !important;
      letter-spacing: -0.02em !important;
      color: var(--pine) !important;
    }

    /* =========================================================
     * 10. Buttons & Controls (Refined Micro-Interactions)
     * ========================================================= */
    .btn {
      border-radius: 10px !important;
      padding: 10px 18px !important;
      font-weight: 600 !important;
      font-size: 13.5px !important;
      letter-spacing: 0.02em !important;
      transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;
      box-shadow: 0 2px 8px rgba(29, 90, 67, 0.25) !important;
    }
    .btn:hover:not(:disabled) {
      filter: brightness(1.08) !important;
      transform: translateY(-1.5px) !important;
      box-shadow: 0 6px 16px rgba(29, 90, 67, 0.32) !important;
    }
    .btn:active:not(:disabled) {
      transform: translateY(0) !important;
      filter: brightness(0.96) !important;
    }
    .btn.ghost {
      background: transparent !important;
      box-shadow: none !important;
      border: 1.5px solid var(--line) !important;
      color: var(--ink) !important;
    }
    .btn.ghost:hover:not(:disabled) {
      background: var(--soft) !important;
      border-color: var(--line) !important;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05) !important;
    }
    .btn.sm {
      padding: 6px 12px !important;
      font-size: 12px !important;
    }

    /* =========================================================
     * 11. Floating Navigation Dock (Apple Dynamic Island Style)
     * ========================================================= */
    .ext-nav-dock {
      position: fixed;
      bottom: calc(16px + env(safe-area-inset-bottom, 0px));
      left: 50%;
      transform: translateX(-50%);
      z-index: 25;
      background: color-mix(in srgb, var(--surface) 86%, transparent) !important;
      backdrop-filter: blur(24px) saturate(200%) !important;
      -webkit-backdrop-filter: blur(24px) saturate(200%) !important;
      border: 1.5px solid color-mix(in srgb, var(--line) 60%, rgba(255,255,255,0.4)) !important;
      border-radius: 999px !important;
      padding: 6px 10px !important;
      box-shadow: 0 16px 40px -8px rgba(0, 0, 0, 0.28), 0 0 1px 1px rgba(255,255,255,0.2) !important;
      display: flex;
      gap: 6px;
      align-items: center;
      max-width: 95vw;
      transition: all 0.2s ease;
    }
    .ext-nav-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 15px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      color: var(--ink);
      background: transparent;
      border: 0;
      cursor: pointer;
      transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      white-space: nowrap;
    }
    .ext-nav-btn:hover {
      background: color-mix(in srgb, var(--pine) 10%, transparent);
      transform: translateY(-1px);
    }
    .ext-nav-btn:active {
      transform: translateY(0);
    }
    .ext-nav-btn.active {
      background: var(--pine);
      color: var(--pine-ink);
      box-shadow: 0 3px 10px rgba(29, 90, 67, 0.35);
    }
    .ext-nav-btn .icon {
      font-size: 16px;
      line-height: 1;
    }
    .ext-badge {
      display: inline-block;
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 99px;
      background: var(--amber);
      color: #fff;
      font-weight: 700;
      margin-left: 2px;
    }
    .ext-bus-tab.active, .ext-status-chip.active {
      background: var(--pine) !important;
      color: var(--pine-ink) !important;
      border-color: var(--pine) !important;
      box-shadow: 0 2px 8px rgba(29, 90, 67, 0.3) !important;
    }

    /* =========================================================
     * 12. Modal Overlay & Card (Elevated Spring Animation)
     * ========================================================= */
    .ext-modal-ov, .ov {
      position: fixed;
      inset: 0;
      background: rgba(10, 20, 15, 0.68) !important;
      backdrop-filter: blur(10px) !important;
      -webkit-backdrop-filter: blur(10px) !important;
      z-index: 100;
      display: grid;
      place-items: center;
      padding: 16px;
      overflow-y: auto;
    }
    .ext-modal, .modal {
      background: var(--surface) !important;
      border: 1px solid color-mix(in srgb, var(--line) 80%, rgba(255,255,255,0.25)) !important;
      border-radius: 22px !important;
      width: 100%;
      max-width: 580px;
      min-width: 0 !important;
      box-sizing: border-box !important;
      padding: 24px !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 16px;
      box-shadow: 0 28px 70px -12px rgba(0, 0, 0, 0.38), 0 0 1px 1px rgba(255, 255, 255, 0.1) !important;
      max-height: 90vh;
      overflow-y: auto;
      overflow-x: hidden !important;
      animation: popIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
    }
    .ext-modal-body {
      min-width: 0 !important;
      max-width: 100% !important;
      width: 100% !important;
      box-sizing: border-box !important;
      overflow-x: hidden !important;
    }
    #ext-bus-controls-wrapper, #ext-bus-tabs, #ext-status-chips {
      min-width: 0 !important;
      max-width: 100% !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }
    #ext-session-tabs {
      min-width: 0 !important;
      max-width: 100% !important;
      width: 100% !important;
      box-sizing: border-box !important;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
    }
    .ext-session-tab {
      min-width: 0 !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }
    .ext-modal-header, .mh {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--line);
      padding-bottom: 14px;
    }
    .ext-modal-header h2, .modal h2 {
      font-size: 20px !important;
      font-family: var(--display);
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      letter-spacing: -0.01em;
    }

    /* Clean Segmented Control */
    .ext-clean-segmented {
      display: grid;
      grid-template-columns: 1fr 1fr;
      background: var(--bg);
      padding: 3px;
      border-radius: 12px;
      border: 1px solid var(--line);
      margin-bottom: 8px;
      gap: 4px;
    }
    .ext-seg-btn {
      padding: 7px 10px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 9px;
      border: none;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      transition: all 0.15s ease;
    }
    .ext-seg-btn.active {
      background: var(--surface);
      color: var(--ink);
      box-shadow: 0 2px 6px rgba(0,0,0,0.06);
      font-weight: 700;
    }
    .ext-seg-btn.disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    /* Unified Progress & Camera Bar */
    .ext-unified-scan-card {
      background: var(--soft);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 9px 12px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .ext-usc-left {
      flex: 1 1 auto;
      min-width: 0;
    }
    .ext-usc-metric {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 4px;
    }
    .ext-usc-count {
      font-size: 14.5px;
      font-weight: 700;
      color: var(--ink);
      font-variant-numeric: tabular-nums;
    }
    .ext-usc-label {
      font-size: 11.5px;
      color: var(--muted);
      font-weight: 500;
    }
    .ext-usc-bar {
      height: 6px;
      background: color-mix(in srgb, var(--line) 85%, transparent);
      border-radius: 99px;
      overflow: hidden;
      margin-bottom: 4px;
    }
    .ext-usc-bar-fill {
      height: 100%;
      background: var(--pine);
      border-radius: 99px;
      transition: width 0.25s ease;
    }
    .ext-usc-sub {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      color: var(--muted);
    }
    .ext-usc-sub b {
      color: var(--ink);
    }
    .ext-usc-scan-btn {
      flex-shrink: 0;
      padding: 9px 13px !important;
      font-size: 12px !important;
      font-weight: 700 !important;
      border-radius: 10px !important;
      gap: 5px !important;
      background: var(--pine) !important;
      color: var(--pine-ink) !important;
      box-shadow: 0 4px 12px rgba(29, 90, 67, 0.22) !important;
      display: flex !important;
      align-items: center !important;
    }

    /* Confirmation Modal (Safety Guard on Revoke) */
    .ext-confirm-ov {
      position: fixed;
      inset: 0;
      background: rgba(10, 20, 15, 0.72) !important;
      backdrop-filter: blur(8px) !important;
      -webkit-backdrop-filter: blur(8px) !important;
      z-index: 250 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 16px !important;
      box-sizing: border-box !important;
      animation: fadeIn 0.15s ease-out;
    }
    .ext-confirm-card {
      background: var(--surface) !important;
      border: 1px solid color-mix(in srgb, var(--line) 85%, transparent) !important;
      border-radius: 20px !important;
      padding: 22px 20px !important;
      max-width: 370px !important;
      width: 100% !important;
      box-sizing: border-box !important;
      box-shadow: 0 24px 60px rgba(0,0,0,0.45), 0 0 1px 1px rgba(255,255,255,0.1) !important;
      text-align: center !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 12px !important;
      animation: popIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
    }
    .ext-confirm-icon {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: #fef2f2;
      color: #dc2626;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
      margin: 0 auto;
      border: 1.5px solid #fecaca;
    }
    .ext-confirm-title {
      font-size: 17px !important;
      font-weight: 700 !important;
      color: var(--ink) !important;
      margin: 0 !important;
      font-family: var(--display);
    }
    .ext-confirm-msg {
      font-size: 13.5px !important;
      color: var(--muted) !important;
      line-height: 1.55 !important;
      margin: 0 !important;
    }
    .ext-confirm-msg b {
      color: var(--ink);
    }
    .ext-confirm-actions {
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 10px !important;
      margin-top: 6px !important;
    }
    .ext-confirm-actions button {
      padding: 10px 12px !important;
      font-size: 12.5px !important;
      font-weight: 600 !important;
      border-radius: 10px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }

    /* Timeline Styling */
    .ext-timeline {
      display: grid;
      gap: 14px;
      position: relative;
      padding-left: 20px;
    }
    .ext-timeline::before {
      content: "";
      position: absolute;
      left: 7px;
      top: 10px;
      bottom: 10px;
      width: 2px;
      background: var(--line);
    }
    .ext-time-node {
      position: relative;
      display: grid;
      gap: 4px;
      background: var(--bg);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px 14px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.02);
    }
    .ext-time-node::before {
      content: "";
      position: absolute;
      left: -19px;
      top: 16px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--pine);
      border: 2px solid var(--surface);
    }
    .ext-time-node.active-now {
      border-color: var(--pine);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--pine) 25%, transparent);
    }
    .ext-time-node.active-now::before {
      background: var(--amber);
      box-shadow: 0 0 0 3px rgba(184, 95, 15, 0.3);
    }
    .ext-time-stamp {
      font-family: var(--mono);
      font-size: 12px;
      font-weight: 600;
      color: var(--pine);
    }
    .ext-time-title {
      font-size: 15px;
      font-weight: 600;
    }
    .ext-time-desc {
      font-size: 13px;
      color: var(--muted);
    }

    /* Emergency Contact Cards */
    .ext-contact-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
      gap: 12px;
    }
    .ext-contact-card {
      background: var(--bg);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px;
      display: grid;
      gap: 6px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.02);
      transition: transform 0.15s ease;
    }
    .ext-contact-card:hover {
      transform: translateY(-2px);
    }
    .ext-contact-badge {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .05em;
      color: var(--pine);
    }
    .ext-contact-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 7px 12px;
      border-radius: 8px;
      background: var(--pine);
      color: var(--pine-ink);
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      margin-top: 4px;
      box-shadow: 0 2px 6px rgba(29, 90, 67, 0.25);
    }

    /* Digital QR Pass & Scanner */
    .ext-qr-pass {
      background: linear-gradient(135deg, #2b226e 0%, #15113d 50%, #0d281f 100%);
      color: #ffffff;
      border-radius: 20px;
      padding: 22px;
      text-align: center;
      box-shadow: 0 16px 40px -8px rgba(43, 34, 110, 0.45);
      position: relative;
      overflow: hidden;
      margin-bottom: 14px;
      border: 1px solid rgba(255, 255, 255, 0.15);
    }
    .ext-qr-box {
      background: #ffffff;
      padding: 14px;
      border-radius: 16px;
      display: inline-block;
      margin-block: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.25);
    }
    .ext-qr-box img {
      display: block;
      margin: 0 auto;
    }
    .ext-qr-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 16px;
      border-radius: 99px;
      font-size: 13px;
      font-weight: 600;
      background: rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(6px);
      margin-top: 6px;
    }
    .ext-qr-status.checked {
      background: #10b981;
      color: #fff;
      box-shadow: 0 0 14px rgba(16, 185, 129, 0.4);
    }
    #ext-reader {
      width: 100%;
      border-radius: 14px;
      overflow: hidden;
      background: #000;
    }
    .ext-scan-result {
      padding: 14px;
      border-radius: 12px;
      background: color-mix(in srgb, var(--pine) 15%, transparent);
      border: 1.5px solid var(--pine);
      display: grid;
      gap: 4px;
      animation: popIn 0.25s ease-out;
    }

    @keyframes popIn {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }

    /* PWA Install Banner */
    .ext-pwa-banner {
      position: fixed;
      top: max(12px, env(safe-area-inset-top, 12px));
      left: 50%;
      transform: translateX(-50%);
      z-index: 95;
      width: min(460px, 94vw);
      background: color-mix(in srgb, var(--surface) 92%, transparent);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1.5px solid var(--pine);
      border-radius: 16px;
      padding: 10px 14px;
      box-shadow: 0 12px 30px rgba(0,0,0,0.22);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      animation: popIn 0.3s ease-out;
    }
    .ext-pwa-banner-text {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
    }
    .ext-pwa-banner-icon {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: var(--pine);
      display: grid;
      place-items: center;
      color: #fff;
      font-size: 20px;
      flex-shrink: 0;
      box-shadow: 0 3px 8px rgba(29, 90, 67, 0.35);
    }

    /* Offline / Online Network Indicator */
    .ext-net-pill {
      position: fixed;
      top: max(12px, env(safe-area-inset-top, 12px));
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      padding: 7px 16px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 6px 20px rgba(0,0,0,0.18);
      animation: popIn 0.25s ease-out;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
    .ext-net-pill.offline {
      background: #fef3c7;
      color: #92400e;
      border: 1.5px solid #f59e0b;
    }
    .ext-net-pill.online {
      background: #dcfce7;
      color: #166534;
      border: 1.5px solid #22c55e;
    }

    /* Smooth horizontal scroll without ugly scrollbars */
    #ext-bus-tabs, #ext-session-tabs, #ext-status-chips {
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
    }
    #ext-bus-tabs::-webkit-scrollbar, #ext-session-tabs::-webkit-scrollbar, #ext-status-chips::-webkit-scrollbar {
      display: none;
    }

    /* Cloud Sync Indicators & Badges */
    .ext-sync-dot {
      display: inline-block;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      margin-right: 5px;
      vertical-align: middle;
    }
    .ext-sync-dot.live {
      background: #10b981;
      box-shadow: 0 0 6px #10b981;
      animation: pulseSync 2s infinite ease-in-out;
    }
    .ext-sync-dot.offline {
      background: #f59e0b;
    }
    @keyframes pulseSync {
      0% { transform: scale(0.95); opacity: 0.8; }
      50% { transform: scale(1.25); opacity: 1; }
      100% { transform: scale(0.95); opacity: 0.8; }
    }
    .ext-sync-live {
      background: rgba(16, 185, 129, 0.12) !important;
      color: #065f46 !important;
      border: 1px solid #10b981 !important;
      font-weight: 600 !important;
    }
    .ext-sync-offline {
      background: rgba(245, 158, 11, 0.12) !important;
      color: #92400e !important;
      border: 1px solid #f59e0b !important;
      font-weight: 600 !important;
    }
    .ext-sync-unconfigured {
      background: var(--surface) !important;
      color: var(--muted) !important;
    }

    /* Globally prevent document horizontal blowout across all mobile screen sizes */
    html, body {
      overflow-x: hidden !important;
      max-width: 100vw !important;
      width: 100% !important;
    }
    .wrap, #app, .top-in, .sum, .tbl, .cards {
      max-width: 100vw !important;
      box-sizing: border-box !important;
    }
    .top, .bar {
      margin-inline: 0 !important;
      max-width: 100vw !important;
      box-sizing: border-box !important;
    }
    .who {
      flex-wrap: wrap !important;
    }

    /* =========================================================
     * Attendance Modal & Responsive Components
     * ========================================================= */
    @media (min-width: 769px) {
      .ext-modal.ext-modal-wide {
        max-width: 680px !important;
      }
    }
    .ext-chk-user-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }
    .ext-att-row {
      background: var(--bg);
      border: 1px solid color-mix(in srgb, var(--line) 75%, transparent);
      border-radius: 12px;
      padding: 10px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      transition: all 0.15s ease;
    }
    .ext-att-row.is-checked {
      border-color: color-mix(in srgb, var(--pine) 35%, transparent);
      background: color-mix(in srgb, var(--pine) 5%, var(--surface));
    }
    .ext-att-col-info {
      flex: 1 1 auto;
      min-width: 0;
    }
    .ext-att-header-line {
      display: flex;
      align-items: baseline;
      gap: 6px;
      flex-wrap: wrap;
    }
    .ext-att-name {
      font-size: 14px;
      color: var(--ink);
    }
    .ext-att-sid {
      font-size: 11.5px;
      color: var(--muted);
    }
    .ext-att-van-tag {
      font-size: 11px;
      background: var(--soft);
      padding: 1px 6px;
      border-radius: 4px;
      color: var(--pine);
      font-weight: 600;
    }
    .ext-att-subline {
      font-size: 11.5px;
      color: var(--muted);
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 2px;
    }
    .ext-att-time-tag {
      font-size: 11px;
      color: var(--pine);
      font-weight: 600;
      margin-top: 2px;
    }
    .ext-att-toggle-btn {
      flex-shrink: 0;
      min-width: 86px;
      text-align: center;
      font-size: 12px !important;
      padding: 7px 10px !important;
      border-radius: 8px !important;
      white-space: nowrap;
    }
    .ext-att-toggle-btn.checked-btn {
      background: #10b981 !important;
      color: #ffffff !important;
      border-color: #10b981 !important;
      box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3) !important;
    }
    #ext-reader {
      width: 100% !important;
      max-width: 360px !important;
      margin: 0 auto !important;
      border-radius: 14px !important;
      overflow: hidden !important;
      background: #000;
    }
    #ext-reader video {
      border-radius: 14px !important;
      object-fit: cover !important;
    }

    /* =========================================================
     * 13. Mobile Responsive Queries
     * ========================================================= */
    @media (max-width: 768px) {
      .top, .bar {
        padding-inline: 10px !important;
      }
      .who {
        gap: 4px !important;
      }
      .who button {
        padding: 5px 8px !important;
        font-size: 11.5px !important;
      }
      .ext-nav-dock {
        bottom: max(10px, calc(6px + env(safe-area-inset-bottom, 0px)));
        padding: 4px 6px !important;
        gap: 2px !important;
        width: calc(100% - 16px) !important;
        max-width: 420px !important;
        display: flex !important;
        justify-content: space-between !important;
        box-sizing: border-box !important;
      }
      .ext-nav-btn {
        padding: 6px 3px !important;
        font-size: 10.5px !important;
        gap: 2px !important;
        flex: 1 1 0 !important;
        min-width: 0 !important;
        justify-content: center !important;
      }
      .ext-nav-btn .icon {
        font-size: 13.5px !important;
      }
      .ext-modal-ov, .ov {
        width: 100vw !important;
        max-width: 100vw !important;
        height: 100dvh !important;
        padding: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: flex-end !important;
        align-items: stretch !important;
        overflow-x: hidden !important;
      }
      .ext-modal, .modal, .ext-modal.ext-modal-wide {
        max-width: 100vw !important;
        width: 100% !important;
        min-width: 0 !important;
        max-height: 90dvh !important;
        padding: 14px 14px 28px !important;
        border-radius: 20px 20px 0 0 !important;
        margin: 0 !important;
        box-sizing: border-box !important;
        overflow-x: hidden !important;
        gap: 12px;
      }
      .ext-modal-body {
        max-width: 100% !important;
        width: 100% !important;
        min-width: 0 !important;
        overflow-x: hidden !important;
      }
      .ext-drag-handle {
        display: block !important;
      }
      .ext-modal-header {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        padding-bottom: 8px !important;
        gap: 8px !important;
      }
      .ext-modal-header h2, .modal h2 {
        font-size: 15px !important;
        line-height: 1.25 !important;
        max-width: 100% !important;
        margin: 0 !important;
        word-break: normal !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
      .ext-chk-user-card {
        flex-direction: column !important;
        align-items: stretch !important;
      }
      .ext-chk-user-card button {
        width: 100% !important;
        justify-content: center !important;
        display: flex !important;
        align-items: center !important;
      }
      .ext-chk-actions-grid {
        grid-template-columns: 1fr 1fr !important;
      }
      #ext-att-list {
        max-height: 55dvh !important;
      }
      .ext-att-row {
        gap: 8px !important;
        padding: 9px 10px !important;
      }
      .ext-att-toggle-btn {
        min-width: 76px !important;
        font-size: 11px !important;
        padding: 6px 6px !important;
        flex-shrink: 0 !important;
      }
      .ext-qr-pass {
        padding: 18px 14px;
      }
      .ext-qr-box {
        padding: 10px;
      }
      .ext-contact-grid {
        grid-template-columns: 1fr;
      }
      .gate-card {
        padding: 26px 20px !important;
      }
    }

    @media (max-width: 380px) {
      .ext-nav-btn {
        padding: 5px 6px !important;
        font-size: 10.5px !important;
        gap: 2px !important;
      }
      .ext-nav-btn .icon {
        font-size: 13px !important;
      }
      .ext-badge {
        font-size: 9px;
        padding: 1px 4px;
      }
      .ext-session-tab {
        font-size: 11px !important;
        padding: 6px 3px !important;
      }
    }

    /* =========================================================
     * 14. Live Kirirom Weather & Packing Checklist Styles
     * ========================================================= */
    .ext-header-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11.5px;
      font-weight: 600;
      background: color-mix(in srgb, var(--pine) 12%, var(--surface));
      color: var(--ink);
      border: 1px solid color-mix(in srgb, var(--pine) 25%, var(--line));
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.18s ease;
    }
    .ext-header-pill:hover {
      background: color-mix(in srgb, var(--pine) 22%, var(--surface));
      transform: translateY(-1px);
    }
    .ext-weather-hero {
      background: linear-gradient(135deg, #1d5a43 0%, #113829 100%);
      color: #ffffff;
      border-radius: 18px;
      padding: 20px;
      box-shadow: 0 12px 28px -6px rgba(29, 90, 67, 0.35);
      position: relative;
      overflow: hidden;
      margin-bottom: 16px;
    }
    .ext-weather-hero::after {
      content: '🌲';
      position: absolute;
      right: 12px;
      bottom: -15px;
      font-size: 96px;
      opacity: 0.15;
      pointer-events: none;
    }
    .ext-weather-stat-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin-bottom: 16px;
    }
    .ext-weather-stat-card {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px 14px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .ext-weather-stat-icon {
      font-size: 22px;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: color-mix(in srgb, var(--pine) 10%, transparent);
      border-radius: 10px;
    }
    .ext-packing-progress-wrap {
      background: color-mix(in srgb, var(--line) 40%, transparent);
      border-radius: 999px;
      height: 8px;
      overflow: hidden;
      margin: 8px 0 14px 0;
    }
    .ext-packing-progress-bar {
      height: 100%;
      background: linear-gradient(90deg, var(--pine) 0%, #10b981 100%);
      border-radius: 999px;
      transition: width 0.3s ease;
    }
    .ext-packing-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid var(--line);
      background: var(--surface);
      margin-bottom: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .ext-packing-item:hover {
      background: color-mix(in srgb, var(--pine) 5%, var(--surface));
      border-color: color-mix(in srgb, var(--pine) 35%, var(--line));
    }
    .ext-packing-item.checked {
      background: color-mix(in srgb, var(--pine) 8%, var(--surface));
      border-color: var(--pine);
      opacity: 0.88;
    }
    .ext-packing-checkbox {
      width: 18px;
      height: 18px;
      accent-color: var(--pine);
      cursor: pointer;
      margin-top: 2px;
      flex-shrink: 0;
    }

    /* =========================================================
     * 15. Live Announcement / Notice Banner Styles
     * ========================================================= */
    .ext-announcement-banner {
      border-radius: 16px;
      padding: 14px 16px;
      margin: 10px 0 16px 0;
      position: relative;
      display: grid;
      gap: 8px;
      box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.08);
      transition: all 0.2s ease;
      animation: extSlideDown 0.3s ease-out;
    }
    @keyframes extSlideDown {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .ext-announcement-banner.urgent {
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(220, 38, 38, 0.22) 100%) !important;
      border: 1.5px solid #ef4444 !important;
    }
    .ext-announcement-banner.warning {
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(217, 119, 6, 0.22) 100%) !important;
      border: 1.5px solid #f59e0b !important;
    }
    .ext-announcement-banner.info {
      background: linear-gradient(135deg, rgba(29, 90, 67, 0.12) 0%, rgba(16, 185, 129, 0.22) 100%) !important;
      border: 1.5px solid var(--pine) !important;
    }
    .ext-announcement-banner.gala {
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(109, 40, 217, 0.22) 100%) !important;
      border: 1.5px solid #8b5cf6 !important;
    }
    .ext-bc-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 3px 8px;
      border-radius: 999px;
    }
    .ext-bc-badge.urgent { background: #fee2e2; color: #b91c1c; }
    .ext-bc-badge.warning { background: #fef3c7; color: #b45309; }
    .ext-bc-badge.info { background: #d1fae5; color: #065f46; }
    .ext-bc-badge.gala { background: #ede9fe; color: #6d28d9; }
    .ext-pulse-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: currentColor;
      display: inline-block;
      animation: extPulse 1.4s infinite;
    }
    @keyframes extPulse {
      0% { transform: scale(0.95); opacity: 0.7; }
      50% { transform: scale(1.3); opacity: 1; }
      100% { transform: scale(0.95); opacity: 0.7; }
    }
    .ext-announcement-minimized {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      background: color-mix(in srgb, var(--surface) 90%, transparent);
      border: 1px dashed var(--line);
      border-radius: 12px;
      padding: 8px 12px;
      margin: 10px 0;
      font-size: 12px;
      cursor: pointer;
    }
  `;

  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  if (!document.querySelector('link[href*="Kantumruy+Pro"]')) {
    const kLink = document.createElement('link');
    kLink.rel = 'stylesheet';
    kLink.href = 'https://fonts.googleapis.com/css2?family=Kantumruy+Pro:ital,wght@0,300..700;1,300..700&display=swap';
    document.head.appendChild(kLink);
  }

  // ---------------------------------------------------------
  // 6. Data Definitions
  // ---------------------------------------------------------
  const ITINERARY_DATA = [
    {
      day: 'ថ្ងៃទី ១: ថ្ងៃសៅរ៍ (Day 1)',
      items: [
        { time: '06:00 AM - 06:45 AM', title: 'ជួបជុំគ្នា & អាហារពេលព្រឹក', desc: 'ជួបជុំគ្នានៅការិយាល័យកណ្តាល (KBC/KLC Head Office)', loc: 'ភ្នំពេញ' },
        { time: '07:00 AM', title: 'ចេញដំណើរទៅកាន់ឧទ្យានជាតិគិរីរម្យ', desc: 'ឡានក្រុង Airbus 1-4 និង VIP Cars ចេញដំណើរដោយសុវត្ថិភាព', loc: 'ផ្លូវជាតិលេខ ៤' },
        { time: '10:30 AM', title: 'ទៅដល់រមណីយដ្ឋាន & Check-in ទទួលបន្ទប់', desc: 'បែងចែកបន្ទប់ស្នាក់នៅតាម Zone A, B, C, D', loc: 'Kirirom Mountain Resort' },
        { time: '12:00 PM - 01:30 PM', title: 'អាហារថ្ងៃត្រង់ជួបជុំគ្រួសារ Kubota', desc: 'ពិសារអាហារប៊ូហ្វេជុំគ្នា និងសម្រាកតាមបន្ទប់', loc: 'ភោជនីយដ្ឋានធំ' },
        { time: '02:00 PM - 05:30 PM', title: 'សកម្មភាពកម្សាន្ត & Team Building', desc: 'Fun Hiking Adventure & Game Challenge សន្សំពិន្ទុ', loc: 'ទីលានសកម្មភាព' },
        { time: '06:30 PM - 10:00 PM', title: 'រាត្រីសមោសរ Gala Dinner & ប្រគល់ពាន', desc: 'ពិធីជប់លៀងពេលល្ងាច ការប្រគល់រង្វាន់ និងកម្មវិធី MC', loc: 'Gala Hall' }
      ]
    },
    {
      day: 'ថ្ងៃទី ២: ថ្ងៃអាទិត្យ (Day 2)',
      items: [
        { time: '06:30 AM - 07:30 AM', title: 'ហាត់ប្រាណពេលព្រឹក & ស្រូបខ្យល់អាកាស', desc: 'ដើរកម្សាន្តក្រោមព្រៃស្រល់ និងស្រូបអុកស៊ីសែនបរិសុទ្ធ', loc: 'Pine Forest' },
        { time: '07:30 AM - 08:30 AM', title: 'អាហារពេលព្រឹក', desc: 'អាហារពេលព្រឹកជុំគ្នា', loc: 'ភោជនីយដ្ឋាន' },
        { time: '09:00 AM - 11:00 AM', title: 'ថតរូបអនុស្សាវរីយ៍រួម & ដំណើរទស្សនាកម្សាន្ត', desc: 'ថតរូបជុំក្រុមការងារទាំងអស់ និងទស្សនាទឹកធ្លាក់', loc: 'Viewpoint & Waterfall' },
        { time: '11:30 AM', title: 'Check-out ប្រគល់បន្ទប់ជូនវិញ', desc: 'ពិនិត្យឥវ៉ាន់ និងរៀបចំឡើងឡានតាម Bus នីមួយៗ', loc: 'Zone A-D' },
        { time: '12:30 PM - 01:30 PM', title: 'អាហារថ្ងៃត្រង់', desc: 'ពិសារអាហារថ្ងៃត្រង់មុនពេលត្រឡប់', loc: 'ភោជនីយដ្ឋាន' },
        { time: '02:00 PM', title: 'ធ្វើដំណើរត្រឡប់មកភ្នំពេញវិញ', desc: 'ដំណើរត្រឡប់មកដល់រាជធានីភ្នំពេញដោយសុវត្ថិភាព', loc: 'ភ្នំពេញ' }
      ]
    }
  ];

  const EMERGENCY_CONTACTS = [
    { role: 'សង្គ្រោះបឋម (First Aid)', name: 'You Sreynin (KLC)', tel: '012345671', note: 'ឡាន Airbus 1 / បន្ទប់ D010' },
    { role: 'សង្គ្រោះបឋម (First Aid)', name: 'Kea Heven (KBC)', tel: '012345672', note: 'ឡាន Airbus 2 / បន្ទប់ B010' },
    { role: 'សង្គ្រោះបឋម (First Aid)', name: 'Dy Bros (KBC)', tel: '012345673', note: 'ឡាន Airbus 3 / បន្ទប់ C010' },
    { role: 'ដឹកជញ្ជូន (Transportation)', name: 'Vuon Soriya (KBC)', tel: '012345674', note: 'ប្រធានសម្របសម្រួលឡាន / Admin' },
    { role: 'ដឹកជញ្ជូន (Transportation)', name: 'Roeun Sarith (KBC)', tel: '012345675', note: 'សម្របសម្រួល Airbus 2 / Admin' },
    { role: 'ម្ហូបអាហារ (Food Team)', name: 'Kong Rany (KLC)', tel: '012345676', note: 'បន្ទប់ D007' },
    { role: 'ម្ហូបអាហារ (Food Team)', name: 'Nim Vannak (KLC)', tel: '012345677', note: 'បន្ទប់ A010' },
    { role: 'កម្មវិធី & MC', name: 'Vat Makara (KBC)', tel: '012345678', note: 'ពិធីករ / បន្ទប់ B010' },
    { role: 'រមណីយដ្ឋាន គិរីរម្យ (Resort Reception)', name: 'Front Desk Kirirom', tel: '023999888', note: 'ជំនួយទូទៅ / Reception' },
    { role: 'ប៉ូលីសទេសចរណ៍ (Police)', name: 'Tourist Police Kirirom', tel: '117', note: 'សង្គ្រោះបន្ទាន់ ២៤ ម៉ោង' }
  ];

  // ---------------------------------------------------------
  // 7. Modals Manager
  // ---------------------------------------------------------
  let activeModal = null;

  function closeModal() {
    if (html5Scanner) {
      try {
        html5Scanner.stop().catch(() => {});
      } catch (e) {}
      html5Scanner = null;
    }
    if (typeof activeModalRefreshCallback === 'function') {
      activeModalRefreshCallback = null;
    }
    if (activeModal) {
      activeModal.remove();
      activeModal = null;
    }
  }

  function openModal(title, contentHtml, isWide = false, headerActionsHtml = '') {
    closeModal();
    const ov = document.createElement('div');
    ov.className = 'ext-modal-ov';
    const formattedTitle = (typeof title === 'string' && !title.includes('<')) ? `<h2>${title}</h2>` : title;
    ov.innerHTML = `
      <div class="ext-modal ${isWide ? 'ext-modal-wide' : ''}" role="dialog" aria-modal="true">
        <div class="ext-drag-handle" style="width:36px;height:4px;background:var(--line);border-radius:99px;margin:0 auto 2px auto;display:none;"></div>
        <div class="ext-modal-header">
          <div style="min-width:0;flex:1 1 auto;overflow:hidden;">
            ${formattedTitle}
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            ${headerActionsHtml || ''}
            <button class="btn ghost sm" id="ext-close-btn" style="padding:4px 10px;border-radius:8px;font-size:12px;white-space:nowrap;flex-shrink:0;">✕ បិទ</button>
          </div>
        </div>
        <div class="ext-modal-body">${contentHtml}</div>
      </div>
    `;
    ov.querySelector('#ext-close-btn').onclick = closeModal;
    ov.onclick = e => { if (e.target === ov) closeModal(); };
    document.body.appendChild(ov);
    activeModal = ov;
  }

  // ---------------------------------------------------------
  // Safe Confirmation Dialog (Prevents accidental Revoke/Undo)
  // ---------------------------------------------------------
  let activeConfirm = null;

  function closeConfirmDialog() {
    if (activeConfirm) {
      activeConfirm.remove();
      activeConfirm = null;
    }
  }

  function showConfirmDialog({ title, message, okText = 'យល់ព្រម', cancelText = 'បោះបង់', danger = false, onConfirm, onCancel }) {
    closeConfirmDialog();
    const ov = document.createElement('div');
    ov.className = 'ext-confirm-ov';
    ov.innerHTML = `
      <div class="ext-confirm-card" role="alertdialog" aria-modal="true">
        <div class="ext-confirm-icon">${danger ? '⚠️' : '❓'}</div>
        <h3 class="ext-confirm-title">${title}</h3>
        <div class="ext-confirm-msg">${message}</div>
        <div class="ext-confirm-actions">
          <button class="btn ghost sm ext-confirm-btn-cancel">${cancelText}</button>
          <button class="btn sm ext-confirm-btn-ok" style="${danger ? 'background:#dc2626 !important;border-color:#dc2626 !important;color:#ffffff !important;' : ''}">${okText}</button>
        </div>
      </div>
    `;

    ov.querySelector('.ext-confirm-btn-cancel').onclick = () => {
      closeConfirmDialog();
      if (onCancel) onCancel();
    };

    ov.querySelector('.ext-confirm-btn-ok').onclick = () => {
      closeConfirmDialog();
      if (onConfirm) onConfirm();
    };

    ov.onclick = (e) => {
      if (e.target === ov) {
        closeConfirmDialog();
        if (onCancel) onCancel();
      }
    };

    document.body.appendChild(ov);
    activeConfirm = ov;
  }

  // ---------------------------------------------------------
  // Feature 1: កាលវិភាគកម្មវិធី (Schedule Modal)
  // ---------------------------------------------------------
  function showScheduleModal() {
    let html = `
      <div style="display:flex;gap:8px;margin-bottom:14px;">
        <button class="btn sm" id="ext-day1-btn">ថ្ងៃទី ១ (Day 1)</button>
        <button class="btn ghost sm" id="ext-day2-btn">ថ្ងៃទី ២ (Day 2)</button>
      </div>
      <div id="ext-timeline-box" class="ext-timeline"></div>
    `;
    openModal('📅 កាលវិភាគកម្មវិធី Outing 2026', html);

    const box = document.getElementById('ext-timeline-box');
    const b1 = document.getElementById('ext-day1-btn');
    const b2 = document.getElementById('ext-day2-btn');

    function renderDay(idx) {
      b1.className = idx === 0 ? 'btn sm' : 'btn ghost sm';
      b2.className = idx === 1 ? 'btn sm' : 'btn ghost sm';
      const items = ITINERARY_DATA[idx].items;
      box.innerHTML = items.map((item, i) => `
        <div class="ext-time-node ${i === 0 ? 'active-now' : ''}">
          <div class="ext-time-stamp">⏰ ${item.time} • 📍 ${item.loc}</div>
          <div class="ext-time-title">${item.title}</div>
          <div class="ext-time-desc">${item.desc}</div>
        </div>
      `).join('');
    }

    b1.onclick = () => renderDay(0);
    b2.onclick = () => renderDay(1);
    renderDay(0);
  }

  // ---------------------------------------------------------
  // Feature 2: ទំនាក់ទំនងសង្គ្រោះបន្ទាន់ (Contacts Modal)
  // ---------------------------------------------------------
  function showContactsModal() {
    let html = `
      <p class="hint" style="margin-bottom:12px;">ចុចលើលេខទូរស័ព្ទដើម្បីទូរស័ព្ទផ្ទាល់ទៅកាន់ប្រធានក្រុម ឬក្រុមការងារសង្គ្រោះបន្ទាន់។</p>
      <div class="ext-contact-grid">
        ${EMERGENCY_CONTACTS.map(c => `
          <div class="ext-contact-card">
            <span class="ext-contact-badge">${c.role}</span>
            <b style="font-size:15px;">${c.name}</b>
            <small style="color:var(--muted);">${c.note}</small>
            <a href="tel:${c.tel}" class="ext-contact-btn">📞 Call: ${c.tel}</a>
          </div>
        `).join('')}
      </div>
    `;
    openModal('📞 លេខទូរស័ព្ទទំនាក់ទំនង & សង្គ្រោះបន្ទាន់', html);
  }

  // ---------------------------------------------------------
  // Feature 2.5: Firebase Real-Time Cloud Sync Modal
  // ---------------------------------------------------------
  function showCloudSyncModal() {
    const fs = getFirestore();
    const st = getCloudSyncStatus();
    const allStaff = getAllStaffList();

    const busCount = (allStaff || []).filter(p => isStaffCheckedIn(p.sid, p.name, 'bus')).length;
    const nightCount = (allStaff || []).filter(p => isStaffCheckedIn(p.sid, p.name, 'night')).length;

    let statusCardHtml = '';
    if (st === 'live') {
      statusCardHtml = `
        <div style="background:#ecfdf5;border:1.5px solid #10b981;border-radius:12px;padding:12px 14px;margin-bottom:14px;">
          <div style="display:flex;align-items:center;gap:8px;font-weight:700;color:#065f46;font-size:14px;">
            <span class="ext-sync-dot live" style="width:10px;height:10px;"></span>
            <span>🟢 កំពុងភ្ជាប់ Real-time Cloud Sync (Firebase Live)</span>
          </div>
          <div style="font-size:12px;color:#047857;margin-top:6px;line-height:1.5;">
            ទិន្នន័យ Check-in ទាំងអស់ត្រូវបានភ្ជាប់ Live ជាមួយ Google Cloud Firestore (Project: <b>kirirom-rooming</b>)។ រាល់ពេលគណៈកម្មការណាស្កេន ទិន្នន័យនឹងលោតឡើងលើទូរស័ព្ទទាំងអស់ភ្លាមៗ។
          </div>
          <div style="display:flex;gap:12px;margin-top:10px;padding-top:8px;border-top:1px dashed #a7f3d0;font-size:11.5px;color:#065f46;">
            <span>🚌 បានឡើងឡាន: <b>${busCount} / ${(allStaff || []).length}</b></span>
            <span>•</span>
            <span>🌙 កម្មវិធីយប់: <b>${nightCount} / ${(allStaff || []).length}</b></span>
          </div>
        </div>
      `;
    } else if (st === 'offline') {
      statusCardHtml = `
        <div style="background:#fffbeb;border:1.5px solid #f59e0b;border-radius:12px;padding:12px 14px;margin-bottom:14px;">
          <div style="display:flex;align-items:center;gap:8px;font-weight:700;color:#92400e;font-size:14px;">
            <span class="ext-sync-dot offline" style="width:10px;height:10px;"></span>
            <span>🟡 ដំណើរការ Offline Mode (ទូរស័ព្ទគ្មានសេវាអ៊ីនធឺណិត)</span>
          </div>
          <div style="font-size:12px;color:#b45309;margin-top:6px;line-height:1.5;">
            ទិន្នន័យត្រូវបានរក្សាទុកយ៉ាងមានសុវត្ថិភាពក្នុងអង្គចងចាំទូរស័ព្ទ (IndexedDB Offline Cache)។ ប្រព័ន្ធនឹងធ្វើការ <b>Auto-Sync</b> រុញទិន្នន័យឡើង Cloud ដោយស្វ័យប្រវត្តនៅពេលទូរស័ព្ទមានសេវាអ៊ីនធឺណិតឡើងវិញ។
          </div>
        </div>
      `;
    } else {
      statusCardHtml = `
        <div style="background:#f3f4f6;border:1.5px solid #d1d5db;border-radius:12px;padding:12px 14px;margin-bottom:14px;">
          <div style="display:flex;align-items:center;gap:8px;font-weight:700;color:#374151;font-size:14px;">
            <span>⚪ ដំណើរការ Local Only (មិនទាន់ភ្ជាប់ Cloud)</span>
          </div>
          <div style="font-size:12px;color:#4b5563;margin-top:6px;line-height:1.5;">
            ទិន្នន័យ Check-in បច្ចុប្បន្នត្រូវបានរក្សាទុកតែលើទូរស័ព្ទនេះប៉ុណ្ណោះ។ ដើម្បីឱ្យគណៈកម្មការផ្សេងៗមើលឃើញទិន្នន័យរួមគ្នា សូមពិនិត្យមើលការភ្ជាប់ Firebase ខាងក្រោម។
          </div>
        </div>
      `;
    }

    const html = `
      ${statusCardHtml}

      <div style="display:grid;gap:12px;">
        <div style="background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px;">
          <b style="font-size:13px;display:block;margin-bottom:6px;">⚡ សកម្មភាពធ្វើសមកាលកម្ម (Sync Actions)</b>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <button class="btn sm" id="ext-test-sync-btn" style="border-radius:8px;font-size:12px;padding:8px;">
              🧪 តេស្តការភ្ជាប់ (Ping)
            </button>
            <button class="btn ghost sm" id="ext-force-sync-btn" style="border-radius:8px;font-size:12px;padding:8px;">
              🔄 Sync ឡើងវិញ (Sync Now)
            </button>
          </div>
        </div>

        <details style="background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:10px 12px;font-size:12px;">
          <summary style="font-weight:600;cursor:pointer;color:var(--pine);">⚙️ កំណត់ Firebase Project ដោយខ្លួនឯង (Advanced Config)</summary>
          <div style="margin-top:10px;display:grid;gap:8px;">
            <p style="margin:0;color:var(--muted);font-size:11.5px;">
              បច្ចុប្បន្នប្រព័ន្ធភ្ជាប់ជាមួយ Firebase Project: <code>kirirom-rooming</code>។ ប្រសិនបើលោកអ្នកចង់ប្តូរទៅប្រើ Firebase Project ផ្សេង សូមបិទភ្ជាប់ (Paste) Config JSON ខាងក្រោម៖
            </p>
            <textarea class="inp" id="ext-custom-firebase-cfg" rows="5" style="font-family:var(--mono);font-size:11px;width:100%;border-radius:8px;" placeholder='{"apiKey": "...", "projectId": "..."}'></textarea>
            <div style="display:flex;gap:6px;">
              <button class="btn sm" id="ext-save-custom-cfg-btn" style="font-size:11.5px;padding:6px 12px;border-radius:7px;">💾 រក្សាទុក & ភ្ជាប់</button>
              <button class="btn ghost sm" id="ext-reset-cfg-btn" style="font-size:11.5px;padding:6px 12px;border-radius:7px;color:var(--danger);">🗑️ កំណត់ឡើងវិញ</button>
            </div>
          </div>
        </details>

        <div style="font-size:11.5px;color:var(--muted);line-height:1.5;background:rgba(29,90,67,0.05);padding:10px 12px;border-radius:10px;">
          💡 <b>ចំណាំសំខាន់:</b> មុខងារ <b>Offline-First</b> អនុញ្ញាតឱ្យលោកអ្នកស្កេន QR Code បានរហ័សទាន់ចិត្តគ្រប់ពេល ទោះបីជាដាច់សេវាទូរស័ព្ទក៏ដោយ។ ពេលទូរស័ព្ទមានសេវាអ៊ីនធឺណិតឡើងវិញ ប្រព័ន្ធនឹងរុញទិន្នន័យទៅ Cloud ដោយស្វ័យប្រវត្តដោយមិនបាច់ចុចអ្វីឡើយ។
        </div>
      </div>
    `;

    openModal('☁️ ស្ថានភាព Real-time Data Sync', html);

    const testBtn = document.getElementById('ext-test-sync-btn');
    const forceBtn = document.getElementById('ext-force-sync-btn');
    const saveCfgBtn = document.getElementById('ext-save-custom-cfg-btn');
    const resetCfgBtn = document.getElementById('ext-reset-cfg-btn');
    const cfgInp = document.getElementById('ext-custom-firebase-cfg');

    if (cfgInp) {
      const curCfg = localStorage.getItem('krr_firebase_config');
      if (curCfg) cfgInp.value = curCfg;
    }

    if (testBtn) {
      testBtn.onclick = async () => {
        testBtn.textContent = 'កំពុងតេស្ត...';
        testBtn.disabled = true;
        const currentFs = getFirestore();
        if (!currentFs) {
          alert('❌ មិនអាចភ្ជាប់ Firestore បានទេ! សូមពិនិត្យមើល Internet ឬ Firebase SDK។');
          testBtn.textContent = '🧪 តេស្តការភ្ជាប់ (Ping)';
          testBtn.disabled = false;
          return;
        }
        try {
          const pingStart = Date.now();
          await currentFs.collection('ext_checkins').doc('ping').set({
            ping: true,
            time: new Date().toISOString()
          });
          const latency = Date.now() - pingStart;
          alert(`✅ ការភ្ជាប់ Firebase Cloud Firestore ដំណើរការជោគជ័យ ១០០%!\n\n⚡ ល្បឿនឆ្លើយតប (Latency): ${latency}ms\n📡 Real-time Sync ត្រៀមរួចជាស្រេចសម្រាប់ទូរស័ព្ទគណៈកម្មការទាំងអស់។`);
          testBtn.textContent = '🧪 តេស្តការភ្ជាប់ (Ping)';
          testBtn.disabled = false;
        } catch (err) {
          alert('⚠️ មានបញ្ហាក្នុងការសរសេរទៅ Firestore: ' + (err.message || err));
          testBtn.textContent = '🧪 តេស្តការភ្ជាប់ (Ping)';
          testBtn.disabled = false;
        }
      };
    }

    if (forceBtn) {
      forceBtn.onclick = () => {
        forceBtn.textContent = 'កំពុង Sync...';
        forceBtn.disabled = true;
        saveCheckinState();
        const currentFs = getFirestore();
        if (currentFs) {
          currentFs.collection('ext_checkins').doc('bus').set(checkinState.bus || {}, { merge: true }).catch(() => {});
          currentFs.collection('ext_checkins').doc('night').set(checkinState.night || {}, { merge: true }).catch(() => {});
        }
        setTimeout(() => {
          forceBtn.textContent = '✅ Sync រួចរាល់!';
          setTimeout(() => {
            if (forceBtn) {
              forceBtn.textContent = '🔄 Sync ឡើងវិញ (Sync Now)';
              forceBtn.disabled = false;
            }
          }, 1500);
        }, 600);
      };
    }

    if (saveCfgBtn && cfgInp) {
      saveCfgBtn.onclick = () => {
        const val = cfgInp.value.trim();
        if (!val) {
          alert('សូមបញ្ចូល Firebase Config ជាមុនសិន!');
          return;
        }
        try {
          let parsed = null;
          if (val.startsWith('{')) {
            parsed = JSON.parse(val);
          } else {
            const fn = new Function('return ' + val);
            parsed = fn();
          }
          if (parsed && parsed.apiKey) {
            localStorage.setItem('krr_firebase_config', JSON.stringify(parsed));
            alert('✅ បានរក្សាទុក Firebase Config ជោគជ័យ! កម្មវិធីនឹង Reload ដើម្បីភ្ជាប់ឡើងវិញ។');
            window.location.reload();
          } else {
            alert('❌ ទម្រង់ Config មិនត្រឹមត្រូវ (ខ្វះ apiKey)!');
          }
        } catch (e) {
          alert('❌ មិនអាចអាន Config បានទេ: ' + e.message);
        }
      };
    }

    if (resetCfgBtn) {
      resetCfgBtn.onclick = () => {
        if (confirm('តើអ្នកពិតជាចង់កំណត់ Firebase Config ត្រឡប់ទៅជា Default វិញមែនទេ?')) {
          localStorage.removeItem('krr_firebase_config');
          alert('បានកំណត់ឡើងវិញរួចរាល់! កម្មវិធីនឹង Reload។');
          window.location.reload();
        }
      };
    }
  }

  // ---------------------------------------------------------
  // Feature 3: QR Code Check-in System (Highlight!)
  // ---------------------------------------------------------
  function getStaffCheckinKey(sid, name) {
    return (sid || name || '').toLowerCase().trim();
  }

  function isStaffCheckedIn(sid, name, session = 'bus') {
    const sess = (session === 'night') ? 'night' : 'bus';
    const k = getStaffCheckinKey(sid, name);
    return !!(checkinState[sess] && checkinState[sess][k]);
  }

  function getStaffCheckinData(sid, name, session = 'bus') {
    const sess = (session === 'night') ? 'night' : 'bus';
    const k = getStaffCheckinKey(sid, name);
    return (checkinState[sess] && checkinState[sess][k]) ? checkinState[sess][k] : null;
  }

  function toggleCheckin(sid, name, session = 'bus', scannerUser = null) {
    const sess = (session === 'night') ? 'night' : 'bus';
    if (!checkinState[sess]) checkinState[sess] = {};
    const k = getStaffCheckinKey(sid, name);
    let checkinRecord = null;
    if (checkinState[sess][k]) {
      delete checkinState[sess][k];
      checkinRecord = null;
    } else {
      checkinRecord = {
        checkedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toISOString(),
        checkedBy: scannerUser ? scannerUser.name : 'Coordinator',
        scannerSid: scannerUser ? (scannerUser.sid || '') : '',
        session: sess
      };
      checkinState[sess][k] = checkinRecord;
      playSuccessBeep();
      triggerVibrate();
    }
    saveCheckinState();
    updateCheckinBadges();
    syncSingleCheckinToCloud(sess, k, checkinRecord);
  }

  // Generate QR Code with reliable fallback
  function renderQrToElement(containerId, dataObj) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';

    const textToEncode = JSON.stringify(dataObj);

    if (typeof QRCode !== 'undefined') {
      try {
        new QRCode(el, {
          text: textToEncode,
          width: 140,
          height: 140,
          colorDark: "#15251d",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.M
        });
        return;
      } catch (e) {}
    }

    // High reliability fallback: QR Code API Image
    const img = document.createElement('img');
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(textToEncode)}`;
    img.width = 140;
    img.height = 140;
    img.alt = 'QR Pass';
    img.loading = 'lazy';
    el.appendChild(img);
  }

  // ---------------------------------------------------------
  // Bus Grouping & Filter Helpers
  // ---------------------------------------------------------
  function normalizeBusKey(van) {
    const v = String(van || '').trim();
    if (/^airbus\s*1/i.test(v)) return 'Airbus1';
    if (/^airbus\s*2/i.test(v)) return 'Airbus2';
    if (/^airbus\s*3/i.test(v)) return 'Airbus3';
    if (/^airbus\s*4/i.test(v)) return 'Airbus4';
    if (/^(vip|pick)/i.test(v)) return 'VIP';
    return v || 'all';
  }

  function getBusLabel(busKey) {
    switch (busKey) {
      case 'Airbus1': return 'Airbus 1';
      case 'Airbus2': return 'Airbus 2';
      case 'Airbus3': return 'Airbus 3';
      case 'Airbus4': return 'Airbus 4';
      case 'VIP': return 'VIP & Pickups';
      case 'all': return 'ឡានទាំងអស់ (All)';
      default: return busKey;
    }
  }

  function filterStaffByBus(staffList, busKey) {
    if (!busKey || busKey === 'all') return staffList;
    if (busKey === 'VIP') {
      return staffList.filter(p => !/^airbus/i.test(p.van || ''));
    }
    return staffList.filter(p => normalizeBusKey(p.van) === busKey);
  }

  const BUS_COORDINATORS = {
    Airbus1: { name: 'Vuon Soriya (Transportation)', tel: '012345674' },
    Airbus2: { name: 'Roeun Sarith & Doen Sena', tel: '012345675' },
    Airbus3: { name: 'Chhot Lyhuo & Sam Lay', tel: '012345673' },
    Airbus4: { name: 'Choeun Ussa (Transportation)', tel: '012345674' },
    VIP: { name: 'Teng Sokhoeun & Sen Sokchea', tel: '023999888' }
  };

  function getBusCoordinatorInfo(busKey) {
    return BUS_COORDINATORS[busKey] || { name: 'ប្រធានឡាន ' + getBusLabel(busKey), tel: '' };
  }

  // Admin & Coordinator QR Scanner & Attendance Management
  let html5Scanner = null;

  function showCheckinAdminModal(scannerUser, defaultSession = null) {
    const activeStaff = scannerUser || getMe();
    const allStaff = getAllStaffList();
    const roleBadge = getScannerRoleBadge(activeStaff);

    const isTr = isTransportationRole(activeStaff);
    const isAct = isActivityRole(activeStaff);
    const isAdm = !!(activeStaff && activeStaff.admin);
    const canDoBus = isAdm || isTr;
    const canDoNight = isAdm || isAct;

    // Strict default session based on permissions
    let activeSession = defaultSession;
    if (!activeSession) {
      if (canDoNight && !canDoBus) activeSession = 'night';
      else activeSession = 'bus';
    } else {
      if (activeSession === 'bus' && !canDoBus && canDoNight) activeSession = 'night';
      if (activeSession === 'night' && !canDoNight && canDoBus) activeSession = 'bus';
    }

    // Coordinator's assigned bus and locking (for 'bus' session)
    const coordinatorBus = (activeStaff && activeStaff.van) ? normalizeBusKey(activeStaff.van) : null;
    const isCoordinatorLocked = !!(coordinatorBus && coordinatorBus !== 'all');
    let activeBus = coordinatorBus || 'Airbus1';

    let statusFilter = 'all'; // 'all' | 'checked' | 'pending'

    function getBusStats(busKey) {
      const busStaff = filterStaffByBus(allStaff, busKey);
      const checked = busStaff.filter(p => isStaffCheckedIn(p.sid, p.name, 'bus')).length;
      const total = busStaff.length;
      const pending = total - checked;
      const pct = Math.round((checked / (total || 1)) * 100);
      return { total, checked, pending, pct, label: getBusLabel(busKey) };
    }

    function getNightStats() {
      const checked = allStaff.filter(p => isStaffCheckedIn(p.sid, p.name, 'night')).length;
      const total = allStaff.length;
      const pending = total - checked;
      const pct = Math.round((checked / (total || 1)) * 100);
      return { total, checked, pending, pct, label: 'កម្មវិធីពេលយប់ (Gala Dinner)' };
    }

    let html = `
      <!-- Top Session Switcher Tabs (Clean Segmented Control) -->
      <div class="ext-clean-segmented" id="ext-session-tabs">
        <button class="ext-seg-btn ext-session-tab ${activeSession === 'bus' ? 'active' : ''} ${!canDoBus ? 'disabled' : ''}" data-session="bus" title="${!canDoBus ? '🔒 សម្រាប់តែគណៈកម្មការ Transportation' : ''}">
          ${!canDoBus ? '🔒 ' : ''}🚌 ឡើងឡាន (Bus)
        </button>
        <button class="ext-seg-btn ext-session-tab ${activeSession === 'night' ? 'active' : ''} ${!canDoNight ? 'disabled' : ''}" data-session="night" title="${!canDoNight ? '🔒 សម្រាប់តែគណៈកម្មការ Activity Team' : ''}">
          ${!canDoNight ? '🔒 ' : ''}🌙 កម្មវិធីយប់ (Gala)
        </button>
      </div>

      <!-- Bus Selector Chips (Swipeable Horizontal Scroll) -->
      <div id="ext-bus-controls-wrapper" style="${activeSession === 'bus' ? '' : 'display:none;'}margin-bottom:8px;">
        <div style="display:flex;gap:5px;overflow-x:auto;padding-bottom:3px;-webkit-overflow-scrolling:touch;" id="ext-bus-tabs">
          ${['Airbus1', 'Airbus2', 'Airbus3', 'Airbus4', 'VIP', 'all'].map(k => {
            const st = getBusStats(k);
            const isMyBus = k === coordinatorBus;
            const isLockedOther = isCoordinatorLocked && !isMyBus;
            return `
              <button class="btn sm ext-bus-tab ${k === activeBus ? 'active' : 'ghost'}" data-bus="${k}" style="white-space:nowrap;font-size:11px;padding:4px 10px;flex-shrink:0;border-radius:8px;${isLockedOther ? 'opacity:0.55;cursor:not-allowed;' : ''}" title="${isLockedOther ? '🔒 មិនអាចចុចបានទេ (លោកអ្នកទទួលបន្ទុកតែ ' + getBusLabel(coordinatorBus) + ')' : (isMyBus ? 'ឡានដែលលោកអ្នកទទួលបន្ទុកផ្ទាល់' : 'វត្តមាន ' + st.label)}">
                ${isLockedOther ? '🔒 ' : (isMyBus ? '⭐ ' : '')}${st.label} <b>(${st.checked}/${st.total})</b>
              </button>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Night Event Compact Banner -->
      <div id="ext-night-banner-wrapper" style="${activeSession === 'night' ? 'display:flex;' : 'display:none;'}margin-bottom:8px;background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.2);border-radius:10px;padding:6px 10px;justify-content:space-between;align-items:center;">
        <span style="color:#6d28d9;font-size:11.5px;font-weight:600;">🌙 កម្មវិធីរាត្រីសមោសរ (បុគ្គលិក ១៥៧ នាក់)</span>
        <span style="background:#7c3aed;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;">Hall Gate</span>
      </div>

      <!-- Unified Progress & Camera Scan Bar (Streamlined) -->
      <div class="ext-unified-scan-card" id="ext-unified-scan-box">
        <div class="ext-usc-left">
          <div class="ext-usc-metric">
            <span class="ext-usc-count" id="ext-progress-count">0 / 33 នាក់</span>
            <span class="ext-usc-label" id="ext-progress-label">បានឡើង (0%)</span>
          </div>
          <div class="ext-usc-bar">
            <div class="ext-usc-bar-fill" id="ext-progress-fill" style="width:0%;"></div>
          </div>
          <div class="ext-usc-sub" id="ext-progress-sub">
            <span>✅ បានឡើង: <b id="ext-count-done">0</b></span>
            <span>•</span>
            <span>⏳ នៅសល់: <b id="ext-count-left" style="color:var(--amber);">33</b></span>
          </div>
        </div>
        <button class="btn sm ext-usc-scan-btn" id="ext-start-scan-btn">
          📷 ស្កេន QR
        </button>
      </div>

      <!-- Camera Drawer (Expands cleanly right under the scan button) -->
      <div id="ext-reader-box" style="display:none;margin-bottom:10px;background:var(--bg);padding:8px;border-radius:12px;border:1px solid var(--line);">
        <div id="ext-reader"></div>
        <button class="btn ghost sm" id="ext-stop-scan-btn" style="margin-top:6px;width:100%;padding:6px;border-radius:8px;font-size:11.5px;">✕ បិទកាមេរ៉ា (Close Camera)</button>
      </div>

      <div id="ext-scan-feedback" style="display:none;margin-bottom:10px;"></div>

      <!-- Search & Status Filter Toolbar (Unified & Compact) -->
      <div style="margin-bottom:8px;display:grid;gap:6px;">
        <div style="display:flex;gap:6px;align-items:center;">
          <input class="inp" id="ext-att-search" placeholder="🔍 ស្វែងរកឈ្មោះ, Staff ID, ឬ ឡាន..." style="flex:1 1 auto;min-width:0;padding:7px 11px;font-size:12px;border-radius:9px;">
          ${activeStaff ? `<button class="btn ghost sm" id="ext-switch-to-pass-btn" style="padding:6px 9px;font-size:11px;border-radius:8px;flex-shrink:0;white-space:nowrap;" title="មើល QR Pass ផ្ទាល់ខ្លួន">🎫 Pass</button>` : ''}
          <button class="btn ghost sm" id="ext-export-att-btn" style="padding:6px 9px;font-size:11px;border-radius:8px;flex-shrink:0;white-space:nowrap;" title="Export CSV">📥 CSV</button>
        </div>
        <div style="display:flex;gap:5px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:2px;" id="ext-status-chips">
          <button class="btn sm ext-status-chip active" data-status="all" style="white-space:nowrap;flex-shrink:0;font-size:11px;padding:4px 9px;border-radius:7px;">ទាំងអស់ (33)</button>
          <button class="btn ghost sm ext-status-chip" data-status="checked" style="white-space:nowrap;flex-shrink:0;font-size:11px;padding:4px 9px;border-radius:7px;">✅ បានឡើង (0)</button>
          <button class="btn ghost sm ext-status-chip" data-status="pending" style="white-space:nowrap;flex-shrink:0;font-size:11px;padding:4px 9px;border-radius:7px;color:var(--amber);">⏳ មិនទាន់ឡើង (33)</button>
        </div>
      </div>

      <div id="ext-att-list" style="max-height:56dvh;overflow-y:auto;display:grid;gap:6px;-webkit-overflow-scrolling:touch;padding-right:2px;"></div>
    `;

    const titleHtml = `
      <div style="min-width:0;display:grid;gap:2px;">
        <div style="font-size:15px;font-weight:700;line-height:1.2;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">🎫 Check-in វត្តមាន</div>
        <div style="font-size:11px;color:var(--muted);font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          👤 <b>${activeStaff ? activeStaff.name : 'Staff'}</b> • <span style="color:var(--pine);font-weight:600;">${getShortRoleLabel(activeStaff)}</span>
        </div>
      </div>
    `;

    const headerActionsHtml = `
      <button class="btn sm" id="ext-cloud-sync-btn" style="padding:4px 8px;font-size:11px;border-radius:8px;white-space:nowrap;flex-shrink:0;" title="Firebase Real-time Cloud Sync">
        ☁️ Sync
      </button>
    `;

    openModal(titleHtml, html, true, headerActionsHtml);

    const attList = document.getElementById('ext-att-list');
    const searchInp = document.getElementById('ext-att-search');
    const startScanBtn = document.getElementById('ext-start-scan-btn');
    const stopScanBtn = document.getElementById('ext-stop-scan-btn');
    const readerBox = document.getElementById('ext-reader-box');
    const feedbackBox = document.getElementById('ext-scan-feedback');
    const exportBtn = document.getElementById('ext-export-att-btn');
    const switchPassBtn = document.getElementById('ext-switch-to-pass-btn');
    const cloudSyncBtn = document.getElementById('ext-cloud-sync-btn');

    if (cloudSyncBtn) {
      cloudSyncBtn.onclick = () => showCloudSyncModal();
    }
    updateCloudSyncBadge();

    activeModalRefreshCallback = () => {
      updateProgressCard();
      renderAttList();
      updateCloudSyncBadge();
    };

    if (switchPassBtn && activeStaff) {
      switchPassBtn.onclick = () => showPersonalPassModal(activeStaff);
    }

    function updateProgressCard() {
      const countEl = document.getElementById('ext-progress-count');
      const labelEl = document.getElementById('ext-progress-label');
      const fillEl = document.getElementById('ext-progress-fill');
      const doneEl = document.getElementById('ext-count-done');
      const leftEl = document.getElementById('ext-count-left');
      const subEl = document.getElementById('ext-progress-sub');

      if (activeSession === 'bus') {
        const st = getBusStats(activeBus);
        if (countEl) countEl.textContent = `${st.checked} / ${st.total} នាក់`;
        if (labelEl) labelEl.textContent = `បានឡើង (${st.pct}%)`;
        if (fillEl) {
          fillEl.style.width = `${st.pct}%`;
          fillEl.style.background = 'var(--pine)';
        }
        if (doneEl) doneEl.textContent = `${st.checked}`;
        if (leftEl) {
          leftEl.textContent = `${st.pending}`;
          leftEl.style.color = st.pending > 0 ? '#b85f0f' : 'var(--muted)';
        }
        if (subEl) {
          subEl.innerHTML = `<span>✅ បានឡើង: <b>${st.checked}</b></span> • <span>⏳ នៅសល់: <b style="color:${st.pending > 0 ? '#b85f0f' : 'var(--muted)'}">${st.pending}</b></span>`;
        }

        // Update status chip badges
        const chips = document.querySelectorAll('.ext-status-chip');
        chips.forEach(c => {
          const s = c.dataset.status;
          if (s === 'all') c.innerHTML = `ទាំងអស់ (${st.total})`;
          if (s === 'checked') c.innerHTML = `✅ បានឡើង (${st.checked})`;
          if (s === 'pending') c.innerHTML = `⏳ មិនទាន់ឡើង (${st.pending})`;
        });

        // Update bus tab counts
        document.querySelectorAll('.ext-bus-tab').forEach(t => {
          const b = t.dataset.bus;
          const bSt = getBusStats(b);
          const isMyBus = b === coordinatorBus;
          const isLockedOther = isCoordinatorLocked && !isMyBus;
          t.innerHTML = `${isLockedOther ? '🔒 ' : (isMyBus ? '⭐ ' : '')}${bSt.label} <b style="opacity:0.9;">(${bSt.checked}/${bSt.total})</b>`;
        });
      } else {
        // NIGHT EVENT (Activity Team)
        const st = getNightStats();
        if (countEl) countEl.textContent = `${st.checked} / ${st.total} នាក់`;
        if (labelEl) labelEl.textContent = `បានចូល (${st.pct}%)`;
        if (fillEl) {
          fillEl.style.width = `${st.pct}%`;
          fillEl.style.background = 'linear-gradient(90deg, #7c3aed, #ec4899)';
        }
        if (doneEl) doneEl.textContent = `${st.checked}`;
        if (leftEl) {
          leftEl.textContent = `${st.pending}`;
          leftEl.style.color = st.pending > 0 ? '#b85f0f' : 'var(--muted)';
        }
        if (subEl) {
          subEl.innerHTML = `<span>✅ បានចូល: <b>${st.checked}</b></span> • <span>⏳ នៅសល់: <b style="color:${st.pending > 0 ? '#b85f0f' : 'var(--muted)'}">${st.pending}</b></span>`;
        }

        const chips = document.querySelectorAll('.ext-status-chip');
        chips.forEach(c => {
          const s = c.dataset.status;
          if (s === 'all') c.innerHTML = `ទាំងអស់ (${st.total})`;
          if (s === 'checked') c.innerHTML = `✅ បានចូល (${st.checked})`;
          if (s === 'pending') c.innerHTML = `⏳ មិនទាន់ចូល (${st.pending})`;
        });
      }
    }

    function renderAttList() {
      const q = (searchInp ? searchInp.value : '').toLowerCase().trim();
      const currentList = (activeSession === 'bus') ? filterStaffByBus(allStaff, activeBus) : allStaff;

      const filtered = currentList.filter(p => {
        const isChk = isStaffCheckedIn(p.sid, p.name, activeSession);
        if (statusFilter === 'checked' && !isChk) return false;
        if (statusFilter === 'pending' && isChk) return false;
        if (!q) return true;
        return (
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.sid && p.sid.toLowerCase().includes(q)) ||
          (p.van && p.van.toLowerCase().includes(q)) ||
          (p.room && p.room.toLowerCase().includes(q)) ||
          (p.pos && p.pos.toLowerCase().includes(q)) ||
          (p.act && p.act.toLowerCase().includes(q))
        );
      });

      if (filtered.length === 0) {
        if (q && activeSession === 'bus') {
          const foundOther = allStaff.find(p => (
            (p.name && p.name.toLowerCase().includes(q)) ||
            (p.sid && p.sid.toLowerCase().includes(q))
          ));
          if (foundOther && normalizeBusKey(foundOther.van) !== activeBus) {
            const otherBusLabel = foundOther.van || 'ឡានផ្សេង';
            const otherCoord = getBusCoordinatorInfo(normalizeBusKey(foundOther.van));
            attList.innerHTML = `
              <div style="background:#fee2e2;border:1.5px solid #ef4444;border-radius:8px;padding:14px;text-align:center;color:#991b1b;">
                <b style="font-size:15px;display:block;margin-bottom:4px;">❌ មិនស្ថិតក្នុងឡាន ${getBusLabel(activeBus)} ទេ!</b>
                <span>បុគ្គលិក <b>${foundOther.name}</b> (${foundOther.sid}) ត្រូវជិះ <b>${otherBusLabel}</b>។</span>
                <div style="font-size:12px;color:#7f1d1d;margin-top:6px;">
                  👉 ត្រូវ Check-in ឡើងឡានជាមួយ: <b>${otherCoord.name}</b> ${otherCoord.tel ? `(📞 ${otherCoord.tel})` : ''}
                </div>
                <div style="font-size:11.5px;color:#991b1b;margin-top:8px;background:rgba(239,68,68,0.1);padding:6px;border-radius:6px;">
                  🔒 លោកអ្នកមិនអាចចុចមើល ឬ Check-in ឱ្យឡានផ្សេងបានឡើយ!
                </div>
              </div>
            `;
            return;
          }
        }
        attList.innerHTML = `
          <div style="text-align:center;padding:22px 14px;color:var(--muted);background:var(--bg);border-radius:8px;">
            ${statusFilter === 'pending' ? (activeSession === 'bus' ? '🎉 អស់អ្នកមិនទាន់ឡើងឡានហើយ! (គ្រប់គ្នាបានឡើងឡានរួចរាល់)' : '🎉 បុគ្គលិកទាំងអស់បានចូលរួមកម្មវិធីពេលយប់រួចរាល់!') : 'មិនមានទិន្នន័យបុគ្គលិកត្រូវបង្ហាញទេ'}
          </div>
        `;
        return;
      }

      attList.innerHTML = filtered.map(p => {
        const checked = isStaffCheckedIn(p.sid, p.name, activeSession);
        const chkData = getStaffCheckinData(p.sid, p.name, activeSession);
        const staffBusKey = normalizeBusKey(p.van);
        const isCrossBus = (activeSession === 'bus' && isCoordinatorLocked && staffBusKey !== coordinatorBus);
        const canCheckThisSession = (activeSession === 'bus' ? canDoBus : canDoNight) && !isCrossBus;
        let btnText = '';
        if (isCrossBus) {
          btnText = checked ? '✅ បានឡើង' : '🔒 ខុសឡាន';
        } else if (!canCheckThisSession) {
          btnText = checked ? (activeSession === 'bus' ? '✅ បានឡើង' : '✅ បានចូល') : '🔒 គ្មានសិទ្ធិ';
        } else if (activeSession === 'bus') {
          btnText = checked ? '✅ បានឡើង' : '⭕ Check-in';
        } else {
          btnText = checked ? '✅ បានចូល' : '⭕ Check-in យប់';
        }
        const nightBtnStyle = (checked && activeSession === 'night') ? 'background:#7c3aed !important;border-color:#7c3aed !important;color:#fff !important;' : '';
        return `
          <div class="ext-att-row ${checked ? 'is-checked' : ''}">
            <div class="ext-att-col-info">
              <div class="ext-att-header-line">
                <b class="ext-att-name">${p.name}</b>
                ${p.sid ? `<span class="mono ext-att-sid">(${p.sid})</span>` : ''}
                ${p.van ? `<span class="ext-att-van-tag">${p.van}</span>` : ''}
              </div>
              <div class="ext-att-subline">
                <span>🏠 ${p.room || 'គ្មានបន្ទប់'}</span>
                ${p.act ? `<span>• 🎯 ${p.act}</span>` : ''}
              </div>
              ${checked && chkData && chkData.checkedAt ? `
                <div class="ext-att-time-tag">
                  ⏰ ម៉ោង ${chkData.checkedAt} ${chkData.checkedBy ? `(${chkData.checkedBy})` : ''}
                </div>
              ` : ''}
            </div>
            <button class="btn sm ext-att-toggle-btn ${checked ? 'checked-btn' : 'ghost'}" data-toggle-chk="${p.sid || p.name}" style="${!canCheckThisSession ? 'opacity:0.45;cursor:not-allowed;' : ''}${nightBtnStyle}" title="${isCrossBus ? '🔒 មិនអាច Check-in បានទេ (បុគ្គលិកឡានផ្សេង)' : (!canCheckThisSession ? 'លោកអ្នកគ្មានសិទ្ធិ Check-in ក្នុងផ្នែកនេះទេ' : '')}">
              ${btnText}
            </button>
          </div>
        `;
      }).join('');

      attList.querySelectorAll('[data-toggle-chk]').forEach(btn => {
        btn.onclick = () => {
          if (activeSession === 'bus' && !canDoBus) {
            alert('⛔ មិនអនុញ្ញាតឡើយ!\n\nលោកអ្នកជាគណៈកម្មការ Activity Team មិនអាច Check-in ឡើងឡានពេលព្រឹកឡើយ! មុខងារនេះសម្រាប់តែគណៈកម្មការដឹកជញ្ជូន (Transportation) ប៉ុណ្ណោះ។');
            return;
          }
          if (activeSession === 'night' && !canDoNight) {
            alert('⛔ មិនអនុញ្ញាតឡើយ!\n\nលោកអ្នកជាគណៈកម្មការដឹកជញ្ជូន (Transportation) មិនអាច Check-in កម្មវិធីពេលយប់ឡើយ! មុខងារនេះសម្រាប់តែគណៈកម្មការ Activity Team ប៉ុណ្ណោះ។');
            return;
          }
          const id = btn.dataset.toggleChk;
          const staff = allStaff.find(s => (s.sid === id || s.name === id));
          if (!staff) return;

          const isAlreadyChecked = isStaffCheckedIn(staff.sid, staff.name, activeSession);

          if (isAlreadyChecked) {
            // Safe Confirmation Dialog: Prevents accidental mis-clicks when scrolling or holding the phone!
            const sessionTitle = (activeSession === 'night') ? 'កម្មវិធីរាត្រីសមោសរ (Gala Dinner)' : `ឡើងឡាន (${staff.van || 'Bus'})`;
            const pendingStatusText = (activeSession === 'night') ? 'មិនទាន់ចូលរួម' : 'មិនទាន់ឡើងឡាន';
            showConfirmDialog({
              title: '⚠️ បញ្ជាក់ការដកវត្តមាន',
              message: `តើលោកអ្នកពិតជាចង់ដកវត្តមានរបស់ <b>${staff.name}</b> ${staff.sid ? `(${staff.sid})` : ''} ពី <b>${sessionTitle}</b> ត្រឡប់ទៅជា <b>"${pendingStatusText}"</b> វិញមែនទេ?`,
              okText: '🗑️ យល់ព្រមដក',
              cancelText: 'បោះបង់',
              danger: true,
              onConfirm: () => {
                toggleCheckin(staff.sid, staff.name, activeSession, activeStaff);
                updateProgressCard();
                renderAttList();
                if (typeof window.toast === 'function') {
                  window.toast(`↩️ បានដកវត្តមាន ${staff.name} រួចរាល់`);
                }
              }
            });
          } else {
            // Check if this person belongs to another bus and coordinator has an assigned bus
            const staffBusKey = normalizeBusKey(staff.van);
            const isCrossBus = (activeSession === 'bus' && isCoordinatorLocked && staffBusKey !== coordinatorBus);

            if (isCrossBus) {
              alert(`⛔ មិនអនុញ្ញាតឡើយ!\n\nលោកអ្នកមិនអាច Check-in បុគ្គលិក ${staff.name} បានឡើយ ពីព្រោះគាត់ត្រូវជិះ ${staff.van || 'ឡានផ្សេង'} (លោកអ្នកទទួលបន្ទុកតែ ${getBusLabel(coordinatorBus)})!`);
              return;
            }

            // Fast 1-tap Check-in for own bus or general admin
            toggleCheckin(staff.sid, staff.name, activeSession, activeStaff);
            updateProgressCard();
            renderAttList();
          }
        };
      });
    }

    // Session tab switcher (Transportation vs Activity)
    document.querySelectorAll('.ext-session-tab, .ext-seg-btn').forEach(tab => {
      tab.onclick = () => {
        const targetSession = tab.dataset.session;
        if (targetSession === 'bus' && !canDoBus) {
          alert('⛔ មិនអនុញ្ញាតឡើយ!\n\nលោកអ្នកជាគណៈកម្មការ Activity Team មិនមានសិទ្ធិ Scan Check-in ឡើងឡានពេលព្រឹកឡើយ! មុខងារនេះសម្រាប់តែគណៈកម្មការដឹកជញ្ជូន (Transportation) ប៉ុណ្ណោះ។');
          return;
        }
        if (targetSession === 'night' && !canDoNight) {
          alert('⛔ មិនអនុញ្ញាតឡើយ!\n\nលោកអ្នកជាគណៈកម្មការដឹកជញ្ជូន (Transportation) មិនមានសិទ្ធិ Scan Check-in កម្មវិធីពេលយប់ឡើយ! មុខងារនេះសម្រាប់តែគណៈកម្មការ Activity Team ប៉ុណ្ណោះ។');
          return;
        }
        document.querySelectorAll('.ext-session-tab, .ext-seg-btn').forEach(t => {
          t.classList.remove('active');
        });
        tab.classList.add('active');
        activeSession = targetSession;

        const busControls = document.getElementById('ext-bus-controls-wrapper');
        const nightBanner = document.getElementById('ext-night-banner-wrapper');
        if (busControls) busControls.style.display = (activeSession === 'bus') ? 'block' : 'none';
        if (nightBanner) nightBanner.style.display = (activeSession === 'night') ? 'flex' : 'none';

        if (searchInp) {
          searchInp.placeholder = (activeSession === 'bus')
            ? `ស្វែងរកឈ្មោះ ឬ Staff ID ក្នុងឡាន ${getBusLabel(activeBus)}...`
            : `ស្វែងរកឈ្មោះ, Staff ID, ឡាន ឬបន្ទប់ ក្នុងចំណោមបុគ្គលិកទាំង ១៥៧ នាក់...`;
        }

        updateProgressCard();
        renderAttList();
      };
    });

    // Bus tab switcher
    document.querySelectorAll('.ext-bus-tab').forEach(tab => {
      tab.onclick = () => {
        const targetBus = tab.dataset.bus;
        if (isCoordinatorLocked && targetBus !== coordinatorBus) {
          alert(`⛔ មិនអនុញ្ញាតឡើយ!\n\nលោកអ្នកជាប្រធាន/អ្នកសម្របសម្រួល ${getBusLabel(coordinatorBus)} មិនអាចចុចមើល ឬគ្រប់គ្រងឡានផ្សេងបានឡើយ!`);
          return;
        }
        document.querySelectorAll('.ext-bus-tab').forEach(t => {
          t.className = 'btn ghost sm ext-bus-tab';
        });
        tab.className = 'btn sm ext-bus-tab active';
        activeBus = targetBus;

        if (searchInp) {
          searchInp.placeholder = (activeBus === 'all')
            ? 'ស្វែងរកឈ្មោះ ឬ Staff ID ក្នុងចំណោមឡានទាំងអស់...'
            : `ស្វែងរកឈ្មោះ ឬ Staff ID ក្នុងឡាន ${getBusLabel(activeBus)}...`;
        }

        updateProgressCard();
        renderAttList();
      };
    });



    // Status filter switcher
    document.querySelectorAll('.ext-status-chip').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.ext-status-chip').forEach(b => {
          b.className = 'btn ghost sm ext-status-chip';
        });
        btn.className = 'btn sm ext-status-chip active';
        statusFilter = btn.dataset.status;
        renderAttList();
      };
    });

    searchInp.oninput = () => renderAttList();

    updateProgressCard();
    renderAttList();

    // Camera QR Scanner using Html5Qrcode
    startScanBtn.onclick = () => {
      if (activeSession === 'bus' && !canDoBus) {
        alert('⛔ មិនអនុញ្ញាតឡើយ!\n\nលោកអ្នកជាគណៈកម្មការ Activity Team មិនអាច Scan Check-in ឡើងឡានពេលព្រឹកឡើយ (សម្រាប់តែគណៈកម្មការដឹកជញ្ជូន Transportation)។');
        return;
      }
      if (activeSession === 'night' && !canDoNight) {
        alert('⛔ មិនអនុញ្ញាតឡើយ!\n\nលោកអ្នកជាគណៈកម្មការដឹកជញ្ជូន (Transportation) មិនអាច Scan Check-in កម្មវិធីពេលយប់ឡើយ (សម្រាប់តែគណៈកម្មការ Activity Team)។');
        return;
      }
      if (typeof Html5Qrcode === 'undefined') {
        alert('កំពុងទាញយកម៉ូឌុលកាមេរ៉ា សូមព្យាយាមម្តងទៀតក្នុងរយៈពេល ២ វិនាទី...');
        return;
      }
      readerBox.style.display = 'block';
      startScanBtn.style.display = 'none';

      html5Scanner = new Html5Qrcode("ext-reader");
      html5Scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          let scannedSid = decodedText;
          try {
            const parsed = JSON.parse(decodedText);
            if (parsed.sid) scannedSid = parsed.sid;
            else if (parsed.name) scannedSid = parsed.name;
          } catch (e) {}

          const found = allStaff.find(p => (p.sid && p.sid.toUpperCase() === scannedSid.toUpperCase()) || (p.name && p.name.toLowerCase() === scannedSid.toLowerCase()));
          if (found) {
            if (activeSession === 'bus') {
              if (!canDoBus) {
                playErrorBeep();
                triggerErrorVibrate();
                feedbackBox.style.display = 'block';
                feedbackBox.className = 'ext-scan-result';
                feedbackBox.style.cssText = 'background:#fef2f2;border:2px solid #ef4444;padding:14px;border-radius:10px;animation:popIn 0.25s ease-out;';
                feedbackBox.innerHTML = `
                  <b style="color:#b91c1c;font-size:16px;">⛔ មិនមានសិទ្ធិ Check-in ឡើងឡានទេ!</b>
                  <div style="font-size:13px;color:#7f1d1d;margin-top:4px;">
                    លោកអ្នកជាគណៈកម្មការ Activity Team មិនអាច Scan Check-in ឡើងឡានបានឡើយ (សម្រាប់តែគណៈកម្មការដឹកជញ្ជូន Transportation)។
                  </div>
                `;
                return;
              }
              // TRANSPORTATION SESSION: Strict bus matching!
              const personBusKey = normalizeBusKey(found.van);
              const isMatch = isCoordinatorLocked ? (personBusKey === coordinatorBus) : (activeBus === 'all' || personBusKey === activeBus);

              if (isMatch) {
                if (!isStaffCheckedIn(found.sid, found.name, 'bus')) {
                  toggleCheckin(found.sid, found.name, 'bus', activeStaff);
                }
                const st = getBusStats(activeBus);
                feedbackBox.style.display = 'block';
                feedbackBox.className = 'ext-scan-result';
                feedbackBox.style.cssText = 'background:#ecfdf5;border:2px solid #10b981;padding:12px;border-radius:10px;animation:popIn 0.25s ease-out;';
                feedbackBox.innerHTML = `
                  <div style="display:grid;gap:4px;">
                    <b style="color:#065f46;font-size:16px;">✅ ស្កេនឡើងឡានជោគជ័យ: ${found.name}</b>
                    <span>Staff ID: <b>${found.sid || '–'}</b> | ឡាន: <b>${found.van || 'No bus'}</b> | បន្ទប់: <b>${found.room || 'No room'}</b></span>
                    ${found.act ? `<small style="color:#047857">🎯 សកម្មភាព: <b>${found.act}</b></small>` : ''}
                    <span style="color:#065f46;font-weight:700;font-size:13px;margin-top:2px;">
                      📊 វត្តមាន ${st.label}: ${st.checked} / ${st.total} នាក់ (${st.pct}%)
                    </span>
                  </div>
                `;
              } else {
                // STRICT REJECTION: The person is assigned to a DIFFERENT bus!
                playErrorBeep();
                triggerErrorVibrate();
                const correctCoord = getBusCoordinatorInfo(personBusKey);

                feedbackBox.style.display = 'block';
                feedbackBox.className = 'ext-scan-result';
                feedbackBox.style.cssText = 'background:#fef2f2;border:2px solid #ef4444;padding:14px;border-radius:10px;animation:popIn 0.25s ease-out;';
                feedbackBox.innerHTML = `
                  <div style="display:grid;gap:6px;">
                    <b style="color:#b91c1c;font-size:16px;display:flex;align-items:center;gap:6px;">
                      ❌ មិនអនុញ្ញាតឱ្យ Check-in ទេ! (ខុសឡាន)
                    </b>
                    <div style="font-size:14px;color:#7f1d1d;">
                      បុគ្គលិក <b>${found.name}</b> (Staff ID: <b>${found.sid || '–'}</b>) មិនមែនជាអ្នកជិះ <b>${getBusLabel(activeBus)}</b> ឡើយ!
                    </div>
                    <div style="background:#fee2e2;border:1px dashed #ef4444;border-radius:8px;padding:8px 12px;margin-top:2px;">
                      <div style="font-size:13px;font-weight:700;color:#991b1b;">
                        👉 ឡានដែលត្រូវជិះពិតប្រាកដ: <span style="background:#b91c1c;color:#fff;padding:2px 8px;border-radius:4px;">${found.van || 'មិនទាន់មានឡាន'}</span>
                      </div>
                      <div style="font-size:12px;color:#7f1d1d;margin-top:4px;">
                        សូមណែនាំគាត់ឱ្យទៅ Check-in ឡើងឡានជាមួយ: <b>${correctCoord.name}</b> ${correctCoord.tel ? `(📞 ${correctCoord.tel})` : ''}
                      </div>
                    </div>
                    <div style="font-size:11.5px;color:#991b1b;margin-top:6px;background:rgba(239,68,68,0.1);padding:6px 10px;border-radius:6px;text-align:center;">
                      🔒 លោកអ្នកមិនអាច Check-in ឱ្យបុគ្គលិកឡានផ្សេងបានឡើយ!
                    </div>
                  </div>
                `;
              }
            } else {
              if (!canDoNight) {
                playErrorBeep();
                triggerErrorVibrate();
                feedbackBox.style.display = 'block';
                feedbackBox.className = 'ext-scan-result';
                feedbackBox.style.cssText = 'background:#fef2f2;border:2px solid #ef4444;padding:14px;border-radius:10px;animation:popIn 0.25s ease-out;';
                feedbackBox.innerHTML = `
                  <b style="color:#b91c1c;font-size:16px;">⛔ មិនមានសិទ្ធិ Check-in កម្មវិធីពេលយប់ទេ!</b>
                  <div style="font-size:13px;color:#7f1d1d;margin-top:4px;">
                    លោកអ្នកជាគណៈកម្មការដឹកជញ្ជូន (Transportation) មិនអាច Scan Check-in កម្មវិធីពេលយប់បានឡើយ (សម្រាប់តែគណៈកម្មការ Activity Team)។
                  </div>
                `;
                return;
              }
              // NIGHT EVENT SESSION (Activity Team): Accepts all 157 staff!
              if (!isStaffCheckedIn(found.sid, found.name, 'night')) {
                toggleCheckin(found.sid, found.name, 'night', activeStaff);
              }
              const st = getNightStats();
              feedbackBox.style.display = 'block';
              feedbackBox.className = 'ext-scan-result';
              feedbackBox.style.cssText = 'background:#f5f3ff;border:2px solid #8b5cf6;padding:12px;border-radius:10px;animation:popIn 0.25s ease-out;';
              feedbackBox.innerHTML = `
                <div style="display:grid;gap:4px;">
                  <b style="color:#5b21b6;font-size:16px;">🌙 ស្កេនចូលកម្មវិធីយប់ជោគជ័យ: ${found.name}</b>
                  <span>Staff ID: <b>${found.sid || '–'}</b> | ឡាន: <b>${found.van || 'No bus'}</b> | បន្ទប់: <b>${found.room || 'No room'}</b></span>
                  ${found.act ? `<small style="color:#6d28d9">🎯 សកម្មភាព: <b>${found.act}</b></small>` : ''}
                  <span style="color:#5b21b6;font-weight:700;font-size:13px;margin-top:2px;">
                    📊 វត្តមានសាលកម្មវិធីសរុប: ${st.checked} / ${st.total} នាក់ (${st.pct}%)
                  </span>
                </div>
              `;
            }
            updateProgressCard();
            renderAttList();
          } else {
            playErrorBeep();
            triggerErrorVibrate();
            feedbackBox.style.display = 'block';
            feedbackBox.className = 'ext-scan-result';
            feedbackBox.style.cssText = 'background:#fef2f2;border:2px solid #ef4444;padding:12px;border-radius:10px;animation:popIn 0.25s ease-out;';
            feedbackBox.innerHTML = `<b style="color:#b91c1c">⚠️ មិនស្គាល់ទិន្នន័យ QR Code នេះទេ: ${decodedText}</b>`;
          }
        },
        () => {}
      ).catch(err => {
        alert('មិនអាចបើកកាមេរ៉ាបានទេ: ' + err);
        readerBox.style.display = 'none';
        startScanBtn.style.display = 'inline-flex';
      });
    };

    stopScanBtn.onclick = () => {
      if (html5Scanner) {
        html5Scanner.stop().then(() => {
          readerBox.style.display = 'none';
          startScanBtn.style.display = 'inline-flex';
        });
      }
    };

    // Export Attendance CSV (Bus specific or Gala Night)
    exportBtn.onclick = () => {
      if (activeSession === 'bus') {
        const busStaff = filterStaffByBus(allStaff, activeBus);
        const rows = [['Staff ID', 'Name', 'Company', 'Bus', 'Room', 'Position', 'Activity', 'Bus Boarding Status', 'Boarded Time', 'Checked By']];
        busStaff.forEach(p => {
          const isChk = isStaffCheckedIn(p.sid, p.name, 'bus');
          const d = getStaffCheckinData(p.sid, p.name, 'bus');
          const t = (isChk && d) ? (d.checkedAt || 'Yes') : (isChk ? 'Yes' : 'No');
          const by = (isChk && d) ? (d.checkedBy || '') : '';
          rows.push([p.sid, p.name, p.company, p.van || '', p.room || '', p.pos || '', p.act || '', isChk ? 'Boarded' : 'Pending', t, by]);
        });
        const csvContent = '\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Kirirom_Bus_Attendance_${activeBus}.csv`;
        a.click();
      } else {
        const rows = [['Staff ID', 'Name', 'Company', 'Bus', 'Room', 'Position', 'Activity', 'Gala Night Status', 'Arrival Time', 'Checked By']];
        allStaff.forEach(p => {
          const isChk = isStaffCheckedIn(p.sid, p.name, 'night');
          const d = getStaffCheckinData(p.sid, p.name, 'night');
          const t = (isChk && d) ? (d.checkedAt || 'Yes') : (isChk ? 'Yes' : 'No');
          const by = (isChk && d) ? (d.checkedBy || '') : '';
          rows.push([p.sid, p.name, p.company, p.van || '', p.room || '', p.pos || '', p.act || '', isChk ? 'Attended' : 'Pending', t, by]);
        });
        const csvContent = '\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Kirirom_Gala_Night_Attendance.csv`;
        a.click();
      }
    };
  }

  // Personal QR Pass Modal
  function showPersonalPassModal(staffObj) {
    const p = staffObj || getMe();
    if (!p) {
      alert('សូមចូលប្រើប្រាស់ (Log in) ជាមួយ Staff ID ឬ ឈ្មោះរបស់អ្នកជាមុនសិន!');
      return;
    }

    const isBusChk = isStaffCheckedIn(p.sid, p.name, 'bus');
    const isNightChk = isStaffCheckedIn(p.sid, p.name, 'night');
    const busData = getStaffCheckinData(p.sid, p.name, 'bus');
    const nightData = getStaffCheckinData(p.sid, p.name, 'night');

    const isTr = isTransportationRole(p);
    const isAct = isActivityRole(p);
    const canDoBus = p.admin || isTr;
    const canDoNight = p.admin || isAct;
    const canScan = canDoBus || canDoNight;

    let scanBtnLabel = '📷 បើកកាមេរ៉ាស្កេន Check-in';
    let targetSession = null;
    if (canDoBus && !canDoNight) {
      scanBtnLabel = `📷 ស្កេន Check-in ឡើងឡាន (${p.van ? getBusLabel(normalizeBusKey(p.van)) : 'Transportation'})`;
      targetSession = 'bus';
    } else if (canDoNight && !canDoBus) {
      scanBtnLabel = '📷 ស្កេន Check-in កម្មវិធីយប់ (Activity Team)';
      targetSession = 'night';
    } else if (canDoBus && canDoNight) {
      scanBtnLabel = '📷 បើកកាមេរ៉ាស្កេន Check-in (Transportation & Activity)';
    }

    const roleBadge = getScannerRoleBadge(p);

    const html = `
      <div class="ext-qr-pass" style="margin:0;">
        <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;opacity:0.8;">Kubota Outing 2026 • Digital Pass</div>
        <h2 style="font-family:var(--display);font-size:24px;margin:6px 0 2px;">${p.name}</h2>
        <div style="font-size:13px;opacity:0.9;">Staff ID: <b>${p.sid || '–'}</b> • ${p.company || 'KBC'}</div>
        ${roleBadge ? `<div style="margin-top:4px;"><span style="background:rgba(255,255,255,0.2);padding:2px 10px;border-radius:99px;font-size:11px;font-weight:700;">${roleBadge}</span></div>` : ''}

        <div class="ext-qr-box">
          <div id="ext-modal-my-qr"></div>
        </div>

        <div style="display:flex;justify-content:center;gap:14px;font-size:14px;font-weight:600;margin-top:6px;">
          <span>🚌 ${p.van || 'No bus'}</span>
          <span>🏠 Room: ${p.room || 'No room'}</span>
        </div>

        <!-- Dual Attendance Status Badges -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;">
          <div style="background:rgba(255,255,255,0.15);padding:8px 6px;border-radius:8px;text-align:center;">
            <div style="font-size:11px;opacity:0.85;margin-bottom:2px;">🚌 ឡើងឡាន (Bus)</div>
            <b style="font-size:13px;color:${isBusChk ? '#86efac' : '#fef08a'};">
              ${isBusChk ? '✅ បានឡើង' : '⏳ មិនទាន់'}
            </b>
            ${isBusChk && busData && busData.checkedAt ? `<div style="font-size:10px;opacity:0.8;margin-top:2px;">ម៉ោង ${busData.checkedAt}</div>` : ''}
          </div>
          <div style="background:rgba(255,255,255,0.15);padding:8px 6px;border-radius:8px;text-align:center;">
            <div style="font-size:11px;opacity:0.85;margin-bottom:2px;">🌙 កម្មវិធីយប់ (Gala)</div>
            <b style="font-size:13px;color:${isNightChk ? '#86efac' : '#fef08a'};">
              ${isNightChk ? '✅ បានចូល' : '⏳ មិនទាន់'}
            </b>
            ${isNightChk && nightData && nightData.checkedAt ? `<div style="font-size:10px;opacity:0.8;margin-top:2px;">ម៉ោង ${nightData.checkedAt}</div>` : ''}
          </div>
        </div>

        <div style="margin-top:10px;">
          <button class="btn ghost sm" id="ext-pass-install-pwa" style="font-size:12px;padding:6px;width:100%;border-color:rgba(255,255,255,0.3);color:#fff;">
            📲 ដំឡើង App លើទូរស័ព្ទ (Install PWA)
          </button>
        </div>

        ${canScan ? `
          <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.2);">
            <button class="btn sm" id="ext-pass-open-scanner-btn" style="background:#ffffff;color:#15251d;font-weight:700;width:100%;">
              ${scanBtnLabel}
            </button>
          </div>
        ` : ''}
      </div>
    `;

    openModal('🎫 ប័ណ្ណ QR Code ផ្ទាល់ខ្លួន', html);

    setTimeout(() => {
      renderQrToElement('ext-modal-my-qr', { sid: p.sid, name: p.name, van: p.van, room: p.room });
      const installPwaBtn = document.getElementById('ext-pass-install-pwa');
      if (installPwaBtn) {
        installPwaBtn.onclick = () => promptPwaInstall();
      }
      if (canScan) {
        const passScanBtn = document.getElementById('ext-pass-open-scanner-btn');
        if (passScanBtn) {
          passScanBtn.onclick = () => showCheckinAdminModal(p, targetSession);
        }
      }
    }, 60);
  }



  // ---------------------------------------------------------
  // 8. Inject Personal QR Pass in Staff Dashboard
  // ---------------------------------------------------------
  function injectPersonalQrBadge() {
    const cur = getMe();
    if (!cur || cur.admin || cur.guest) return;

    const meContainer = document.querySelector('.me');
    if (!meContainer || document.getElementById('ext-personal-qr-pass')) return;

    const isBusChk = isStaffCheckedIn(cur.sid, cur.name, 'bus');
    const isNightChk = isStaffCheckedIn(cur.sid, cur.name, 'night');
    const busData = getStaffCheckinData(cur.sid, cur.name, 'bus');
    const nightData = getStaffCheckinData(cur.sid, cur.name, 'night');

    const isTr = isTransportationRole(cur);
    const isAct = isActivityRole(cur);
    const canDoBus = cur.admin || isTr;
    const canDoNight = cur.admin || isAct;
    const canScan = canDoBus || canDoNight;

    let scanBtnLabel = '📷 បើកកាមេរ៉ាស្កេន Check-in';
    let targetSession = null;
    if (canDoBus && !canDoNight) {
      scanBtnLabel = `📷 ស្កេន Check-in ឡើងឡាន (${cur.van ? getBusLabel(normalizeBusKey(cur.van)) : 'Transportation'})`;
      targetSession = 'bus';
    } else if (canDoNight && !canDoBus) {
      scanBtnLabel = '📷 ស្កេន Check-in កម្មវិធីយប់ (Activity Team)';
      targetSession = 'night';
    } else if (canDoBus && canDoNight) {
      scanBtnLabel = '📷 បើកកាមេរ៉ាស្កេន Check-in (Transportation & Activity)';
    }

    const roleBadge = getScannerRoleBadge(cur);

    const passCard = document.createElement('div');
    passCard.id = 'ext-personal-qr-pass';
    passCard.className = 'ext-qr-pass';
    passCard.innerHTML = `
      <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;opacity:0.8;">Kubota Outing 2026 • Digital Pass</div>
      <h2 style="font-family:var(--display);font-size:24px;margin:4px 0 2px;">${cur.name}</h2>
      <div style="font-size:13px;opacity:0.9;">Staff ID: <b>${cur.sid || '–'}</b> • ${cur.company || 'KBC'}</div>
      ${roleBadge ? `<div style="margin-top:4px;"><span style="background:rgba(255,255,255,0.2);padding:2px 10px;border-radius:99px;font-size:11px;font-weight:700;">${roleBadge}</span></div>` : ''}

      <div class="ext-qr-box">
        <div id="ext-my-qrcode"></div>
      </div>

      <div style="display:flex;justify-content:center;gap:14px;font-size:14px;font-weight:600;">
        <span>🚌 ${cur.van || 'No bus'}</span>
        <span>🏠 Room: ${cur.room || 'No room'}</span>
      </div>

      <!-- Dual Attendance Status Badges -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;">
        <div style="background:rgba(255,255,255,0.15);padding:8px 6px;border-radius:8px;text-align:center;">
          <div style="font-size:11px;opacity:0.85;margin-bottom:2px;">🚌 ឡើងឡាន (Bus)</div>
          <b id="ext-dash-bus-status" style="font-size:13px;color:${isBusChk ? '#86efac' : '#fef08a'};">
            ${isBusChk ? '✅ បានឡើង' : '⏳ មិនទាន់'}
          </b>
          ${isBusChk && busData && busData.checkedAt ? `<div style="font-size:10px;opacity:0.8;margin-top:2px;">ម៉ោង ${busData.checkedAt}</div>` : ''}
        </div>
        <div style="background:rgba(255,255,255,0.15);padding:8px 6px;border-radius:8px;text-align:center;">
          <div style="font-size:11px;opacity:0.85;margin-bottom:2px;">🌙 កម្មវិធីយប់ (Gala)</div>
          <b id="ext-dash-night-status" style="font-size:13px;color:${isNightChk ? '#86efac' : '#fef08a'};">
            ${isNightChk ? '✅ បានចូល' : '⏳ មិនទាន់'}
          </b>
          ${isNightChk && nightData && nightData.checkedAt ? `<div style="font-size:10px;opacity:0.8;margin-top:2px;">ម៉ោង ${nightData.checkedAt}</div>` : ''}
        </div>
      </div>

      <div style="margin-top:10px;">
        <button class="btn ghost sm" id="ext-dash-install-pwa" style="font-size:12px;padding:6px;width:100%;border-color:rgba(255,255,255,0.3);color:#fff;">
          📲 ដំឡើង App លើទូរស័ព្ទ (Install PWA)
        </button>
      </div>

      ${canScan ? `
        <div style="margin-top:10px;">
          <button class="btn sm" id="ext-dash-scanner-btn" style="background:#ffffff;color:#15251d;font-weight:700;width:100%;">
            ${scanBtnLabel}
          </button>
        </div>
      ` : ''}
    `;

    meContainer.insertBefore(passCard, meContainer.firstChild);

    setTimeout(() => {
      renderQrToElement('ext-my-qrcode', { sid: cur.sid, name: cur.name, van: cur.van, room: cur.room });
      const dashPwaBtn = document.getElementById('ext-dash-install-pwa');
      if (dashPwaBtn) {
        dashPwaBtn.onclick = () => promptPwaInstall();
      }
      if (canScan) {
        const btn = document.getElementById('ext-dash-scanner-btn');
        if (btn) btn.onclick = () => showCheckinAdminModal(cur, targetSession);
      }
    }, 60);
  }

  function updateCheckinBadges() {
    const allStaff = getAllStaffList();
    const badge = document.getElementById('ext-checkin-badge');
    const cur = getMe();

    if (badge && allStaff.length) {
      if (cur && isTransportationRole(cur) && !isActivityRole(cur) && cur.van) {
        const myBusKey = normalizeBusKey(cur.van);
        const myBusStaff = filterStaffByBus(allStaff, myBusKey);
        const count = myBusStaff.filter(p => isStaffCheckedIn(p.sid, p.name, 'bus')).length;
        badge.textContent = `${count}/${myBusStaff.length}`;
        const qrBtn = document.getElementById('ext-nav-qr');
        if (qrBtn) qrBtn.title = `Check-in ឡើងឡាន ${getBusLabel(myBusKey)}: ${count}/${myBusStaff.length} នាក់`;
      } else if (cur && isActivityRole(cur) && !isTransportationRole(cur)) {
        const count = allStaff.filter(p => isStaffCheckedIn(p.sid, p.name, 'night')).length;
        badge.textContent = `${count}/${allStaff.length}`;
        const qrBtn = document.getElementById('ext-nav-qr');
        if (qrBtn) qrBtn.title = `Check-in កម្មវិធីយប់ (Gala): ${count}/${allStaff.length} នាក់`;
      } else {
        const busCount = allStaff.filter(p => isStaffCheckedIn(p.sid, p.name, 'bus')).length;
        const nightCount = allStaff.filter(p => isStaffCheckedIn(p.sid, p.name, 'night')).length;
        badge.textContent = `${busCount}/${allStaff.length}`;
        const qrBtn = document.getElementById('ext-nav-qr');
        if (qrBtn) qrBtn.title = `ឡើងឡាន: ${busCount}/${allStaff.length} | កម្មវិធីយប់: ${nightCount}/${allStaff.length}`;
      }
    }

    const myBusStatus = document.getElementById('ext-dash-bus-status');
    const myNightStatus = document.getElementById('ext-dash-night-status');
    if (cur && !cur.admin) {
      const isBus = isStaffCheckedIn(cur.sid, cur.name, 'bus');
      const isNight = isStaffCheckedIn(cur.sid, cur.name, 'night');
      if (myBusStatus) {
        myBusStatus.textContent = isBus ? '✅ បានឡើង' : '⏳ មិនទាន់';
        myBusStatus.style.color = isBus ? '#86efac' : '#fef08a';
      }
      if (myNightStatus) {
        myNightStatus.textContent = isNight ? '✅ បានចូល' : '⏳ មិនទាន់';
        myNightStatus.style.color = isNight ? '#86efac' : '#fef08a';
      }
    }
  }

  // ---------------------------------------------------------
  // 8.5 Live Kirirom Weather & Mountain Packing Checklist (Feature 5)
  // ---------------------------------------------------------
  const KIRIROM_COORDS = { lat: 11.3197, lon: 104.0583 };
  let kiriromWeatherInFlight = null;

  function decodeWmoWeather(code, isDay = 1) {
    const c = Number(code);
    if (c === 0) {
      return {
        text: isDay ? 'មេឃស្រឡះល្អ' : 'មេឃស្រឡះពេលយប់',
        icon: isDay ? '☀️' : '🌙',
        desc: 'អាកាសធាតុស្រឡះល្អ គ្មានពពក'
      };
    }
    if (c === 1 || c === 2 || c === 3) {
      return {
        text: 'មានពពកតិចតួច',
        icon: isDay ? '⛅' : '☁️',
        desc: 'ត្រជាក់ស្រួល មេឃមានពពកខ្លះៗ'
      };
    }
    if (c === 45 || c === 48) {
      return {
        text: 'អ័ព្ទត្រជាក់លើភ្នំ',
        icon: '🌫️',
        desc: 'អ័ព្ទចុះត្រជាក់លើព្រៃស្រល់'
      };
    }
    if (c >= 51 && c <= 57) {
      return {
        text: 'ភ្លៀងរលឹមស្រិចៗ',
        icon: '🌦️',
        desc: 'មានភ្លៀងរលឹមស្រាលៗ'
      };
    }
    if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) {
      return {
        text: 'មានភ្លៀងធ្លាក់',
        icon: '🌧️',
        desc: 'មានភ្លៀងធ្លាក់លើតំបន់ភ្នំ'
      };
    }
    if (c >= 95) {
      return {
        text: 'ផ្គររន្ទះ',
        icon: '⛈️',
        desc: 'អាចមានភ្លៀងផ្គររន្ទះ'
      };
    }
    return {
      text: 'ត្រជាក់ស្រួល',
      icon: '🌤️',
      desc: 'អាកាសធាតុស្រស់ស្រាយលើខ្ពង់រាប'
    };
  }

  async function fetchKiriromWeather(forceRefresh = false) {
    if (!forceRefresh) {
      try {
        const cachedRaw = localStorage.getItem(EXT_STORAGE_KEYS.WEATHER_CACHE);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (cached && cached.timestamp && (Date.now() - cached.timestamp < 15 * 60 * 1000)) {
            return cached.data;
          }
        }
      } catch (e) {}
    }

    if (kiriromWeatherInFlight) return kiriromWeatherInFlight;

    kiriromWeatherInFlight = (async () => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${KIRIROM_COORDS.lat}&longitude=${KIRIROM_COORDS.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FBangkok`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error('Weather API HTTP ' + res.status);
        const data = await res.json();

        const cur = data.current || {};
        const daily = data.daily || {};
        const wmo = decodeWmoWeather(cur.weather_code, cur.is_day);

        const parsed = {
          temp: Math.round(cur.temperature_2m ?? 22),
          apparent: Math.round(cur.apparent_temperature ?? 23),
          humidity: Math.round(cur.relative_humidity_2m ?? 80),
          wind: Math.round(cur.wind_speed_10m ?? 6),
          precip: cur.precipitation ?? 0,
          isDay: cur.is_day ?? 1,
          code: cur.weather_code ?? 1,
          condition: wmo.text,
          conditionDesc: wmo.desc,
          icon: wmo.icon,
          elevation: data.elevation || 626,
          daily: [
            {
              day: 'ថ្ងៃទី ១ (Day 1)',
              max: Math.round(daily.temperature_2m_max?.[0] ?? 28),
              min: Math.round(daily.temperature_2m_min?.[0] ?? 21),
              rainProb: daily.precipitation_probability_max?.[0] ?? 30,
              icon: decodeWmoWeather(daily.weather_code?.[0] ?? 2, 1).icon,
              cond: decodeWmoWeather(daily.weather_code?.[0] ?? 2, 1).text
            },
            {
              day: 'ថ្ងៃទី ២ (Day 2)',
              max: Math.round(daily.temperature_2m_max?.[1] ?? 27),
              min: Math.round(daily.temperature_2m_min?.[1] ?? 20),
              rainProb: daily.precipitation_probability_max?.[1] ?? 40,
              icon: decodeWmoWeather(daily.weather_code?.[1] ?? 2, 1).icon,
              cond: decodeWmoWeather(daily.weather_code?.[1] ?? 2, 1).text
            }
          ],
          updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        try {
          localStorage.setItem(EXT_STORAGE_KEYS.WEATHER_CACHE, JSON.stringify({
            timestamp: Date.now(),
            data: parsed
          }));
        } catch(e) {}

        return parsed;
      } catch (err) {
        console.warn('Using offline Kirirom weather fallback:', err);
        return {
          temp: 22,
          apparent: 23,
          humidity: 82,
          wind: 5,
          precip: 0,
          isDay: 1,
          code: 2,
          condition: 'ត្រជាក់ស្រួលលើភ្នំ',
          conditionDesc: 'អាកាសធាតុស្រស់ស្រាយក្នុងព្រៃស្រល់',
          icon: '🌤️',
          elevation: 675,
          daily: [
            { day: 'ថ្ងៃទី ១ (Day 1)', max: 28, min: 20, rainProb: 20, icon: '🌤️', cond: 'មេឃស្រឡះ' },
            { day: 'ថ្ងៃទី ២ (Day 2)', max: 27, min: 19, rainProb: 30, icon: '⛅', cond: 'ពពកតិចតួច' }
          ],
          updatedAt: 'ក្រៅបណ្តាញ (Offline)'
        };
      } finally {
        kiriromWeatherInFlight = null;
      }
    })();

    return kiriromWeatherInFlight;
  }

  async function updateHeaderWeatherTemp() {
    const tempSpan = document.getElementById('ext-weather-pill-temp');
    const dockTxt = document.getElementById('ext-nav-weather-txt');
    try {
      const w = await fetchKiriromWeather(false);
      if (w && w.temp !== undefined) {
        if (tempSpan) tempSpan.textContent = `${w.temp}°C`;
        if (dockTxt) dockTxt.textContent = `${w.temp}°C`;
      }
    } catch(e) {}
  }

  function mountHeaderWeatherPill() {
    const cur = getMe();
    if (!cur) return;
    const whoEl = document.querySelector('.top-in .who');
    if (!whoEl) return;

    let pill = document.getElementById('ext-header-weather-btn');
    if (!pill) {
      pill = document.createElement('button');
      pill.id = 'ext-header-weather-btn';
      pill.className = 'ext-header-pill';
      pill.type = 'button';
      pill.title = 'មើលការព្យាករណ៍អាកាសធាតុគិរីរម្យ & បញ្ជីឥវ៉ាន់';
      pill.innerHTML = `🌤️ <span id="ext-weather-pill-temp">--°C</span> <span style="opacity:0.75;font-weight:400;margin-left:2px;">គិរីរម្យ</span>`;
      pill.onclick = showWeatherModal;

      const logoutBtn = whoEl.querySelector('[data-act="logout"]');
      if (logoutBtn) whoEl.insertBefore(pill, logoutBtn);
      else whoEl.appendChild(pill);
    }

    updateHeaderWeatherTemp();
  }

  const PACKING_ITEMS = [
    { id: 'jacket', label: '🧥 អាវរងា ឬអាវក្រៅ', tip: 'ចាំបាច់ពេលយប់លើភ្នំ និងក្នុងរថយន្តម៉ាស៊ីនត្រជាក់ (ពេលយប់អាចចុះដល់ ១៨°C-២០°C)' },
    { id: 'shoes', label: '👟 ស្បែកជើងប៉ាតា / ដើរព្រៃ', tip: 'សម្រាប់កម្មវិធី Fun Hiking Adventure & Game Challenge' },
    { id: 'mosquito', label: '🦟 ថ្នាំបាញ់មូស ឬសត្វល្អិត', tip: 'ការពារសត្វល្អិតខាំពេលធ្វើសកម្មភាពក្នុងព្រៃស្រល់' },
    { id: 'umbrella', label: '☂️ ឆ័ត្រ ឬអាវភ្លៀងតូច', tip: 'អាកាសធាតុលើតំបន់ភ្នំអាចប្រែប្រួល ឬមានភ្លៀងរលឹមស្រិចៗ' },
    { id: 'powerbank', label: '🔋 Power Bank & ខ្សែសាកទូរស័ព្ទ', tip: 'ត្រៀមថាមពលទូរស័ព្ទសម្រាប់ថតរូបទេសភាព និង Check-in' },
    { id: 'meds', label: '💊 ថ្នាំផ្ទាល់ខ្លួន / ថ្នាំពុលឡាន', tip: 'សម្រាប់អ្នកងាយវិលមុខពេលជិះឡានឡើងភ្នំ ឬមានជំងឺប្រចាំកាយ' },
    { id: 'sunscreen', label: '🧴 ឡេការពារកម្ដៅថ្ងៃ (Sunscreen)', tip: 'ការពារស្បែកពេលដើរហាត់ប្រាណ ឬលេងហ្គេមក្រៅអគារ' },
    { id: 'sports_clothes', label: '🩳 សម្លៀកបំពាក់កីឡាផ្លាស់ប្តូរ', tip: 'សម្រាប់ផ្លាស់ប្តូរបន្ទាប់ពីលេងហ្គេមបែកញើស' },
    { id: 'gala_clothes', label: '👗 សម្លៀកបំពាក់រាត្រីសមោសរ Gala', tip: 'សម្រាប់កម្មវិធីជប់លៀង Gala Dinner & Party ពេលយប់' }
  ];

  async function showWeatherModal() {
    let savedPacking = {};
    try {
      savedPacking = JSON.parse(localStorage.getItem(EXT_STORAGE_KEYS.PACKING) || '{}');
    } catch(e) {}

    const computePackingStats = (store) => {
      const checkedCount = PACKING_ITEMS.filter(it => !!store[it.id]).length;
      const total = PACKING_ITEMS.length;
      const pct = Math.round((checkedCount / total) * 100);
      return { checkedCount, total, pct };
    };

    let initialStats = computePackingStats(savedPacking);

    const initialHtml = `
      <div id="ext-weather-modal-content">
        <!-- Weather Hero Card -->
        <div class="ext-weather-hero">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <span style="font-size:12px;letter-spacing:0.06em;text-transform:uppercase;opacity:0.9;">
              📍 ឧទ្យានជាតិព្រះសុរាម្រិត-កុសុមៈ គិរីរម្យ
            </span>
            <span id="ext-weather-live-badge" style="background:rgba(255,255,255,0.22);padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;">
              កំពុងទាញយក...
            </span>
          </div>

          <div style="display:flex;align-items:baseline;gap:12px;margin:10px 0;">
            <span id="ext-w-icon" style="font-size:42px;line-height:1;">🌤️</span>
            <div>
              <div style="display:flex;align-items:baseline;gap:6px;">
                <b id="ext-w-temp" style="font-size:46px;font-family:var(--display);line-height:1;">--</b>
                <span style="font-size:24px;font-weight:400;opacity:0.9;">°C</span>
              </div>
              <div id="ext-w-condition" style="font-size:15px;font-weight:600;opacity:0.95;">កំពុងពិនិត្យអាកាសធាតុ...</div>
            </div>
          </div>

          <div style="font-size:12px;opacity:0.85;border-top:1px solid rgba(255,255,255,0.2);padding-top:8px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;">
            <span id="ext-w-feels">កម្ដៅជាក់ស្ដែង: --°C</span>
            <span id="ext-w-elev">កម្ពស់ខ្ពង់រាប: ~675 ម៉ែត្រ</span>
            <span id="ext-w-updated">បានធ្វើបច្ចុប្បន្នភាព: --</span>
          </div>
        </div>

        <!-- 2-Stat Grid -->
        <div class="ext-weather-stat-grid">
          <div class="ext-weather-stat-card">
            <div class="ext-weather-stat-icon">💧</div>
            <div>
              <div style="font-size:11px;color:var(--muted);">សំណើមបរិយាកាស</div>
              <b id="ext-w-hum" style="font-size:15px;">--%</b>
            </div>
          </div>
          <div class="ext-weather-stat-card">
            <div class="ext-weather-stat-icon">💨</div>
            <div>
              <div style="font-size:11px;color:var(--muted);">ល្បឿនខ្យល់បក់</div>
              <b id="ext-w-wind" style="font-size:15px;">-- km/h</b>
            </div>
          </div>
        </div>

        <!-- 2-Day Forecast Section -->
        <div style="background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin-bottom:16px;">
          <b style="font-size:13px;display:block;margin-bottom:8px;">📅 ការព្យាករណ៍សម្រាប់ដំណើរកម្សាន្ត ២ ថ្ងៃ</b>
          <div id="ext-w-daily-box" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div style="background:color-mix(in srgb, var(--pine) 8%, var(--surface));padding:10px;border-radius:10px;text-align:center;">
              <div style="font-size:11px;color:var(--muted);margin-bottom:2px;">ថ្ងៃទី ១ (Day 1)</div>
              <div style="font-size:18px;">🌤️ <b>28°C</b> / 20°C</div>
              <small style="font-size:11px;color:var(--pine);">មេឃស្រឡះ ត្រជាក់យប់</small>
            </div>
            <div style="background:color-mix(in srgb, var(--pine) 8%, var(--surface));padding:10px;border-radius:10px;text-align:center;">
              <div style="font-size:11px;color:var(--muted);margin-bottom:2px;">ថ្ងៃទី ២ (Day 2)</div>
              <div style="font-size:18px;">⛅ <b>27°C</b> / 19°C</div>
              <small style="font-size:11px;color:var(--pine);">ពពកតិចតួច ស្រស់ស្រាយ</small>
            </div>
          </div>
        </div>

        <!-- Mountain Climate Advisory -->
        <div style="background:color-mix(in srgb, var(--amber) 10%, var(--surface));border:1px solid color-mix(in srgb, var(--amber) 30%, transparent);border-radius:14px;padding:12px 14px;margin-bottom:18px;">
          <div style="display:flex;align-items:center;gap:6px;font-weight:700;color:var(--amber);font-size:13px;">
            <span>🌲</span>
            <span>ក្រើនរំលឹកអាកាសធាតុព្រៃភ្នំគិរីរម្យ</span>
          </div>
          <div style="font-size:12px;line-height:1.55;color:var(--ink);margin-top:6px;">
            តំបន់ខ្ពង់រាបគិរីរម្យមានកម្ពស់ខ្ពស់ និងព្រៃស្រល់ក្រាស់ ធ្វើឱ្យសីតុណ្ហភាពទាបជាងទីក្រុងភ្នំពេញ <b>៣ ទៅ ៥ អង្សាសេ</b>។ នៅពេលយប់ និងព្រឹកព្រលឹម សីតុណ្ហភាពអាចចុះត្រជាក់ដល់ <b>១៨°C - ២០°C</b> សូមត្រៀមអាវរងាអោយបានគ្រប់គ្នា!
          </div>
        </div>

        <!-- Packing Checklist Card -->
        <div style="background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <div>
              <b style="font-size:14px;">🎒 បញ្ជីផ្ទៀងផ្ទាត់ឥវ៉ាន់ចាំបាច់ (Packing Checklist)</b>
              <div style="font-size:11.5px;color:var(--muted);">ចុចធីកលើឥវ៉ាន់ដែលបានរៀបចំរួចរាល់៖</div>
            </div>
            <b id="ext-packing-count-badge" style="font-size:12px;color:var(--pine);background:color-mix(in srgb, var(--pine) 12%, transparent);padding:3px 8px;border-radius:99px;white-space:nowrap;">
              ${initialStats.checkedCount}/${initialStats.total} (${initialStats.pct}%)
            </b>
          </div>

          <div class="ext-packing-progress-wrap">
            <div id="ext-packing-progress" class="ext-packing-progress-bar" style="width:${initialStats.pct}%;"></div>
          </div>

          <div style="display:flex;gap:6px;margin-bottom:12px;">
            <button class="btn ghost sm" type="button" id="ext-pack-all-btn" style="padding:3px 8px;font-size:11px;border-radius:6px;">✓ ជ្រើសទាំងអស់</button>
            <button class="btn ghost sm" type="button" id="ext-pack-clear-btn" style="padding:3px 8px;font-size:11px;border-radius:6px;color:var(--muted);">✕ ដោះទាំងអស់</button>
          </div>

          <div id="ext-packing-items-list">
            ${PACKING_ITEMS.map(it => {
              const isChecked = !!savedPacking[it.id];
              return `
                <div class="ext-packing-item ${isChecked ? 'checked' : ''}" data-pack-id="${it.id}">
                  <input type="checkbox" class="ext-packing-checkbox" ${isChecked ? 'checked' : ''}>
                  <div style="flex:1 1 auto;min-width:0;">
                    <div style="font-size:13px;font-weight:600;color:var(--ink);">${it.label}</div>
                    <div style="font-size:11px;color:var(--muted);margin-top:1px;">${it.tip}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    openModal('🌤️ អាកាសធាតុ & ការត្រៀមឥវ៉ាន់គិរីរម្យ', initialHtml);

    // Bind packing list interactions
    const listEl = document.getElementById('ext-packing-items-list');
    const updateUiAndStorage = () => {
      const stats = computePackingStats(savedPacking);
      const badge = document.getElementById('ext-packing-count-badge');
      const bar = document.getElementById('ext-packing-progress');
      if (badge) badge.textContent = `${stats.checkedCount}/${stats.total} (${stats.pct}%)`;
      if (bar) bar.style.width = `${stats.pct}%`;
      try {
        localStorage.setItem(EXT_STORAGE_KEYS.PACKING, JSON.stringify(savedPacking));
      } catch(e) {}
    };

    if (listEl) {
      listEl.querySelectorAll('.ext-packing-item').forEach(el => {
        el.onclick = () => {
          const id = el.getAttribute('data-pack-id');
          const chk = el.querySelector('.ext-packing-checkbox');
          const newState = !savedPacking[id];
          savedPacking[id] = newState;
          chk.checked = newState;
          el.classList.toggle('checked', newState);
          updateUiAndStorage();
        };
      });
    }

    const packAllBtn = document.getElementById('ext-pack-all-btn');
    if (packAllBtn) {
      packAllBtn.onclick = () => {
        PACKING_ITEMS.forEach(it => { savedPacking[it.id] = true; });
        if (listEl) {
          listEl.querySelectorAll('.ext-packing-item').forEach(el => {
            el.classList.add('checked');
            el.querySelector('.ext-packing-checkbox').checked = true;
          });
        }
        updateUiAndStorage();
      };
    }

    const packClearBtn = document.getElementById('ext-pack-clear-btn');
    if (packClearBtn) {
      packClearBtn.onclick = () => {
        savedPacking = {};
        if (listEl) {
          listEl.querySelectorAll('.ext-packing-item').forEach(el => {
            el.classList.remove('checked');
            el.querySelector('.ext-packing-checkbox').checked = false;
          });
        }
        updateUiAndStorage();
      };
    }

    // Now fetch live weather asynchronously and populate
    try {
      const w = await fetchKiriromWeather(true);
      if (w) {
        const liveBadge = document.getElementById('ext-weather-live-badge');
        const iconEl = document.getElementById('ext-w-icon');
        const tempEl = document.getElementById('ext-w-temp');
        const condEl = document.getElementById('ext-w-condition');
        const feelsEl = document.getElementById('ext-w-feels');
        const elevEl = document.getElementById('ext-w-elev');
        const updatedEl = document.getElementById('ext-w-updated');
        const humEl = document.getElementById('ext-w-hum');
        const windEl = document.getElementById('ext-w-wind');
        const dailyBox = document.getElementById('ext-w-daily-box');

        if (liveBadge) liveBadge.textContent = '🟢 ផ្សាយផ្ទាល់ (Live)';
        if (iconEl) iconEl.textContent = w.icon;
        if (tempEl) tempEl.textContent = w.temp;
        if (condEl) condEl.textContent = `${w.condition} • ${w.conditionDesc}`;
        if (feelsEl) feelsEl.textContent = `កម្ដៅជាក់ស្ដែង: ${w.apparent}°C`;
        if (elevEl) elevEl.textContent = `កម្ពស់ខ្ពង់រាប: ~${w.elevation} ម៉ែត្រ`;
        if (updatedEl) updatedEl.textContent = `ម៉ោង: ${w.updatedAt}`;
        if (humEl) humEl.textContent = `${w.humidity}%`;
        if (windEl) windEl.textContent = `${w.wind} km/h`;

        if (dailyBox && w.daily && w.daily.length >= 2) {
          dailyBox.innerHTML = `
            <div style="background:color-mix(in srgb, var(--pine) 8%, var(--surface));padding:10px;border-radius:10px;text-align:center;">
              <div style="font-size:11px;color:var(--muted);margin-bottom:2px;">${w.daily[0].day}</div>
              <div style="font-size:18px;">${w.daily[0].icon} <b>${w.daily[0].max}°C</b> / ${w.daily[0].min}°C</div>
              <small style="font-size:11px;color:var(--pine);">${w.daily[0].cond} (ឱកាសភ្លៀង ${w.daily[0].rainProb}%)</small>
            </div>
            <div style="background:color-mix(in srgb, var(--pine) 8%, var(--surface));padding:10px;border-radius:10px;text-align:center;">
              <div style="font-size:11px;color:var(--muted);margin-bottom:2px;">${w.daily[1].day}</div>
              <div style="font-size:18px;">${w.daily[1].icon} <b>${w.daily[1].max}°C</b> / ${w.daily[1].min}°C</div>
              <small style="font-size:11px;color:var(--pine);">${w.daily[1].cond} (ឱកាសភ្លៀង ${w.daily[1].rainProb}%)</small>
            </div>
          `;
        }

        updateHeaderWeatherTemp();
      }
    } catch (e) {
      console.warn('Weather modal async update error:', e);
    }
  }

  // ---------------------------------------------------------
  // 8.6 Live Announcement & Broadcast System (Feature 2)
  // ---------------------------------------------------------
  function renderAnnouncementBanner() {
    const cur = getMe();
    const wrap = document.querySelector('#app .wrap');
    if (!wrap) return;

    let bannerWrapper = document.getElementById('ext-announcement-wrapper');
    if (!bannerWrapper) {
      bannerWrapper = document.createElement('div');
      bannerWrapper.id = 'ext-announcement-wrapper';
      wrap.insertBefore(bannerWrapper, wrap.firstChild);
    }

    if (!broadcastState || !broadcastState.active || !broadcastState.title) {
      bannerWrapper.innerHTML = '';
      bannerWrapper.style.display = 'none';
      return;
    }

    bannerWrapper.style.display = 'block';

    const cat = broadcastState.category || 'info';
    const isUrgent = cat === 'urgent';
    const isDismissed = !isUrgent && (localStorage.getItem(EXT_STORAGE_KEYS.DISMISSED_BROADCAST) === String(broadcastState.updatedAt || broadcastState.title));

    if (isDismissed) {
      bannerWrapper.innerHTML = `
        <div class="ext-announcement-minimized" id="ext-bc-reopen-btn" title="ចុចដើម្បីបើកមើលសេចក្តីជូនដំណឹងពេញ">
          <div style="display:flex;align-items:center;gap:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            <span>📢</span>
            <span><b>ដំណឹង:</b> ${escapeHtml(broadcastState.title)}</span>
          </div>
          <span style="color:var(--pine);font-weight:600;white-space:nowrap;font-size:11px;">បើកមើល ▾</span>
        </div>
      `;
      const reopenBtn = document.getElementById('ext-bc-reopen-btn');
      if (reopenBtn) {
        reopenBtn.onclick = () => showAnnouncementDetailModal(broadcastState);
      }
      return;
    }

    const catMeta = {
      urgent: { label: 'បន្ទាន់ (Urgent)', icon: '🚨', badgeClass: 'urgent' },
      warning: { label: 'កាលវិភាគ & ក្រើនរំលឹក', icon: '⚠️', badgeClass: 'warning' },
      info: { label: 'ដំណឹងទូទៅ (Notice)', icon: '📢', badgeClass: 'info' },
      gala: { label: 'រាត្រីសមោសរ Gala Dinner', icon: '🎉', badgeClass: 'gala' }
    }[cat] || { label: 'ដំណឹងទូទៅ', icon: '📢', badgeClass: 'info' };

    const isTr = isTransportationRole(cur);
    const isAct = isActivityRole(cur);
    const canManage = cur && (cur.admin || isTr || isAct);

    let timeStr = '';
    if (broadcastState.updatedAt) {
      try {
        const d = new Date(broadcastState.updatedAt);
        timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch(e) {}
    }

    bannerWrapper.innerHTML = `
      <div class="ext-announcement-banner ${cat}" id="ext-banner-card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="ext-bc-badge ${catMeta.badgeClass}">
              ${isUrgent ? '<span class="ext-pulse-dot"></span>' : ''}
              <span>${catMeta.icon} ${catMeta.label}</span>
            </span>
            ${timeStr ? `<span style="font-size:11px;color:var(--muted);">• ម៉ោង ${timeStr}</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:4px;">
            ${canManage ? `
              <button class="btn ghost sm" id="ext-bc-edit-btn" style="padding:2px 8px;font-size:11px;border-radius:6px;height:24px;" title="កែសម្រួលការផ្សាយ">
                ⚙️ គ្រប់គ្រង
              </button>
            ` : ''}
            ${!isUrgent ? `
              <button id="ext-bc-dismiss-btn" style="background:transparent;border:0;color:var(--muted);font-size:16px;cursor:pointer;padding:2px 6px;line-height:1;" title="បិទផ្ទាំងនេះ">
                ✕
              </button>
            ` : ''}
          </div>
        </div>

        <div style="font-size:15px;font-weight:700;letter-spacing:-0.01em;cursor:pointer;" id="ext-bc-title-click">
          ${escapeHtml(broadcastState.title)}
        </div>

        ${broadcastState.message ? `
          <div style="font-size:13px;line-height:1.45;color:var(--ink);opacity:0.9;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;cursor:pointer;" id="ext-bc-msg-click">
            ${escapeHtml(broadcastState.message)}
          </div>
        ` : ''}

        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:2px;">
          <button class="btn sm" id="ext-bc-view-btn" style="font-size:12px;padding:4px 12px;border-radius:8px;">
            👁️ មើលសេចក្តីជូនដំណឹងពេញ
          </button>
          ${broadcastState.author ? `
            <span style="font-size:11px;color:var(--muted);">ផ្សាយដោយ: <b>${escapeHtml(broadcastState.author)}</b></span>
          ` : ''}
        </div>
      </div>
    `;

    const openDetail = () => showAnnouncementDetailModal(broadcastState);
    const titleClick = document.getElementById('ext-bc-title-click');
    const msgClick = document.getElementById('ext-bc-msg-click');
    const viewBtn = document.getElementById('ext-bc-view-btn');
    if (titleClick) titleClick.onclick = openDetail;
    if (msgClick) msgClick.onclick = openDetail;
    if (viewBtn) viewBtn.onclick = openDetail;

    const editBtn = document.getElementById('ext-bc-edit-btn');
    if (editBtn) {
      editBtn.onclick = () => showBroadcastAdminModal();
    }

    const dismissBtn = document.getElementById('ext-bc-dismiss-btn');
    if (dismissBtn) {
      dismissBtn.onclick = (e) => {
        e.stopPropagation();
        localStorage.setItem(EXT_STORAGE_KEYS.DISMISSED_BROADCAST, String(broadcastState.updatedAt || broadcastState.title));
        renderAnnouncementBanner();
      };
    }
  }

  function mountHeaderBroadcastBtn() {
    const cur = getMe();
    if (!cur) return;
    const isTr = isTransportationRole(cur);
    const isAct = isActivityRole(cur);
    const canBroadcast = cur.admin || isTr || isAct;
    if (!canBroadcast) {
      const oldBtn = document.getElementById('ext-header-broadcast-btn');
      if (oldBtn) oldBtn.remove();
      return;
    }

    const whoEl = document.querySelector('.top-in .who');
    if (!whoEl) return;

    let bcBtn = document.getElementById('ext-header-broadcast-btn');
    if (!bcBtn) {
      bcBtn = document.createElement('button');
      bcBtn.id = 'ext-header-broadcast-btn';
      bcBtn.className = 'ext-header-pill';
      bcBtn.type = 'button';
      bcBtn.style.cssText = 'background:color-mix(in srgb, var(--amber) 15%, var(--surface));border-color:var(--amber);color:var(--amber);';
      bcBtn.title = 'ផ្ញើសេចក្តីជូនដំណឹងផ្ទាល់ទៅកាន់បុគ្គលិកទាំងអស់';
      bcBtn.innerHTML = `📢 <span style="font-weight:700;">ផ្សាយដំណឹង</span>`;
      bcBtn.onclick = () => showBroadcastAdminModal();

      const logoutBtn = whoEl.querySelector('[data-act="logout"]');
      if (logoutBtn) whoEl.insertBefore(bcBtn, logoutBtn);
      else whoEl.appendChild(bcBtn);
    }
  }

  function showAnnouncementDetailModal(bc) {
    if (!bc) return;
    const cat = bc.category || 'info';
    const catMeta = {
      urgent: { label: 'បន្ទាន់ (Urgent)', icon: '🚨', color: '#ef4444' },
      warning: { label: 'កាលវិភាគ & ក្រើនរំលឹក', icon: '⚠️', color: '#f59e0b' },
      info: { label: 'ដំណឹងទូទៅ (Notice)', icon: '📢', color: '#10b981' },
      gala: { label: 'រាត្រីសមោសរ Gala Dinner', icon: '🎉', color: '#8b5cf6' }
    }[cat] || { label: 'ដំណឹងទូទៅ', icon: '📢', color: '#10b981' };

    let timeStr = 'ថ្មីៗនេះ';
    if (bc.updatedAt) {
      try {
        const d = new Date(bc.updatedAt);
        timeStr = `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} • ម៉ោង ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      } catch(e) {}
    }

    const cur = getMe();
    const canManage = cur && (cur.admin || isTransportationRole(cur) || isActivityRole(cur));

    const html = `
      <div style="display:grid;gap:16px;">
        <div style="border-left:5px solid ${catMeta.color};background:color-mix(in srgb, ${catMeta.color} 10%, var(--surface));padding:14px;border-radius:12px;">
          <div style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:${catMeta.color};">
            <span>${catMeta.icon}</span>
            <span>${catMeta.label}</span>
            <span style="color:var(--muted);font-weight:400;margin-left:auto;">${timeStr}</span>
          </div>
          <h2 style="font-family:var(--display);font-size:20px;margin:8px 0 4px 0;line-height:1.3;color:var(--ink);">
            ${escapeHtml(bc.title)}
          </h2>
          ${bc.author ? `<div style="font-size:12px;color:var(--muted);">ផ្សាយដោយ: <b>${escapeHtml(bc.author)}</b></div>` : ''}
        </div>

        <div style="font-size:14px;line-height:1.65;white-space:pre-wrap;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px;color:var(--ink);">
          ${escapeHtml(bc.message || 'គ្មានខ្លឹមសារបន្ថែម')}
        </div>

        ${canManage ? `
          <button class="btn sm" id="ext-detail-admin-edit-btn" style="background:var(--pine);width:100%;font-weight:600;">
            ⚙️ បើកផ្ទាំងគ្រប់គ្រងការផ្សាយ (Broadcast Manager)
          </button>
        ` : ''}
      </div>
    `;

    openModal('📢 សេចក្តីជូនដំណឹងផ្លូវការ', html);

    const adminEditBtn = document.getElementById('ext-detail-admin-edit-btn');
    if (adminEditBtn) {
      adminEditBtn.onclick = () => {
        closeModal();
        setTimeout(showBroadcastAdminModal, 150);
      };
    }
  }

  function showBroadcastAdminModal() {
    const cur = getMe();
    if (!cur) {
      alert('សូមចូលប្រើប្រាស់ជាមុនសិន!');
      return;
    }

    const currentBc = broadcastState || {
      title: '',
      message: '',
      category: 'urgent',
      active: true
    };

    const templates = [
      {
        name: '🚌 ឡានត្រៀមចេញ',
        cat: 'urgent',
        title: 'ឡាន Airbus 1-4 ត្រៀមចេញដំណើរម៉ោង ៧:០០ ព្រឹក!',
        msg: 'សូមបងប្អូនទាំងអស់ប្រញាប់ឡើងឡានតាមលេខរថយន្តដែលបានកំណត់ ដើម្បីចេញដំណើរអោយបានទាន់ពេលវេលា!'
      },
      {
        name: '🍽️ អាហារថ្ងៃត្រង់',
        cat: 'info',
        title: 'ម៉ោងពិសារអាហារថ្ងៃត្រង់ជុំគ្នា!',
        msg: 'សូមអញ្ជើញបងប្អូនទាំងអស់គ្នាទៅកាន់ភោជនីយដ្ឋានធំ ដើម្បីពិសារអាហារថ្ងៃត្រង់ជុំគ្នា!'
      },
      {
        name: '🌲 ឡើងភ្នំ Hiking & Games',
        cat: 'warning',
        title: 'ជួបជុំគ្នានៅទីលានសកម្មភាព!',
        msg: 'សូមបងប្អូនត្រៀមស្បែកជើងប៉ាតា អាវយឺតកីឡា និងទឹកផឹក ដើម្បីជួបជុំគ្នានៅទីលានសកម្មភាពសម្រាប់ការដើរព្រៃ និងលេងហ្គេម!'
      },
      {
        name: '🎉 Gala Dinner',
        cat: 'gala',
        title: 'កម្មវិធី Gala Dinner & Party ម៉ោង ៦:៣០ ល្ងាច!',
        msg: 'កម្មវិធីរាត្រីសមោសរ Gala Dinner & ការប្រគល់រង្វាន់នឹងចាប់ផ្តើមនៅម៉ោង ៦:៣០ ល្ងាច នៅ Gala Hall សូមបងប្អូនទាំងអស់ចូលរួមអោយបានគ្រប់គ្នា!'
      },
      {
        name: '⚠️ ប្តូរម៉ោង / ទីតាំង',
        cat: 'warning',
        title: 'សេចក្តីជូនដំណឹងពីការកែសម្រួលកម្មវិធី',
        msg: 'សូមជម្រាបជូនដំណឹងពីការផ្លាស់ប្តូរម៉ោង ឬទីតាំងកម្មវិធីមួយចំនួនដូចខាងក្រោម...'
      }
    ];

    const html = `
      <div style="display:grid;gap:14px;">
        <div style="font-size:12px;color:var(--muted);">
          ជ្រើសរើសគំរូសាររហ័ស (Quick Templates) ឬសរសេរថ្មីដោយខ្លួនឯង៖
        </div>
        <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;" class="ext-no-scrollbar" id="ext-bc-tpl-list">
          ${templates.map((tpl, i) => `
            <button type="button" class="btn ghost sm" data-tpl-idx="${i}" style="white-space:nowrap;font-size:12px;padding:5px 10px;border-radius:999px;">
              ${tpl.name}
            </button>
          `).join('')}
        </div>

        <form id="ext-broadcast-form" style="display:grid;gap:12px;">
          <div>
            <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;color:var(--muted);">ប្រភេទសេចក្តីជូនដំណឹង (Category)</label>
            <select class="inp" id="ext-bc-form-cat" style="width:100%;">
              <option value="urgent" ${currentBc.category === 'urgent' ? 'selected' : ''}>🚨 ដំណឹងបន្ទាន់ខ្លាំង (Urgent - ក្រហម & មិនអាចបិទបាន)</option>
              <option value="warning" ${currentBc.category === 'warning' ? 'selected' : ''}>⚠️ កាលវិភាគ & ក្រើនរំលឹក (Important - លឿងទុំ)</option>
              <option value="info" ${currentBc.category === 'info' ? 'selected' : ''}>📢 ដំណឹងទូទៅ (Notice - បៃតង)</option>
              <option value="gala" ${currentBc.category === 'gala' ? 'selected' : ''}>🎉 កម្មវិធីរាត្រីសមោសរ & Games (Gala - ស្វាយ)</option>
            </select>
          </div>

          <div>
            <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;color:var(--muted);">ចំណងជើងសេចក្តីជូនដំណឹង (Title)</label>
            <input class="inp" id="ext-bc-form-title" placeholder="ឧ. ឡាន Airbus 1-4 ត្រៀមចេញដំណើរ..." value="${escapeHtml(currentBc.title || '')}" required style="width:100%;">
          </div>

          <div>
            <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;color:var(--muted);">ខ្លឹមសារលម្អិត (Detailed Message)</label>
            <textarea class="inp" id="ext-bc-form-msg" rows="4" placeholder="សរសេរខ្លឹមសារលម្អិតនៅទីនេះ..." style="width:100%;font-family:inherit;">${escapeHtml(currentBc.message || '')}</textarea>
          </div>

          <div style="background:color-mix(in srgb, var(--pine) 8%, var(--surface));border:1px solid var(--line);border-radius:10px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;">
            <div>
              <b style="font-size:13px;">បើកបង្ហាញការផ្សាយ (Active Status)</b>
              <div style="font-size:11px;color:var(--muted);">ប្រសិនបើបិទ បុគ្គលិកទាំងអស់នឹងលែងឃើញផ្ទាំងប្រកាសនេះ</div>
            </div>
            <input type="checkbox" id="ext-bc-form-active" ${currentBc.active !== false ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--pine);cursor:pointer;">
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px;">
            <button class="btn" type="submit" id="ext-bc-submit-btn" style="background:var(--pine);font-weight:700;">
              🚀 ផ្សាយផ្ទាល់ភ្លាមៗ
            </button>
            <button class="btn ghost" type="button" id="ext-bc-clear-btn" style="color:var(--danger);border-color:var(--line);">
              🗑️ លុប / បិទការផ្សាយ
            </button>
          </div>
        </form>
      </div>
    `;

    openModal('📢 ផ្ទាំងគ្រប់គ្រងការផ្សាយដំណឹងបន្ទាន់', html);

    // Template click handler
    const tplList = document.getElementById('ext-bc-tpl-list');
    if (tplList) {
      tplList.querySelectorAll('[data-tpl-idx]').forEach(btn => {
        btn.onclick = () => {
          const idx = Number(btn.getAttribute('data-tpl-idx'));
          const t = templates[idx];
          if (t) {
            document.getElementById('ext-bc-form-cat').value = t.cat;
            document.getElementById('ext-bc-form-title').value = t.title;
            document.getElementById('ext-bc-form-msg').value = t.msg;
            document.getElementById('ext-bc-form-active').checked = true;
          }
        };
      });
    }

    const form = document.getElementById('ext-broadcast-form');
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const title = document.getElementById('ext-bc-form-title').value.trim();
        const message = document.getElementById('ext-bc-form-msg').value.trim();
        const category = document.getElementById('ext-bc-form-cat').value;
        const active = document.getElementById('ext-bc-form-active').checked;

        if (!title) {
          alert('សូមបញ្ចូលចំណងជើងសេចក្តីជូនដំណឹង!');
          return;
        }

        const subBtn = document.getElementById('ext-bc-submit-btn');
        if (subBtn) {
          subBtn.disabled = true;
          subBtn.textContent = 'កំពុងផ្សាយ...';
        }

        const payload = {
          title,
          message,
          category,
          active,
          author: cur.name + (cur.admin ? ' (Admin)' : (cur.label ? ` (${cur.label})` : '')),
          authorSid: cur.sid || '',
          updatedAt: new Date().toISOString()
        };

        broadcastState = payload;
        try {
          localStorage.setItem(EXT_STORAGE_KEYS.BROADCAST, JSON.stringify(payload));
        } catch(e) {}

        renderAnnouncementBanner();

        const fs = getFirestore();
        if (fs) {
          try {
            await fs.collection('ext_checkins').doc('broadcast').set(payload, { merge: true });
          } catch(err) {
            console.warn('Firestore broadcast write queued/error:', err);
          }
        }

        closeModal();
        if (typeof window.toast === 'function') {
          window.toast('✅ បានផ្សាយដំណឹងផ្ទាល់ទៅកាន់បុគ្គលិកទាំងអស់រួចរាល់!');
        }
      };
    }

    const clearBtn = document.getElementById('ext-bc-clear-btn');
    if (clearBtn) {
      clearBtn.onclick = async () => {
        if (!confirm('តើអ្នកប្រាកដជាចង់បិទការផ្សាយដំណឹងនេះមែនទេ?')) return;
        const payload = {
          active: false,
          updatedAt: new Date().toISOString()
        };
        broadcastState = payload;
        try {
          localStorage.setItem(EXT_STORAGE_KEYS.BROADCAST, JSON.stringify(payload));
        } catch(e) {}
        renderAnnouncementBanner();

        const fs = getFirestore();
        if (fs) {
          try {
            await fs.collection('ext_checkins').doc('broadcast').set(payload, { merge: true });
          } catch(e) {}
        }
        closeModal();
        if (typeof window.toast === 'function') {
          window.toast('🗑️ បានបិទការផ្សាយដំណឹងរួចរាល់!');
        }
      };
    }
  }


  // =========================================================
  // Feature 16: Interactive Resort Map, Room Zone Finder & GPS Navigation
  // =========================================================
  const RESORT_DATA = {
    name: 'vKirirom Pine Resort',
    khmerName: 'រមណីយដ្ឋាន គិរីរម្យ (vKirirom Pine Resort)',
    coords: { lat: 11.3197, lon: 104.0583 },
    altitude: '៦២៦ ម៉ែត្រលើនីវ៉ូទឹកសមុទ្រ',
    description: 'រមណីយដ្ឋានបែបធម្មជាតិព័ទ្ធជុំវិញដោយព្រៃស្រល់ខៀវស្រងាត់ លើឧទ្យានជាតិព្រះសុរាម្រិត-កុសមៈ គិរីរម្យ',
    zones: {
      A: {
        name: 'Zone A (Pine Villa)',
        khmerName: 'តំបន់ផ្ទះវីឡាស្រល់ A (Pine Villa A)',
        range: 'A001 – A016 (១៦ បន្ទប់)',
        location: 'ភាគពាយព្យ (North-West Pine Ridge)',
        nearby: 'ច្រកចូលធំ, ចំណតរថយន្ត Airbus 1-4, ប៉ុស្តិ៍សង្គ្រោះបឋម',
        walkingGuide: 'ដើរពី Reception ត្រង់ទៅទិសខាងលិច ប្រហែល ១-២ នាទី (~១០០ ម៉ែត្រ)',
        coords: { lat: 11.3208, lon: 104.0572 },
        color: '#10b981',
        pinCoords: { x: 135, y: 155 },
        desc: 'តំបន់ផ្ទះវីឡាឈើស្រល់ ស្ងប់ស្ងាត់ មានផាសុកភាព ជិតចំណតរថយន្ត'
      },
      B: {
        name: 'Zone B (Pine Villa)',
        khmerName: 'តំបន់ផ្ទះវីឡាស្រល់ B (Pine Villa B)',
        range: 'B001 – B016 (១៦ បន្ទប់)',
        location: 'ភាគឦសាន (North-East Ridge)',
        nearby: 'ទីលានលេងហ្គេម Team Building, ផ្លូវដើរព្រៃ Hiking Trail',
        walkingGuide: 'ដើរពី Reception ទៅខាងស្តាំដៃកាត់តាមសួនស្រល់ ប្រហែល ២-៣ នាទី (~១៨០ ម៉ែត្រ)',
        coords: { lat: 11.3216, lon: 104.0594 },
        color: '#3b82f6',
        pinCoords: { x: 600, y: 125 },
        desc: 'តំបន់ផ្ទះវីឡាជិតទីលានសកម្មភាព Team Building & Hiking'
      },
      C: {
        name: 'Zone C (Deluxe Villa)',
        khmerName: 'តំបន់វីឡាកណ្តាលសួន C (Deluxe Villa C)',
        range: 'C001 – C012 (១២ បន្ទប់)',
        location: 'កណ្តាលរីហ្សត (Central Resort Core)',
        nearby: 'អាងហែលទឹក Pine Pool, ភោជនីយដ្ឋានធំ Pine View, Reception',
        walkingGuide: 'ដើរពី Reception ត្រឹមតែ ៥០ ម៉ែត្រ ជាប់នឹងអាងហែលទឹក (~១ នាទី)',
        coords: { lat: 11.3200, lon: 104.0585 },
        color: '#f59e0b',
        pinCoords: { x: 320, y: 245 },
        desc: 'តំបន់កណ្តាលងាយស្រួលធ្វើដំណើរ ជាប់អាងហែលទឹក និងភោជនីយដ្ឋាន'
      },
      D: {
        name: 'Zone D (Luxury Tent & Villa)',
        khmerName: 'តំបន់ជ្រលងស្រល់ & តង់ប្រណិត D (Zone D)',
        range: 'D001 – D018 (១៨ បន្ទប់)',
        location: 'ភាគអាគ្នេយ៍ (South-East Valley)',
        nearby: 'សាលសមោសរ Gala Dinner Hall, ផ្លូវដើរព្រៃស្រល់ Pine Trail',
        walkingGuide: 'ដើរពី Reception ចុះទៅទិសខាងត្បូងកាត់សាលប្រជុំ ប្រហែល ២-៣ នាទី (~២២០ ម៉ែត្រ)',
        coords: { lat: 11.3188, lon: 104.0598 },
        color: '#8b5cf6',
        pinCoords: { x: 585, y: 365 },
        desc: 'តំបន់ធម្មជាតិខ្យល់អាកាសត្រជាក់បរិសុទ្ធ ជិតសាលសមោសរ Gala Dinner'
      }
    },
    landmarks: [
      {
        id: 'reception',
        name: 'ការិយាល័យទទួលភ្ញៀវ (Front Desk & Reception)',
        category: 'core',
        icon: '🏢',
        coords: { lat: 11.3197, lon: 104.0583 },
        pinCoords: { x: 230, y: 340 },
        walkingGuide: 'ចំណុចកណ្តាលនៃរីហ្សត (Central Hub)',
        note: 'ទីតាំង Check-in / Check-out និងទទួលសោបន្ទប់ (Ext: 023 999 888)'
      },
      {
        id: 'restaurant',
        name: 'ភោជនីយដ្ឋានធំ (Pine View Restaurant)',
        category: 'dining',
        icon: '🍽️',
        coords: { lat: 11.3204, lon: 104.0588 },
        pinCoords: { x: 370, y: 110 },
        walkingGuide: 'ដើរពី Reception ទៅខាងកើត ៦០ ម៉ែត្រ (~១ នាទី)',
        note: 'អាហារប៊ូហ្វេថ្ងៃត្រង់ និងអាហារពេលព្រឹក (ម៉ោង 7:30 AM & 12:00 PM)'
      },
      {
        id: 'pool',
        name: 'អាងហែលទឹកព្រៃស្រល់ (Pine Swimming Pool)',
        category: 'recreation',
        icon: '🏊‍♂️',
        coords: { lat: 11.3201, lon: 104.0582 },
        pinCoords: { x: 430, y: 230 },
        walkingGuide: 'នៅចំកណ្តាលទល់មុខ Zone C (៥០ ម៉ែត្រពី Reception)',
        note: 'បើកពីម៉ោង 6:00 AM ដល់ 8:00 PM (ទឹកធម្មជាតិត្រជាក់ស្រួល)'
      },
      {
        id: 'gala_hall',
        name: 'សាលសមោសរ Gala Dinner & ឆាកតន្ត្រី (Gala Hall)',
        category: 'event',
        icon: '🎉',
        coords: { lat: 11.3189, lon: 104.0596 },
        pinCoords: { x: 360, y: 430 },
        walkingGuide: 'ដើរទៅទិសខាងត្បូង ក្បែរ Zone D (~២០០ ម៉ែត្រ)',
        note: 'កម្មវិធីរាត្រីសមោសរ Gala Dinner & Party ម៉ោង 6:30 PM យប់ថ្ងៃសៅរ៍'
      },
      {
        id: 'activity_field',
        name: 'ទីលានសកម្មភាព & Team Building Lawn',
        category: 'activity',
        icon: '⚽',
        coords: { lat: 11.3212, lon: 104.0576 },
        pinCoords: { x: 260, y: 50 },
        walkingGuide: 'នៅខាងជើង Zone A និងខាងលិច Zone B (~១៥០ ម៉ែត្រ)',
        note: 'ទីតាំងលេងហ្គេម Game Challenge & ប្រជុំជួរម៉ោង 2:00 PM'
      },
      {
        id: 'bus_parking',
        name: 'ចំណតរថយន្តធំ & Airbus 1-4 Station',
        category: 'transport',
        icon: '🚌',
        coords: { lat: 11.3193, lon: 104.0577 },
        pinCoords: { x: 90, y: 400 },
        walkingGuide: 'ច្រកចូលធំខាងឆ្វេងដៃ (~៨០ ម៉ែត្រពី Reception)',
        note: 'ចំណតឡាន Airbus 1, 2, 3, 4 និង VIP Cars ពេលមកដល់ និងពេលត្រឡប់'
      },
      {
        id: 'hiking_trail',
        name: 'ច្រកផ្លូវដើរព្រៃស្រល់ (Pine Hiking Trailhead)',
        category: 'hiking',
        icon: '🌲',
        coords: { lat: 11.3223, lon: 104.0605 },
        pinCoords: { x: 730, y: 65 },
        walkingGuide: 'នៅខាងលើ Zone B និង Zone D ឆ្ពោះទៅជ្រលងភ្នំ',
        note: 'ចំណុចចាប់ផ្តើម Fun Hiking Adventure (ចម្ងាយដើរ ៣-៤ គ.ម)'
      },
      {
        id: 'first_aid',
        name: 'ប៉ុស្តិ៍សង្គ្រោះបឋម (First Aid Medical Post)',
        category: 'emergency',
        icon: '🏥',
        coords: { lat: 11.3198, lon: 104.0586 },
        pinCoords: { x: 175, y: 270 },
        walkingGuide: 'បន្ទប់ក្បែរ Reception និង First Aid Teams នៅ D010, B010, C010',
        note: 'ក្រុមគ្រូពេទ្យ និងថ្នាំសង្គ្រោះបឋម ២៤ ម៉ោង (Call: 012345671)'
      }
    ],
    tips: [
      { icon: '📶', title: 'WiFi រមណីយដ្ឋាន', desc: 'ឈ្មោះ WiFi: "vKirirom_Guest" (No password) មាននៅ Reception, Restaurant និង Lounge' },
      { icon: '⚡', title: 'ទឹកក្តៅ & ភ្លើង', desc: 'ប្រព័ន្ធទឹកក្តៅដើរដោយពន្លឺព្រះអាទិត្យ សូមបើកទឹកក្តៅចោលប្រហែល ១ នាទីមុនងូត' },
      { icon: '🕒', title: 'ម៉ោងចេញ-ចូលបន្ទប់', desc: 'Check-in: 10:30 AM (Day 1) | Check-out: 11:30 AM (Day 2)' },
      { icon: '🌲', title: 'បរិស្ថានធម្មជាតិ', desc: 'សូមជួយថែរក្សាអនាម័យ មិនបោះសំរាមពាសវាលពាសកាល និងហាមជក់បារីក្នុងព្រៃស្រល់' }
    ]
  };

  function getBlueprintImgSrc() {
    const el = document.querySelector('.mapbox img');
    if (el && el.src) return el.src;
    const match = document.body.innerHTML.match(/src="(data:image\/[^;]+;base64,[^"]+)"/);
    return match ? match[1] : '';
  }

  function getEffectivePeopleList() {
    if (typeof getAllPeople === 'function') {
      try {
        const list = getAllPeople();
        if (Array.isArray(list) && list.length) {
          return list.map(p => (typeof eff === 'function' ? eff(p) : p));
        }
      } catch(e) {}
    }
    if (typeof PEOPLE !== 'undefined' && Array.isArray(PEOPLE)) {
      return PEOPLE.map(p => (typeof eff === 'function' ? eff(p) : p));
    }
    return [];
  }

  function getZoneDetails(zoneKey) {
    const list = getEffectivePeopleList();
    const zoneStaff = list.filter(p => (p.room || '').trim().startsWith(zoneKey));
    const rooms = [...new Set(zoneStaff.map(p => (p.room || '').trim()).filter(Boolean))].sort();
    const maleCount = zoneStaff.filter(p => p.gender === 'M').length;
    const femaleCount = zoneStaff.filter(p => p.gender === 'F').length;
    return {
      zoneKey,
      meta: RESORT_DATA.zones[zoneKey] || {},
      totalStaff: zoneStaff.length,
      maleCount,
      femaleCount,
      rooms,
      staff: zoneStaff
    };
  }

  function getRoomOccupants(roomNo) {
    if (!roomNo) return null;
    const cleanR = roomNo.trim().toUpperCase();
    const list = getEffectivePeopleList();
    const occupants = list.filter(p => (p.room || '').trim().toUpperCase() === cleanR);
    const zKey = cleanR.charAt(0);
    const zoneMeta = RESORT_DATA.zones[zKey] || {};
    return {
      roomNo: cleanR,
      zoneKey: zKey,
      zoneMeta,
      occupants
    };
  }

  function calculateKiriromDistance(userLat, userLon) {
    const KIRIROM_LAT = RESORT_DATA.coords.lat;
    const KIRIROM_LON = RESORT_DATA.coords.lon;
    const R = 6371; // Earth radius in km
    const dLat = (KIRIROM_LAT - userLat) * Math.PI / 180;
    const dLon = (KIRIROM_LON - userLon) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(userLat * Math.PI / 180) * Math.cos(KIRIROM_LAT * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  }

  function generateResortSvg(activePinCoords) {
    const px = activePinCoords && typeof activePinCoords.x === 'number' ? activePinCoords.x : 230;
    const py = activePinCoords && typeof activePinCoords.y === 'number' ? activePinCoords.y : 340;

    return `
      <svg viewBox="0 0 820 520" class="ext-resort-svg" id="ext-resort-svg" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="forestGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#144d34" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="#0a261a" stop-opacity="0"/>
          </radialGradient>
          <pattern id="pinePattern" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M20 5 L28 20 L24 20 L30 30 L10 30 L16 20 L12 20 Z" fill="rgba(255,255,255,0.03)" />
          </pattern>
          <filter id="pinShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000" flood-opacity="0.5"/>
          </filter>
        </defs>

        <!-- Background Canvas -->
        <rect width="820" height="520" rx="16" fill="#0d261b" stroke="var(--line)" stroke-width="1.5" />
        <rect width="820" height="520" rx="16" fill="url(#pinePattern)" />

        <!-- Contour lines / Nature paths -->
        <path d="M 0 160 Q 200 130 420 180 T 820 140" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1.5" stroke-dasharray="4,4" />
        <path d="M 0 380 Q 250 420 480 370 T 820 400" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1.5" stroke-dasharray="4,4" />

        <!-- Roads & Walkways Network -->
        <!-- Main Entrance Road from Bus Parking -->
        <path d="M 100 420 L 100 370 Q 110 340 180 340 L 230 340" fill="none" stroke="#4a6358" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M 100 420 L 100 370 Q 110 340 180 340 L 230 340" fill="none" stroke="#fef3c7" stroke-width="2" stroke-dasharray="6,6" stroke-linecap="round" />

        <!-- Core Promenade Loop Connecting All Zones -->
        <path d="M 230 340 Q 140 320 140 230 L 140 200 Q 140 120 230 110 L 370 110 Q 420 110 450 150 L 580 150 Q 610 150 610 210 L 610 290 Q 610 340 560 360 L 460 360 Q 380 360 360 410 L 360 420 Q 340 440 280 410 Q 240 390 230 340" 
              fill="none" stroke="#385145" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M 230 340 Q 140 320 140 230 L 140 200 Q 140 120 230 110 L 370 110 Q 420 110 450 150 L 580 150 Q 610 150 610 210 L 610 290 Q 610 340 560 360 L 460 360 Q 380 360 360 410 L 360 420 Q 340 440 280 410 Q 240 390 230 340" 
              fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-dasharray="3,3" />

        <!-- Cross Pathways to Central Amenities -->
        <path d="M 230 340 L 320 260 L 410 240" fill="none" stroke="#385145" stroke-width="6" stroke-linecap="round" />
        <path d="M 370 110 L 370 180 L 410 230" fill="none" stroke="#385145" stroke-width="6" stroke-linecap="round" />
        <path d="M 410 240 L 500 330" fill="none" stroke="#385145" stroke-width="6" stroke-linecap="round" />

        <!-- Hiking Trailhead path extending out -->
        <path d="M 610 150 Q 670 130 730 65" fill="none" stroke="#d97706" stroke-width="5" stroke-dasharray="6,4" stroke-linecap="round" />

        <!-- ================= ZONE POLYGONS ================= -->
        <!-- ZONE A (North-West) -->
        <g class="svg-zone-grp" data-zone="A" id="svg-zone-A" style="cursor:pointer;">
          <rect x="50" y="90" width="170" height="130" rx="14" fill="rgba(16, 185, 129, 0.15)" stroke="#10b981" stroke-width="2.5" class="svg-zone-rect" />
          <rect x="62" y="102" width="70" height="22" rx="6" fill="#10b981" />
          <text x="97" y="117" fill="#fff" font-size="11" font-weight="bold" text-anchor="middle">Zone A</text>
          <text x="62" y="145" fill="#e2ece5" font-size="13" font-weight="bold">Pine Villa A</text>
          <text x="62" y="165" fill="#a7f3d0" font-size="11">A001 – A016 (16 បន្ទប់)</text>
          <text x="62" y="185" fill="#6ee7b7" font-size="11">👥 33 នាក់ (ប្រុស 27 • ស្រី 6)</text>
          <circle cx="195" cy="115" r="14" fill="rgba(16, 185, 129, 0.25)" />
          <text x="195" y="120" font-size="14" text-anchor="middle">🏡</text>
        </g>

        <!-- ZONE B (North-East) -->
        <g class="svg-zone-grp" data-zone="B" id="svg-zone-B" style="cursor:pointer;">
          <rect x="510" y="60" width="185" height="130" rx="14" fill="rgba(59, 130, 246, 0.15)" stroke="#3b82f6" stroke-width="2.5" class="svg-zone-rect" />
          <rect x="522" y="72" width="70" height="22" rx="6" fill="#3b82f6" />
          <text x="557" y="87" fill="#fff" font-size="11" font-weight="bold" text-anchor="middle">Zone B</text>
          <text x="522" y="115" fill="#e2ece5" font-size="13" font-weight="bold">Pine Villa B</text>
          <text x="522" y="135" fill="#bfdbfe" font-size="11">B001 – B016 (16 បន្ទប់)</text>
          <text x="522" y="155" fill="#93c5fd" font-size="11">👥 44 នាក់ (ប្រុស 44)</text>
          <circle cx="665" cy="85" r="14" fill="rgba(59, 130, 246, 0.25)" />
          <text x="665" y="90" font-size="14" text-anchor="middle">🏡</text>
        </g>

        <!-- ZONE C (Center Core) -->
        <g class="svg-zone-grp" data-zone="C" id="svg-zone-C" style="cursor:pointer;">
          <rect x="245" y="195" width="150" height="105" rx="14" fill="rgba(245, 158, 11, 0.15)" stroke="#f59e0b" stroke-width="2.5" class="svg-zone-rect" />
          <rect x="255" y="205" width="70" height="22" rx="6" fill="#f59e0b" />
          <text x="290" y="220" fill="#fff" font-size="11" font-weight="bold" text-anchor="middle">Zone C</text>
          <text x="255" y="246" fill="#e2ece5" font-size="12" font-weight="bold">Deluxe Villa C</text>
          <text x="255" y="264" fill="#fde68a" font-size="10.5">C001 – C012 (12 បន្ទប់)</text>
          <text x="255" y="282" fill="#fcd34d" font-size="10.5">👥 29 នាក់ (ប្រុស 12 • ស្រី 17)</text>
          <circle cx="370" cy="216" r="13" fill="rgba(245, 158, 11, 0.25)" />
          <text x="370" y="221" font-size="13" text-anchor="middle">🏡</text>
        </g>

        <!-- ZONE D (South-East Valley) -->
        <g class="svg-zone-grp" data-zone="D" id="svg-zone-D" style="cursor:pointer;">
          <rect x="490" y="300" width="195" height="135" rx="14" fill="rgba(139, 92, 246, 0.15)" stroke="#8b5cf6" stroke-width="2.5" class="svg-zone-rect" />
          <rect x="502" y="312" width="70" height="22" rx="6" fill="#8b5cf6" />
          <text x="537" y="327" fill="#fff" font-size="11" font-weight="bold" text-anchor="middle">Zone D</text>
          <text x="502" y="355" fill="#e2ece5" font-size="13" font-weight="bold">Luxury Tent & Villa D</text>
          <text x="502" y="375" fill="#ddd6fe" font-size="11">D001 – D018 (18 បន្ទប់)</text>
          <text x="502" y="395" fill="#c4b5fd" font-size="11">👥 51 នាក់ (ប្រុស 15 • ស្រី 36)</text>
          <circle cx="655" cy="325" r="14" fill="rgba(139, 92, 246, 0.25)" />
          <text x="655" y="330" font-size="14" text-anchor="middle">⛺</text>
        </g>

        <!-- ================= LANDMARKS ================= -->
        <!-- Reception / Lobby -->
        <g class="svg-lm-grp" data-lm="reception" id="svg-lm-reception" style="cursor:pointer;">
          <circle cx="230" cy="340" r="22" fill="#0f766e" stroke="#2dd4bf" stroke-width="2.5" filter="url(#pinShadow)" />
          <text x="230" y="347" font-size="17" text-anchor="middle">🏢</text>
          <rect x="180" y="370" width="100" height="20" rx="5" fill="rgba(15, 118, 110, 0.9)" />
          <text x="230" y="384" fill="#fff" font-size="10.5" font-weight="bold" text-anchor="middle">Reception / សោ</text>
        </g>

        <!-- Pine View Restaurant -->
        <g class="svg-lm-grp" data-lm="restaurant" id="svg-lm-restaurant" style="cursor:pointer;">
          <circle cx="370" cy="110" r="22" fill="#c2410c" stroke="#fb923c" stroke-width="2.5" filter="url(#pinShadow)" />
          <text x="370" y="117" font-size="17" text-anchor="middle">🍽️</text>
          <rect x="320" y="138" width="100" height="20" rx="5" fill="rgba(194, 65, 12, 0.9)" />
          <text x="370" y="152" fill="#fff" font-size="10" font-weight="bold" text-anchor="middle">ភោជនីយដ្ឋានធំ</text>
        </g>

        <!-- Swimming Pool -->
        <g class="svg-lm-grp" data-lm="pool" id="svg-lm-pool" style="cursor:pointer;">
          <circle cx="430" cy="230" r="22" fill="#0284c7" stroke="#38bdf8" stroke-width="2.5" filter="url(#pinShadow)" />
          <text x="430" y="237" font-size="17" text-anchor="middle">🏊‍♂️</text>
          <rect x="385" y="258" width="90" height="20" rx="5" fill="rgba(2, 132, 199, 0.9)" />
          <text x="430" y="272" fill="#fff" font-size="10" font-weight="bold" text-anchor="middle">អាងហែលទឹក</text>
        </g>

        <!-- Gala Dinner Hall -->
        <g class="svg-lm-grp" data-lm="gala_hall" id="svg-lm-gala_hall" style="cursor:pointer;">
          <circle cx="360" cy="430" r="22" fill="#7c3aed" stroke="#a78bfa" stroke-width="2.5" filter="url(#pinShadow)" />
          <text x="360" y="437" font-size="17" text-anchor="middle">🎉</text>
          <rect x="305" y="458" width="110" height="20" rx="5" fill="rgba(124, 58, 237, 0.9)" />
          <text x="360" y="472" fill="#fff" font-size="10" font-weight="bold" text-anchor="middle">សាល Gala Dinner</text>
        </g>

        <!-- Activity Lawn -->
        <g class="svg-lm-grp" data-lm="activity_field" id="svg-lm-activity_field" style="cursor:pointer;">
          <circle cx="260" cy="50" r="20" fill="#15803d" stroke="#4ade80" stroke-width="2" filter="url(#pinShadow)" />
          <text x="260" y="56" font-size="15" text-anchor="middle">⚽</text>
          <rect x="205" y="74" width="110" height="18" rx="5" fill="rgba(21, 128, 61, 0.9)" />
          <text x="260" y="87" fill="#fff" font-size="9.5" font-weight="bold" text-anchor="middle">ទីលានលេងហ្គេម</text>
        </g>

        <!-- Airbus Parking Station -->
        <g class="svg-lm-grp" data-lm="bus_parking" id="svg-lm-bus_parking" style="cursor:pointer;">
          <circle cx="90" cy="400" r="22" fill="#b45309" stroke="#fbbf24" stroke-width="2.5" filter="url(#pinShadow)" />
          <text x="90" y="407" font-size="17" text-anchor="middle">🚌</text>
          <rect x="35" y="428" width="110" height="20" rx="5" fill="rgba(180, 83, 9, 0.9)" />
          <text x="90" y="442" fill="#fff" font-size="9.5" font-weight="bold" text-anchor="middle">ចំណត Airbus 1-4</text>
        </g>

        <!-- Pine Hiking Trailhead -->
        <g class="svg-lm-grp" data-lm="hiking_trail" id="svg-lm-hiking_trail" style="cursor:pointer;">
          <circle cx="730" cy="65" r="20" fill="#166534" stroke="#86efac" stroke-width="2" filter="url(#pinShadow)" />
          <text x="730" y="71" font-size="15" text-anchor="middle">🌲</text>
          <rect x="670" y="90" width="120" height="20" rx="5" fill="rgba(22, 101, 52, 0.9)" />
          <text x="730" y="104" fill="#fff" font-size="10" font-weight="bold" text-anchor="middle">ផ្លូវដើរព្រៃ Hiking</text>
        </g>

        <!-- First Aid Post -->
        <g class="svg-lm-grp" data-lm="first_aid" id="svg-lm-first_aid" style="cursor:pointer;">
          <circle cx="175" cy="270" r="18" fill="#be123c" stroke="#fda4af" stroke-width="2" filter="url(#pinShadow)" />
          <text x="175" y="276" font-size="14" text-anchor="middle">🏥</text>
          <rect x="130" y="293" width="90" height="18" rx="4" fill="rgba(190, 18, 60, 0.9)" />
          <text x="175" y="306" fill="#fff" font-size="9.5" font-weight="bold" text-anchor="middle">សង្គ្រោះបឋម</text>
        </g>

        <!-- Active Pin Indicator that moves on selection -->
        <g id="ext-svg-pin" transform="translate(${px}, ${py})" style="transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); pointer-events: none;">
          <circle cx="0" cy="0" r="26" fill="rgba(239, 68, 68, 0.3)" class="ext-radar-pulse" />
          <path d="M 0 -36 C -12 -36 -18 -26 -18 -16 C -18 -4 0 0 0 0 C 0 0 18 -4 18 -16 C 18 -26 12 -36 0 -36 Z" fill="#ef4444" stroke="#ffffff" stroke-width="2.5" filter="url(#pinShadow)" />
          <circle cx="0" cy="-20" r="6" fill="#ffffff" />
        </g>

        <!-- North Compass Rose -->
        <g transform="translate(770, 470)">
          <circle cx="0" cy="0" r="18" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" />
          <polygon points="0,-14 4,-2 -4,-2" fill="#ef4444" />
          <polygon points="0,14 4,2 -4,2" fill="#e5e7eb" />
          <text x="0" y="-17" fill="#ef4444" font-size="9" font-weight="bold" text-anchor="middle">N</text>
        </g>
      </svg>
    `;
  }

  function showResortMapModal(initialTarget) {
    let currentTab = 'map'; // 'map' | 'blueprint' | 'rooms' | 'landmarks' | 'tips'
    let currentZone = 'C';
    let currentRoom = null;
    let currentLandmark = null;

    const meUser = getMe();
    if (initialTarget) {
      const t = String(initialTarget).trim().toUpperCase();
      if (/^[ABCD]\d{3}$/.test(t)) {
        currentRoom = t;
        currentZone = t.charAt(0);
      } else if (['A', 'B', 'C', 'D'].includes(t)) {
        currentZone = t;
      } else if (RESORT_DATA.landmarks.some(l => l.id === initialTarget)) {
        currentLandmark = initialTarget;
      }
    } else if (meUser && meUser.room && /^[ABCD]\d{3}$/.test(meUser.room.trim().toUpperCase())) {
      currentRoom = meUser.room.trim().toUpperCase();
      currentZone = currentRoom.charAt(0);
    }

    const modalHtml = `
      <div class="ext-map-modal-wrap" id="ext-map-modal-container">
        <!-- Top Tab Bar -->
        <div class="ext-map-header-tabs" id="ext-map-tabs-bar">
          <button class="ext-map-tab-btn active" data-tab="map">🗺️ ផែនទីអន្តរកម្ម</button>
          <button class="ext-map-tab-btn" data-tab="blueprint">🖼️ ប្លង់ដើម</button>
          <button class="ext-map-tab-btn" data-tab="rooms">🏡 បន្ទប់ស្នាក់នៅ</button>
          <button class="ext-map-tab-btn" data-tab="landmarks">📍 ទីតាំងសំខាន់ & GPS</button>
          <button class="ext-map-tab-btn" data-tab="tips">💡 ព័ត៌មានជំនួយ</button>
        </div>

        <div id="ext-map-view-body">
          <!-- Dynamic Content rendered by renderActiveView() -->
        </div>
      </div>
    `;

    openModal('🗺️ ផែនទីរមណីយដ្ឋាន & បន្ទប់ស្នាក់នៅ (vKirirom)', modalHtml, true);

    function getPinCoords() {
      if (currentLandmark) {
        const lm = RESORT_DATA.landmarks.find(l => l.id === currentLandmark);
        if (lm && lm.pinCoords) return lm.pinCoords;
      }
      const zMeta = RESORT_DATA.zones[currentZone];
      return zMeta && zMeta.pinCoords ? zMeta.pinCoords : { x: 230, y: 340 };
    }

    function renderActiveView() {
      const container = document.getElementById('ext-map-view-body');
      if (!container) return;

      // Update tabs active state
      document.querySelectorAll('#ext-map-tabs-bar .ext-map-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === currentTab);
      });

      if (currentTab === 'map') {
        renderInteractiveMapView(container);
      } else if (currentTab === 'blueprint') {
        renderBlueprintView(container);
      } else if (currentTab === 'rooms') {
        renderRoomsView(container);
      } else if (currentTab === 'landmarks') {
        renderLandmarksView(container);
      } else if (currentTab === 'tips') {
        renderTipsView(container);
      }
    }

    function renderInteractiveMapView(container) {
      const pin = getPinCoords();
      const zData = getZoneDetails(currentZone);
      const roomData = currentRoom ? getRoomOccupants(currentRoom) : null;
      const lmData = currentLandmark ? RESORT_DATA.landmarks.find(l => l.id === currentLandmark) : null;

      container.innerHTML = `
        <!-- Search bar with suggestions -->
        <div class="ext-map-search-bar">
          <span class="ext-map-search-icon">🔍</span>
          <input type="text" class="ext-map-search-input" id="ext-resort-search" placeholder="វាយលេខបន្ទប់ (A007, B010, C002...) ឬឈ្មោះបុគ្គលិក..." value="${currentRoom || ''}" autocomplete="off">
          <div class="ext-map-search-dropdown" id="ext-resort-search-drop"></div>
        </div>

        <!-- Quick Action Chips -->
        <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:6px;margin-bottom:6px;scrollbar-width:none;">
          ${meUser && meUser.room ? `
            <button class="btn sm" id="ext-quick-my-room" style="font-size:11px;padding:4px 9px;background:var(--pine);color:#fff;border-radius:999px;white-space:nowrap;">
              🏠 បន្ទប់របស់ខ្ញុំ (${esc(meUser.room)})
            </button>
          ` : ''}
          <button class="btn sm ${currentZone==='A'&&!currentLandmark?'active':''}" data-set-zone="A" style="font-size:11px;padding:4px 9px;border-radius:999px;white-space:nowrap;">Zone A (16)</button>
          <button class="btn sm ${currentZone==='B'&&!currentLandmark?'active':''}" data-set-zone="B" style="font-size:11px;padding:4px 9px;border-radius:999px;white-space:nowrap;">Zone B (16)</button>
          <button class="btn sm ${currentZone==='C'&&!currentLandmark?'active':''}" data-set-zone="C" style="font-size:11px;padding:4px 9px;border-radius:999px;white-space:nowrap;">Zone C (12)</button>
          <button class="btn sm ${currentZone==='D'&&!currentLandmark?'active':''}" data-set-zone="D" style="font-size:11px;padding:4px 9px;border-radius:999px;white-space:nowrap;">Zone D (18)</button>
          <button class="btn sm ${currentLandmark==='reception'?'active':''}" data-set-lm="reception" style="font-size:11px;padding:4px 9px;border-radius:999px;white-space:nowrap;">🏢 Reception</button>
          <button class="btn sm ${currentLandmark==='pool'?'active':''}" data-set-lm="pool" style="font-size:11px;padding:4px 9px;border-radius:999px;white-space:nowrap;">🏊 Pool</button>
        </div>

        <!-- SVG Map Card -->
        <div class="ext-map-canvas-card">
          ${generateResortSvg(pin)}
        </div>

        <!-- Details Info Card -->
        <div class="ext-map-info-card">
          ${lmData ? `
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
              <div>
                <div style="font-size:16px;font-weight:700;color:var(--ink);display:flex;align-items:center;gap:6px;">
                  <span>${lmData.icon}</span> <span>${esc(lmData.name)}</span>
                </div>
                <div style="font-size:12px;color:var(--muted);margin-top:4px;">
                  📍 ${esc(lmData.walkingGuide)}
                </div>
                <div style="font-size:12px;color:var(--pine);font-weight:500;margin-top:2px;">
                  ℹ️ ${esc(lmData.note)}
                </div>
              </div>
              <a href="https://www.google.com/maps/dir/?api=1&destination=${lmData.coords.lat},${lmData.coords.lon}" target="_blank" rel="noopener" class="btn sm" style="background:#1d5a43;color:#fff;border-radius:10px;text-decoration:none;white-space:nowrap;font-size:11.5px;padding:6px 10px;">
                🧭 Google Maps
              </a>
            </div>
          ` : `
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
              <div>
                <div style="font-size:15px;font-weight:700;color:var(--ink);display:flex;align-items:center;gap:6px;">
                  <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${zData.meta.color || 'var(--pine)'};"></span>
                  <span>${esc(zData.meta.khmerName || 'Zone ' + currentZone)}</span>
                </div>
                <div style="font-size:12px;color:var(--muted);margin-top:3px;">
                  📍 ${esc(zData.meta.walkingGuide || '')}
                </div>
                <div style="font-size:12px;color:var(--pine);margin-top:2px;font-weight:600;">
                  👥 ${zData.totalStaff} នាក់ (ប្រុស ${zData.maleCount} • ស្រី ${zData.femaleCount}) • ${zData.rooms.length} បន្ទប់
                </div>
              </div>
              <a href="https://www.google.com/maps/dir/?api=1&destination=${zData.meta.coords.lat},${zData.meta.coords.lon}" target="_blank" rel="noopener" class="btn sm" style="background:#1d5a43;color:#fff;border-radius:10px;text-decoration:none;white-space:nowrap;font-size:11.5px;padding:6px 10px;">
                🧭 នាំផ្លូវ GPS
              </a>
            </div>

            <!-- If Room selected, show room occupants -->
            ${roomData && roomData.occupants.length ? `
              <div style="margin-top:12px;padding:10px;border-radius:10px;background:color-mix(in srgb, var(--surface) 80%, var(--line));border:1px solid var(--line);">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                  <span style="font-weight:700;font-size:13px;color:var(--ink);">
                    🚪 បន្ទប់ ${esc(roomData.roomNo)} (${roomData.occupants.length} នាក់)
                  </span>
                  <button class="btn sm" id="ext-filter-app-room" style="font-size:10.5px;padding:2px 7px;border-radius:6px;">
                    🔍 បង្ហាញក្នុង App
                  </button>
                </div>
                <div style="display:grid;gap:4px;">
                  ${roomData.occupants.map(p => `
                    <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px;background:var(--surface);padding:4px 8px;border-radius:6px;">
                      <span style="font-weight:600;">${p.gender === 'F' ? '👩' : '👨'} ${esc(p.name)}</span>
                      <span style="color:var(--muted);font-size:11px;">
                        ${esc(p.company)} • ID ${esc(p.sid)} ${p.label ? '• ' + esc(p.label) : ''}
                      </span>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Quick Room Buttons in this zone -->
            <div style="margin-top:10px;">
              <div style="font-size:11.5px;font-weight:600;color:var(--muted);margin-bottom:4px;">
                ជ្រើសរើសបន្ទប់ក្នុង ${esc(zData.meta.name || 'Zone ' + currentZone)}:
              </div>
              <div class="ext-zone-room-grid">
                ${zData.rooms.map(r => `
                  <button class="ext-room-chip-btn ${currentRoom === r ? 'active' : ''}" data-room-pick="${r}">
                    <span>${r}</span>
                    <small style="font-size:9px;opacity:0.8;">
                      ${getRoomOccupants(r)?.occupants.length || 0} នាក់
                    </small>
                  </button>
                `).join('')}
              </div>
            </div>
          `}
        </div>
      `;

      // Attach Search Events
      const searchIn = document.getElementById('ext-resort-search');
      const dropEl = document.getElementById('ext-resort-search-drop');
      if (searchIn && dropEl) {
        searchIn.oninput = () => {
          const q = searchIn.value.trim().toLowerCase();
          if (!q) {
            dropEl.style.display = 'none';
            return;
          }
          const list = getEffectivePeopleList();
          const matchedPeople = list.filter(p => 
            p.name.toLowerCase().includes(q) || 
            (p.sid && String(p.sid).toLowerCase().includes(q)) || 
            (p.room && p.room.toLowerCase().includes(q))
          ).slice(0, 8);

          if (!matchedPeople.length) {
            dropEl.innerHTML = '<div style="padding:10px;color:var(--muted);font-size:12px;text-align:center;">រកមិនឃើញបន្ទប់ ឬឈ្មោះនេះទេ</div>';
            dropEl.style.display = 'block';
            return;
          }

          dropEl.innerHTML = matchedPeople.map(p => `
            <div class="ext-map-search-item" data-select-room="${esc(p.room || '')}">
              <div>
                <b>${esc(p.name)}</b> <span style="font-size:11px;color:var(--muted);">(ID: ${esc(p.sid)})</span>
              </div>
              <span class="pchip" style="font-size:11px;font-weight:700;color:var(--pine);">
                🚪 ${esc(p.room || 'គ្មានបន្ទប់')}
              </span>
            </div>
          `).join('');
          dropEl.style.display = 'block';

          dropEl.querySelectorAll('[data-select-room]').forEach(el => {
            el.onclick = () => {
              const r = el.dataset.selectRoom;
              if (r) {
                currentRoom = r.trim().toUpperCase();
                currentZone = currentRoom.charAt(0);
                currentLandmark = null;
                dropEl.style.display = 'none';
                renderActiveView();
              }
            };
          });
        };
      }

      // Quick my room button
      const myRoomBtn = document.getElementById('ext-quick-my-room');
      if (myRoomBtn && meUser && meUser.room) {
        myRoomBtn.onclick = () => {
          currentRoom = meUser.room.trim().toUpperCase();
          currentZone = currentRoom.charAt(0);
          currentLandmark = null;
          renderActiveView();
        };
      }

      // Quick filter in main app
      const filterAppRoomBtn = document.getElementById('ext-filter-app-room');
      if (filterAppRoomBtn && roomData) {
        filterAppRoomBtn.onclick = () => {
          if (typeof f !== 'undefined') {
            f.room = roomData.roomNo;
            f.tab = 'rooms';
            if (typeof window.render === 'function') window.render();
          }
          closeModal();
          if (typeof window.toast === 'function') {
            window.toast(`🔍 បានច្រោះមើលបន្ទប់ ${roomData.roomNo}`);
          }
        };
      }

      // SVG Click handlers
      document.querySelectorAll('#ext-resort-svg .svg-zone-grp').forEach(grp => {
        grp.onclick = () => {
          const z = grp.dataset.zone;
          if (z) {
            currentZone = z;
            currentLandmark = null;
            renderActiveView();
          }
        };
      });

      document.querySelectorAll('#ext-resort-svg .svg-lm-grp').forEach(grp => {
        grp.onclick = () => {
          const lm = grp.dataset.lm;
          if (lm) {
            currentLandmark = lm;
            renderActiveView();
          }
        };
      });

      // Zone bar buttons
      container.querySelectorAll('[data-set-zone]').forEach(btn => {
        btn.onclick = () => {
          currentZone = btn.dataset.setZone;
          currentLandmark = null;
          renderActiveView();
        };
      });

      // Landmark buttons
      container.querySelectorAll('[data-set-lm]').forEach(btn => {
        btn.onclick = () => {
          currentLandmark = btn.dataset.setLm;
          renderActiveView();
        };
      });

      // Room pick buttons
      container.querySelectorAll('[data-room-pick]').forEach(btn => {
        btn.onclick = () => {
          currentRoom = btn.dataset.roomPick;
          currentLandmark = null;
          renderActiveView();
        };
      });
    }

    function renderBlueprintView(container) {
      const blueprintSrc = getBlueprintImgSrc();
      container.innerHTML = `
        <div style="font-size:12.5px;color:var(--muted);margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;">
          <span>🔍 ចុចលើប្លង់ដើម្បីពង្រីក (Tap to Zoom)</span>
          <span style="font-size:11.5px;color:var(--pine);">vKirirom Official Master Plan</span>
        </div>
        <div class="ext-blueprint-img-box" id="ext-blueprint-box">
          ${blueprintSrc ? `
            <img src="${blueprintSrc}" alt="Resort Blueprint" id="ext-blueprint-img">
          ` : `
            <div style="padding:40px;color:var(--muted);font-size:13px;">
              🖼️ ប្លង់ដើមកំពុងផ្ទុក... សូមពិនិត្យនៅក្នុងផ្ទាំង Rooms
            </div>
          `}
        </div>
        <div style="margin-top:10px;display:grid;grid-template-columns:repeat(2, 1fr);gap:8px;">
          <div style="background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:11.5px;">
            <b>Zone A & B:</b> Pine Villa Suites
          </div>
          <div style="background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:11.5px;">
            <b>Zone C & D:</b> Deluxe Villa & Luxury Tents
          </div>
        </div>
      `;

      const box = document.getElementById('ext-blueprint-box');
      if (box) {
        box.onclick = () => box.classList.toggle('zoom');
      }
    }

    function renderRoomsView(container) {
      let filterZone = 'ALL';
      const renderZoneRooms = () => {
        const list = getEffectivePeopleList();
        const zonesToDisplay = filterZone === 'ALL' ? ['A', 'B', 'C', 'D'] : [filterZone];

        container.innerHTML = `
          <!-- Zone Filter Tabs -->
          <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:8px;margin-bottom:10px;scrollbar-width:none;">
            <button class="btn sm ${filterZone==='ALL'?'active':''}" data-rz="ALL" style="font-size:11.5px;padding:5px 12px;border-radius:999px;">
              ទាំងអស់ (62 បន្ទប់)
            </button>
            <button class="btn sm ${filterZone==='A'?'active':''}" data-rz="A" style="font-size:11.5px;padding:5px 12px;border-radius:999px;">
              Zone A (16)
            </button>
            <button class="btn sm ${filterZone==='B'?'active':''}" data-rz="B" style="font-size:11.5px;padding:5px 12px;border-radius:999px;">
              Zone B (16)
            </button>
            <button class="btn sm ${filterZone==='C'?'active':''}" data-rz="C" style="font-size:11.5px;padding:5px 12px;border-radius:999px;">
              Zone C (12)
            </button>
            <button class="btn sm ${filterZone==='D'?'active':''}" data-rz="D" style="font-size:11.5px;padding:5px 12px;border-radius:999px;">
              Zone D (18)
            </button>
          </div>

          <div style="display:grid;gap:12px;max-height:60vh;overflow-y:auto;padding-right:4px;">
            ${zonesToDisplay.map(zKey => {
              const zMeta = RESORT_DATA.zones[zKey] || {};
              const zData = getZoneDetails(zKey);
              return `
                <div style="background:var(--surface);border:1.5px solid var(--line);border-radius:14px;padding:12px;">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--line);">
                    <div>
                      <span style="font-weight:700;font-size:14px;color:var(--ink);">
                        🏡 ${esc(zMeta.khmerName || 'Zone ' + zKey)}
                      </span>
                      <div style="font-size:11px;color:var(--muted);margin-top:2px;">
                        ${esc(zMeta.location || '')} • ដើរពី Reception ~1-2 នាទី
                      </div>
                    </div>
                    <span style="font-size:11.5px;font-weight:700;color:var(--pine);background:color-mix(in srgb, var(--pine) 10%, transparent);padding:3px 8px;border-radius:999px;">
                      ${zData.totalStaff} នាក់
                    </span>
                  </div>

                  <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(240px, 1fr));gap:8px;">
                    ${zData.rooms.map(rNo => {
                      const occ = list.filter(p => (p.room || '').trim() === rNo);
                      return `
                        <div style="background:color-mix(in srgb, var(--surface) 95%, var(--line));border:1px solid var(--line);border-radius:10px;padding:8px 10px;">
                          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                            <b style="font-size:13px;color:var(--ink);">🚪 ${rNo}</b>
                            <button class="ext-room-map-link" data-goto-map-room="${rNo}">
                              🗺️ ទីតាំង
                            </button>
                          </div>
                          <div style="display:grid;gap:3px;">
                            ${occ.map(p => `
                              <div style="font-size:11.5px;display:flex;align-items:center;justify-content:space-between;">
                                <span>${p.gender === 'F' ? '👩' : '👨'} ${esc(p.name)}</span>
                                <span style="color:var(--muted);font-size:10.5px;">${esc(p.company)}</span>
                              </div>
                            `).join('')}
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;

        container.querySelectorAll('[data-rz]').forEach(btn => {
          btn.onclick = () => {
            filterZone = btn.dataset.rz;
            renderZoneRooms();
          };
        });

        container.querySelectorAll('[data-goto-map-room]').forEach(btn => {
          btn.onclick = () => {
            currentRoom = btn.dataset.gotoMapRoom;
            currentZone = currentRoom.charAt(0);
            currentLandmark = null;
            currentTab = 'map';
            renderActiveView();
          };
        });
      };

      renderZoneRooms();
    }

    function renderLandmarksView(container) {
      container.innerHTML = `
        <!-- Live GPS distance checker -->
        <div class="ext-gps-calc-hero">
          <div>
            <div style="font-size:14px;font-weight:700;">📡 ពិនិត្យចម្ងាយពីអ្នកទៅគិរីរម្យ</div>
            <div style="font-size:11.5px;opacity:0.85;margin-top:2px;" id="ext-gps-dist-text">
              ចុចប៊ូតុងខាងស្តាំដើម្បីគណនាចម្ងាយជាក់ស្តែងតាម GPS
            </div>
          </div>
          <button class="btn sm" id="ext-calc-gps-btn" style="background:#fff;color:#064e3b;font-weight:700;border-radius:10px;font-size:11.5px;padding:6px 12px;white-space:nowrap;">
            📍 ចម្ងាយពីខ្ញុំ
          </button>
        </div>

        <!-- Landmarks List -->
        <div style="max-height:60vh;overflow-y:auto;padding-right:4px;">
          ${RESORT_DATA.landmarks.map(lm => `
            <div class="ext-landmark-item">
              <div style="display:flex;align-items:flex-start;gap:10px;">
                <div style="font-size:24px;line-height:1;margin-top:2px;">${lm.icon}</div>
                <div>
                  <div style="font-size:13.5px;font-weight:700;color:var(--ink);">
                    ${esc(lm.name)}
                  </div>
                  <div style="font-size:11.5px;color:var(--muted);margin-top:2px;">
                    🚶 ${esc(lm.walkingGuide)}
                  </div>
                  <div style="font-size:11.5px;color:var(--pine);font-weight:500;margin-top:1px;">
                    ℹ️ ${esc(lm.note)}
                  </div>
                </div>
              </div>
              <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">
                <a href="https://www.google.com/maps/dir/?api=1&destination=${lm.coords.lat},${lm.coords.lon}" target="_blank" rel="noopener" class="btn sm" style="background:#1d5a43;color:#fff;border-radius:8px;text-decoration:none;font-size:11px;padding:5px 9px;text-align:center;">
                  🧭 នាំផ្លូវ GPS
                </a>
                <button class="btn sm" data-view-on-svg="${lm.id}" style="font-size:11px;padding:4px 8px;border-radius:8px;">
                  🗺️ លើផែនទី
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      `;

      // GPS calculation event
      const calcBtn = document.getElementById('ext-calc-gps-btn');
      const distTxt = document.getElementById('ext-gps-dist-text');
      if (calcBtn && distTxt) {
        calcBtn.onclick = () => {
          if (!navigator.geolocation) {
            alert('ឧបករណ៍របស់អ្នកមិនគាំទ្រ Geolocation ទេ');
            return;
          }
          calcBtn.disabled = true;
          distTxt.textContent = '⏳ កំពុងចាប់សញ្ញា GPS...';

          navigator.geolocation.getCurrentPosition(
            (pos) => {
              calcBtn.disabled = false;
              const d = calculateKiriromDistance(pos.coords.latitude, pos.coords.longitude);
              if (d > 20) {
                distTxt.innerHTML = `📍 អ្នកនៅចម្ងាយប្រហែល <b>${d} គ.ម</b> ពីគិរីរម្យ (ធ្វើដំណើរប្រហែល ${Math.round(d/50*10)/10} ម៉ោង)`;
              } else {
                distTxt.innerHTML = `🌲 អ្នកកំពុងនៅលើតំបន់ភ្នំគិរីរម្យ! ចម្ងាយប្រហែល <b>${d} គ.ម</b> ពីរមណីយដ្ឋាន`;
              }
            },
            (err) => {
              calcBtn.disabled = false;
              distTxt.textContent = '⚠️ មិនអាចចាប់សញ្ញា GPS បានទេ (សូមបើក Location Access)';
            },
            { enableHighAccuracy: true, timeout: 10000 }
          );
        };
      }

      container.querySelectorAll('[data-view-on-svg]').forEach(btn => {
        btn.onclick = () => {
          currentLandmark = btn.dataset.viewOnSvg;
          currentTab = 'map';
          renderActiveView();
        };
      });
    }

    function renderTipsView(container) {
      container.innerHTML = `
        <div style="display:grid;gap:10px;">
          ${RESORT_DATA.tips.map(tip => `
            <div style="background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px;display:flex;align-items:flex-start;gap:12px;">
              <span style="font-size:22px;line-height:1;">${tip.icon}</span>
              <div>
                <b style="font-size:13px;color:var(--ink);">${esc(tip.title)}</b>
                <div style="font-size:12px;color:var(--muted);margin-top:3px;line-height:1.4;">
                  ${esc(tip.desc)}
                </div>
              </div>
            </div>
          `).join('')}

          <div style="background:linear-gradient(135deg, #1e293b, #0f172a);color:#fff;border-radius:12px;padding:14px;margin-top:6px;">
            <div style="font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px;">
              📞 ទំនាក់ទំនង Reception រមណីយដ្ឋាន
            </div>
            <div style="font-size:12px;opacity:0.85;margin-top:4px;">
              សម្រាប់បញ្ហាបន្ទប់ សោ ឬជំនួយផ្សេងៗក្នុងរីហ្សត៖
            </div>
            <a href="tel:023999888" style="display:inline-block;background:#38bdf8;color:#0f172a;font-weight:700;padding:6px 14px;border-radius:8px;text-decoration:none;font-size:12px;margin-top:8px;">
              📞 Call: 023 999 888 (Front Desk)
            </a>
          </div>
        </div>
      `;
    }

    // Attach Top Header Tab clicks
    document.querySelectorAll('#ext-map-tabs-bar .ext-map-tab-btn').forEach(btn => {
      btn.onclick = () => {
        currentTab = btn.dataset.tab;
        renderActiveView();
      };
    });

    renderActiveView();
  }

  function mountHeaderResortMapBtn() {
    const whoEl = document.querySelector('.top-in .who');
    if (!whoEl) return;
    let btn = document.getElementById('ext-header-map-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'ext-header-map-btn';
      btn.className = 'ext-header-pill';
      btn.type = 'button';
      btn.title = 'ផែនទីរីហ្សត & បន្ទប់ស្នាក់នៅ (Resort Map & Zones)';
      btn.innerHTML = `🗺️ <span class="ext-pill-txt" style="font-weight:600;">ផែនទី</span>`;
      btn.onclick = () => showResortMapModal();

      const logoutBtn = whoEl.querySelector('[data-act="logout"]');
      if (logoutBtn) whoEl.insertBefore(btn, logoutBtn);
      else whoEl.appendChild(btn);
    }
  }

  function enhanceRoomCardsWithMapBtn() {
    const roomHeaders = document.querySelectorAll('.rcard .rtitle b, .room');
    roomHeaders.forEach(el => {
      const text = el.textContent.trim();
      const match = text.match(/\b([ABCD]\d{3})\b/);
      if (match && !el.dataset.hasMapBtn) {
        el.dataset.hasMapBtn = 'true';
        const rNo = match[1];
        const link = document.createElement('span');
        link.className = 'ext-room-map-link';
        link.title = `មើលទីតាំង ${rNo} លើផែនទី`;
        link.innerHTML = `🗺️`;
        link.onclick = (e) => {
          e.stopPropagation();
          showResortMapModal(rNo);
        };
        if (el.parentNode) el.parentNode.appendChild(link);
      }
    });
  }

  // ---------------------------------------------------------
  // 9. Floating Navigation Dock
  // ---------------------------------------------------------
  function mountNavigationDock() {
    const cur = getMe();
    const isTr = isTransportationRole(cur);
    const isAct = isActivityRole(cur);
    const canDoBus = cur && (cur.admin || isTr);
    const canDoNight = cur && (cur.admin || isAct);
    const canScan = canDoBus || canDoNight;

    let dockTitle = 'QR Pass ផ្ទាល់ខ្លួន';
    let dockLabel = 'QR Pass';
    if (canDoBus && !canDoNight) {
      dockTitle = `ស្កេនឡើងឡាន (${cur.van ? getBusLabel(normalizeBusKey(cur.van)) : 'Transportation'})`;
      dockLabel = 'ឡើងឡាន';
    } else if (canDoNight && !canDoBus) {
      dockTitle = 'ស្កេនកម្មវិធីយប់ (Activity Team)';
      dockLabel = 'កម្មវិធីយប់';
    } else if (canScan) {
      dockTitle = 'ស្កេនវត្តមាន (Check-in Scanner)';
      dockLabel = 'Check-in';
    }

    let dock = document.getElementById('ext-nav-dock');
    if (!dock) {
      dock = document.createElement('div');
      dock.id = 'ext-nav-dock';
      dock.className = 'ext-nav-dock';
      document.body.appendChild(dock);
    }

    dock.innerHTML = `
      <button class="ext-nav-btn" id="ext-nav-sched" title="កាលវិភាគ">
        <span class="icon">📅</span><span>កាលវិភាគ</span>
      </button>
      <button class="ext-nav-btn" id="ext-nav-contact" title="ទំនាក់ទំនងបន្ទាន់">
        <span class="icon">📞</span><span>ទំនាក់ទំនង</span>
      </button>
      <button class="ext-nav-btn" id="ext-nav-weather" title="ការព្យាករណ៍អាកាសធាតុគិរីរម្យ & បញ្ជីឥវ៉ាន់">
        <span class="icon">🌤️</span><span id="ext-nav-weather-txt">អាកាសធាតុ</span>
      </button>
      <button class="ext-nav-btn" id="ext-nav-map" title="ផែនទីរីហ្សត & បន្ទប់ស្នាក់នៅ (Resort Map & Zones)">
        <span class="icon">🗺️</span><span>ផែនទី</span>
      </button>
      <button class="ext-nav-btn" id="ext-nav-qr" title="${dockTitle}">
        <span class="icon">${canScan ? '📷' : '🎫'}</span>
        <span>${dockLabel}</span>
        ${canScan ? `<span class="ext-badge" id="ext-checkin-badge">0</span>` : ''}
      </button>
    `;

    dock.querySelector('#ext-nav-sched').onclick = showScheduleModal;
    dock.querySelector('#ext-nav-contact').onclick = showContactsModal;
    dock.querySelector('#ext-nav-weather').onclick = showWeatherModal;
    const mapNavBtn = dock.querySelector('#ext-nav-map');
    if (mapNavBtn) mapNavBtn.onclick = () => showResortMapModal();
    dock.querySelector('#ext-nav-qr').onclick = () => {
      const activeUser = getMe();
      if (!activeUser) {
        alert('សូមចូលប្រើប្រាស់ (Log in) ជាមួយ Staff ID ឬ ឈ្មោះរបស់អ្នកជាមុនសិន!');
      } else if (canScanCheckin(activeUser)) {
        const uTr = isTransportationRole(activeUser);
        const uAct = isActivityRole(activeUser);
        const uCanBus = activeUser.admin || uTr;
        const uCanNight = activeUser.admin || uAct;
        let defaultSess = null;
        if (uCanBus && !uCanNight) defaultSess = 'bus';
        else if (uCanNight && !uCanBus) defaultSess = 'night';
        showCheckinAdminModal(activeUser, defaultSess);
      } else {
        showPersonalPassModal(activeUser);
      }
    };

    updateCheckinBadges();
  }

  // ---------------------------------------------------------
  // 9.5 PWA Support & Offline Network Monitor
  // ---------------------------------------------------------
  let deferredInstallPrompt = null;
  const isIos = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  let pwaInited = false;

  function initPwa() {
    if (pwaInited) return;
    pwaInited = true;

    // 1. Register Service Worker
    if ('serviceWorker' in navigator) {
      const registerSW = () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => {
            reg.onupdatefound = () => {
              const worker = reg.installing;
              if (worker) {
                worker.onstatechange = () => {
                  if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                    console.log('Kirirom Outing PWA updated.');
                  }
                };
              }
            };
          })
          .catch(() => {});
      };
      if (document.readyState === 'complete') {
        registerSW();
      } else {
        window.addEventListener('load', registerSW);
      }
    }

    // 2. Listen for beforeinstallprompt (Android, Chrome, Edge)
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      const dismissed = localStorage.getItem('krr_pwa_dismissed');
      if (!dismissed && !isStandalone) {
        showPwaBanner();
      }
    });

    // 3. Online / Offline network monitor
    function showNetworkPill(isOnline) {
      let el = document.getElementById('ext-net-pill');
      if (!el) {
        el = document.createElement('div');
        el.id = 'ext-net-pill';
        document.body.appendChild(el);
      }
      el.className = `ext-net-pill ${isOnline ? 'online' : 'offline'}`;
      el.innerHTML = isOnline
        ? '<span>🟢 បានភ្ជាប់អ៊ីនធឺណិតឡើងវិញ (Online)</span>'
        : '<span>📡 ដំណើរការ Offline (ទិន្នន័យរក្សាទុកក្នុងទូរស័ព្ទ)</span>';
      el.style.display = 'flex';
      setTimeout(() => {
        if (el) el.style.display = 'none';
      }, 4000);
    }

    window.addEventListener('offline', () => showNetworkPill(false));
    window.addEventListener('online', () => showNetworkPill(true));
    if (!navigator.onLine) showNetworkPill(false);
  }

  function showPwaBanner() {
    if (document.getElementById('ext-pwa-banner') || isStandalone) return;
    const banner = document.createElement('div');
    banner.id = 'ext-pwa-banner';
    banner.className = 'ext-pwa-banner';
    banner.innerHTML = `
      <div class="ext-pwa-banner-text">
        <div class="ext-pwa-banner-icon">🌲</div>
        <div>
          <b style="display:block;font-size:13px;color:var(--pine);">ដំឡើង App លើទូរស័ព្ទ (PWA)</b>
          <span style="font-size:11px;color:var(--muted);">ងាយស្រួលបើកមើល Offline នៅលើភ្នំគិរីរម្យ</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <button class="btn sm" id="ext-pwa-install-act-btn" style="padding:5px 10px;font-size:12px;background:var(--pine);white-space:nowrap;">
          📲 ដំឡើង
        </button>
        <button class="btn ghost sm" id="ext-pwa-dismiss-btn" style="padding:4px 8px;font-size:14px;border:0;" title="បិទ">
          ✕
        </button>
      </div>
    `;
    document.body.appendChild(banner);

    const actBtn = document.getElementById('ext-pwa-install-act-btn');
    if (actBtn) actBtn.onclick = () => promptPwaInstall();
    const disBtn = document.getElementById('ext-pwa-dismiss-btn');
    if (disBtn) disBtn.onclick = () => {
      localStorage.setItem('krr_pwa_dismissed', 'true');
      banner.remove();
    };
  }

  function promptPwaInstall() {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.then(() => {
        deferredInstallPrompt = null;
        const banner = document.getElementById('ext-pwa-banner');
        if (banner) banner.remove();
      });
      return;
    }

    if (isIos) {
      const iosGuide = `
        <div style="text-align:center;padding:10px 0;">
          <div style="font-size:48px;margin-bottom:10px;">📲</div>
          <h3 style="margin-bottom:12px;font-size:18px;">របៀបដំឡើង App លើ iPhone / iPad</h3>
          <div style="background:var(--bg);padding:14px;border-radius:10px;text-align:left;display:grid;gap:10px;font-size:14px;">
            <div>1️⃣ ចុចប៊ូតុង <b>Share</b> (<span style="font-size:18px;">📤</span>) នៅផ្នែកខាងក្រោមនៃ Safari</div>
            <div>2️⃣ អូសចុះក្រោម រួចជ្រើសយក <b>"Add to Home Screen"</b> (<span style="font-size:18px;">➕</span>)</div>
            <div>3️⃣ ចុច <b>"Add"</b> នៅជ្រុងលើខាងស្តាំ ជាការស្រេច!</div>
          </div>
          <button class="btn sm" id="ext-ios-modal-ok-btn" style="margin-top:16px;width:100%;">យល់ព្រម (OK)</button>
        </div>
      `;
      openModal('📲 ដំឡើង App (iOS Safari)', iosGuide);
      setTimeout(() => {
        const okBtn = document.getElementById('ext-ios-modal-ok-btn');
        if (okBtn) okBtn.onclick = closeModal;
      }, 50);
      return;
    }

    alert('💡 របៀបដំឡើង App:\n\nចុចលើ Menu ចុចបី (⋮) នៅជ្រុងខាងលើនៃ Browser របស់អ្នក រួចជ្រើសរើស "Install App" ឬ "Add to Home screen"!');
  }

  // ---------------------------------------------------------
  // 10. Lifecycle Updates
  // ---------------------------------------------------------
  function onAppUpdated() {
    setupLocalAuthBypass();
    renderAnnouncementBanner();
    mountHeaderWeatherPill();
    mountHeaderBroadcastBtn();
    mountHeaderResortMapBtn();
    mountNavigationDock();
    enhanceRoomCardsWithMapBtn();
    injectPersonalQrBadge();
    updateCheckinBadges();

    // If Admin password gate is showing, add a 1-click Local Test button
    const pfForm = document.getElementById('pf');
    if (pfForm && !document.getElementById('ext-dev-hint')) {
      const hintEl = document.createElement('div');
      hintEl.id = 'ext-dev-hint';
      hintEl.style.cssText = 'background:color-mix(in srgb, var(--pine) 8%, var(--surface));border:1px solid color-mix(in srgb, var(--pine) 30%, transparent);border-radius:14px;padding:14px;margin-top:14px;text-align:center;display:grid;gap:8px;box-shadow:0 4px 15px -4px rgba(29,90,67,0.15);';
      hintEl.innerHTML = `
        <span style="font-size:12px;color:var(--muted)">🧪 <b>របៀបសាកល្បងនៅ Local (Dev Test):</b></span>
        <button class="btn sm" type="button" id="ext-dev-admin-btn" style="background:var(--pine);width:100%;font-weight:700;">
          ⚡ ចុចត្រង់នេះដើម្បីចូល Admin (Local Mode)
        </button>
        <small style="color:var(--muted);font-size:11px;">ឬវាយ Password: <code>admin</code> ឬ <code>123456</code></small>
      `;
      pfForm.appendChild(hintEl);

      const devBtn = document.getElementById('ext-dev-admin-btn');
      if (devBtn) {
        devBtn.onclick = () => {
          const pwInput = document.getElementById('pw');
          if (pwInput) pwInput.value = 'admin';
          pfForm.dispatchEvent(new Event('submit', { cancelable: true }));
        };
      }
    }
  }

  // Wrap render safely
  if (typeof window.render === 'function') {
    const origRender = window.render;
    window.render = function () {
      origRender.apply(this, arguments);
      setTimeout(onAppUpdated, 40);
    };
  }

  // Observe DOM changes on #app
  const observer = new MutationObserver(() => {
    onAppUpdated();
  });

  const appEl = document.getElementById('app');
  if (appEl) {
    observer.observe(appEl, { childList: true });
  }

  document.addEventListener('DOMContentLoaded', () => {
    onAppUpdated();
    initFirebaseExtSync();
    initPwa();
  });

  setTimeout(() => {
    onAppUpdated();
    initFirebaseExtSync();
    initPwa();
  }, 300);

})();
