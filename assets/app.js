        // NOTE: admin auth is now verified SERVER-SIDE (POST /api/admin/login).
        // The passcode never lives in client code anymore — see server/auth.js.
        const DB_NAME = 'p2kMusicDB';
        const DB_VERSION = 6;
        const SONG_PRICE = 16;
        const PREVIEW_SECONDS = 30;

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

        // ══ PAYPAL CHECKOUT ═════════════════════════════════════════════════
        // Live mode: real PayPal JS SDK Buttons — buyer approves in a popup, then
        // the server captures & verifies the payment before anything unlocks.
        // Demo mode (no live credentials): a simulate button drives the same
        // server create→capture path so the flow is fully testable locally.
        let siteMode = 'demo';
        const PAYPAL_SDK = { clientId: null, currency: 'CAD', loaded: false, loading: null };

        async function loadSiteConfig() {
            try {
                const r = await api('GET', '/api/config');
                if (r.ok && r.data) {
                    siteMode = r.data.mode || 'demo';
                    PAYPAL_SDK.currency = r.data.currency || 'CAD';
                    if (r.data.paypalClientId) PAYPAL_SDK.clientId = r.data.paypalClientId;
                }
            } catch (e) { /* backend unreachable — stay in demo */ }
        }

        function loadPayPalSDK() {
            if (PAYPAL_SDK.loaded) return Promise.resolve(true);
            if (PAYPAL_SDK.loading) return PAYPAL_SDK.loading;
            if (!PAYPAL_SDK.clientId) return Promise.resolve(false);
            PAYPAL_SDK.loading = new Promise((resolve) => {
                const s = document.createElement('script');
                s.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(PAYPAL_SDK.clientId) +
                        '&currency=' + encodeURIComponent(PAYPAL_SDK.currency) + '&intent=capture';
                s.onload = () => { PAYPAL_SDK.loaded = true; resolve(true); };
                s.onerror = () => resolve(false);
                document.head.appendChild(s);
            });
            return PAYPAL_SDK.loading;
        }

        // Mount a checkout into `container`. `getPayload` is an object (or a function
        // returning one — or null to abort with its own message) POSTed to /api/orders.
        // `onPaid(captureData)` fires only after the server confirms payment.
        async function mountCheckout(container, getPayload, onPaid) {
            if (!container) return;
            const resolvePayload = () => {
                try { return (typeof getPayload === 'function') ? getPayload() : getPayload; }
                catch (e) { return null; }
            };

            if (siteMode === 'live' && PAYPAL_SDK.clientId) {
                container.innerHTML = '<div class="checkout-loading"><i class="fas fa-spinner fa-spin"></i> Loading secure checkout…</div>';
                const ready = await loadPayPalSDK();
                if (ready && window.paypal && window.paypal.Buttons) {
                    container.innerHTML = '';
                    let ourOrderId = null;
                    try {
                        window.paypal.Buttons({
                            style: { layout: 'vertical', color: 'gold', shape: 'pill', label: 'paypal' },
                            createOrder: async () => {
                                const payload = resolvePayload();
                                if (!payload) throw new Error('cancelled');
                                const r = await api('POST', '/api/orders', payload);
                                if (!(r.ok && r.data && r.data.paypalOrderId)) throw new Error('order_failed');
                                ourOrderId = r.data.orderId;
                                return r.data.paypalOrderId;
                            },
                            onApprove: async () => {
                                const cap = await api('POST', '/api/orders/' + ourOrderId + '/capture', {});
                                if (cap.ok && cap.data && cap.data.paid) onPaid(cap.data);
                                else showNotification('Payment could not be verified — please try again');
                            },
                            onCancel: () => showNotification('Checkout cancelled'),
                            onError: () => showNotification('PayPal had a problem — please try again'),
                        }).render(container).catch(() => {
                            container.innerHTML = '<p class="tm-hint">Checkout failed to load — refresh and try again.</p>';
                        });
                        return;
                    } catch (e) { /* fall through to the manual button */ }
                }
                // SDK blocked/unavailable — fall through to the manual path so buyers aren't stuck.
            }

            // DEMO / fallback path — server is in demo mode, payment is simulated (no real charge).
            container.innerHTML = '';
            const btn = document.createElement('button');
            btn.className = 'cta-button';
            btn.style.width = '100%'; btn.style.justifyContent = 'center';
            const label = '<i class="fab fa-paypal"></i> Pay with PayPal';
            btn.innerHTML = label;
            btn.addEventListener('click', async () => {
                const payload = resolvePayload();
                if (!payload) return;
                btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing…';
                try {
                    const r = await api('POST', '/api/orders', payload);
                    if (r.ok && r.data && r.data.orderId) {
                        const cap = await api('POST', '/api/orders/' + r.data.orderId + '/capture', {});
                        if (cap.ok && cap.data && cap.data.paid) { onPaid(cap.data); return; }
                    }
                    showNotification('Payment did not complete — please try again');
                } catch (e) { showNotification('Could not reach the server'); }
                finally { btn.disabled = false; btn.innerHTML = label; }
            });
            container.appendChild(btn);
            if (siteMode !== 'live') {
                const note = document.createElement('p');
                note.className = 'tm-hint';
                note.innerHTML = '<i class="fas fa-flask"></i> Demo mode — no real charge.';
                container.appendChild(note);
            }
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
            { id: 'ep-01', title: "Episode 1 — Underground Origins", guest: "P2K (solo)", description: "How it all started: crates, cracked software, and the first beat that actually hit.", date: "2026-06-12", audio: "", duration: "42:10" },
            { id: 'ep-02', title: "Episode 2 — In The Lab with DJ Meemx", guest: "DJ Meemx", description: "Breaking down the late-night studio sessions and the sound behind the collabs.", date: "2026-06-26", audio: "", duration: "55:30" },
            { id: 'ep-03', title: "Episode 3 — Bass, Dubstep & Where It's Going", guest: "dannyminus", description: "Two producers argue about drops, sub-bass, and the future of the underground.", date: "2026-07-10", audio: "", duration: "48:05" }
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

        // ADMIN LOGIN
        let pendingChallenge = null;

        function showAdminLogin() {
            document.getElementById('adminLoginModal').classList.add('show');
            resetAdminLogin();
            const em = document.getElementById('adminEmail'); if (em) em.focus();
        }

        function hideAdminLogin() {
            document.getElementById('adminLoginModal').classList.remove('show');
            resetAdminLogin();
        }

        // Return the modal to step 1 (email + password)
        function resetAdminLogin() {
            pendingChallenge = null;
            const s1 = document.getElementById('loginStep1'), s2 = document.getElementById('loginStep2');
            if (s1) s1.style.display = '';
            if (s2) s2.style.display = 'none';
            const err = document.getElementById('loginError'); if (err) err.style.display = 'none';
            const pw = document.getElementById('adminPassword'); if (pw) pw.value = '';
            const cd = document.getElementById('adminCode'); if (cd) cd.value = '';
        }

        // Step 1: email + password → server emails a one-time code
        async function handleAdminLogin(event) {
            event.preventDefault();
            const email = document.getElementById('adminEmail').value.trim();
            const password = document.getElementById('adminPassword').value;
            const errorDiv = document.getElementById('loginError');
            const btn = document.getElementById('loginContinueBtn');
            errorDiv.style.display = 'none';
            if (btn) { btn.disabled = true; btn.textContent = 'Sending code…'; }
            try {
                const r = await api('POST', '/api/admin/login', { email, password });
                if (r.ok && r.data && r.data.ok) {
                    pendingChallenge = r.data.challenge;
                    document.getElementById('loginStep1').style.display = 'none';
                    document.getElementById('loginStep2').style.display = '';
                    const msg = document.getElementById('loginSentMsg');
                    if (r.data.demo && r.data.demoCode) {
                        msg.innerHTML = 'Demo mode (email not set up) — your code is <b style="color:var(--cyan); letter-spacing:3px; font-size:1.1rem;">' + r.data.demoCode + '</b>';
                    } else {
                        msg.textContent = 'We emailed a 6-digit code to ' + (r.data.sentTo || 'your email') + '. Enter it below.';
                    }
                    const cd = document.getElementById('adminCode'); if (cd) cd.focus();
                } else {
                    const err = r.data && r.data.error;
                    if (err === 'email_not_configured') errorDiv.textContent = 'Login email isn’t set up on the server yet — codes can’t be sent.';
                    else if (err === 'locked') errorDiv.textContent = 'Account locked — try again in ' + (r.data.retryInMin || 15) + ' min';
                    else errorDiv.textContent = (r.status === 429) ? 'Too many attempts — wait a moment' : 'Invalid email or password';
                    errorDiv.style.display = 'block';
                }
            } catch (e) {
                errorDiv.textContent = 'Cannot reach the server — is the backend running?';
                errorDiv.style.display = 'block';
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = 'Continue'; }
            }
        }

        // Step 2: verify the emailed code → admin session
        async function handleAdminVerify(event) {
            event.preventDefault();
            const code = document.getElementById('adminCode').value.trim();
            const errorDiv = document.getElementById('loginError');
            errorDiv.style.display = 'none';
            try {
                const r = await api('POST', '/api/admin/verify', { challenge: pendingChallenge, code });
                if (r.ok && r.data && r.data.ok) {
                    isAdmin = true;
                    csrfToken = r.data.csrf;
                    updateAdminUI();
                    hideAdminLogin();
                    showNotification('Admin access granted' + (r.data.email ? ' — ' + r.data.email : ''));
                    return;
                }
                if (r.data && r.data.error === 'code_expired') { errorDiv.textContent = 'Code expired — start again'; setTimeout(resetAdminLogin, 1400); }
                else if (r.status === 429) { errorDiv.textContent = 'Too many attempts — start again'; setTimeout(resetAdminLogin, 1400); }
                else { errorDiv.textContent = 'Invalid code' + (r.data && r.data.attemptsLeft != null ? ' (' + r.data.attemptsLeft + ' left)' : ''); }
                errorDiv.style.display = 'block';
                const cd = document.getElementById('adminCode'); if (cd) cd.value = '';
            } catch (e) {
                errorDiv.textContent = 'Cannot reach the server';
                errorDiv.style.display = 'block';
            }
        }

        async function logout() {
            try { await api('POST', '/api/admin/logout'); } catch (e) {}
            isAdmin = false;
            csrfToken = null;
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
                    ? '<div style="text-align:center; color: rgba(255,255,255,0.5); padding: 3rem; grid-column: 1/-1;"><i class="fas fa-magnifying-glass" style="font-size:2.5rem; margin-bottom:1rem; display:block;"></i>No tracks match your search.</div>'
                    : '<div style="text-align:center; color: rgba(255,255,255,0.5); padding: 3rem; grid-column: 1/-1;"><i class="fas fa-music" style="font-size:3rem; margin-bottom:1rem; display:block;"></i>No playable songs yet. Add MP3 files to the audio/ folder.</div>';
                return;
            }
            grid.innerHTML = list.map((song, index) => {
                const songIndex = songs.indexOf(song);
                const isOwned = purchasedSongs.has(song.id) || song.uploaded || isAdmin;
                const isDefaultSong = !song.uploaded;
                return `
                <div class="song-card" id="songCard${song.id}">
                    <div class="song-title"><i class="fas fa-music"></i> ${escapeHTML(song.title)}</div>
                    <div class="play-controls">
                        <button class="play-btn" onclick="togglePlay(${song.id}, ${songIndex})">
                            <i class="fas fa-play" id="playIcon${song.id}"></i>
                        </button>
                        <div class="progress-bar" onclick="seekAudio(event, ${song.id})">
                            <div class="progress-fill" id="progress${song.id}"></div>
                        </div>
                        <div class="time-display" id="time${song.id}">0:00 / ${song.duration}</div>
                    </div>
                    ${!isOwned && isDefaultSong ? '<div class="preview-label"><i class="fas fa-clock"></i> 30-second preview</div>' : ''}
                    <div class="song-price">
                        ${isOwned ? `
                            <span class="purchased-badge"><i class="fas fa-check-circle"></i> Owned</span>
                            ${isDefaultSong ? `<a class="download-btn" href="${escapeHTML(encodeAudioURL(song.file))}" download="${escapeHTML(song.title)}.mp3" onclick="event.stopPropagation()"><i class="fas fa-download"></i> Download</a>` : ''}
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
                    <img src="${escapeHTML(image.src)}" alt="${escapeHTML(image.title)}" class="gallery-image" onclick="setBackground('${escapeHTML(image.src.replace(/'/g, "\\'"))}')">
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
                    // Enforce 30-second preview for unpurchased songs
                    const songObj = songs.find(s => s.id === songId);
                    if (songObj && !songObj.uploaded && !purchasedSongs.has(songId) && !isAdmin) {
                        if (currentAudio.currentTime >= PREVIEW_SECONDS) {
                            currentAudio.pause();
                            currentAudio.currentTime = 0;
                            const icon = document.getElementById(`playIcon${songId}`);
                            if (icon) icon.className = 'fas fa-play';
                            globalPlayBtn.innerHTML = '<i class="fas fa-play"></i>';
                            showNotification('Preview ended - Buy for $' + SONG_PRICE + ' to hear the full track!');
                            openPaypalModal(songId);
                        }
                    }
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
                commentsList.innerHTML = '<li class="no-comments">No comments yet. Be the first to comment!</li>';
                return;
            }

            commentsList.innerHTML = comments.map(comment => `
                <li class="comment-item">
                    <div class="comment-author">${escapeHTML(comment.name)}</div>
                    <div class="comment-date">${escapeHTML(comment.date)}</div>
                    <div class="comment-text">${escapeHTML(comment.text)}</div>
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
                setTimeout(() => notification.remove(), 300);
            }, 3000);
        }

        // MOBILE MENU
        var _elMobileToggle = document.getElementById('mobileToggle'); if (_elMobileToggle) _elMobileToggle.addEventListener('click', function() {
            document.getElementById('navLinks').classList.toggle('active');
        });

        // SMOOTH SCROLL
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                const href = this.getAttribute('href');
                if (!href || href.length < 2) return; // bare "#" links (e.g. Cookie Settings) handle themselves
                e.preventDefault();
                let target = null;
                try { target = document.querySelector(href); } catch (err) { /* not a valid selector */ }
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                const nl = document.getElementById('navLinks');
                if (nl) nl.classList.remove('active');
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

        // PAYPAL PAYMENT — real approve→capture via mountCheckout (see the checkout helper up top)
        function openPaypalModal(songId) {
            const song = songs.find(s => s.id === songId);
            if (!song) return;
            currentBuySongId = songId;
            document.getElementById('paypalSongTitle').textContent = song.title;
            document.getElementById('paypalModal').classList.add('show');
            const container = document.getElementById('paypal-button-container');
            mountCheckout(container,
                { kind: 'song', ref: String(songId), title: song.title },
                () => onSongPurchased(songId));
        }

        function closePaypalModal() {
            document.getElementById('paypalModal').classList.remove('show');
            currentBuySongId = null;
        }

        // Fires only after the server has captured & verified the payment.
        async function onSongPurchased(songId) {
            const song = songs.find(s => s.id === songId);
            purchasedSongs.add(songId);
            await dbPut('purchases', { songId: songId, date: new Date().toISOString() });
            closePaypalModal();
            renderSongs();
            logRevenue('music', song ? song.title : 'Track', SONG_PRICE);
            showNotification('Purchased "' + (song ? song.title : 'track') + '" — you can now play & download the full track!');
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
                        <div class="news-post-title"><i class="fas fa-bullhorn"></i> ${escapeHTML(post.title)}</div>
                        <div class="news-post-date">${escapeHTML(post.date)}</div>
                    </div>
                    <div class="news-post-body">${escapeHTML(post.body).replace(/\n/g, '<br>')}</div>
                    ${isAdmin ? `<button class="btn btn-danger" onclick="deleteNews(${post.id})" style="margin-top:0.8rem; font-size:0.8rem;"><i class="fas fa-trash"></i> Delete</button>` : ''}
                </div>
            `).join('');
        }

        // ── TICKETING: shows, purchase, on-the-spot ticket generation ──
        function escapeHTML(s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }

        function fmtEventDate(iso) {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            let y, m, d;
            if (/^\d{4}-\d{2}-\d{2}/.test(iso)) {
                const parts = iso.split('-'); y = +parts[0]; m = +parts[1]; d = +parts[2];
            } else {
                const dt = new Date(iso);
                if (isNaN(dt.getTime())) return { mon: 'TBA', day: '--', full: iso || 'TBA' };
                y = dt.getFullYear(); m = dt.getMonth() + 1; d = dt.getDate();
            }
            const mon = months[(m - 1) % 12] || 'TBA';
            return { mon: mon.toUpperCase(), day: String(d).padStart(2, '0'), full: mon + ' ' + d + ', ' + y };
        }

        // Render the Tour list from the merged events (defaults + admin-announced)
        function renderTour() {
            const list = document.getElementById('tourList');
            if (!list) return;
            const sorted = [...events].sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));
            if (sorted.length === 0) {
                list.innerHTML = '<div class="tour-empty"><i class="fas fa-calendar-xmark"></i>No shows announced yet — check back soon!</div>';
                return;
            }
            list.innerHTML = sorted.map(ev => {
                const d = fmtEventDate(ev.date);
                const cap = Number(ev.capacity) || 0, sold = Number(ev.sold) || 0;
                const left = Math.max(cap - sold, 0);
                const soldOut = cap > 0 && left <= 0;
                const price = Number(ev.price) || 0;
                const priceLabel = price > 0 ? '$' + price.toFixed(0) + ' CAD' : '<span class="free">Free entry</span>';
                const spotsLabel = soldOut ? '' : (cap > 0 ? ' · <span class="spots' + (left <= 15 ? ' low' : '') + '">' + left + ' left</span>' : '');
                const isCustom = !DEFAULT_EVENTS.find(de => de.id === ev.id);
                const adminDel = (isAdmin && isCustom) ? ' · <a onclick="deleteEvent(\'' + String(ev.id) + '\')" style="color:var(--coral);cursor:pointer;">remove</a>' : '';
                const idAttr = String(ev.id).replace(/'/g, "\\'");
                return `
                <div class="tour-row reveal in">
                    <div class="tour-date"><div class="m">${d.mon}</div><div class="d">${d.day}</div></div>
                    <div class="tour-info">
                        <h4>${escapeHTML(ev.title)}</h4>
                        <span><i class="fas fa-location-dot"></i> ${escapeHTML(ev.city || '')}${ev.venue ? ' — ' + escapeHTML(ev.venue) : ''}</span>
                        <span class="tour-price">${priceLabel}${spotsLabel}${adminDel}</span>
                    </div>
                    ${soldOut
                        ? '<button class="tour-btn soldout" disabled>Sold Out</button>'
                        : '<button class="tour-btn" onclick="openTicketModal(\'' + idAttr + '\')">Get Tickets</button>'}
                </div>`;
            }).join('');
        }

        // Admin: announce a show — lists it in Tour AND auto-posts a News announcement
        async function announceEvent() {
            if (!isAdmin) { showNotification('Admin access required'); return; }
            const title = document.getElementById('evTitle').value.trim();
            const date = document.getElementById('evDate').value.trim();
            const venue = document.getElementById('evVenue').value.trim();
            const city = document.getElementById('evCity').value.trim();
            const price = parseFloat(document.getElementById('evPrice').value) || 0;
            const capacity = parseInt(document.getElementById('evCap').value) || 0;
            if (!title || !date) { showNotification('Please add at least a show title and date'); return; }

            const ev = { id: Date.now(), title, date, venue, city, price, capacity, sold: 0, announcedAt: new Date().toISOString() };
            await dbPut('events', ev);
            events.push(ev);

            // Announce the day's event to fans via the News feed
            const d = fmtEventDate(date);
            const news = {
                id: Date.now() + 1,
                title: '🎫 New Show: ' + title,
                body: 'P2K just announced ' + title + ' on ' + d.full + (city ? ' in ' + city : '') + (venue ? ' at ' + venue : '') + '. ' + (price > 0 ? 'Tickets $' + price.toFixed(0) + ' CAD' : 'Free entry') + ' — grab yours in the Tour section!',
                date: new Date().toLocaleString()
            };
            await dbPut('news', news);

            ['evTitle', 'evDate', 'evVenue', 'evCity', 'evPrice', 'evCap'].forEach(id => document.getElementById(id).value = '');
            renderTour();
            await loadNews();
            showNotification('Show announced — ticket sales are live!');
        }

        async function deleteEvent(id) {
            if (!isAdmin) return;
            events = events.filter(e => String(e.id) !== String(id));
            await dbDelete('events', isNaN(Number(id)) ? id : Number(id));
            renderTour();
            showNotification('Show removed');
        }

        // Ticket purchase modal
        function openTicketModal(eventId) {
            const ev = events.find(e => String(e.id) === String(eventId));
            if (!ev) return;
            const cap = Number(ev.capacity) || 0, sold = Number(ev.sold) || 0;
            if (cap > 0 && sold >= cap) { showNotification('Sorry, this show is sold out'); return; }
            currentTicketEventId = ev.id;
            const d = fmtEventDate(ev.date);
            const price = Number(ev.price) || 0;

            document.getElementById('ticketBuyView').style.display = 'block';
            const rv = document.getElementById('ticketResultView');
            rv.style.display = 'none'; rv.innerHTML = '';
            document.getElementById('tmEventInfo').innerHTML = '<b>' + escapeHTML(ev.title) + '</b><small><i class="fas fa-calendar"></i> ' + d.full + ' &nbsp;·&nbsp; <i class="fas fa-location-dot"></i> ' + escapeHTML(ev.city || '') + (ev.venue ? ' — ' + escapeHTML(ev.venue) : '') + '</small>';
            document.getElementById('tmPrice').textContent = price > 0 ? ('$' + price.toFixed(2) + ' CAD') : 'Free RSVP';
            document.getElementById('tmName').value = '';
            document.getElementById('tmEmail').value = '';

            const pay = document.getElementById('tmPayContainer');
            pay.innerHTML = '';
            if (price > 0) {
                // Real PayPal checkout — the ticket is only issued after the server captures.
                mountCheckout(pay, () => ticketPayload(ev),
                    (data) => finalizeTicket(ev, data.ticket, (data.ticket && data.ticket.holder) || '', (data.ticket && data.ticket.email) || ''));
            } else {
                const b = document.createElement('button');
                b.className = 'cta-button'; b.style.width = '100%'; b.style.justifyContent = 'center';
                b.innerHTML = '<i class="fas fa-ticket"></i> Reserve Free Ticket';
                b.addEventListener('click', () => reserveFreeTicket(ev));
                pay.appendChild(b);
            }
            document.getElementById('ticketModal').classList.add('show');
        }

        function closeTicketModal() {
            document.getElementById('ticketModal').classList.remove('show');
            currentTicketEventId = null;
        }

        function genTicketCode(ev) {
            const base = (ev.city || ev.title || 'P2K').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'P2K';
            const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
            return 'P2K-' + base + '-' + rand;
        }

        // Encoded in the QR — a validation URL the backend can verify at the door tomorrow
        function ticketQRData(t) { return 'https://p2k-music.ca/t/' + t.id; }

        function makeQR(container, text) {
            if (!container) return;
            container.innerHTML = '';
            try {
                if (window.QRCode) {
                    new QRCode(container, { text: text, width: 160, height: 160, colorDark: '#04121a', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
                    return;
                }
            } catch (e) { /* fall through to image fallback */ }
            const img = new Image();
            img.alt = 'Ticket QR code';
            img.onerror = () => { container.innerHTML = '<div class="qr-fallback">' + escapeHTML(text) + '</div>'; };
            img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=' + encodeURIComponent(text);
            container.appendChild(img);
        }

        function ticketHTML(t) {
            const d = fmtEventDate(t.eventDate);
            const priceLine = Number(t.price) > 0 ? '$' + Number(t.price).toFixed(2) + ' CAD' : 'Free RSVP';
            return `
            <div class="ticket">
                <div class="ticket-top"><span class="tt-brand">p2k-music.ca</span><span class="tt-type">Admit One</span></div>
                <div class="ticket-body">
                    <div class="ticket-qr"></div>
                    <div class="ticket-details">
                        <div class="td-show">${escapeHTML(t.eventTitle)}</div>
                        <div class="td-row"><i class="fas fa-calendar"></i> ${d.full}</div>
                        <div class="td-row"><i class="fas fa-location-dot"></i> ${escapeHTML(t.city || '')}${t.venue ? ' — ' + escapeHTML(t.venue) : ''}</div>
                        <div class="td-row"><i class="fas fa-user"></i> ${escapeHTML(t.holder)}</div>
                        <div class="td-row"><i class="fas fa-tag"></i> ${priceLine}</div>
                    </div>
                </div>
                <div class="ticket-perf"></div>
                <div class="ticket-code"><span class="tc-label">Ticket No.</span><span class="tc-val">${escapeHTML(t.id)}</span></div>
            </div>`;
        }

        function buildTicketNode(t) {
            const wrap = document.createElement('div');
            wrap.innerHTML = ticketHTML(t);
            const node = wrap.firstElementChild;
            makeQR(node.querySelector('.ticket-qr'), ticketQRData(t));
            return node;
        }

        // Build the /api/orders payload for a ticket, validating the holder name.
        // Returns null (with a message) to abort checkout before any PayPal order opens.
        function ticketPayload(ev) {
            const holder = document.getElementById('tmName').value.trim();
            if (!holder) { showNotification('Please enter the name for the ticket'); document.getElementById('tmName').focus(); return null; }
            const cap = Number(ev.capacity) || 0, sold = Number(ev.sold) || 0;
            if (cap > 0 && sold >= cap) { showNotification('Sorry, this show just sold out'); return null; }
            return {
                kind: 'ticket', ref: String(ev.id), title: ev.title, price: Number(ev.price) || 0,
                holder: holder, email: document.getElementById('tmEmail').value.trim(),
                eventDate: ev.date, venue: ev.venue || '', city: ev.city || ''
            };
        }

        // Free RSVP — no PayPal; the server still issues a signed ticket (or we fall
        // back to a local one if the backend is offline).
        async function reserveFreeTicket(ev) {
            const holder = document.getElementById('tmName').value.trim();
            if (!holder) { showNotification('Please enter the name for the ticket'); document.getElementById('tmName').focus(); return; }
            const email = document.getElementById('tmEmail').value.trim();
            try {
                const ord = await api('POST', '/api/orders', {
                    kind: 'ticket', ref: String(ev.id), title: ev.title, price: 0,
                    holder: holder, email: email, eventDate: ev.date, venue: ev.venue || '', city: ev.city || ''
                });
                if (ord.ok && ord.data && ord.data.orderId) {
                    const cap = await api('POST', '/api/orders/' + ord.data.orderId + '/capture', {});
                    if (cap.ok && cap.data && cap.data.paid) { finalizeTicket(ev, cap.data.ticket, holder, email); return; }
                }
            } catch (e) { /* backend offline — issue locally below */ }
            finalizeTicket(ev, null, holder, email);
        }

        // Save + render a freshly issued ticket. `st` is the server-signed ticket
        // (preferred, validatable at the door) or null for the offline fallback.
        async function finalizeTicket(ev, st, holder, email) {
            const ticket = st ? {
                id: st.code, eventId: ev.id, eventTitle: st.eventTitle || ev.title, eventDate: st.eventDate || ev.date,
                venue: st.venue || ev.venue || '', city: st.city || ev.city || '', holder: st.holder || holder,
                email: st.email || email, price: Number(st.price) || 0, purchasedAt: new Date().toISOString(),
                status: st.status || 'valid', serverIssued: true
            } : {
                id: genTicketCode(ev), eventId: ev.id, eventTitle: ev.title, eventDate: ev.date,
                venue: ev.venue || '', city: ev.city || '', holder: holder, email: email,
                price: Number(ev.price) || 0, purchasedAt: new Date().toISOString(), status: 'valid'
            };

            ev.sold = (Number(ev.sold) || 0) + 1;
            await dbPut('tickets', ticket);
            await dbPut('events', ev); // persist sold count (and default events on first sale)
            myTickets.push(ticket);

            const view = document.getElementById('ticketResultView');
            document.getElementById('ticketBuyView').style.display = 'none';
            view.style.display = 'block';
            view.innerHTML = '<h3><i class="fas fa-circle-check"></i> You\'re In!</h3><div class="ticket-status"><i class="fas fa-shield-halved"></i> Ticket saved to this device</div>';
            view.appendChild(buildTicketNode(ticket));
            const done = document.createElement('button');
            done.className = 'btn'; done.style.width = '100%'; done.style.marginTop = '0.5rem';
            done.innerHTML = '<i class="fas fa-check"></i> Done';
            done.onclick = closeTicketModal;
            view.appendChild(done);

            if (ticket.price > 0) logRevenue('ticket', ticket.eventTitle, ticket.price);
            renderTour();
            loadMyTickets();
            showNotification('🎫 Ticket generated for ' + (ticket.holder || 'you') + '!');
        }

        function loadMyTickets() {
            const wrap = document.getElementById('myTicketsWrap');
            const grid = document.getElementById('myTicketsGrid');
            if (!grid || !wrap) return;
            if (!myTickets || myTickets.length === 0) { wrap.style.display = 'none'; grid.innerHTML = ''; return; }
            wrap.style.display = 'block';
            grid.innerHTML = '';
            [...myTickets].sort((a, b) => (a.purchasedAt < b.purchasedAt ? 1 : -1)).forEach(t => grid.appendChild(buildTicketNode(t)));
        }

        // ── SCAN & CHECK-IN (admin door mode) ──
        let scanStream = null, scanning = false, scanCanvas = null, lastScanCode = '', lastScanTime = 0;

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

        // Pull the ticket code out of a raw scan (handles the QR URL or a bare code)
        function extractCode(text) {
            if (!text) return '';
            text = String(text).trim();
            const m = text.match(/([A-Za-z0-9]+-[A-Za-z0-9]+-[A-Za-z0-9]+)\s*$/);
            if (m) return m[1].toUpperCase();
            if (text.indexOf('/') >= 0) { const parts = text.split('/').filter(Boolean); text = parts[parts.length - 1] || text; }
            return text.toUpperCase();
        }

        function toggleScanner() { scanning ? stopScanner() : startScanner(); }

        async function startScanner() {
            const video = document.getElementById('scanVideo');
            try {
                scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                video.srcObject = scanStream;
                await video.play();
                document.getElementById('scannerBox').classList.add('active');
                document.getElementById('scanToggleBtn').innerHTML = '<i class="fas fa-stop"></i> Stop Camera';
                scanning = true;
                scanLoop();
            } catch (e) {
                showNotification('Camera unavailable — use manual code entry');
                document.getElementById('scanIdle').innerHTML = '<i class="fas fa-triangle-exclamation"></i><p>Camera unavailable<br><small>Use manual entry below</small></p>';
            }
        }

        function stopScanner() {
            scanning = false;
            if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
            const v = document.getElementById('scanVideo');
            if (v) v.srcObject = null;
            const box = document.getElementById('scannerBox');
            if (box) box.classList.remove('active');
            const btn = document.getElementById('scanToggleBtn');
            if (btn) btn.innerHTML = '<i class="fas fa-camera"></i> Start Camera';
        }

        function scanLoop() {
            if (!scanning) return;
            const video = document.getElementById('scanVideo');
            if (video && video.readyState === video.HAVE_ENOUGH_DATA && window.jsQR) {
                scanCanvas = scanCanvas || document.createElement('canvas');
                scanCanvas.width = video.videoWidth;
                scanCanvas.height = video.videoHeight;
                const cx = scanCanvas.getContext('2d');
                cx.drawImage(video, 0, 0, scanCanvas.width, scanCanvas.height);
                try {
                    const img = cx.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
                    const res = jsQR(img.data, img.width, img.height);
                    if (res && res.data) handleScan(res.data);
                } catch (e) { /* frame not ready */ }
            }
            requestAnimationFrame(scanLoop);
        }

        function handleScan(text) {
            const code = extractCode(text);
            const now = Date.now();
            if (code === lastScanCode && now - lastScanTime < 3000) return; // debounce repeat frames
            lastScanCode = code; lastScanTime = now;
            if (navigator.vibrate) navigator.vibrate(60);
            doCheckIn(code);
        }

        function checkInManual() {
            const input = document.getElementById('manualCode');
            const v = input.value.trim();
            if (!v) { showNotification('Enter a ticket code'); return; }
            doCheckIn(v);
            input.value = '';
        }

        // Shape a server ticket payload into what renderCheckinResult expects
        function srvTicket(t, code) {
            return { id: code, holder: t.holder, eventTitle: t.event_title, eventDate: t.event_date, checkedInAt: t.checked_in_at };
        }

        async function doCheckIn(raw) {
            const code = extractCode(raw);
            if (!code) return;

            // Prefer the SERVER: validates + marks used cross-device (the door scanner
            // no longer needs the ticket to live in its own browser).
            try {
                const look = await api('GET', '/api/ticket/' + encodeURIComponent(code));
                if (look.ok && look.data) {
                    const t = look.data;
                    if (t.forged) { renderCheckinResult('invalid', null, code); return; }
                    if (t.status === 'checked-in') { renderCheckinResult('used', srvTicket(t, code), code); return; }
                    if (t.status === 'void') { renderCheckinResult('invalid', null, code); return; }
                    const chk = await api('POST', '/api/ticket/' + encodeURIComponent(code) + '/checkin');
                    if (chk.ok && chk.data && chk.data.ok) { renderCheckinResult('valid', srvTicket(t, code), code); await loadCheckinLog(); return; }
                    if (chk.data && chk.data.alreadyUsed) { renderCheckinResult('used', srvTicket(chk.data, code), code); return; }
                    renderCheckinResult('invalid', null, code); return;
                }
                // 404 → not a server ticket; fall through to the local store
            } catch (e) { /* backend unreachable — fall back to local tickets */ }

            // Fallback: this device's own IndexedDB tickets (offline / no backend)
            let ticket = await dbGet('tickets', code);
            if (!ticket) ticket = (myTickets || []).find(t => t.id === code) || null;
            if (!ticket) { renderCheckinResult('invalid', null, code); return; }
            if (ticket.status === 'checked-in') { renderCheckinResult('used', ticket, code); return; }
            ticket.status = 'checked-in';
            ticket.checkedInAt = new Date().toISOString();
            await dbPut('tickets', ticket);
            const idx = (myTickets || []).findIndex(t => t.id === code);
            if (idx >= 0) myTickets[idx] = ticket;
            renderCheckinResult('valid', ticket, code);
            await loadCheckinLog();
        }

        function renderCheckinResult(state, ticket, code) {
            const box = document.getElementById('checkinResult');
            if (!box) return;
            if (state === 'valid') {
                const d = fmtEventDate(ticket.eventDate);
                box.className = 'checkin-result ok';
                box.innerHTML = '<div class="ci-icon"><i class="fas fa-circle-check"></i></div><div class="ci-title">Checked In</div>' +
                    '<div class="ci-name">' + escapeHTML(ticket.holder) + '</div>' +
                    '<div class="ci-meta">' + escapeHTML(ticket.eventTitle) + ' · ' + d.full + '</div>' +
                    '<div class="ci-code">' + escapeHTML(ticket.id) + '</div>';
            } else if (state === 'used') {
                const when = ticket.checkedInAt ? new Date(ticket.checkedInAt).toLocaleString() : 'earlier';
                box.className = 'checkin-result warn';
                box.innerHTML = '<div class="ci-icon"><i class="fas fa-triangle-exclamation"></i></div><div class="ci-title">Already In</div>' +
                    '<div class="ci-name">' + escapeHTML(ticket.holder) + '</div>' +
                    '<div class="ci-meta">Entered ' + escapeHTML(when) + '</div>' +
                    '<div class="ci-code">' + escapeHTML(ticket.id) + '</div>';
            } else {
                box.className = 'checkin-result bad';
                box.innerHTML = '<div class="ci-icon"><i class="fas fa-circle-xmark"></i></div><div class="ci-title">Not Found</div>' +
                    '<div class="ci-meta">No ticket matches this code on this device</div>' +
                    '<div class="ci-code">' + escapeHTML(code || '—') + '</div>';
            }
        }

        async function loadCheckinLog() {
            const all = await dbGetAll('tickets');
            const inList = all.filter(t => t.status === 'checked-in').sort((a, b) => (a.checkedInAt < b.checkedInAt ? 1 : -1));
            const cnt = document.getElementById('ciCount');
            if (cnt) cnt.textContent = inList.length;
            const log = document.getElementById('checkinLog');
            if (!log) return;
            if (inList.length === 0) { log.innerHTML = '<div class="ci-log-empty">No check-ins yet.</div>'; return; }
            log.innerHTML = inList.slice(0, 20).map(t =>
                '<div class="ci-log-row"><span><i class="fas fa-check"></i> ' + escapeHTML(t.holder) + '</span><span class="ci-log-code">' + escapeHTML(t.id) + '</span></div>'
            ).join('');
        }

        // ── MERCH: PayPal checkout with size + quantity ──
        const MERCH_ITEMS = {
            tee:      { name: 'P2K Logo Tee',       price: 32, icon: 'fa-shirt',        sizes: ['S', 'M', 'L', 'XL', '2XL'] },
            hoodie:   { name: 'Underground Hoodie', price: 64, icon: 'fa-vest',         sizes: ['S', 'M', 'L', 'XL', '2XL'] },
            vinyl:    { name: 'Limited Vinyl',      price: 40, icon: 'fa-record-vinyl', sizes: null },
            stickers: { name: 'Sticker Pack',       price: 12, icon: 'fa-compact-disc', sizes: null }
        };
        let currentMerch = null, merchQty = 1;

        function openMerchModal(id) {
            const it = MERCH_ITEMS[id];
            if (!it) return;
            currentMerch = id; merchQty = 1;
            document.getElementById('mmIcon').innerHTML = '<i class="fas ' + it.icon + '"></i>';
            document.getElementById('mmName').textContent = it.name;
            document.getElementById('mmUnit').textContent = '$' + it.price.toFixed(2) + ' CAD each';
            document.getElementById('mmQtyVal').textContent = '1';
            const sizeWrap = document.getElementById('mmSizeWrap');
            const sizeSel = document.getElementById('mmSize');
            if (it.sizes) {
                sizeWrap.style.display = 'block';
                sizeSel.innerHTML = it.sizes.map(s => '<option value="' + s + '">' + s + '</option>').join('');
            } else {
                sizeWrap.style.display = 'none';
                sizeSel.innerHTML = '';
            }
            updateMerchTotal();
            mountCheckout(document.getElementById('mmPayContainer'), () => merchPayload(), () => onMerchPaid());
            document.getElementById('merchModal').classList.add('show');
        }

        function closeMerchModal() {
            document.getElementById('merchModal').classList.remove('show');
            currentMerch = null;
        }

        // Read the live selection (size + quantity) at click time so one mounted
        // button always charges the current total.
        function merchPayload() {
            const it = MERCH_ITEMS[currentMerch];
            if (!it) return null;
            const size = it.sizes ? (document.getElementById('mmSize').value || '') : '';
            const total = it.price * merchQty;
            const label = it.name + (size ? ' - Size ' + size : '') + (merchQty > 1 ? ' x' + merchQty : '');
            return { kind: 'merch', ref: currentMerch, title: label + ' - p2k-music.ca', price: total };
        }

        function onMerchPaid() {
            const it = MERCH_ITEMS[currentMerch];
            const total = it ? it.price * merchQty : 0;
            const label = it ? it.name + (merchQty > 1 ? ' x' + merchQty : '') : 'Merch';
            logRevenue('merch', label, total);
            closeMerchModal();
            showNotification('Order placed — thank you! Ships in 5–7 days.');
        }

        function mmQty(delta) {
            merchQty = Math.max(1, Math.min(10, merchQty + delta));
            document.getElementById('mmQtyVal').textContent = merchQty;
            updateMerchTotal();
        }

        // Quantity/size only change the displayed total — the mounted checkout
        // button reads the current selection at click time (see merchPayload).
        function updateMerchTotal() {
            const it = MERCH_ITEMS[currentMerch];
            if (!it) return;
            const total = it.price * merchQty;
            document.getElementById('mmTotal').textContent = '$' + total.toFixed(2) + ' CAD';
        }

        // ── PODCAST: episodes, playback, guest applications & invites ──
        function val(id) { const el = document.getElementById(id); return el ? (el.value || '').trim() : ''; }

        function renderPodcast() {
            const grid = document.getElementById('podcastGrid');
            if (!grid) return;
            const sorted = [...episodes].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
            if (sorted.length === 0) {
                grid.innerHTML = '<div class="tour-empty"><i class="fas fa-podcast"></i>No episodes yet — stay tuned!</div>';
                return;
            }
            grid.innerHTML = sorted.map(ep => {
                const d = fmtEventDate(ep.date);
                const idAttr = String(ep.id).replace(/'/g, "\\'");
                return `
                <div class="episode-card reveal in" id="epCard${ep.id}">
                    <div class="episode-art"><i class="fas fa-podcast"></i><span class="episode-ep">EP</span></div>
                    <div class="episode-body">
                        <div class="episode-meta">${d.full}${ep.guest ? ' · <i class="fas fa-microphone"></i> ' + escapeHTML(ep.guest) : ''}</div>
                        <h4 class="episode-title">${escapeHTML(ep.title)}</h4>
                        <p class="episode-desc">${escapeHTML(ep.description || '')}</p>
                        <div class="play-controls">
                            <button class="play-btn" onclick="togglePodcast('${idAttr}')"><i class="fas fa-play" id="epIcon${ep.id}"></i></button>
                            <div class="progress-bar"><div class="progress-fill" id="epProgress${ep.id}"></div></div>
                            <div class="time-display" id="epTime${ep.id}">${ep.duration || '--:--'}</div>
                        </div>
                        ${isAdmin ? `<button class="btn btn-danger" onclick="removeEpisode('${idAttr}')" style="margin-top:0.5rem; font-size:0.8rem;"><i class="fas fa-trash"></i> Remove</button>` : ''}
                    </div>
                </div>`;
            }).join('');
        }

        function togglePodcast(id) {
            const ep = episodes.find(e => String(e.id) === String(id));
            if (!ep) return;
            if (!ep.audio) { showNotification('This episode\'s audio is coming soon'); return; }
            const icon = document.getElementById('epIcon' + id);
            if (currentAudio && !currentAudio.paused) currentAudio.pause(); // don't overlap with music player

            if (podcastAudio && String(currentPodcastId) === String(id)) {
                if (podcastAudio.paused) { podcastAudio.play(); if (icon) icon.className = 'fas fa-pause'; }
                else { podcastAudio.pause(); if (icon) icon.className = 'fas fa-play'; }
                return;
            }
            if (podcastAudio) {
                podcastAudio.pause();
                const prev = document.getElementById('epIcon' + currentPodcastId);
                if (prev) prev.className = 'fas fa-play';
            }
            podcastAudio = new Audio(ep.audio.startsWith('data:') ? ep.audio : encodeAudioURL(ep.audio));
            currentPodcastId = id;
            podcastAudio.play().catch(() => showNotification('Could not play this episode'));
            if (icon) icon.className = 'fas fa-pause';
            try { vizConnect(podcastAudio); setPlayingUI(true); } catch(e) {}
            podcastAudio.addEventListener('timeupdate', () => {
                if (!podcastAudio.duration) return;
                const pf = document.getElementById('epProgress' + id);
                const td = document.getElementById('epTime' + id);
                if (pf) pf.style.width = (podcastAudio.currentTime / podcastAudio.duration * 100) + '%';
                if (td) td.textContent = formatTime(podcastAudio.currentTime) + ' / ' + formatTime(podcastAudio.duration);
            });
            podcastAudio.addEventListener('ended', () => { if (icon) icon.className = 'fas fa-play'; });
            podcastAudio.addEventListener('error', () => { if (icon) icon.className = 'fas fa-play'; showNotification('Episode audio unavailable'); });
        }

        async function removeEpisode(id) {
            if (!isAdmin) return;
            if (podcastAudio && String(currentPodcastId) === String(id)) { podcastAudio.pause(); podcastAudio = null; currentPodcastId = null; }
            episodes = episodes.filter(e => String(e.id) !== String(id));
            await dbDelete('podcast', isNaN(Number(id)) ? id : Number(id));
            renderPodcast();
            showNotification('Episode removed');
        }

        // Admin: publish a new episode (from an uploaded file or a URL) + auto-announce to News
        async function addEpisode() {
            if (!isAdmin) { showNotification('Admin access required'); return; }
            const title = val('epTitle');
            if (!title) { showNotification('Give the episode a title'); return; }
            const guest = val('epGuest'), date = val('epDate'), desc = val('epDesc'), url = val('epAudioUrl');
            const fileInput = document.getElementById('epUpload');

            const finish = async (audio) => {
                const ep = { id: Date.now(), title, guest, date, description: desc, audio: audio || url || '', duration: '--:--', uploaded: true, publishedAt: new Date().toISOString() };
                await dbPut('podcast', ep);
                episodes.push(ep);
                ['epTitle', 'epGuest', 'epDate', 'epDesc', 'epAudioUrl'].forEach(x => { const el = document.getElementById(x); if (el) el.value = ''; });
                if (fileInput) fileInput.value = '';
                renderPodcast();
                await dbPut('news', { id: Date.now() + 1, title: '🎙️ New Podcast Episode', body: '"' + title + '"' + (guest ? ' with ' + guest : '') + ' is live on The P2K Podcast. Tune in!', date: new Date().toLocaleString() });
                await loadNews();
                showNotification('Episode published!');
            };

            if (fileInput && fileInput.files && fileInput.files[0]) {
                const reader = new FileReader();
                reader.onload = (ev) => finish(ev.target.result);
                reader.readAsDataURL(fileInput.files[0]);
            } else {
                finish('');
            }
        }

        // Public: a fan/artist applies to be a guest
        async function submitGuestApplication(e) {
            e.preventDefault();
            const app = { id: Date.now(), type: 'application', name: val('guestName'), email: val('guestEmail'), links: val('guestLinks'), topic: val('guestTopic'), date: new Date().toLocaleString(), status: 'new' };
            if (!app.name || !app.topic) return;
            await dbPut('guests', app);
            guestApps.push(app);
            ['guestName', 'guestEmail', 'guestLinks', 'guestTopic'].forEach(x => { const el = document.getElementById(x); if (el) el.value = ''; });
            if (isAdmin) loadGuestAdmin();
            showNotification('Thanks ' + app.name + '! Your pitch is in — P2K will be in touch.');
        }

        // Admin: create an invite for a specific guest and produce a shareable message
        async function generateInvite() {
            if (!isAdmin) { showNotification('Admin access required'); return; }
            const name = val('invName');
            if (!name) { showNotification('Enter the guest\'s name'); return; }
            const date = val('invDate'), show = val('invShow');
            const code = 'GUEST-' + Math.random().toString(36).slice(2, 7).toUpperCase();
            const whenTxt = date ? fmtEventDate(date).full : 'a date TBC';
            const link = 'https://p2k-music.ca/podcast?invite=' + code;
            const message = 'Hey ' + name + '! P2K wants you as a guest on The P2K Podcast' + (show ? ' — "' + show + '"' : '') + ' on ' + whenTxt + '.\nYour guest pass: ' + code + '\nConfirm here: ' + link;
            const invite = { id: Date.now(), type: 'invite', name, show, date, code, message, createdAt: new Date().toLocaleString(), status: 'sent' };
            await dbPut('guests', invite);
            guestApps.push(invite);

            const box = document.getElementById('inviteResult');
            if (box) {
                box.innerHTML = '<div class="invite-card"><div class="invite-code">' + escapeHTML(code) + '</div><div class="invite-msg">' + escapeHTML(message) + '</div><button class="btn" onclick="copyInvite(' + invite.id + ')" style="width:100%;"><i class="fas fa-copy"></i> Copy Invite Message</button></div>';
            }
            ['invName', 'invDate', 'invShow'].forEach(x => { const el = document.getElementById(x); if (el) el.value = ''; });
            loadGuestAdmin();
            showNotification('Invite created for ' + name);
        }

        function copyInvite(id) {
            const inv = guestApps.find(g => String(g.id) === String(id));
            if (!inv) return;
            const text = inv.message || '';
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => showNotification('Invite copied to clipboard')).catch(() => fallbackCopy(text));
            } else { fallbackCopy(text); }
        }

        function fallbackCopy(text) {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
            document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); showNotification('Invite copied'); } catch (e) { showNotification('Copy failed — select the text manually'); }
            document.body.removeChild(ta);
        }

        function loadGuestAdmin() {
            const list = document.getElementById('guestAdminList');
            if (!list) return;
            const items = [...guestApps].sort((a, b) => (a.id < b.id ? 1 : -1));
            if (items.length === 0) { list.innerHTML = '<div class="no-comments">No applications or invites yet.</div>'; return; }
            list.innerHTML = items.map(g => {
                if (g.type === 'invite') {
                    return '<div class="guest-item invite"><span class="guest-tag">Invite</span><b>' + escapeHTML(g.name) + '</b> · ' + escapeHTML(g.code || '') + (g.show ? ' · ' + escapeHTML(g.show) : '') + '<div class="guest-sub" style="opacity:0.6;">' + escapeHTML(g.createdAt || '') + '</div></div>';
                }
                return '<div class="guest-item"><span class="guest-tag app">Applied</span><b>' + escapeHTML(g.name) + '</b>' + (g.email ? ' · ' + escapeHTML(g.email) : '') + '<div class="guest-sub">' + escapeHTML(g.topic || '') + '</div><div class="guest-sub" style="opacity:0.6;">' + escapeHTML(g.date || '') + (g.links ? ' · ' + escapeHTML(g.links) : '') + '</div></div>';
            }).join('');
        }

        // ── REVENUE & PROFIT DASHBOARD ──
        const PROFIT_SOURCES = [
            { key: 'music',  label: 'Music Sales', icon: 'fa-music',        color: '#00d4ff' },
            { key: 'ticket', label: 'Tickets',     icon: 'fa-ticket',       color: '#ff2d95' },
            { key: 'merch',  label: 'Merch',       icon: 'fa-bag-shopping', color: '#ffc439' },
            { key: 'listen', label: 'Listening',   icon: 'fa-headphones',   color: '#00e6c0' },
            { key: 'ad',     label: 'Ads',         icon: 'fa-rectangle-ad', color: '#ff6b6b' },
            { key: 'other',  label: 'Other',       icon: 'fa-coins',        color: '#7c3aed' }
        ];

        // Central hook: turn any monetizable action into a banked, monitored fund entry
        async function logRevenue(source, label, amount) {
            amount = Number(amount) || 0;
            if (amount <= 0) return;
            const rec = { id: Date.now() + Math.random(), source: source, label: label || '', amount: amount, date: new Date().toISOString() };
            revenueLog.push(rec);
            try { await dbPut('revenue', rec); } catch (e) {}
            renderProfit();
        }

        async function recordIncome() {
            if (!isAdmin) { showNotification('Admin access required'); return; }
            const source = val('incSource') || 'other';
            const label = val('incLabel') || 'Manual entry';
            const amount = parseFloat(document.getElementById('incAmount').value) || 0;
            if (amount <= 0) { showNotification('Enter an amount'); return; }
            await logRevenue(source, label, amount);
            document.getElementById('incLabel').value = '';
            document.getElementById('incAmount').value = '';
            showNotification('Added $' + amount.toFixed(2) + ' to profit');
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
                return '<div class="psource"><div class="psource-icon" style="color:' + s.color + '"><i class="fas ' + s.icon + '"></i></div><div class="psource-amt">$' + d.amt.toFixed(2) + '</div><div class="psource-label">' + s.label + (d.n ? ' · ' + d.n : '') + '</div></div>';
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
                    return '<div class="pledger-row"><span class="pledger-src" style="color:' + src.color + '"><i class="fas ' + src.icon + '"></i></span><span class="pledger-label">' + escapeHTML(r.label || src.label) + '<span class="pledger-date">' + new Date(r.date).toLocaleString() + '</span></span><span class="pledger-amt">+$' + (Number(r.amount) || 0).toFixed(2) + '</span></div>';
                }).join('');
            }
        }

        // INITIALIZE
        async function init() {
            const adminReady = checkAdminStatus(); // resolves once the server session is known
            const configReady = loadSiteConfig();  // mode + public PayPal client id
            try {
                await openDB();
                await loadFromDB();
                await loadBackground();
            } catch(e) {
                console.warn('IndexedDB init failed, using defaults:', e);
            }
            await configReady; // checkout needs to know live vs demo before any Buy click
            // Check which audio files actually exist on the server (only where the music grid exists)
            if (document.getElementById('songsGrid')) await checkFileAvailability();
            renderSongs();
            renderGallery();
            renderTour();
            loadMyTickets();
            renderPodcast();
            loadGuestAdmin();
            renderProfit();
            await loadComments();
            await loadNews();
            // Set up drag & drop zones
            setupDropZone('songDropZone', 'songUpload', 'song');
            setupDropZone('imageDropZone', 'imageUpload', 'image');
            setupDropZone('bgDropZone', 'bgUpload', 'bg');
            if (document.body.dataset.page === 'home') showNotification('Welcome to p2k-music.ca');
            // Admin page: once the server has answered, prompt sign-in if needed
            // (replaces the old localStorage gate — the server session is the truth).
            if (document.body.dataset.page === 'admin') {
                await adminReady;
                if (!isAdmin) showAdminLogin();
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

        // updateAdminUI lives at the bottom of this file (the page-safe,
        // null-guarded version) — every page shares it.

        /* ============================================================
           VISUAL FX LAYER (particles, visualizer, scrollspy, reveal,
           counters, loader, cursor, tilt) — additive, non-breaking.
           ============================================================ */

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
            links.forEach(a => {
                const href = a.getAttribute('href') || '';
                if (href.startsWith('#') && href.length > 1) map[href.slice(1)] = a;
            });
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

        // ---- Card tilt (event delegation, works for dynamic cards) ----
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

        // ---- Particle network background ----
        function initParticles() {
            const canvas = document.getElementById('fxParticles');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            let w, h, particles = [];
            // Palette-matched glow colours (cyan / violet / magenta / coral / gold)
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
                        tw: Math.random() * Math.PI * 2  // twinkle phase
                    };
                });
            }
            function draw() {
                ctx.clearRect(0, 0, w, h);
                ctx.globalCompositeOperation = 'lighter';  // additive glow
                for (let i = 0; i < particles.length; i++) {
                    const p = particles[i];
                    // gentle drift + soft repulsion from the cursor for interactivity
                    if (mouse.active) {
                        const mdx = p.x - mouse.x, mdy = p.y - mouse.y;
                        const md = Math.hypot(mdx, mdy);
                        if (md < 140 && md > 0.1) { const f = (140 - md) / 140 * 0.6; p.vx += (mdx / md) * f * 0.08; p.vy += (mdy / md) * f * 0.08; }
                    }
                    p.vx *= 0.99; p.vy *= 0.99;                 // damping so pushes settle
                    p.x += p.vx; p.y += p.vy;
                    if (p.x < 0 || p.x > w) p.vx *= -1;
                    if (p.y < 0 || p.y > h) p.vy *= -1;
                    p.tw += 0.03;
                    const a = 0.45 + 0.35 * Math.sin(p.tw);     // twinkle
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
                            // tint the link with this node's colour, fading with distance
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

        // ---- Audio visualizer (Web Audio API) with graceful fallback ----
        let vizCtx = null, vizAnalyser = null, vizData = null, vizConnected = new WeakSet(), vizRAF = null;
        function ensureVizCtx() {
            if (vizCtx) return true;
            try {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return false;
                vizCtx = new AC();
                vizAnalyser = vizCtx.createAnalyser();
                vizAnalyser.fftSize = 128;
                vizData = new Uint8Array(vizAnalyser.frequencyBinCount);
                vizAnalyser.connect(vizCtx.destination);
                return true;
            } catch (e) { return false; }
        }
        function vizConnect(audioEl) {
            if (!ensureVizCtx() || !audioEl) { startViz(false); return; }
            if (vizCtx.state === 'suspended') vizCtx.resume();
            if (!vizConnected.has(audioEl)) {
                try {
                    const src = vizCtx.createMediaElementSource(audioEl);
                    src.connect(vizAnalyser);
                    vizConnected.add(audioEl);
                } catch (e) { /* one source per element; ignore */ }
            }
            startViz(true);
        }
        function startViz(real) {
            const canvas = document.getElementById('pageViz');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            function size() { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; }
            size();
            cancelAnimationFrame(vizRAF);
            let t = 0;
            function frame() {
                const W = canvas.width, H = canvas.height;
                ctx.clearRect(0, 0, W, H);
                const bars = 64;
                const bw = W / bars;
                if (real && vizAnalyser) vizAnalyser.getByteFrequencyData(vizData);
                for (let i = 0; i < bars; i++) {
                    let v;
                    if (real && vizData) {
                        v = (vizData[i % vizData.length] / 255);
                    } else {
                        v = (Math.sin(i * 0.35 + t * 0.08) * 0.5 + 0.5) * (0.35 + 0.4 * Math.sin(t * 0.05 + i));
                        v = Math.abs(v);
                    }
                    const bh = Math.max(2, v * H * 0.9);
                    const x = i * bw;
                    const grad = ctx.createLinearGradient(0, H, 0, H - bh);
                    grad.addColorStop(0, 'rgba(0,212,255,0.9)');
                    grad.addColorStop(0.5, 'rgba(124,58,237,0.8)');
                    grad.addColorStop(1, 'rgba(255,45,149,0.9)');
                    ctx.fillStyle = grad;
                    ctx.fillRect(x + bw * 0.15, H - bh, bw * 0.7, bh);
                }
                t++;
                const stillPlaying = currentAudio && !currentAudio.paused;
                if (real && !stillPlaying) { fadeViz(ctx, canvas); return; }
                vizRAF = requestAnimationFrame(frame);
            }
            frame();
        }
        function fadeViz(ctx, canvas) {
            // gentle idle wave when nothing is playing
            cancelAnimationFrame(vizRAF);
            let t = 0;
            function idle() {
                const W = canvas.width, H = canvas.height;
                ctx.clearRect(0, 0, W, H);
                const bars = 64, bw = W / bars;
                for (let i = 0; i < bars; i++) {
                    const v = (Math.sin(i * 0.3 + t * 0.04) * 0.5 + 0.5) * 0.22;
                    const bh = Math.max(2, v * H);
                    ctx.fillStyle = 'rgba(0,212,255,0.25)';
                    ctx.fillRect(i * bw + bw * 0.15, H - bh, bw * 0.7, bh);
                }
                t++;
                if (!(currentAudio && !currentAudio.paused)) vizRAF = requestAnimationFrame(idle);
            }
            idle();
        }
        function setPlayingUI(on) {
            const fp = document.getElementById('floatingPlayer');
            if (fp) fp.classList.toggle('playing', on);
            if (on) startSwirl(); else stopSwirl();
        }

        // ---- Featured / demo section handlers ----
        function playFeatured() {
            const s = songs.find(x => x.title === 'T.H.C VOL2') || songs[songs.length - 1];
            if (s) { togglePlay(s.id, songs.indexOf(s)); }
            document.getElementById('music').scrollIntoView({ behavior: 'smooth' });
        }
        function videoSoon(name) { showNotification('🎬 "' + name + '" — video dropping soon!'); }
        function ticketsSoon() { showNotification('🎫 Ticket links go live soon — check back!'); }
        function merchSoon() { showNotification('🛍️ Store opening soon — thanks for the love!'); }
        function handleBooking(e) {
            e.preventDefault();
            const name = document.getElementById('bookName').value.trim();
            document.getElementById('bookName').value = '';
            document.getElementById('bookEmail').value = '';
            document.getElementById('bookMsg').value = '';
            showNotification('Thanks ' + (name || 'friend') + '! Your message was noted — P2K will reach out.');
        }

        // ── COOKIE CONSENT (gates AdSense until the visitor accepts) ──
        const COOKIE_KEY = 'p2kCookieConsent';
        function initAds() {
            try {
                document.querySelectorAll('ins.adsbygoogle').forEach(function (unit) {
                    if (/^\d+$/.test((unit.getAttribute('data-ad-slot') || '').trim()) && !unit.dataset.loaded) {
                        (adsbygoogle = window.adsbygoogle || []).push({});
                        unit.dataset.loaded = '1';
                    }
                });
            } catch (e) { /* adsbygoogle.js blocked or not yet loaded */ }
        }
        // Units still carrying a placeholder slot id can never serve — hide the
        // whole "Advertisement" box instead of showing fans an empty frame.
        function hidePlaceholderAdSlots() {
            document.querySelectorAll('ins.adsbygoogle').forEach(function (unit) {
                if (!/^\d+$/.test((unit.getAttribute('data-ad-slot') || '').trim())) {
                    const wrap = unit.closest('.ad-slot');
                    if (wrap) wrap.style.display = 'none';
                }
            });
        }
        function setCookieConsent(choice) {
            try { localStorage.setItem(COOKIE_KEY, choice); } catch (e) {}
            const banner = document.getElementById('cookieBanner');
            if (banner) banner.classList.remove('show');
            if (choice === 'accepted') initAds();
            showNotification(choice === 'accepted' ? 'Cookies accepted — thanks!' : 'Cookies rejected — no ads or tracking.');
        }
        function openCookieSettings() {
            const banner = document.getElementById('cookieBanner');
            if (banner) banner.classList.add('show');
        }
        function initCookieConsent() {
            let c = null;
            try { c = localStorage.getItem(COOKIE_KEY); } catch (e) {}
            if (c === 'accepted') initAds();
            else if (c !== 'rejected') { const b = document.getElementById('cookieBanner'); if (b) b.classList.add('show'); }
        }

        function fxInit() {
            initScrollspy();
            initReveal();
            initCounters();
            initCursor();
            initTilt();
            initParticles();
            onScrollFx();
            hidePlaceholderAdSlots();
            initCookieConsent();
            // idle visualizer so the hero always has motion
            startViz(false);
        }

        // Keyboard access for pointer-only cards marked role="button"
        document.addEventListener('keydown', (e) => {
            if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.matches && e.target.matches('[role="button"]')) {
                e.preventDefault();
                e.target.click();
            }
        });

        // Hook wallet + visualizer into audio player
        const originalTogglePlay = togglePlay;
        togglePlay = function(songId, songIndex) {
            originalTogglePlay(songId, songIndex);
            if (currentAudio && !currentAudio.paused) {
                walletOnPlay();
                vizConnect(currentAudio);
                setPlayingUI(true);
            } else {
                walletOnPause();
                setPlayingUI(false);
            }
        };

        init();
        fxInit();
    

        // ---- Page-safe admin UI (multi-page override; last declaration wins) ----
        function updateAdminUI() {
            const adminPanel = document.getElementById('adminPanel');
            const adminBadge = document.getElementById('adminBadge');
            const logoutBtn = document.getElementById('logoutBtn');
            const adminLoginBtn = document.getElementById('adminLoginBtn');
            const walletPanel = document.getElementById('admin-wallet');
            const checkinSection = document.getElementById('checkin');
            const profitSection = document.getElementById('profit');
            if (isAdmin) {
                if (adminPanel) adminPanel.classList.add('show');
                if (adminBadge) adminBadge.style.display = 'inline-flex';
                if (logoutBtn) logoutBtn.classList.add('show');
                if (adminLoginBtn) adminLoginBtn.style.display = 'none';
                if (walletPanel) { walletPanel.classList.add('show'); walletLoad(); }
                if (checkinSection) { checkinSection.style.display = 'block'; loadCheckinLog(); }
                if (profitSection) { profitSection.style.display = 'block'; renderProfit(); }
            } else {
                if (adminPanel) adminPanel.classList.remove('show');
                if (adminBadge) adminBadge.style.display = 'none';
                if (logoutBtn) logoutBtn.classList.remove('show');
                if (adminLoginBtn) adminLoginBtn.style.display = '';
                if (walletPanel) walletPanel.classList.remove('show');
                if (checkinSection) checkinSection.style.display = 'none';
                if (profitSection) profitSection.style.display = 'none';
                stopScanner();
            }
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

        // ================= Energy-swirl visualizer for the player (no words) =================
        let swirlRAF = null, swirlT = 0;
        function ensurePlayerSwirl() {
            const fp = document.getElementById('floatingPlayer');
            if (!fp || document.getElementById('playerSwirl')) return;
            const c = document.createElement('canvas');
            c.id = 'playerSwirl'; c.className = 'player-swirl';
            fp.insertBefore(c, fp.firstChild);
        }
        function drawSwirl() {
            const c = document.getElementById('playerSwirl');
            if (!c) { swirlRAF = null; return; }
            const w = c.width = c.offsetWidth || 320, h = c.height = c.offsetHeight || 90;
            const ctx = c.getContext('2d');
            ctx.clearRect(0, 0, w, h);
            ctx.globalCompositeOperation = 'lighter';
            const cx = w / 2, cy = h / 2, R = Math.min(w, h);
            const cols = ['rgba(0,212,255,', 'rgba(255,196,57,', 'rgba(255,255,255,'];
            for (let s = 0; s < 3; s++) {
                ctx.beginPath();
                for (let i = 0; i <= 130; i++) {
                    const p = i / 130;
                    const ang = p * Math.PI * 6 + swirlT * 0.03 + s * 2.1;
                    const rad = (0.10 + p * 0.5) * R;
                    const wob = Math.sin(p * 11 + swirlT * 0.05 + s) * 0.14 * R;
                    const x = cx + Math.cos(ang) * rad + Math.cos(ang * 0.5) * wob;
                    const y = cy + Math.sin(ang) * rad * 0.52 + Math.sin(ang * 0.5) * wob * 0.5;
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.strokeStyle = cols[s] + '0.55)';
                ctx.lineWidth = 2.2;
                ctx.shadowColor = cols[s] + '0.95)';
                ctx.shadowBlur = 16;
                ctx.stroke();
            }
            // bright core
            ctx.beginPath(); ctx.arc(cx, cy, 3 + Math.sin(swirlT * 0.12) * 1.5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.shadowColor = 'rgba(0,212,255,1)'; ctx.shadowBlur = 22; ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
            swirlT++;
            swirlRAF = requestAnimationFrame(drawSwirl);
        }
        function startSwirl() { ensurePlayerSwirl(); const c = document.getElementById('playerSwirl'); if (c) c.classList.add('on'); cancelAnimationFrame(swirlRAF); drawSwirl(); }
        function stopSwirl() { cancelAnimationFrame(swirlRAF); swirlRAF = null; const c = document.getElementById('playerSwirl'); if (c) { c.classList.remove('on'); const x = c.getContext('2d'); if (x) x.clearRect(0, 0, c.width, c.height); } }

        // ============ Aurora nebula wallpaper (every page) ============
        // Re-envisioned 2026-07-06: drifting colour orbs replace the old ribbons.
        function injectAuroraField() {
            if (document.getElementById('auroraField')) return;
            // Clean up any legacy ribbon node from cached markup
            const legacy = document.getElementById('ribbonBg');
            if (legacy) legacy.remove();
            const bg = document.createElement('div');
            bg.id = 'auroraField';
            bg.setAttribute('aria-hidden', 'true');
            bg.innerHTML = '<div class="orb o1"></div><div class="orb o2"></div><div class="orb o3"></div><div class="orb o4"></div><div class="orb o5"></div><div class="orb o6"></div>';
            document.body.insertBefore(bg, document.body.firstChild);
        }

        injectAuroraField();

        // Add the "Converter" tool link into the shared nav + footer (every page)
        function injectConverterNav() {
            const nav = document.getElementById('navLinks');
            if (nav && !nav.querySelector('[data-nav="converter"]')) {
                const li = document.createElement('li');
                li.innerHTML = '<a class="navlink" data-nav="converter" href="converter/index.html">Converter</a>';
                const contactLi = nav.querySelector('[data-nav="contact"]');
                if (contactLi && contactLi.parentElement) nav.insertBefore(li, contactLi.parentElement);
                else nav.appendChild(li);
            }
            document.querySelectorAll('.footer-nav').forEach(fn => {
                if (!fn.querySelector('a[href*="converter/"]')) {
                    const a = document.createElement('a');
                    a.href = 'converter/index.html'; a.textContent = 'Converter';
                    fn.appendChild(a);
                }
            });
        }
        injectConverterNav();
        initLibrary();
        ensurePlayerSwirl();
