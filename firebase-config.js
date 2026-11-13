// =========================================================================
// 🌲 Kirirom Outing 2026 - Real-Time Firebase Cloud Configuration
// =========================================================================
// របៀបកំណត់៖
// 1. បង្កើតគម្រោងលើ Firebase Console (https://console.firebase.google.com/)
// 2. បង្កើត Web App (</>) រួចចម្លង Firebase Config យកមកដាក់ក្នុង firebaseConfig ខាងក្រោម
// 3. ឬលោកអ្នកអាច Paste តាមរយៈ UI "☁️ Cloud Sync" នៅក្នុងកម្មវិធីផ្ទាល់ក៏បាន។
// =========================================================================

(function () {
  // 1. ពិនិត្យមើល Config ដែលបានរក្សាទុកក្នុង LocalStorage (ពី UI Settings)
  let savedConfig = null;
  try {
    const raw = localStorage.getItem('krr_firebase_config');
    if (raw) {
      savedConfig = JSON.parse(raw);
    }
  } catch (e) {}

  // 2. Default Config (អ្នកអាចបិទភ្ជាប់ Config ផ្ទាល់នៅទីនេះប្រសិនបើចង់)
  const defaultFileConfig = {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  };

  const activeConfig = (savedConfig && savedConfig.apiKey) 
    ? savedConfig 
    : (defaultFileConfig.apiKey ? defaultFileConfig : null);

  window.FIREBASE_CONFIG = activeConfig;

  // 3. Enable Offline Persistence ស្វ័យប្រវត្តពេល Firebase ដំណើរការ
  if (window.FIREBASE_CONFIG && typeof firebase !== 'undefined' && firebase.firestore) {
    try {
      firebase.firestore().enablePersistence({ synchronizeTabs: true }).catch(err => {
        console.warn('Firestore persistence notification:', err.code);
      });
    } catch (e) {}
  }
})();
