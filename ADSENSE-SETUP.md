# Google AdSense Setup — p2k-music.ca

This is the complete checklist to get real ads showing. **Ads will NOT appear until every step below is done AND Google approves the site.** Until then the ad areas stay blank — that's normal, not a bug.

Publisher ID in use: **`ca-pub-2580922665149434`**

---

## ✅ What's already done in the code

1. **Loader script** in `<head>` (loads Google's ad engine):
   ```html
   <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2580922665149434" crossorigin="anonymous"></script>
   ```
2. **Two ad units** on the page — one between *News* and *Music*, one above the *footer* (styled, labelled "Advertisement", responsive).
3. An **initializer script** that only activates ad units once they have a real slot ID (so the placeholders don't throw errors).
4. **`ads.txt`** file in the project root.

> ⚠️ **The one thing that was broken:** the original ad had `data-ad-slot="auto"`, which is not a valid slot ID, so it could never show an ad. It's now `REPLACE_WITH_AD_SLOT_ID` — you paste your real numeric slot ID there (step 4).

---

## 📋 What YOU need to do (in the AdSense dashboard)

### 1. Confirm the AdSense account
Sign in at <https://adsense.google.com> with the account that owns `ca-pub-2580922665149434`.
- If that account is **your friend's**, either use his login, or create **your own** AdSense account and swap the ID everywhere it appears (it's in `index.html` in 3 spots and in `ads.txt`).

### 2. Add the site
AdSense ▸ **Sites** ▸ **Add site** → enter your domain (e.g. `p2k-music.ca`).
The loader script already in `<head>` is what Google looks for to verify ownership.

### 3. Upload `ads.txt`
Make sure `ads.txt` ends up at the **root of the live site**: `https://YOURDOMAIN/ads.txt`.
- GitHub Pages / Netlify / Vercel: keeping it beside `index.html` puts it at the root automatically.
- Confirm by visiting the URL in a browser — you should see the `google.com, pub-…` line.

### 4. Create ad units and paste the slot IDs
AdSense ▸ **Ads** ▸ **By ad unit** ▸ **Display ads** → name it (e.g. "Home – in-content") → **Create**.
Google shows a code snippet containing a number like `data-ad-slot="1234567890"`. **Copy that number.**

In `index.html`, replace the placeholders:
| Placeholder | Where |
|---|---|
| `REPLACE_WITH_AD_SLOT_ID`   | Ad unit #1 (between News & Music) |
| `REPLACE_WITH_AD_SLOT_ID_2` | Ad unit #2 (before footer) |

Create a separate ad unit for each and paste its own slot number. (Don't want two ads? Delete the entire "Ad unit #2" block.)

### 5. Wait for approval
New sites/accounts are reviewed by Google — usually **a few days, sometimes up to ~2 weeks**. You'll get an email. Ads only start showing **after approval** and **on the live domain** (not on `localhost`).

---

## 🅰️ Easier alternative: Auto ads
If you don't want to manage individual units, turn on **Auto ads**:
AdSense ▸ **Ads** ▸ **By site** ▸ toggle **Auto ads** on for the domain.
Google then places ads automatically using only the `<head>` loader script — you can leave the manual `<ins>` blocks empty or delete them. (Downside: less control over exactly where ads land, which on a music site can mean an ad near the player.)

---

## ⚠️ Important — read before going live

- **You only earn on the LIVE approved domain.** Blank ad boxes locally or before approval are expected.
- **Never click your own ads** and never ask friends to — it's the #1 reason accounts get banned.
- **Content/copyright:** AdSense will not monetize (and PayPal/labels can act against) content you don't own the rights to. Several tracks in the catalog look like other artists' songs / remixes. Before running ads **or** selling tracks for money, make sure P2K actually owns or is licensed for every track. This protects the account and avoids takedowns.
- Keep ads away from anything clickable (the player, buy buttons) so users don't tap ads by accident — that also violates policy.

---

## 🔧 Troubleshooting "I don't see ads"
1. Site not approved yet → wait for the email.
2. Viewing on `localhost` → deploy to the real domain.
3. `data-ad-slot` still says `REPLACE_WITH_…` → paste the real number (step 4).
4. `ads.txt` not reachable at the domain root → re-check the deploy path.
5. Ad blocker on in your browser → test in a clean/incognito window.
6. Brand-new account → the very first ads can take 24–48h after approval to start filling.
