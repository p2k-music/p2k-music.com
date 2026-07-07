         // NOTE: admin auth is now verified SERVER-SIDE (POST /api/admin/login).
         // The passcode never lives in client code anymore — see server/auth.js.
         const STORAGE_KEY = 'p2kMusicAdmin';
         const DB_NAME = 'p2kMusicDB';
         const DB_VERSION = 6;
         const SONG_PRICE = 16;
         const PREVIEW_SECONDS = Infinity;
         const ADMIN_PASSCODE = 'Nokiah199430';
         const PAYPAL_EMAIL = 'p2key1@gmail.com';

         // ── Backend API helper (same-origin; the session travels in an HttpOnly cookie) ──
         const API_BASE = '';
         let csrfToken = null;
         async function api(method, path, body) {
             const opts = { method, credentials: 'same-origin', headers: {} };
             if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
             if (csrfToken && method !== 'GET') opts.headers['X-CSRF-Token'] = csrfToken;
             const res = await fetch(API_BASE + path, opts);
             let data = null; try { data = await res.json(); } catch (e) {}
             return { ok: res.ok, status: res.status, data };
         }

         const DEFAULT_SONGS = [
             { id: 1, title: "Bluntedp2k beats", file: "audio/Bluntedp2k beats .mp3", duration: "--:--" },
             { id: 2, title: "dannyminus - BLUELINE HOTLINE - dannyminus Remix", file: "audio/dannyminus - BLUELINE HOTLINE - dannyminus Remix.mp3", duration: "--:--" },
             { id: 3, title: "DEEZY ME ! (1)", file: "audio/DEEZY ME ! (1).mp3", duration: "--:--" },
             { id: 4, title: "DEEZY ME !", file: "audio/DEEZY ME !.mp3", duration: "--:--" },
             { id: 5, title: "DEEZY ME !BY P2K DUB THIS (1)", file: "audio/DEEZY ME !BY P2K DUB THIS (1).mp3", duration: "--:--" },
             { id: 6, title: "DEEZY ME !BY P2K DUB THIS", file: "audio/DEEZY ME !BY P2K DUB THIS.mp3", duration: "--:--" },
             { id: 7, title: "DJ Meemx - ngithande kancane tonight (1)", file: "audio/DJ Meemx - ngithande kancane tonight (1).mp3", duration: "--:--" },
             { id: 8, title: "DJ Meemx - ngithande kancane tonight (2)", file: "audio/DJ Meemx - ngithande kancane tonight (2).mp3", duration: "--:--" },
             { id: 9, title: "DJ Meemx - ngithande kancane tonight (3)", file: "audio/DJ Meemx - ngithande kancane tonight (3).mp3", duration: "--:--" },
             { id: 10, title: "DJ Meemx - ngithande kancane tonight", file: "audio/DJ Meemx - ngithande kancane tonight.mp3", duration: "--:--" },
             { id: 11, title: "escape 2 the dubstep (1)", file: "audio/escape 2 the dubstep (1).mp3", duration: "--:--" },
             { id: 12, title: "Forklift Rhymebook", file: "audio/Forklift Rhymebook.mp3", duration: "--:--" },
             { id: 13, title: "Hold My Pulse", file: "audio/Hold My Pulse.mp3", duration: "--:--" },
             { id: 14, title: "iDi my name (1)", file: "audio/iDi my name _ (1).mp3", duration: "--:--" },
             { id: 15, title: "iDi my name", file: "audio/iDi my name _.mp3", duration: "--:--" },
             { id: 16, title: "ijaze DRAMAtuBIN2", file: "audio/ijaze DRAMAtuBIN2.mp3", duration: "--:--" },
             { id: 17, title: "inocent beat flopy disc 4", file: "audio/inocent beat flopy disc 4.mp3", duration: "--:--" },
             { id: 18, title: "JMHBM - Skyscraper II", file: "audio/JMHBM - Skyscraper II.mp3", duration: "--:--" },
             { id: 19, title: "Ketsa - Owned the Day", file: "audio/Ketsa - Owned the Day.mp3", duration: "--:--" },
             { id: 20, title: "Key Libertise (1)", file: "audio/Key Libertise (1).mp3", duration: "--:--" },
             { id: 21, title: "LG FLOW P2K$ imix", file: "audio/LG FLOW P2K$ imix.mp4", duration: "--:--" },
             { id: 22, title: "messwave - blink n miss - No Lead Vocals", file: "audio/messwave - blink n miss - No Lead Vocals.mp3", duration: "--:--" },
             { id: 23, title: "Mirror Walk", file: "audio/Mirror Walk.mp3", duration: "--:--" },
             { id: 24, title: "off see ican turn on (1)", file: "audio/off see _ ican turn on (1).mp3", duration: "--:--" },
             { id: 25, title: "Oppenheimer s Chain", file: "audio/Oppenheimer_s_Chain.mp3", duration: "--:--" },
             { id: 26, title: "Out of Flux - Sunny Summer (1)", file: "audio/Out of Flux - Sunny Summer (1).mp3", duration: "--:--" },
             { id: 27, title: "Out of Flux - Sunny Summer", file: "audio/Out of Flux - Sunny Summer.mp3", duration: "--:--" },
             { id: 28, title: "p2k .DJ Meemx - ngithande kancane tonight", file: "audio/p2k .DJ  Meemx - ngithande kancane tonight.mp3", duration: "--:--" },
             { id: 29, title: "p2k actualy", file: "audio/p2k actualy.mp3", duration: "--:--" },
             { id: 30, title: "p2k coming truk", file: "audio/p2k coming truk.mp3", duration: "--:--" },
             { id: 31, title: "p2k dunda tu nikupe ngoma", file: "audio/p2k dunda tu  nikupe ngoma .mp3", duration: "--:--" },
             { id: 32, title: "P2K EKA JENVA !", file: "audio/P2K EKA JENVA !.mp3", duration: "--:--" },
             { id: 33, title: "p2k icee puls (1)", file: "audio/p2k icee puls  (1).mp3", duration: "--:--" },
             { id: 34, title: "p2k manuver 4them", file: "audio/p2k manuver 4them .mp3", duration: "--:--" },
             { id: 35, title: "p2k sec verse diferrent flow Top Of The World", file: "audio/p2k sec verse diferrent flow Top Of The World.mp3", duration: "--:--" },
             { id: 36, title: "p2k spell tha money i git in", file: "audio/p2k spell tha money i git in  .mp3", duration: "--:--" },
             { id: 37, title: "p2k8 (2)", file: "audio/p2k8 (2).mp3", duration: "--:--" },
             { id: 38, title: "p2k freestyle 7", file: "audio/p2k_freestyle_7.mp3", duration: "--:--" },
             { id: 39, title: "p2k haupate", file: "audio/p2k_haupate^^.mp3", duration: "--:--" },
             { id: 40, title: "Pocket Rift", file: "audio/Pocket Rift.mp3", duration: "--:--" },
             { id: 41, title: "Riddim Reactor", file: "audio/Riddim_Reactor.mp3", duration: "--:--" },
             { id: 42, title: "second verses hip hop 1 (5)", file: "audio/second verses hip hop 1 (5).mp3", duration: "--:--" },
             { id: 43, title: "second verses hip hop 1", file: "audio/second verses hip hop 1.mp3", duration: "--:--" },
             { id: 44, title: "second verses hip hop 2", file: "audio/second verses hip hop 2.mp3", duration: "--:--" },
             { id: 45, title: "second verses hip hop 4 (1)", file: "audio/second verses hip hop 4 (1).mp3", duration: "--:--" },
             { id: 46, title: "second verses hip hop 4", file: "audio/second verses hip hop 4.mp3", duration: "--:--" },
             { id: 47, title: "second verses hiphop sp2k4 (2)", file: "audio/second verses hiphop  sp2k4 (2).mp3", duration: "--:--" },
             { id: 48, title: "second verses hiphop sp2k4 (3)", file: "audio/second verses hiphop  sp2k4 (3).mp3", duration: "--:--" },
             { id: 49, title: "second verses hiphop sp2k4 (4)", file: "audio/second verses hiphop  sp2k4 (4).mp3", duration: "--:--" },
             { id: 50, title: "second verses hiphop p2k4", file: "audio/second verses hiphop p2k4.mp3", duration: "--:--" },
             { id: 51, title: "Stop (Original Mix)", file: "audio/Stop (Original Mix).mp3", duration: "--:--" },
             { id: 52, title: "Subterfuge", file: "audio/Subterfuge.mp3", duration: "--:--" },
             { id: 53, title: "T.H.C VOL2", file: "audio/T.H.C VOL2.mp3", duration: "--:--" }
         ];

         const DEFAULT_IMAGES = [
             { id: 1, src: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500&h=500&fit=crop", title: "Studio Session 1" },
             { id: 2, src: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=500&h=500&fit=crop", title: "Performance Night" },
             { id: 3, src: "https://images.unsplash.com/photo-1520637836862-4d197d17c52a?w=500&h=500&fit=crop", title: "Behind the Scenes" },
             { id: 4, src: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=500&h=500&fit=crop", title: "Music Production" }
         ];

         // Default shows. `date` is ISO (YYYY-MM-DD); price 0 = free RSVP. sold/capacity drive "spots left".
         const DEFAULT_EVENTS = [
             { id: 'evt-tor-0814', title: "Underground Sessions", date: "2026-08-14", venue: "The Velvet", city: "Toronto, ON", price: 25, capacity: 150, sold: 138 },
             { id: 'evt-mtl-0902', title: "Bass & Beats Night", date: "2026-09-02", venue: "Club Neon", city: "Montreal, QC", price: 30, capacity: 200, sold: 96 },
             { id: 'evt-van-0920', title: "P2K Live & Direct", date: "2026-09-20", venue: "The Wave", city: "Vancouver, BC", price: 35, capacity: 120, sold: 120 },
             { id: 'evt-cal-1011', title: "Late Night Frequencies", date: "2026-10-11", venue: "Basement 9", city: "Calgary, AB", price: 20, capacity: 180, sold: 41 }
         ];

         // Default podcast episodes (audio empty until P2K uploads a file / adds a URL)
         const DEFAULT_EPISODES = [
             { id: 'ep-01', title: "Episode 1 — Underground Origins", guest: "P2K (solo)", description: "How it all started: crates, cracked software, and the first beat that actually hit.", date: '2026-07-01', audio: '' },
             { id: 'ep-02', title: "Episode 2 — In The Lab with DJ Meemx", guest: "DJ Meemx", description: "Breaking down the late-night studio sessions and the sound behind the collabs.", date: '2026-07-08', audio: '' },
             { id: 'ep-03', title: "Episode 3 — Bass, Dubstep & Where It's Going", guest: "dannyminus", description: "Two producers argue about drops, sub-bass, and the future of the underground.", date: '2026-07-15', audio: '' }
         ];

         let songs = [...DEFAULT_SONGS];
         let images = [...DEFAULT_IMAGES];
         let events = [...DEFAULT_EVENTS];
         let episodes = [...DEFAULT_EPISODES];
         let myTickets = [];
         let guestApps = [];
         let revenueLog = [];
         let listenBanked = 0;
         let currentAudio = null;
         let currentSongId = null;
         let isAdmin = false;
         let db = null;
         let purchasedSongs = new Set();
         let currentBuySongId = null;
         let currentTicketEventId = null;
         let podcastAudio = null;
         let currentPodcastId = null;
         let audioUnlocked = false;

         function encodeAudioURL(path) {
             if (path.startsWith('data:')) return path;
             const parts = path.split('/');
             return parts.map((p, i) => i === parts.length - 1 ? encodeURIComponent(p) : p).join('/');
         }

         // ── IndexedDB: persistent storage that handles large files (hundreds of MB) ──
         function openDB() {
             return new Promise((resolve, reject) => {
                 const request = indexedDB.open(DB_NAME, DB_VERSION);
                 request.onupgradeneeded = function(e) {
                     const database = e.target.result;
                     if (!database.objectStoreNames.contains('songs')) {
                         database.createObjectStore('songs', { keyPath: 'id' });
                     }
                     if (!database.objectStoreNames.contains('images')) {
                         database.createObjectStore('images', { keyPath: 'id' });
                     }
                     if (!database.objectStoreNames.contains('comments')) {
                         database.createObjectStore('comments', { keyPath: 'id' });
                     }
                     if (!database.objectStoreNames.contains('settings')) {
                         database.createObjectStore('settings', { keyPath: 'key' });
                     }
                     if (!database.objectStoreNames.contains('purchases')) {
                         database.createObjectStore('purchases', { keyPath: 'songId' });
                     }
                     if (!database.objectStoreNames.contains('news')) {
                         database.createObjectStore('news', { keyPath: 'id' });
                     }
                     if (!database.objectStoreNames.contains('events')) {
                         database.createObjectStore('events', { keyPath: 'id' });
                     }
                     if (!database.objectStoreNames.contains('tickets')) {
                         database.createObjectStore('tickets', { keyPath: 'id' });
                     }
                     if (!database.objectStoreNames.contains('podcast')) {
                         database.createObjectStore('podcast', { keyPath: 'id' });
                     }
                     if (!database.objectStoreNames.contains('guests')) {
                         database.createObjectStore('guests', { keyPath: 'id' });
                     }
                     if (!database.objectStoreNames.contains('revenue')) {
                         database.createObjectStore('revenue', { keyPath: 'id' });
                     }
                 };
                 request.onsuccess = function(e) {
                     db = e.target.result;
                     resolve(db);
                 };
                 request.onerror = function(e) {
                     console.error('IndexedDB error:', e);
                     reject(e);
                 };
             });
         }

         function dbPut(storeName, data) {
             return new Promise((resolve, reject) => {
                 if (!db) { resolve(); return; }
                 const tx = db.transaction(storeName, 'readwrite');
                 const store = tx.objectStore(storeName);
                 store.put(data);
                 tx.oncomplete = () => resolve();
                 tx.onerror = (e) => { console.warn('DB write error:', e); resolve(); };
             });
         }

         function dbDelete(storeName, id) {
             return new Promise((resolve, reject) => {
                 if (!db) { resolve(); return; }
                 const tx = db.transaction(storeName, 'readwrite');
                 const store = tx.objectStore(storeName);
                 store.delete(id);
                 tx.oncomplete = () => resolve();
                 tx.onerror = (e) => { console.warn('DB delete error:', e); resolve(); };
             });
         }

         function dbGet(storeName, key) {
             return new Promise((resolve) => {
                 if (!db) { resolve(null); return; }
                 try {
                     const tx = db.transaction(storeName, 'readonly');
                     const req = tx.objectStore(storeName).get(key);
                     req.onsuccess = () => resolve(req.result || null);
                     req.onerror = () => resolve(null);
                 } catch (e) { resolve(null); }
             });
         }

         function dbGetAll(storeName) {
             return new Promise((resolve, reject) => {
                 if (!db) { resolve([]); return; }
                 const tx = db.transaction(storeName, 'readonly');
                 const store = tx.objectStore(storeName);
                 const request = store.getAll();
                 request.onsuccess = () => resolve(request.result || []);
                 request.onerror = () => resolve([]);
             });
         }

         function dbClear(storeName) {
             return new Promise((resolve, reject) => {
                 if (!db) { resolve(); return; }
                 const tx = db.transaction(storeName, 'readwrite');
                 const store = tx.objectStore(storeName);
                 store.clear();
                 tx.oncomplete = () => resolve();
                 tx.onerror = (e) => { console.warn('DB clear error:', e); resolve(); };
             });
         }

         // Load uploaded songs/images from IndexedDB and merge with defaults
         async function loadFromDB() {
             try {
                 const savedSongs = await dbGetAll('songs');
                 const savedImages = await dbGetAll('images');

                 // Merge: defaults first, then any user-uploaded items
                 if (savedSongs.length > 0) {
                     const defaultIds = new Set(DEFAULT_SONGS.map(s => s.id));
                     const uploaded = savedSongs.filter(s => !defaultIds.has(s.id));
                     songs = [...DEFAULT_SONGS, ...uploaded];
                 } else {
                     songs = [...DEFAULT_SONGS];
                 }

                 if (savedImages.length > 0) {
                     const defaultIds = new Set(DEFAULT_IMAGES.map(i => i.id));
                     const uploaded = savedImages.filter(i => !defaultIds.has(i.id));
                     images = [...DEFAULT_IMAGES, ...uploaded];
                 } else {
                     images = [...DEFAULT_IMAGES];
                 }

                 // Load purchases
                 const savedPurchases = await dbGetAll('purchases');
                 purchasedSongs = new Set(savedPurchases.map(p => p.songId));

                 // Merge events: default shows, overlaid by saved versions (for sold counts) + admin-announced shows
                 const savedEvents = await dbGetAll('events');
                 const overrides = new Map(savedEvents.map(e => [e.id, e]));
                 const defaultEventIds = new Set(DEFAULT_EVENTS.map(e => e.id));
                 events = DEFAULT_EVENTS.map(e => overrides.get(e.id) || e)
                     .concat(savedEvents.filter(e => !defaultEventIds.has(e.id)));

                 // Load this device's tickets
                 myTickets = await dbGetAll('tickets');

                 // Merge podcast episodes (defaults overlaid by saved) + load guest applications/invites
                 const savedEpisodes = await dbGetAll('podcast');
                 const epOverrides = new Map(savedEpisodes.map(e => [e.id, e]));
                 const defaultEpIds = new Set(DEFAULT_EPISODES.map(e => e.id));
                 episodes = DEFAULT_EPISODES.map(e => epOverrides.get(e.id) || e)
                     .concat(savedEpisodes.filter(e => !defaultEpIds.has(e.id)));
                 guestApps = await dbGetAll('guests');

                 // Revenue ledger + cumulative listening earnings (for the profit dashboard)
                 revenueLog = await dbGetAll('revenue');
                 const lb = await dbGet('settings', 'listenBanked');
                 listenBanked = lb ? (Number(lb.value) || 0) : 0;

                 // Migrate any old localStorage data to IndexedDB (one-time)
                 await migrateLocalStorage();
             } catch(e) {
                 console.warn('Failed to load from IndexedDB, using defaults:', e);
                 songs = [...DEFAULT_SONGS];
                 images = [...DEFAULT_IMAGES];
             }
         }

         // One-time migration from old localStorage to IndexedDB
         async function migrateLocalStorage() {
             try {
                 const oldSongs = localStorage.getItem('p2kSongs');
                 const oldImages = localStorage.getItem('p2kImages');
                 const oldComments = localStorage.getItem('p2kComments');

                 if (oldSongs) {
                     const parsed = JSON.parse(oldSongs);
                     const defaultIds = new Set(DEFAULT_SONGS.map(s => s.id));
                     for (const song of parsed) {
                         if (!defaultIds.has(song.id)) {
                             await dbPut('songs', song);
                             if (!songs.find(s => s.id === song.id)) {
                                 songs.push(song);
                             }
                         }
                     }
                     localStorage.removeItem('p2kSongs');
                 }

                 if (oldImages) {
                     const parsed = JSON.parse(oldImages);
                     const defaultIds = new Set(DEFAULT_IMAGES.map(i => i.id));
                     for (const image of parsed) {
                         if (!defaultIds.has(image.id)) {
                             await dbPut('images', image);
                             if (!images.find(i => i.id === image.id)) {
                                 images.push(image);
                             }
                         }
                     }
                     localStorage.removeItem('p2kImages');
                 }

                 if (oldComments) {
                     const parsed = JSON.parse(oldComments);
                     for (const comment of parsed) {
                         await dbPut('comments', comment);
                     }
                     localStorage.removeItem('p2kComments');
                 }
             } catch(e) {
                 console.warn('Migration from localStorage skipped:', e);
             }
         }

         // ADMIN LOGIN - Simple passcode method
         function showAdminLogin() {
             const passcode = prompt('Enter admin passcode:');
             if (passcode === ADMIN_PASSCODE) {
                 isAdmin = true;
                 updateAdminUI();
                 showNotification('Admin access granted!');
             } else if (passcode !== null) {
                 showNotification('Invalid passcode');
             }
         }

         function hideAdminLogin() {
             // No modal to hide in simple mode
         }

         async function logout() {
             isAdmin = false;
             updateAdminUI();
             showNotification('Logged out');
         }

         // Trust the server's HttpOnly session cookie — never a client-set flag.
         async function checkAdminStatus() {
             try {
                 const r = await api('GET', '/api/admin/session');
                 if (r.ok && r.data && r.data.admin) {
                     isAdmin = true;
                     csrfToken = r.data.csrf;
                     updateAdminUI();
                 }
             } catch (e) { /* backend unreachable — remain a normal visitor */ }
         }

         // FILE UPLOADS - stored in IndexedDB for persistence
         var _elSongUpload = document.getElementById('songUpload'); if (_elSongUpload) _elSongUpload.addEventListener('change', function(e) {
             if (!isAdmin) {
                 showNotification('Admin access required to upload');
                 return;
             }
             const files = Array.from(e.target.files);
             let uploadCount = 0;
             const totalFiles = files.length;
             files.forEach(file => {
                 if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
                     const reader = new FileReader();
                     reader.onload = async function(ev) {
                         const newSong = {
                             id: Date.now() + Math.random(),
                             title: file.name.replace(/\.[^/.]+$/, ""),
                             file: ev.target.result,
                             duration: "--:--",
                             uploaded: true
                         };
                         songs.push(newSong);
                         await dbPut('songs', newSong);
                         renderSongs();
                         uploadCount++;
                         showNotification(`Added "${newSong.title}" (${uploadCount}/${totalFiles})`);
                     };
                     reader.readAsDataURL(file);
                 } else {
                     showNotification(`Unsupported file type: ${file.name}`);
                 }
             });
             e.target.value = '';
         });

         var _elImageUpload = document.getElementById('imageUpload'); if (_elImageUpload) _elImageUpload.addEventListener('change', function(e) {
             if (!isAdmin) {
                 showNotification('Admin access required to upload');
                 return;
             }
             const files = Array.from(e.target.files);
             files.forEach(file => {
                 if (file.type.startsWith('image/')) {
                     const reader = new FileReader();
                     reader.onload = async function(ev) {
                         const newImage = {
                             id: Date.now() + Math.random(),
                             src: ev.target.result,
                             title: file.name.replace(/\.[^/.]+$/, ""),
                             uploaded: true
                         };
                         images.push(newImage);
                         await dbPut('images', newImage);
                         renderGallery();
                         showNotification(`Added "${newImage.title}"`);
                     };
                     reader.readAsDataURL(file);
                 }
             });
             e.target.value = '';
         });

         var _elBgUpload = document.getElementById('bgUpload'); if (_elBgUpload) _elBgUpload.addEventListener('change', function(e) {
             if (!isAdmin) {
                 showNotification('Admin access required');
                 return;
             }
             const file = e.target.files[0];
             if (file && file.type.startsWith('image/')) {
                 const reader = new FileReader();
                 reader.onload = async function(ev) {
                     const bgData = ev.target.result;
                     document.getElementById('customBg').style.backgroundImage = `url(${bgData})`;
                     await dbPut('settings', { key: 'background', value: bgData });
                     showNotification('Background updated');
                 };
                 reader.readAsDataURL(file);
             }
             e.target.value = '';
         });

         // Track which default song files actually exist on the server
         const fileAvailability = {};

         async function checkFileAvailability() {
             const checks = DEFAULT_SONGS.map(async (song) => {
                 // Skip data URL songs (uploaded via browser) - they always work
                 if (song.file.startsWith('data:')) {
                     fileAvailability[song.id] = true;
                     return;
                 }
                 try {
                     const resp = await fetch(encodeAudioURL(song.file), { method: 'HEAD' });
                     fileAvailability[song.id] = resp.ok;
                 } catch(e) {
                     fileAvailability[song.id] = false;
                 }
             });
             await Promise.all(checks);
         }

         // RENDER FUNCTIONS
         function renderSongs() {
             const grid = document.getElementById('songsGrid');
             if (!grid) return;
             // Filter: only show songs whose files are available (or uploaded via browser)
             const availableSongs = songs.filter(song => {
                 // Uploaded songs (data URLs or from IndexedDB) always show
                 if (song.uploaded || song.file.startsWith('data:')) return true;
                 // Default songs: show only if file exists on server
                 if (fileAvailability[song.id] === false) return false;
                 // If not checked yet or available, show
                 return true;
             });

             let list = availableSongs;
             const _q = (window.songFilter || '').trim().toLowerCase();
             if (_q) list = list.filter(s => (s.title || '').toLowerCase().includes(_q));
             if (window.songSort === 'az') list = [...list].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
             else if (window.songSort === 'za') list = [...list].sort((a, b) => (b.title || '').localeCompare(a.title || ''));
             const _cnt = document.getElementById('songCount'); if (_cnt) _cnt.textContent = list.length;
             if (list.length === 0) {
                 grid.innerHTML = _q
                     ? '<div style="text-align:center; color: rgba(255,255,255,0.5); padding: 3rem; grid-column: 1/-1;"><i class="fas fa-magnifying-glass" style="font-size:2.5rem; margin-bottom:1rem;"></i> No results</div>'
                     : '<div style="text-align:center; color: rgba(255,255,255,0.5); padding: 3rem; grid-column: 1/-1;"><i class="fas fa-music" style="font-size:3rem; margin-bottom:1rem; display:block;"></i> No songs</div>';
                 return;
             }
             grid.innerHTML = list.map((song, index) => {
                 const songIndex = songs.indexOf(song);
                 const isOwned = purchasedSongs.has(song.id) || song.uploaded || isAdmin;
                 const isDefaultSong = !song.uploaded;
                 return `
                 <div class="song-card" id="songCard${song.id}">
                     <div class="song-title"><i class="fas fa-music"></i> ${song.title}</div>
                     <div class="play-controls">
                         <button class="play-btn" onclick="togglePlay(${song.id}, ${songIndex})">
                             <i class="fas fa-play" id="playIcon${song.id}"></i>
                         </button>
                         <div class="progress-bar" onclick="seekAudio(event, ${song.id})">
                             <div class="progress-fill" id="progress${song.id}"></div>
                         </div>
                         <div class="time-display" id="time${song.id}">0:00 / ${song.duration}</div>
                     </div>
                     <div class="song-price">
                         ${isOwned ? `
                             <span class="purchased-badge"><i class="fas fa-check-circle"></i> Full Track</span>
                             ${isDefaultSong ? `<a class="download-btn" href="${encodeAudioURL(song.file)}" download="${song.title}.mp3" onclick="event.stopPropagation()"><i class="fas fa-download"></i> Download</a>` : ''}
                         ` : isDefaultSong ? `
                             <span class="price-tag">$${SONG_PRICE} CAD</span>
                             <button class="buy-btn" onclick="openPaypalModal(${song.id})"><i class="fab fa-paypal"></i> Buy Now</button>
                         ` : ''}
                     </div>
                     ${isAdmin ? `<button class="btn btn-danger" onclick="removeSong(${song.id})" style="margin-top:0.5rem"><i class="fas fa-trash"></i> Remove</button>` : ''}
                 </div>
             `}).join('');
         }

         function renderGallery() {
             const grid = document.getElementById('galleryGrid');
             if (!grid) return;
             grid.innerHTML = images.map(image => `
                 <div class="image-card">
                     <img src="${image.src}" alt="${image.title}" class="gallery-image" onclick="setBackground('${image.src.replace(/'/g, "\\'")}')">
                     <div class="image-overlay">
                         ${isAdmin ? `<button class="btn btn-danger" onclick="removeImage(${image.id})"><i class="fas fa-trash"></i></button>` : ''}
                     </div>
                 </div>
             `).join('');
         }

         // AUDIO CONTROLS
         function togglePlay(songId, songIndex) {
             const song = songs[songIndex] || songs.find(s => s.id === songId);
             if (!song) return;

             const file = song.file;
             const title = song.title;
             const playIcon = document.getElementById(`playIcon${songId}`);
             const globalPlayBtn = document.getElementById('globalPlayBtn');
             const floatingPlayer = document.getElementById('floatingPlayer');

             if (currentAudio && currentSongId === songId) {
                 if (currentAudio.paused) {
                     currentAudio.play().catch(err => showNotification('Cannot play: ' + err.message));
                     if (playIcon) playIcon.className = 'fas fa-pause';
                     globalPlayBtn.innerHTML = '<i class="fas fa-pause"></i>';
                 } else {
                     currentAudio.pause();
                     if (playIcon) playIcon.className = 'fas fa-play';
                     globalPlayBtn.innerHTML = '<i class="fas fa-play"></i>';
                 }
             } else {
                 if (currentAudio) {
                     currentAudio.pause();
                     if (currentSongId) {
                         const prevIcon = document.getElementById(`playIcon${currentSongId}`);
                         if (prevIcon) prevIcon.className = 'fas fa-play';
                     }
                 }

                 currentAudio = new Audio(encodeAudioURL(file));
                 currentAudio.volume = 1.0;
                 currentAudio.preload = 'auto';
                 currentSongId = songId;
                 currentAudio.load();
                 currentAudio.play().catch(err => {
                     showNotification('Tap play again if audio does not start');
                     console.error('Playback error:', err);
                     const card = document.getElementById(`songCard${songId}`);
                     if (card) card.style.opacity = '0.5';
                 });
                 if (playIcon) playIcon.className = 'fas fa-pause';
                 globalPlayBtn.innerHTML = '<i class="fas fa-pause"></i>';
                 document.getElementById('currentSongTitle').textContent = title;
                 floatingPlayer.classList.add('show');

                 currentAudio.addEventListener('timeupdate', () => {
                     updateProgress(songId);
                 });
                 currentAudio.addEventListener('loadedmetadata', () => {
                     const timeDisplay = document.getElementById(`time${songId}`);
                     if (timeDisplay && currentAudio.duration) {
                         timeDisplay.textContent = `0:00 / ${formatTime(currentAudio.duration)}`;
                     }
                 });
                 currentAudio.addEventListener('ended', () => {
                     if (playIcon) playIcon.className = 'fas fa-play';
                     globalPlayBtn.innerHTML = '<i class="fas fa-play"></i>';
                 });
                 currentAudio.addEventListener('error', () => {
                     if (playIcon) playIcon.className = 'fas fa-play';
                     globalPlayBtn.innerHTML = '<i class="fas fa-play"></i>';
                     showNotification('Error loading: ' + title + ' - upload the file to audio/ folder');
                     const card = document.getElementById(`songCard${songId}`);
                     if (card) card.style.opacity = '0.5';
                 });
             }
         }

         function updateProgress(songId) {
             if (currentAudio) {
                 const progress = (currentAudio.currentTime / currentAudio.duration) * 100;
                 const progressFill = document.getElementById(`progress${songId}`);
                 const globalProgressFill = document.getElementById('globalProgressFill');

                 if (progressFill) {
                     progressFill.style.width = progress + '%';
                 }
                 if (globalProgressFill) {
                     globalProgressFill.style.width = progress + '%';
                 }

                 const timeDisplay = document.getElementById(`time${songId}`);
                 if (timeDisplay && currentAudio.duration) {
                     const current = formatTime(currentAudio.currentTime);
                     const total = formatTime(currentAudio.duration);
                     timeDisplay.textContent = `${current} / ${total}`;
                 }
             }
         }

         function formatTime(seconds) {
             const mins = Math.floor(seconds / 60);
             const secs = Math.floor(seconds % 60);
             return `${mins}:${secs.toString().padStart(2, '0')}`;
         }

         var _elGlobalPlay = document.getElementById('globalPlayBtn'); if (_elGlobalPlay) _elGlobalPlay.addEventListener('click', function() {
             if (currentAudio && currentSongId) {
                 if (currentAudio.paused) {
                     currentAudio.play();
                     this.innerHTML = '<i class="fas fa-pause"></i>';
                     setPlayingUI(true);
                     walletOnPlay();
                 } else {
                     currentAudio.pause();
                     this.innerHTML = '<i class="fas fa-play"></i>';
                     setPlayingUI(false);
                     walletOnPause();
                 }
             }
         });

         // SEEK AUDIO
         function seekAudio(event, songId) {
             if (currentAudio && currentSongId === songId) {
                 const bar = event.currentTarget;
                 const rect = bar.getBoundingClientRect();
                 const percent = (event.clientX - rect.left) / rect.width;
                 currentAudio.currentTime = percent * currentAudio.duration;
             }
         }

         // DELETE FUNCTIONS (admin only)
         async function removeSong(id) {
             if (!isAdmin) {
                 showNotification('Admin access required');
                 return;
             }
             if (currentSongId === id && currentAudio) {
                 currentAudio.pause();
                 currentAudio = null;
                 currentSongId = null;
                 document.getElementById('floatingPlayer').classList.remove('show');
             }
             songs = songs.filter(song => song.id !== id);
             await dbDelete('songs', id);
             renderSongs();
             showNotification('Song removed');
         }

         async function removeImage(id) {
             if (!isAdmin) {
                 showNotification('Admin access required');
                 return;
             }
             images = images.filter(image => image.id !== id);
             await dbDelete('images', id);
             renderGallery();
             showNotification('Image removed');
         }

         // BACKGROUND
         function setBackground(src) {
             document.getElementById('customBg').style.backgroundImage = `url(${src})`;
             showNotification('Background updated');
         }

         async function resetToDefault() {
             if (!isAdmin) {
                 showNotification('Admin access required');
                 return;
             }
             document.getElementById('customBg').style.backgroundImage = '';
             await dbDelete('settings', 'background');
             showNotification('Background reset');
         }

         async function clearAllData() {
             if (!isAdmin) {
                 showNotification('Admin access required');
                 return;
             }
             if (confirm('Clear all uploaded content? (Default songs will remain)')) {
                 songs = [...DEFAULT_SONGS];
                 images = [...DEFAULT_IMAGES];
                 await dbClear('songs');
                 await dbClear('images');
                 if (currentAudio) {
                     currentAudio.pause();
                     currentAudio = null;
                     currentSongId = null;
                     document.getElementById('floatingPlayer').classList.remove('show');
                 }
                 renderSongs();
                 renderGallery();
                 await resetToDefault();
                 showNotification('Content reset to defaults');
             }
         }

         // COMMENTS - also stored in IndexedDB
         async function addComment(event) {
             event.preventDefault();
             const name = document.getElementById('commentName').value.trim() || 'Anonymous';
             const text = document.getElementById('commentText').value.trim();

             if (!text) return;

             const comment = {
                 id: Date.now(),
                 name: name,
                 text: text,
                 date: new Date().toLocaleString()
             };

             await dbPut('comments', comment);
             document.getElementById('commentName').value = '';
             document.getElementById('commentText').value = '';
             await loadComments();
             showNotification('Comment posted');
         }

         async function loadComments() {
             let comments = await dbGetAll('comments');
             const commentsList = document.getElementById('commentsList');
             if (!commentsList) return;

             // Sort newest first
             comments.sort((a, b) => b.id - a.id);

             if (comments.length === 0) {
                 commentsList.innerHTML = '<div class="no-comments">No comments yet. Be the first to comment!</div>';
                 return;
             }

             commentsList.innerHTML = comments.map(comment => `
                 <li class="comment-item">
                     <div class="comment-author">${comment.name}</div>
                     <div class="comment-date">${comment.date}</div>
                     <div class="comment-text">${comment.text}</div>
                 </li>
             `).join('');
         }

         // NOTIFICATIONS
         function showNotification(message) {
             const notification = document.createElement('div');
             notification.className = 'notification';
             notification.textContent = message;
             document.body.appendChild(notification);

             setTimeout(() => notification.classList.add('show'), 100);
             setTimeout(() => {
                 notification.classList.remove('show');
                 setTimeout(() => document.body.removeChild(notification), 300);
             }, 3000);
         }

         // MOBILE MENU
         var _elMobileToggle = document.getElementById('mobileToggle'); if (_elMobileToggle) _elMobileToggle.addEventListener('click', function() {
             document.getElementById('navLinks').classList.toggle('active');
         });

         // SMOOTH SCROLL
         document.querySelectorAll('a[href^="#"]').forEach(anchor => {
             anchor.addEventListener('click', function (e) {
                 e.preventDefault();
                 const target = document.querySelector(this.getAttribute('href'));
                 if (target) {
                     target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                 }
                 document.getElementById('navLinks').classList.remove('active');
             });
         });

         // Restore saved background
         async function loadBackground() {
             try {
                 if (!db) return;
                 const tx = db.transaction('settings', 'readonly');
                 const store = tx.objectStore('settings');
                 const request = store.get('background');
                 request.onsuccess = () => {
                     if (request.result && request.result.value) {
                         document.getElementById('customBg').style.backgroundImage = `url(${request.result.value})`;
                     }
                 };
             } catch(e) {
                 console.warn('Could not load background:', e);
             }
         }

         // PAYPAL PAYMENT
         function openPaypalModal(songId) {
             const song = songs.find(s => s.id === songId);
             if (!song) return;
             currentBuySongId = songId;
             document.getElementById('paypalSongTitle').textContent = song.title;
             document.getElementById('paypalModal').classList.add('show');

             // Render PayPal button
             const container = document.getElementById('paypal-button-container');
             container.innerHTML = `
                 <a href="https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=${encodeURIComponent(PAYPAL_EMAIL)}&item_name=${encodeURIComponent(song.title + ' - p2k-music.ca')}&amount=${SONG_PRICE}&currency_code=CAD&return=${encodeURIComponent(window.location.href)}&cancel_return=${encodeURIComponent(window.location.href)}" target="_blank" rel="noopener" class="tm-pay-btn">
                     <i class="fab fa-paypal"></i> Pay $${SONG_PRICE} CAD with PayPal
                 </a>
                 <p style="margin-top:1rem; color:rgba(255,255,255,0.5); font-size:0.85rem;">After payment, click the button below to unlock your track.</p>
                 <button class="btn" onclick="confirmPurchase(${songId})" style="margin-top:0.5rem;"><i class="fas fa-check-circle"></i> I've Completed Payment</button>
             `;
         }

         function closePaypalModal() {
             document.getElementById('paypalModal').classList.remove('show');
             currentBuySongId = null;
         }

         function handlePaypalClick(songId) {
             showNotification('Complete your PayPal payment, then click "I\'ve Completed Payment"');
         }

         async function confirmPurchase(songId) {
             const song = songs.find(s => s.id === songId);
             purchasedSongs.add(songId);
             await dbPut('purchases', { songId: songId, date: new Date().toISOString() });
             closePaypalModal();
             renderSongs();
             logRevenue('music', song ? song.title : 'Track', SONG_PRICE);
             showNotification('Purchased "' + (song ? song.title : 'track') + '" - you can now play & download the full track!');
         }

         // Prevent right-click saving on audio elements
         document.addEventListener('contextmenu', function(e) {
             if (e.target.closest('.song-card') || e.target.closest('.floating-music')) {
                 e.preventDefault();
                 showNotification('Purchase required to download');
             }
         });

         // DRAG & DROP UPLOAD
         function setupDropZone(zoneId, inputId, type) {
             const zone = document.getElementById(zoneId);
             const input = document.getElementById(inputId);
             if (!zone || !input) return;

             zone.addEventListener('click', () => input.click());
             zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
             zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
             zone.addEventListener('drop', (e) => {
                 e.preventDefault();
                 zone.classList.remove('dragover');
                 if (!isAdmin) { showNotification('Admin access required to upload'); return; }
                 const files = Array.from(e.dataTransfer.files);
                 if (type === 'song') {
                     handleSongFiles(files);
                 } else if (type === 'image') {
                     handleImageFiles(files);
                 } else if (type === 'bg') {
                     handleBgFile(files[0]);
                 }
             });
         }

         function handleSongFiles(files) {
             const progress = document.getElementById('songUploadProgress');
             const fill = document.getElementById('songProgressFill');
             const text = document.getElementById('songProgressText');
             if (progress) progress.style.display = 'block';
             let uploaded = 0;
             const total = files.length;

             files.forEach(file => {
                 if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
                     const reader = new FileReader();
                     reader.onload = async function(ev) {
                         const newSong = {
                             id: Date.now() + Math.random(),
                             title: file.name.replace(/\.[^/.]+$/, ""),
                             file: ev.target.result,
                             duration: "--:--",
                             uploaded: true
                         };
                         songs.push(newSong);
                         await dbPut('songs', newSong);
                         renderSongs();
                         uploaded++;
                         if (fill) fill.style.width = ((uploaded / total) * 100) + '%';
                         if (text) text.textContent = `Uploaded ${uploaded} of ${total} files`;
                         showNotification(`Added "${newSong.title}" (${uploaded}/${total})`);
                         if (uploaded === total && progress) {
                             setTimeout(() => { progress.style.display = 'none'; }, 2000);
                         }
                     };
                     reader.readAsDataURL(file);
                 }
             });
         }

         function handleImageFiles(files) {
             files.forEach(file => {
                 if (file.type.startsWith('image/')) {
                     const reader = new FileReader();
                     reader.onload = async function(ev) {
                         const newImage = {
                             id: Date.now() + Math.random(),
                             src: ev.target.result,
                             title: file.name.replace(/\.[^/.]+$/, ""),
                             uploaded: true
                         };
                         images.push(newImage);
                         await dbPut('images', newImage);
                         renderGallery();
                         showNotification(`Added "${newImage.title}"`);
                     };
                     reader.readAsDataURL(file);
                 }
             });
         }

         function handleBgFile(file) {
             if (file && file.type.startsWith('image/')) {
                 const reader = new FileReader();
                 reader.onload = async function(ev) {
                     document.getElementById('customBg').style.backgroundImage = `url(${ev.target.result})`;
                     await dbPut('settings', { key: 'background', value: ev.target.result });
                     showNotification('Background updated');
                 };
                 reader.readAsDataURL(file);
             }
         }

         // NEWS / ANNOUNCEMENTS
         async function postNews() {
             if (!isAdmin) { showNotification('Admin access required'); return; }
             const title = document.getElementById('newsTitle').value.trim();
             const body = document.getElementById('newsBody').value.trim();
             if (!title || !body) { showNotification('Please fill in both title and message'); return; }

             const post = {
                 id: Date.now(),
                 title: title,
                 body: body,
                 date: new Date().toLocaleString()
             };
             await dbPut('news', post);
             document.getElementById('newsTitle').value = '';
             document.getElementById('newsBody').value = '';
             await loadNews();
             showNotification('News update posted!');
         }

         async function deleteNews(id) {
             if (!isAdmin) return;
             await dbDelete('news', id);
             await loadNews();
             showNotification('News post removed');
         }

         async function loadNews() {
             let posts = await dbGetAll('news');
             const container = document.getElementById('newsContainer');
             if (!container) return;
             posts.sort((a, b) => b.id - a.id);

             if (posts.length === 0) {
                 container.innerHTML = '<div class="no-news"><i class="fas fa-newspaper" style="font-size:2rem; display:block; margin-bottom:0.5rem;"></i>No news posted yet. Check back soon!</div>';
                 return;
             }

             container.innerHTML = posts.map(post => `
                 <div class="news-post">
                     <div class="news-post-header">
                         <div class="news-post-title"><i class="fas fa-bullhorn"></i> ${post.title}</div>
                         <div class="news-post-date">${post.date}</div>
                     </div>
                     <div class="news-post-body">${post.body}</div>
                     ${isAdmin ? `<button class="btn btn-danger" onclick="deleteNews(${post.id})" style="margin-top:0.8rem; font-size:0.8rem;"><i class="fas fa-trash"></i> Delete</button>` : ''}
                 </div>
             `).join('');
         }

         // Show wallet when admin is logged in
         function updateAdminUI() {
             const adminPanel = document.getElementById('adminPanel');
             const adminBadge = document.getElementById('adminBadge');
             const logoutBtn = document.getElementById('logoutBtn');
             const adminLoginBtn = document.getElementById('adminLoginBtn');
             const walletPanel = document.getElementById('admin-wallet');
             const checkinSection = document.getElementById('checkin');

             if (isAdmin) {
                 if (adminPanel) adminPanel.classList.add('show');
                 if (adminBadge) adminBadge.style.display = 'block';
                 if (logoutBtn) logoutBtn.classList.add('show');
                 if (adminLoginBtn) adminLoginBtn.style.display = 'none';
                 if (walletPanel) walletPanel.classList.add('show');
                 if (checkinSection) { checkinSection.style.display = 'block'; }
                 const profitSection = document.getElementById('profit');
                 if (profitSection) { profitSection.style.display = 'block'; renderProfit(); }
                 walletLoad();
             } else {
                 if (adminPanel) adminPanel.classList.remove('show');
                 if (adminBadge) adminBadge.style.display = 'none';
                 if (logoutBtn) logoutBtn.classList.remove('show');
                 if (adminLoginBtn) adminLoginBtn.style.display = 'block';
                 if (walletPanel) walletPanel.classList.remove('show');
                 if (checkinSection) checkinSection.style.display = 'none';
                 const profitSectionOff = document.getElementById('profit');
                 if (profitSectionOff) profitSectionOff.style.display = 'none';
             }
         }

         // WALLET SYSTEM
         let walletBalance = 0;
         let walletSession = 0;
         let walletPaid    = 0;
         let walletSecs    = 0;
         let walletTicker  = null;
         const RATE = 1.55 / 180;

         function walletOnPlay() {
           const _wlb = document.getElementById('wallet-live-badge');
           if (_wlb) { _wlb.textContent = '● Live'; _wlb.classList.add('wallet-live'); }
           clearInterval(walletTicker);
           walletTicker = setInterval(async () => {
             walletSecs++;
             walletSession += RATE;
             walletBalance += RATE;
             walletUpdateDisplay();
             if (walletSecs % 60 === 0) {
               listenBanked += RATE * 60;
               dbPut('settings', { key: 'listenBanked', value: listenBanked });
               renderProfit();
               await fetch('/api/listen-tick', { method: 'POST' }).catch(e => console.log('ping sent'));
             }
           }, 1000);
         }

         function walletOnPause() {
           clearInterval(walletTicker);
           const _wlb = document.getElementById('wallet-live-badge');
           if (_wlb) { _wlb.textContent = '● Paused'; _wlb.classList.remove('wallet-live'); }
         }

         function walletUpdateDisplay() {
           if (!document.getElementById('w-dollars')) return;
           const f = walletBalance.toFixed(2).split('.');
           document.getElementById('w-dollars').textContent = f[0];
           document.getElementById('w-cents').textContent   = f[1];
           document.getElementById('w-session').textContent = '$' + walletSession.toFixed(2);
           document.getElementById('w-paid').textContent    = '$' + walletPaid.toFixed(2);
           document.getElementById('w-time').textContent    = fmtTime(walletSecs);
           const pct = Math.min(((walletBalance % 1.55) / 1.55) * 100, 100);
           document.getElementById('w-bar').style.width     = pct.toFixed(1) + '%';
           document.getElementById('w-pct').textContent     = pct.toFixed(0) + '%';
           const rem = (1.55 - (walletBalance % 1.55)).toFixed(2);
           document.getElementById('w-hint').textContent = walletBalance >= 1.55 ? 'Ready to withdraw!' : '$' + rem + ' more to unlock';
         }

         function fmtTime(s) {
           return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
         }

         async function walletLoad() {
           try {
             const res = await fetch('/api/earnings');
             if (res.ok) {
               const data = await res.json();
               walletBalance = parseFloat(data.balance) || 0;
               walletPaid = parseFloat(data.paid) || 0;
               walletUpdateDisplay();
             }
           } catch(e) {
             console.log('Wallet load:', e);
           }
         }

         function setW(v) { document.getElementById('w-amount').value = v.toFixed(2); }
         function setWAll() { document.getElementById('w-amount').value = walletBalance.toFixed(2); }

         async function sendWithdraw() {
           const amt = parseFloat(document.getElementById('w-amount').value);
           const ok  = document.getElementById('w-success');
           const err = document.getElementById('w-error');
           ok.style.display = err.style.display = 'none';

           if (!amt || amt < 1.55) {
             err.textContent = 'Minimum withdrawal is $1.55';
             err.style.display = 'block';
             return;
           }
           if (amt > walletBalance) {
             err.textContent = 'Amount exceeds your balance';
             err.style.display = 'block';
             return;
           }

           try {
             const r = await api('POST', '/api/withdraw', { amount: amt });
             const data = r.data || {};

             if (data.success) {
               walletBalance -= amt;
               walletPaid += amt;
               walletUpdateDisplay();
               document.getElementById('w-amount').value = '';
               ok.textContent = '$' + amt.toFixed(2) + ' sent to p2key1@gmail.com';
               ok.style.display = 'block';
               setTimeout(() => { ok.style.display = 'none'; }, 5000);
             } else {
               err.textContent = data.error || 'Payout failed, try again';
               err.style.display = 'block';
             }
           } catch(e) {
             err.textContent = 'Network error';
             err.style.display = 'block';
           }
         }

         // REVENUE & PROFIT DASHBOARD
         const PROFIT_SOURCES = [
             { key: 'music',  label: 'Music Sales', icon: 'fa-music',        color: '#00d4ff' },
             { key: 'ticket', label: 'Tickets',     icon: 'fa-ticket',       color: '#ff2d95' },
             { key: 'merch',  label: 'Merch',       icon: 'fa-bag-shopping', color: '#ffc439' },
             { key: 'listen', label: 'Listening',   icon: 'fa-headphones',   color: '#00e6c0' },
             { key: 'ad',     label: 'Ads',         icon: 'fa-rectangle-ad', color: '#ff6b6b' },
             { key: 'other',  label: 'Other',       icon: 'fa-coins',        color: '#7c3aed' }
         ];

         async function logRevenue(source, label, amount) {
             amount = Number(amount) || 0;
             if (amount <= 0) return;
             const rec = { id: Date.now() + Math.random(), source: source, label: label || '', amount: amount, date: new Date().toISOString() };
             revenueLog.push(rec);
             try { await dbPut('revenue', rec); } catch (e) {}
             renderProfit();
         }

         function profitTotals() {
             const t = { music: { amt: 0, n: 0 }, ticket: { amt: 0, n: 0 }, merch: { amt: 0, n: 0 }, listen: { amt: listenBanked, n: 0 }, ad: { amt: 0, n: 0 }, other: { amt: 0, n: 0 } };
             revenueLog.forEach(r => { const s = t[r.source] || t.other; s.amt += Number(r.amount) || 0; s.n++; });
             return t;
         }

         function renderProfit() {
             if (!document.getElementById('profit')) return;
             const t = profitTotals();
             const total = PROFIT_SOURCES.reduce((sum, s) => sum + (t[s.key] ? t[s.key].amt : 0), 0);
             const maxAmt = Math.max(1, ...PROFIT_SOURCES.map(s => t[s.key] ? t[s.key].amt : 0));
             const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

             set('profitTotal', '$' + total.toFixed(2));
             set('profitCount', revenueLog.length);
             const today = new Date().toDateString();
             const todayTotal = revenueLog.filter(r => new Date(r.date).toDateString() === today).reduce((s, r) => s + (Number(r.amount) || 0), 0);
             set('profitToday', '$' + todayTotal.toFixed(2));

             const sc = document.getElementById('profitSources');
             if (sc) sc.innerHTML = PROFIT_SOURCES.map(s => {
                 const d = t[s.key] || { amt: 0, n: 0 };
                 return '<div class="psource"><div class="psource-icon" style="color:' + s.color + '"><i class="fas ' + s.icon + '"></i></div><div class="psource-amt">$' + d.amt.toFixed(2) + '</div></div>';
             }).join('');

             const ch = document.getElementById('profitChart');
             if (ch) ch.innerHTML = PROFIT_SOURCES.map(s => {
                 const amt = t[s.key] ? t[s.key].amt : 0;
                 const pct = (amt / maxAmt) * 100;
                 return '<div class="pbar-row"><span class="pbar-label">' + s.label + '</span><div class="pbar-track"><div class="pbar-fill" style="width:' + pct.toFixed(1) + '%; background:' + s.color + '"></div></div><span class="pbar-val">$' + amt.toFixed(2) + '</span></div>';
             }).join('');

             const lg = document.getElementById('profitLedger');
             if (lg) {
                 const items = [...revenueLog].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 20);
                 if (items.length === 0) { lg.innerHTML = '<div class="no-comments">No transactions yet — sales and listening will appear here.</div>'; }
                 else lg.innerHTML = items.map(r => {
                     const src = PROFIT_SOURCES.find(s => s.key === r.source) || PROFIT_SOURCES[5];
                     return '<div class="pledger-row"><span class="pledger-src" style="color:' + src.color + '"><i class="fas ' + src.icon + '"></i></span><span class="pledger-label">' + (r.label || src.label) + '</span><span class="pledger-amt">$' + r.amount.toFixed(2) + '</span></div>';
                 }).join('');
             }
         }

         // INITIALIZE
         async function init() {
             checkAdminStatus();
             try {
                 await openDB();
                 await loadFromDB();
                 await loadBackground();
             } catch(e) {
                 console.warn('IndexedDB init failed, using defaults:', e);
             }
             // Check which audio files actually exist on the server (only where the music grid exists)
             if (document.getElementById('songsGrid')) await checkFileAvailability();
             renderSongs();
             renderGallery();
             loadBackground();
             await loadNews();
             await loadComments();
             // Set up drag & drop zones
             setupDropZone('songDropZone', 'songUpload', 'song');
             setupDropZone('imageDropZone', 'imageUpload', 'image');
             setupDropZone('bgDropZone', 'bgUpload', 'bg');
             if (document.body.dataset.page === 'home') showNotification('Welcome to p2k-music.ca');
         }

         // ---- Loader ----
         window.addEventListener('load', () => {
             const loader = document.getElementById('loader');
             if (loader) setTimeout(() => loader.classList.add('hide'), 650);
         });

         // ---- Navbar scrolled state + scroll progress + back to top ----
         const navbarEl = document.getElementById('navbar');
         const scrollProg = document.getElementById('scrollProgress');
         const backTop = document.getElementById('backToTop');
         function onScrollFx() {
             const y = window.scrollY || document.documentElement.scrollTop;
             const h = document.documentElement.scrollHeight - window.innerHeight;
             if (scrollProg) scrollProg.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
             if (navbarEl) navbarEl.classList.toggle('scrolled', y > 40);
             if (backTop) backTop.classList.toggle('show', y > 600);
         }
         window.addEventListener('scroll', onScrollFx, { passive: true });

         // ---- Scrollspy: highlight active nav link ----
         function initScrollspy() {
             const links = Array.from(document.querySelectorAll('.nav-links a'));
             const map = {};
             links.forEach(a => { const id = a.getAttribute('href').slice(1); if (id) map[id] = a; });
             const sections = Object.keys(map).map(id => document.getElementById(id)).filter(Boolean);
             const spy = new IntersectionObserver((entries) => {
                 entries.forEach(en => {
                     if (en.isIntersecting) {
                         links.forEach(l => l.classList.remove('active'));
                         const active = map[en.target.id];
                         if (active) active.classList.add('active');
                     }
                 });
             }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
             sections.forEach(s => spy.observe(s));
         }

         // ---- Reveal on scroll ----
         function initReveal() {
             const els = document.querySelectorAll('.reveal');
             const io = new IntersectionObserver((entries) => {
                 entries.forEach(en => {
                     if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
                 });
             }, { threshold: 0.12 });
             els.forEach(el => io.observe(el));
         }

         // ---- Count-up stats ----
         function initCounters() {
             const nums = document.querySelectorAll('.stat-num[data-count]');
             const io = new IntersectionObserver((entries) => {
                 entries.forEach(en => {
                     if (!en.isIntersecting) return;
                     const el = en.target;
                     io.unobserve(el);
                     const target = parseFloat(el.getAttribute('data-count')) || 0;
                     const suffix = el.getAttribute('data-suffix') || '';
                     const dur = 1500;
                     let start = null;
                     function step(ts) {
                         if (!start) start = ts;
                         const p = Math.min((ts - start) / dur, 1);
                         const eased = 1 - Math.pow(1 - p, 3);
                         el.textContent = Math.round(target * eased) + suffix;
                         if (p < 1) requestAnimationFrame(step);
                     }
                     requestAnimationFrame(step);
                 });
             }, { threshold: 0.5 });
             nums.forEach(n => io.observe(n));
         }

         // ---- Cursor glow (desktop, pointer:fine only) ----
         function initCursor() {
             if (!window.matchMedia('(pointer:fine)').matches) return;
             const glow = document.getElementById('cursorGlow');
             if (!glow) return;
             window.addEventListener('mousemove', (e) => {
                 glow.style.left = e.clientX + 'px';
                 glow.style.top = e.clientY + 'px';
                 glow.style.opacity = '1';
             });
             window.addEventListener('mouseout', () => { glow.style.opacity = '0'; });
         }

         // ---- Card tilt ----
         function initTilt() {
             if (!window.matchMedia('(pointer:fine)').matches) return;
             const sel = '.song-card, .stat-card, .video-card, .merch-card, .image-card';
             document.addEventListener('mousemove', (e) => {
                 const card = e.target.closest(sel);
                 if (!card) return;
                 const r = card.getBoundingClientRect();
                 const cx = (e.clientX - r.left) / r.width - 0.5;
                 const cy = (e.clientY - r.top) / r.height - 0.5;
                 card.style.transform = `perspective(800px) rotateY(${cx * 6}deg) rotateX(${-cy * 6}deg) translateY(-6px)`;
             });
             document.addEventListener('mouseout', (e) => {
                 const card = e.target.closest(sel);
                 if (card) card.style.transform = '';
             });
         }

         // ---- Particles ----
         function initParticles() {
             const canvas = document.getElementById('fxParticles');
             if (!canvas) return;
             const ctx = canvas.getContext('2d');
             let w, h, particles = [];
             const PAL = [[0,212,255],[124,58,237],[255,45,149],[255,107,107],[255,196,57]];
             const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
             const mouse = { x: -9999, y: -9999, active: false };
             function resize() {
                 w = canvas.width = window.innerWidth;
                 h = canvas.height = window.innerHeight;
                 const count = Math.min(110, Math.floor(w * h / 16000));
                 particles = Array.from({ length: count }, () => {
                     const c = PAL[Math.floor(Math.random() * PAL.length)];
                     return {
                         x: Math.random() * w, y: Math.random() * h,
                         vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
                         r: Math.random() * 1.9 + 0.6, c,
                         tw: Math.random() * Math.PI * 2
                     };
                 });
             }
             function draw() {
                 ctx.clearRect(0, 0, w, h);
                 ctx.globalCompositeOperation = 'lighter';
                 for (let i = 0; i < particles.length; i++) {
                     const p = particles[i];
                     if (mouse.active) {
                         const mdx = p.x - mouse.x, mdy = p.y - mouse.y;
                         const md = Math.hypot(mdx, mdy);
                         if (md < 140 && md > 0.1) { const f = (140 - md) / 140 * 0.6; p.vx += (mdx / md) * f * 0.08; p.vy += (mdy / md) * f * 0.08; }
                     }
                     p.vx *= 0.99; p.vy *= 0.99;
                     p.x += p.vx; p.y += p.vy;
                     if (p.x < 0 || p.x > w) p.vx *= -1;
                     if (p.y < 0 || p.y > h) p.vy *= -1;
                     p.tw += 0.03;
                     const a = 0.45 + 0.35 * Math.sin(p.tw);
                     ctx.beginPath();
                     ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                     ctx.fillStyle = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${a})`;
                     ctx.shadowColor = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},0.9)`;
                     ctx.shadowBlur = 8;
                     ctx.fill();
                     for (let j = i + 1; j < particles.length; j++) {
                         const q = particles[j];
                         const dx = p.x - q.x, dy = p.y - q.y;
                         const dist = Math.sqrt(dx * dx + dy * dy);
                         if (dist < 130) {
                             ctx.beginPath();
                             ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
                             ctx.strokeStyle = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${0.16 * (1 - dist / 130)})`;
                             ctx.lineWidth = 1; ctx.shadowBlur = 0;
                             ctx.stroke();
                         }
                     }
                 }
                 ctx.shadowBlur = 0;
                 ctx.globalCompositeOperation = 'source-over';
                 requestAnimationFrame(draw);
             }
             resize();
             window.addEventListener('resize', resize);
             window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true; }, { passive: true });
             window.addEventListener('mouseout', () => { mouse.active = false; mouse.x = mouse.y = -9999; });
             if (!reduce) draw();
         }

         function fxInit() {
             initScrollspy();
             initReveal();
             initCounters();
             initCursor();
             initTilt();
             initParticles();
             onScrollFx();
         }

         // ================= Music library controls (Music page) =================
         window.songFilter = '';
         window.songSort = 'default';
         function initLibrary() {
             const s = document.getElementById('songSearch');
             const so = document.getElementById('songSort');
             if (s) s.addEventListener('input', () => { window.songFilter = s.value; renderSongs(); });
             if (so) so.addEventListener('change', () => { window.songSort = so.value; renderSongs(); });
         }

         function playFeatured() {
             const s = songs.find(x => x.title === 'T.H.C VOL2') || songs[songs.length - 1];
             if (s) { togglePlay(s.id, songs.indexOf(s)); }
             document.getElementById('music').scrollIntoView({ behavior: 'smooth' });
         }

         init();
         fxInit();
         initLibrary();
