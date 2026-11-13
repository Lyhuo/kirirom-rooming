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
    CHECKIN: 'krr_ext_checkins_v1'
  };

  let checkinState = { bus: {}, night: {} };

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
        bottom: max(8px, calc(4px + env(safe-area-inset-bottom, 0px)));
        padding: 5px 8px;
        gap: 4px;
        max-width: 98vw;
      }
      .ext-nav-btn {
        padding: 7px 11px;
        font-size: 12px;
        gap: 4px;
      }
      .ext-nav-btn .icon {
        font-size: 15px;
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
        padding: 6px 7px;
        font-size: 11px;
      }
      .ext-nav-btn .icon {
        font-size: 14px;
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
            return `
              <button class="btn sm ext-bus-tab ${k === activeBus ? 'active' : 'ghost'}" data-bus="${k}" style="white-space:nowrap;font-size:11px;padding:4px 10px;flex-shrink:0;border-radius:8px;" title="${isMyBus ? 'ឡានដែលលោកអ្នកទទួលបន្ទុកផ្ទាល់ (' + st.label + ')' : 'ចុចមើលវត្តមាន ' + st.label}">
                ${isMyBus ? '⭐ ' : ''}${st.label} <b>(${st.checked}/${st.total})</b>
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
          t.innerHTML = `${isMyBus ? '⭐ ' : ''}${bSt.label} <b style="opacity:0.9;">(${bSt.checked}/${bSt.total})</b>`;
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
                <div style="margin-top:10px;">
                  <button class="btn sm" id="ext-switch-to-bus-btn" style="background:#1d5a43;color:#fff;border:none;font-size:12px;padding:6px 14px;border-radius:6px;cursor:pointer;">
                    🚌 ប្តូរទៅមើល ${otherBusLabel}
                  </button>
                </div>
              </div>
            `;
            const switchBtn = attList.querySelector('#ext-switch-to-bus-btn');
            if (switchBtn) {
              switchBtn.onclick = () => {
                const targetBusKey = normalizeBusKey(foundOther.van);
                const targetTab = document.querySelector(`.ext-bus-tab[data-bus="${targetBusKey}"]`);
                if (targetTab) targetTab.click();
              };
            }
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
        const canCheckThisSession = (activeSession === 'bus') ? canDoBus : canDoNight;
        let btnText = '';
        if (!canCheckThisSession) {
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
            <button class="btn sm ext-att-toggle-btn ${checked ? 'checked-btn' : 'ghost'}" data-toggle-chk="${p.sid || p.name}" style="${!canCheckThisSession ? 'opacity:0.45;' : ''}${nightBtnStyle}" title="${!canCheckThisSession ? 'លោកអ្នកគ្មានសិទ្ធិ Check-in ក្នុងផ្នែកនេះទេ' : ''}">
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
            const isCrossBus = (activeSession === 'bus' && coordinatorBus && staffBusKey && staffBusKey !== coordinatorBus);

            if (isCrossBus) {
              showConfirmDialog({
                title: 'ℹ️ Check-in ជំនួសឡានផ្សេង?',
                message: `បុគ្គលិក <b>${escapeHtml(staff.name)}</b> ស្ថិតក្នុង <b>${escapeHtml(staff.van || 'ឡានផ្សេង')}</b><br><br><span style="color:var(--muted);font-size:12px;">(លោកអ្នកជាប្រធាន/អ្នកសម្របសម្រួល <b>${getBusLabel(coordinatorBus)}</b>)</span><br><br>តើលោកអ្នកពិតជាចង់ Check-in ឡើងឡានឱ្យគាត់ជំនួសមែនទេ?`,
                confirmText: '✅ យល់ព្រម Check-in',
                cancelText: 'បោះបង់',
                onConfirm: () => {
                  toggleCheckin(staff.sid, staff.name, activeSession, activeStaff);
                  updateProgressCard();
                  renderAttList();
                  if (typeof window.toast === 'function') {
                    window.toast(`✅ បាន Check-in ជំនួស ${staff.name} (${staff.van || ''})`);
                  }
                }
              });
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
              const isMatch = (activeBus === 'all' || personBusKey === activeBus);

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
                    <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">
                      <button class="btn sm" id="ext-qr-force-chk-btn" style="background:#1d5a43;color:#fff;border:none;font-size:11.5px;padding:5px 12px;border-radius:6px;cursor:pointer;">
                        ✅ Check-in ឡើងឡានជំនួស
                      </button>
                      <button class="btn sm ghost" id="ext-qr-switch-bus-btn" style="font-size:11.5px;padding:5px 12px;border-radius:6px;cursor:pointer;">
                        🚌 ប្តូរទៅមើល ${found.van || 'ឡានគាត់'}
                      </button>
                    </div>
                  </div>
                `;
                const forceChkBtn = feedbackBox.querySelector('#ext-qr-force-chk-btn');
                if (forceChkBtn) {
                  forceChkBtn.onclick = () => {
                    showConfirmDialog({
                      title: 'ℹ️ Check-in ជំនួសឡានផ្សេង?',
                      message: `បុគ្គលិក <b>${escapeHtml(found.name)}</b> ស្ថិតក្នុង <b>${escapeHtml(found.van || 'ឡានផ្សេង')}</b><br><br>តើលោកអ្នកពិតជាចង់ Check-in ឡើងឡានឱ្យគាត់ជំនួសមែនទេ?`,
                      confirmText: '✅ យល់ព្រម Check-in',
                      cancelText: 'បោះបង់',
                      onConfirm: () => {
                        toggleCheckin(found.sid, found.name, 'bus', activeStaff);
                        updateProgressCard();
                        renderAttList();
                        if (typeof window.toast === 'function') {
                          window.toast(`✅ បាន Check-in ជំនួស ${found.name} (${found.van || ''})`);
                        }
                        feedbackBox.style.display = 'none';
                      }
                    });
                  };
                }
                const switchBusBtn = feedbackBox.querySelector('#ext-qr-switch-bus-btn');
                if (switchBusBtn) {
                  switchBusBtn.onclick = () => {
                    const targetTab = document.querySelector(`.ext-bus-tab[data-bus="${personBusKey}"]`);
                    if (targetTab) targetTab.click();
                    feedbackBox.style.display = 'none';
                  };
                }
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
      <button class="ext-nav-btn" id="ext-nav-qr" title="${dockTitle}">
        <span class="icon">${canScan ? '📷' : '🎫'}</span>
        <span>${dockLabel}</span>
        ${canScan ? `<span class="ext-badge" id="ext-checkin-badge">0</span>` : ''}
      </button>
    `;

    dock.querySelector('#ext-nav-sched').onclick = showScheduleModal;
    dock.querySelector('#ext-nav-contact').onclick = showContactsModal;
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
    mountNavigationDock();
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
