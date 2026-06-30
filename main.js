import * as THREE from "./three.module.js";

const canvas = document.querySelector("#game");

const levelNameEl = document.querySelector("#levelName");
const scoreEl = document.querySelector("#score");
const sizeEl = document.querySelector("#size");
const sizeFillEl = document.querySelector("#sizeFill");
const timeEl = document.querySelector("#time");
const levelSelectEl = document.querySelector("#levelSelect");
const totalScoreEl = document.querySelector("#totalScore");
const menuEl = document.querySelector("#menu");
const gameOverEl = document.querySelector("#gameOver");
const finalScoreEl = document.querySelector("#finalScore");
const starsEl = document.querySelector("#stars");
const ratingEl = document.querySelector("#rating");
const startButton = document.querySelector("#start");
const restartButton = document.querySelector("#restart");
const nextLevelButton = document.querySelector("#nextLevel");
const audioToggleButton = document.querySelector("#audioToggle");
const backButton = document.querySelector("#backButton");
const doubleScoreButton = document.querySelector("#doubleScore");
const extraTimeButton = document.querySelector("#extraTime");
const adBanner = document.querySelector("#adBanner");
const adOverlay = document.querySelector("#adOverlay");
const adTitle = document.querySelector("#adTitle");
const adSub = document.querySelector("#adSub");
const adClose = document.querySelector("#adClose");

// ---------------------------------------------------------------------------
// AdMob configuration. The App ID also has to be in AndroidManifest.xml.
// While developing keep `testing: true` so Google serves TEST ads (tapping your
// own LIVE ads will get the account banned). Flip to false for release.
const ADMOB = {
  enabled: true,
  // RELEASE: must be false so Google serves your real, Families-self-certified
  // ads. Only flip to true on a debug build while developing.
  testing: false,
  // Real AdMob App ID — must match android/app/src/main/AndroidManifest.xml.
  appId: "ca-app-pub-2108893679425036~5708184875",
  banner: "ca-app-pub-2108893679425036/2194078754",
  interstitial: "ca-app-pub-2108893679425036/5911786311",
  rewardedDouble: "ca-app-pub-2108893679425036/2802819936",
  rewardedTime: "ca-app-pub-2108893679425036/6646283486",
  appOpen: "ca-app-pub-2108893679425036/8574021363",
};

// The native AdMob plugin only exists inside the built Android app; in a browser
// this returns null and the manager transparently falls back to a simulated ad.
function getAdMobPlugin() {
  const C = window.Capacitor;
  if (!C || (typeof C.isNativePlatform === "function" && !C.isNativePlatform())) return null;
  if (C.Plugins && C.Plugins.AdMob) return C.Plugins.AdMob;
  if (typeof C.registerPlugin === "function") {
    try { return C.registerPlugin("AdMob"); } catch (e) {}
  }
  return null;
}
const adMob = getAdMobPlugin();
// True only inside the built native app. The simulated "ad" overlay is a
// browser-only dev aid and must NEVER render on a device — a self-drawn ad that
// looks like the game violates the Families Ad Format Requirements.
const isNativePlatform = !!(window.Capacitor
  && typeof window.Capacitor.isNativePlatform === "function"
  && window.Capacitor.isNativePlatform());
const useRealAds = ADMOB.enabled && !!adMob;
let adsReady = false;
async function ensureAdsInit() {
  if (!useRealAds) return false;
  if (adsReady) return true;
  try {
    await adMob.initialize({
      initializeForTesting: ADMOB.testing,
      tagForChildDirectedTreatment: true,
      maxAdContentRating: "G",
    });
    adsReady = true;
  } catch (e) {
    console.warn("[ads] init failed", e);
  }
  return adsReady;
}

// Ad manager. Frequency-cap + placement logic is shared; display is either real
// AdMob (on device) or the simulated overlay (browser / plugin missing).
const Ads = {
  // Tunable frequency caps.
  minInterstitialGap: 70000,  // ms between interstitials
  levelsPerInterstitial: 2,   // at most ~one interstitial per N finished runs
  freePlays: 2,               // no interstitials for the first N runs
  appOpenGap: 120000,         // ms before an app-open ad can show again

  plays: Number(localStorage.getItem("gulp-plays") || 0),
  levelsSinceAd: 0,
  lastFullAdAt: 0,
  busy: false,
  removed: localStorage.getItem("gulp-remove-ads") === "1",

  showBanner() {
    if (this.removed) return;
    if (useRealAds) {
      ensureAdsInit().then((ok) => {
        if (!ok) return;
        adMob.showBanner({
          adId: ADMOB.banner,
          adSize: "ADAPTIVE_BANNER",
          position: "BOTTOM_CENTER",
          margin: 0,
          isTesting: ADMOB.testing,
        }).catch((e) => console.warn("[ads] banner", e));
      });
    } else if (!isNativePlatform) {
      // Browser dev only — never show the placeholder banner on a device.
      adBanner.classList.remove("hidden");
    }
  },
  hideBanner() {
    if (useRealAds) {
      const hide = adMob.removeBanner || adMob.hideBanner;
      if (hide) hide.call(adMob).catch(() => {});
    } else {
      adBanner.classList.add("hidden");
    }
  },

  // Simulated full-screen ad; onDone(rewardEarned) fires when it closes.
  _overlay(title, sub, rewarded, onDone) {
    // Safety net: the simulated ad is a browser dev aid only. If we ever reach
    // here on a device, resolve without drawing a fake ad (Families policy).
    if (isNativePlatform) { onDone(rewarded); return; }
    if (this.busy) { onDone(false); return; }
    this.busy = true;
    this.lastFullAdAt = Date.now();
    adTitle.textContent = title;
    adSub.textContent = sub;
    adOverlay.classList.remove("hidden");
    let remaining = rewarded ? 4 : 3;
    adClose.disabled = true;
    adClose.textContent = rewarded ? `Reward in ${remaining}` : `Skip in ${remaining}`;
    const tick = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        adClose.textContent = rewarded ? `Reward in ${remaining}` : `Skip in ${remaining}`;
      } else {
        clearInterval(tick);
        adClose.disabled = false;
        adClose.textContent = rewarded ? "Claim Reward" : "Continue ✕";
      }
    }, 1000);
    adClose.onclick = () => {
      if (adClose.disabled) return;
      clearInterval(tick);
      adOverlay.classList.add("hidden");
      adClose.onclick = null;
      this.busy = false;
      onDone(rewarded); // simulated: watched to the end => reward granted
    };
  },

  showRewarded(adId, label, onReward) {
    if (useRealAds) this._realRewarded(adId, label, onReward);
    else if (!isNativePlatform) this._overlay("Rewarded Ad", label, true, (earned) => { if (earned) onReward(); });
  },

  async _realRewarded(adId, label, onReward) {
    let rewarded = false;
    let l1, l2;
    try {
      if (!await ensureAdsInit()) throw new Error("not ready");
      // Reward event name for @capacitor-community/admob v8 (with a fallback).
      try { l1 = await adMob.addListener("onRewardedVideoAdReward", () => { rewarded = true; }); } catch (e) {}
      try { l2 = await adMob.addListener("onRewarded", () => { rewarded = true; }); } catch (e) {}
      await adMob.prepareRewardVideoAd({ adId, isTesting: ADMOB.testing });
      const res = await adMob.showRewardVideoAd();
      if (res && (res.type || res.amount || res.rewardItem)) rewarded = true;
      if (l1 && l1.remove) l1.remove();
      if (l2 && l2.remove) l2.remove();
      if (rewarded) onReward();
    } catch (e) {
      console.warn("[ads] rewarded", e);
      if (l1 && l1.remove) l1.remove();
      if (l2 && l2.remove) l2.remove();
      // No real ad available: do NOT draw a fake ad on-device. The reward simply
      // isn't granted (Families Ad Format Requirements forbid simulated ads).
    }
  },

  showInterstitial(onDone = () => {}) {
    if (this.removed) { onDone(); return; }
    this.levelsSinceAd = 0;
    this.lastFullAdAt = Date.now();
    if (useRealAds) this._realInterstitial(onDone);
    else if (!isNativePlatform) this._overlay("Advertisement", "Your AdMob ad will play here", false, () => onDone());
    else onDone();
  },

  async _realInterstitial(onDone) {
    let done = false;
    const finish = () => { if (!done) { done = true; onDone(); } };
    try {
      if (!await ensureAdsInit()) return finish();
      await adMob.prepareInterstitial({ adId: ADMOB.interstitial, isTesting: ADMOB.testing });
      await adMob.showInterstitial();
      finish();
    } catch (e) {
      console.warn("[ads] interstitial", e);
      finish(); // never block navigation if the ad fails
    }
  },

  // Show an interstitial only when the caps allow; always calls onDone exactly once.
  maybeInterstitial(onDone = () => {}) {
    const ok = !this.removed
      && this.plays > this.freePlays
      && this.levelsSinceAd >= this.levelsPerInterstitial
      && Date.now() - this.lastFullAdAt > this.minInterstitialGap;
    if (ok) this.showInterstitial(onDone);
    else onDone();
  },

  // App-open ad on returning to the foreground (menu/game-over only).
  maybeAppOpen() {
    return; // Disabled for Families Policy compliance (ads at logical breaks only)
    if (this.removed || this.busy || state === "playing") return;
    if (Date.now() - this.lastFullAdAt < this.appOpenGap) return;
    if (this.plays <= this.freePlays) return;
    this.lastFullAdAt = Date.now();
    if (useRealAds) {
      // App-open ads aren't in @capacitor-community/admob v8; show an
      // interstitial on resume instead (same "returning to app" moment).
      if (typeof adMob.prepareAppOpenAd === "function") {
        ensureAdsInit().then(async (ok) => {
          if (!ok) return;
          try {
            await adMob.prepareAppOpenAd({ adId: ADMOB.appOpen, isTesting: ADMOB.testing });
            await adMob.showAppOpenAd();
          } catch (e) { console.warn("[ads] appopen", e); }
        });
      } else {
        this._realInterstitial(() => {});
      }
    } else {
      this.showInterstitial();
    }
  },

  recordPlay() {
    this.plays += 1;
    this.levelsSinceAd += 1;
    localStorage.setItem("gulp-plays", String(this.plays));
  },
};

const WORLD = { width: 2600, height: 1800 };

// Environment presets drive ground, sky, fog and lighting so each level feels
// like a different place. Levels reference one of these by name (theme.env).
const ENVIRONMENTS = {
  grass:  { ground: "tint", groundColor: "#8faa79", fog: "#cfe1ec", sun: 0xfff2d6, sunI: 1.5, hemiSky: 0xdcebff, hemiGround: 0x47502f, hemiI: 0.62 },
  sand:   { ground: "tint", groundColor: "#d9c18a", fog: "#efe2c0", sun: 0xfff0c8, sunI: 1.7, hemiSky: 0xfff3d8, hemiGround: 0x7a6238, hemiI: 0.7 },
  snow:   { ground: "snow", groundColor: "#eef4fb", fog: "#dde9f5", sun: 0xfdfcff, sunI: 1.55, hemiSky: 0xeaf3ff, hemiGround: 0x9fb0c4, hemiI: 0.8 },
  water:  { ground: "water", groundColor: "#2f7fa6", fog: "#bcd9e6", sun: 0xfff2d6, sunI: 1.45, hemiSky: 0xd7eefb, hemiGround: 0x274d5c, hemiI: 0.66 },
  lava:   { ground: "lava", groundColor: "#3a1410", fog: "#3a160c", sun: 0xffb070, sunI: 1.1, hemiSky: 0xff8a3a, hemiGround: 0x3a0d06, hemiI: 0.55, emissive: 0xff4400 },
  toxic:  { ground: "tint", groundColor: "#4d5a32", fog: "#3f4f2a", sun: 0xd6ff9e, sunI: 1.2, hemiSky: 0xbfff8a, hemiGround: 0x2a3318, hemiI: 0.6 },
  rock:   { ground: "tint", groundColor: "#5b5750", fog: "#2c2a27", sun: 0xffe7c4, sunI: 1.15, hemiSky: 0x9aa0ad, hemiGround: 0x2a2722, hemiI: 0.5 },
  space:  { ground: "space", groundColor: "#3a3a44", fog: "#070712", sun: 0xeaf0ff, sunI: 1.35, hemiSky: 0x556088, hemiGround: 0x0a0a14, hemiI: 0.35 },
};

const LEVELS = [
  { id: "park", name: "Green Park", difficulty: "Easy", seconds: 120, unlockScore: 0, objects: 220, bots: 1, startRadius: 32, growth: 0.055, speedBonus: 1.05, targets: [800, 1500, 2200], theme: { env: "grass", roads: true }, weights: { person: 0.4, tree: 0.3, car: 0.15, building: 0.05, hydrant: 0.1 } },
  { id: "suburbs", name: "Sunny Suburbs", difficulty: "Easy", seconds: 115, unlockScore: 1000, objects: 240, bots: 1, startRadius: 31, growth: 0.052, speedBonus: 1.04, targets: [1200, 2200, 3200], theme: { env: "grass", roads: true }, weights: { person: 0.35, tree: 0.25, car: 0.2, building: 0.1, hydrant: 0.1 } },
  { id: "autumn", name: "Autumn Town", difficulty: "Easy", seconds: 110, unlockScore: 2200, objects: 250, bots: 2, startRadius: 30, growth: 0.048, speedBonus: 1.05, targets: [1800, 3200, 4800], theme: { env: "grass", roads: true, foliage: "#d46a1f" }, weights: { person: 0.35, tree: 0.35, car: 0.15, building: 0.05, mushroom: 0.1 } },
  { id: "downtown", name: "Downtown City", difficulty: "Medium", seconds: 105, unlockScore: 4000, objects: 280, bots: 2, startRadius: 29, growth: 0.045, speedBonus: 1, targets: [2500, 4500, 6500], theme: { env: "rock", roads: true }, weights: { person: 0.3, car: 0.25, bus: 0.1, building: 0.3, hydrant: 0.05 } },
  { id: "night", name: "Night City", difficulty: "Medium", seconds: 100, unlockScore: 6500, objects: 300, bots: 2, startRadius: 28, growth: 0.042, speedBonus: 1.02, targets: [3200, 5800, 8500], theme: { env: "space", roads: true, accent: "#00eaff" }, weights: { person: 0.3, car: 0.3, bus: 0.1, building: 0.25, hydrant: 0.05 } },
  { id: "industrial", name: "Industrial Zone", difficulty: "Medium", seconds: 100, unlockScore: 9000, objects: 320, bots: 3, startRadius: 27, growth: 0.04, speedBonus: 1.1, targets: [4500, 8000, 12000], theme: { env: "rock", roads: true, ground: "#333" }, weights: { person: 0.2, crate: 0.3, car: 0.2, building: 0.25, tank: 0.05 } },
  { id: "beach", name: "Beach District", difficulty: "Medium", seconds: 100, unlockScore: 12000, objects: 290, bots: 2, startRadius: 28, growth: 0.04, speedBonus: 1.07, targets: [5000, 9000, 13500], theme: { env: "sand", roads: false }, weights: { person: 0.4, boat: 0.2, tree: 0.2, rock: 0.1, building: 0.1 } },
  { id: "snow", name: "Snow Village", difficulty: "Medium", seconds: 95, unlockScore: 16000, objects: 300, bots: 3, startRadius: 26, growth: 0.038, speedBonus: 1.05, targets: [5500, 10000, 15000], theme: { env: "snow", roads: false, slippery: true }, weights: { person: 0.3, snowman: 0.3, tree: 0.2, rock: 0.1, building: 0.1 } },
  { id: "desert", name: "Desert Town", difficulty: "Medium", seconds: 95, unlockScore: 21000, objects: 310, bots: 3, startRadius: 26, growth: 0.036, speedBonus: 1.08, targets: [6000, 11000, 16500], theme: { env: "sand", roads: true }, weights: { person: 0.3, cactus: 0.3, rock: 0.2, building: 0.2 } },
  { id: "oldtown", name: "Old Town", difficulty: "Hard", seconds: 90, unlockScore: 27000, objects: 320, bots: 3, startRadius: 25, growth: 0.034, speedBonus: 1.05, targets: [7000, 13000, 19500], theme: { env: "grass", roads: true, buildingColor: "#8a5a35" }, weights: { person: 0.3, tree: 0.3, car: 0.2, building: 0.2 } },
  { id: "airport", name: "Airport Area", difficulty: "Hard", seconds: 90, unlockScore: 34000, objects: 330, bots: 3, startRadius: 24, growth: 0.032, speedBonus: 1.06, targets: [8000, 15000, 22500], theme: { env: "rock", roads: false }, weights: { person: 0.2, rocket: 0.2, crate: 0.3, car: 0.2, building: 0.1 } },
  { id: "harbor", name: "Harbor City", difficulty: "Hard", seconds: 90, unlockScore: 42000, objects: 340, bots: 3, startRadius: 24, growth: 0.03, speedBonus: 1.1, targets: [9500, 18000, 27000], theme: { env: "water", roads: true }, weights: { person: 0.2, boat: 0.3, crate: 0.2, car: 0.1, building: 0.2 } },
  { id: "carnival", name: "Carnival Park", difficulty: "Hard", seconds: 85, unlockScore: 51000, objects: 340, bots: 4, startRadius: 23, growth: 0.028, speedBonus: 1.12, targets: [11000, 21000, 31500], theme: { env: "toxic", roads: false }, weights: { person: 0.5, mushroom: 0.2, tree: 0.1, hydrant: 0.1, building: 0.1 } },
  { id: "campus", name: "University Campus", difficulty: "Hard", seconds: 85, unlockScore: 61000, objects: 330, bots: 4, startRadius: 23, growth: 0.026, speedBonus: 1.07, targets: [13000, 25000, 37500], theme: { env: "grass", roads: true }, weights: { person: 0.5, tree: 0.2, car: 0.1, building: 0.2 } },
  { id: "shopping", name: "Shopping District", difficulty: "Hard", seconds: 85, unlockScore: 72000, objects: 320, bots: 4, startRadius: 22, growth: 0.025, speedBonus: 1.08, targets: [15000, 29000, 43500], theme: { env: "rock", roads: true }, weights: { person: 0.4, car: 0.3, bus: 0.1, building: 0.2 } },
  { id: "mountain", name: "Mountain Village", difficulty: "Hard", seconds: 80, unlockScore: 84000, objects: 330, bots: 4, startRadius: 22, growth: 0.024, speedBonus: 1.09, targets: [18000, 34000, 51000], theme: { env: "snow", roads: false, slippery: true }, weights: { person: 0.3, tree: 0.3, rock: 0.2, building: 0.2 } },
  { id: "tech", name: "Tech City", difficulty: "Expert", seconds: 80, unlockScore: 97000, objects: 340, bots: 4, startRadius: 21, growth: 0.022, speedBonus: 1.1, targets: [22000, 42000, 63000], theme: { env: "space", roads: true }, weights: { person: 0.2, rocket: 0.2, car: 0.2, building: 0.4 } },
  { id: "construction", name: "Construction Site", difficulty: "Expert", seconds: 80, unlockScore: 111000, objects: 340, bots: 5, startRadius: 21, growth: 0.021, speedBonus: 1.11, targets: [27000, 51000, 76500], theme: { env: "rock", roads: true }, weights: { person: 0.2, crate: 0.3, car: 0.2, building: 0.3 } },
  { id: "stadium", name: "Stadium Zone", difficulty: "Expert", seconds: 78, unlockScore: 126000, objects: 350, bots: 5, startRadius: 20, growth: 0.02, speedBonus: 1.12, targets: [33000, 62000, 93000], theme: { env: "grass", roads: false }, weights: { person: 0.6, car: 0.2, building: 0.2 } },
  { id: "megacity", name: "Mega City Final", difficulty: "Final", seconds: 78, unlockScore: 142000, objects: 380, bots: 6, startRadius: 18, growth: 0.018, speedBonus: 1.15, targets: [40000, 75000, 112500], theme: { env: "rock", roads: true }, weights: { person: 0.2, car: 0.3, bus: 0.1, building: 0.4 } },
];

// Star goals were too easy to clear, so scale every level's 1/2/3-star targets
// up. Raise STAR_DIFFICULTY for an even tougher grind, lower it to ease off.
const STAR_DIFFICULTY = 9;
for (const lvl of LEVELS) {
  lvl.targets = lvl.targets.map((t) => Math.round((t * STAR_DIFFICULTY) / 100) * 100);
}

let width = 0;
let height = 0;
let lastTime = performance.now();
let state = "menu";
let runTime = LEVELS[0].seconds;
let score = 0;
let objects = [];
let powerups = [];
let particles = [];
let bots = [];
let shake = 0;
let audio;
let audioMaster;
let musicGain;
let sfxGain;
let ambientGain;
let reverbGain;            // wet reverb send level (SFX also go out dry)
const MASTER_VOLUME = 2.6; // overall makeup so the mix is actually audible
let blackhole = null;      // persistent black-hole drone nodes while playing
let lastAbsorbSoundAt = 0; // throttle for mass-absorb voice spam
let nextScreamAt = 0;      // global throttle for crowd screams
let comboCount = 0;        // consecutive absorbs inside the streak window
let comboExpireAt = 0;     // performance-time (s) the current streak lapses
let lastChimeAt = 0;       // throttle so a crowd-eat doesn't fire dozens of pings
let musicStep = 0;
let nextMusicAt = 0;
let audioUnlocked = false;

// ---- Generative music ------------------------------------------------------
// Each environment gets its own mode, tempo, chord progression and timbres so
// the soundtrack changes as the world does. Notes are derived from a scale so
// everything stays in key no matter how it is sequenced.
const SCALES = {
  major:     [0, 2, 4, 5, 7, 9, 11],
  minor:     [0, 2, 3, 5, 7, 8, 10],
  dorian:    [0, 2, 3, 5, 7, 9, 10],
  phrygian:  [0, 1, 3, 5, 7, 8, 10],
  lydian:    [0, 2, 4, 6, 7, 9, 11],
  pentMinor: [0, 3, 5, 7, 10],
  whole:     [0, 2, 4, 6, 8, 10],
};
const MUSIC_THEMES = {
  grass: { scale: "major",    root: 130.81, bpm: 96,  prog: [0, 4, 5, 3], lead: "triangle", pad: "sine",     drums: 0.6 },
  sand:  { scale: "dorian",   root: 146.83, bpm: 100, prog: [0, 3, 4, 3], lead: "sawtooth", pad: "triangle", drums: 0.7 },
  snow:  { scale: "lydian",   root: 174.61, bpm: 90,  prog: [0, 5, 3, 4], lead: "sine",     pad: "sine",     drums: 0.4 },
  water: { scale: "dorian",   root: 130.81, bpm: 94,  prog: [0, 5, 3, 4], lead: "triangle", pad: "sine",     drums: 0.5 },
  rock:  { scale: "minor",    root: 110.00, bpm: 112, prog: [0, 5, 3, 4], lead: "sawtooth", pad: "sawtooth", drums: 1.0 },
  toxic: { scale: "phrygian", root: 116.54, bpm: 104, prog: [0, 1, 0, 5], lead: "square",   pad: "triangle", drums: 0.8 },
  lava:  { scale: "phrygian", root: 98.00,  bpm: 122, prog: [0, 5, 1, 4], lead: "sawtooth", pad: "sawtooth", drums: 1.0 },
  space: { scale: "lydian",   root: 130.81, bpm: 84,  prog: [0, 4, 5, 3], lead: "sine",     pad: "sine",     drums: 0.5, arp: true },
};
const MELODY_PATTERN = [0, 2, 4, 2, 0, 4, 2, 5]; // chord-tone offsets the lead walks through
let audioMuted = localStorage.getItem("gulp-muted-v2") === "1";
let noFoodTimer = 0;
let powerupSpawnTimer = 0;
let selectedLevelIndex = Number(localStorage.getItem("gulp-selected-level") || 0);
let levelStars = JSON.parse(localStorage.getItem("gulp-level-stars") || "{}");
let bestScores = JSON.parse(localStorage.getItem("gulp-best-scores") || "{}");
let totalScore = Number(localStorage.getItem("gulp-total-score") || 0);
selectedLevelIndex = clamp(selectedLevelIndex, 0, LEVELS.length - 1);
if (!isLevelUnlocked(LEVELS[selectedLevelIndex])) {
  selectedLevelIndex = 0;
}

const pointer = {
  active: false,
  screenX: 0,
  screenY: 0,
  worldX: WORLD.width / 2,
  worldY: WORLD.height / 2,
};

const player = {
  x: WORLD.width / 2,
  y: WORLD.height / 2,
  radius: 34,
  targetRadius: 34,
  vx: 0,
  vy: 0,
  holeMesh: null,
  powers: {
    speed: 0,
    magnet: 0,
    size: 0
  }
};

// Smoothed camera framing. `x`/`y` are the look target in world space
// (world Y maps to the 3D Z axis); `zoom` drives how far the camera pulls back.
const camera = {
  x: player.x,
  y: player.y,
  zoom: 1,
};

const palettes = {
  road: "#5f625b",
  roadStripe: "#f4d89a",
  grass: "#8faa79",
  grassDark: "#799264",
  sidewalk: "#c5bda6",
  building: ["#d9b36d", "#5fb4aa", "#d86d5a", "#c27b93", "#93aa78"],
  car: ["#f0d36b", "#df6d58", "#5fb4c2", "#e9e5d1"],
  tree: ["#4f8e57", "#6ea95c", "#3f7750"],
  person: ["#f4d09f", "#6e8bc2", "#d95757", "#f2efe2"],
  rock: ["#7c756b", "#8a8278", "#6b645b", "#948b7e"],
  cactus: ["#3f7a45", "#4f8e57", "#5a9a52"],
  crate: ["#b07b3e", "#c08a44", "#9a6a34", "#caa05a"],
  hydrant: ["#d23a2c", "#e0552c", "#d2a52c"],
  snowman: ["#f2f7ff", "#e6eef8", "#ffffff"],
  mushroom: ["#d2483c", "#c25cae", "#5c8ed2", "#e0a23a"],
  boat: ["#e9e5d1", "#5fb4c2", "#df6d58", "#6e8bc2"],
  bus: ["#e0b13a", "#d2553c", "#4f8ec2", "#5a9a6a"],
  tank: ["#5b6044", "#4a5238", "#6a6e50"],
  rocket: ["#e9e5d1", "#d23a2c", "#c5ccd6"],
};

let activeTheme = { ...palettes };

/* ------------------------------------------------------------------ */
/* Three.js scene setup                                                */
/* ------------------------------------------------------------------ */

const HORIZON_COLOR = 0xcfe1ec;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setClearColor(HORIZON_COLOR, 1);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = makeSkyTexture();
scene.fog = new THREE.Fog(HORIZON_COLOR, 2700, 5400);

const threeCamera = new THREE.PerspectiveCamera(55, 1, 1, 12000);

// Natural outdoor lighting: soft sky/ground bounce plus a warm sun that
// casts shadows. The sun follows the player each frame (see updateSun) so a
// single tight shadow map can stay sharp over the whole world.
const hemiLight = new THREE.HemisphereLight(0xdcebff, 0x47502f, 0.62);
scene.add(hemiLight);
const sun = new THREE.DirectionalLight(0xfff2d6, 1.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 2;
const shadowCam = sun.shadow.camera;
shadowCam.near = 50;
shadowCam.far = 4400;
shadowCam.left = -1350;
shadowCam.right = 1350;
shadowCam.top = 1350;
shadowCam.bottom = -1350;
shadowCam.updateProjectionMatrix();
scene.add(sun);
scene.add(sun.target);

// Shared geometries (unit-sized; instances are scaled per object).
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8); // 8 segments is plenty for mobile
const coneGeo = new THREE.ConeGeometry(1, 1, 8);
const roofGeo = new THREE.ConeGeometry(1, 1, 4); // 4-sided pyramid = pitched/hip roof
const wheelGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
const rockGeo = new THREE.DodecahedronGeometry(1, 0);
const sphereGeo = new THREE.SphereGeometry(1, 12, 8); // Slightly lower poly for performance

// Glow materials for sci-fi / lava buildings.
const neonMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#5fe0ff") });
const emberMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff6a1a") });
const BUILD_STYLE = {
  park: "house", suburbs: "house", autumn: "house", downtown: "tower",
  night: "tower", industrial: "industrial", beach: "desert", snow: "ice",
  desert: "desert", oldtown: "house", airport: "industrial", harbor: "industrial",
  carnival: "house", campus: "house", shopping: "tower", mountain: "ice",
  tech: "dome", construction: "industrial", stadium: "tower", megacity: "tower",
};
const LEVEL_ICONS = {
  park: "🌳", suburbs: "🏡", autumn: "🍂", downtown: "🏙️",
  night: "🌃", industrial: "🏭", beach: "🏖️", snow: "❄️",
  desert: "🌵", oldtown: "🏛️", airport: "✈️", harbor: "⚓",
  carnival: "🎡", campus: "🎓", shopping: "🛍️", mountain: "🏔️",
  tech: "💻", construction: "🚧", stadium: "🏟️", megacity: "🏙️",
};
// Per-environment colours for the floating island tiles (top face, side face).
const TILE_COLORS = {
  grass: ["#7fae5a", "#41612f"], sand: ["#ddc77f", "#9c7e44"],
  snow: ["#dfeaf5", "#9fb2c6"], water: ["#3f9ec2", "#1f5c78"],
  rock: ["#737069", "#3c3833"], toxic: ["#6f9a3f", "#3a5320"],
  lava: ["#5a2418", "#270d08"], space: ["#2f3550", "#141826"],
};
const BUILD_COLORS = {
  tower: ["#d9b36d", "#5fb4aa", "#d86d5a", "#c27b93", "#93aa78", "#6f86b8"],
  house: ["#c98b5a", "#b5604a", "#8a9b6a", "#cdaa6a", "#9a6b8a", "#7a9bb0"],
  industrial: ["#7a7d74", "#8a6a52", "#6a7a82", "#8a8a6a", "#6e6660"],
  desert: ["#d8b27a", "#cda36a", "#c9925a", "#e0c08a", "#bf8f5f"],
  obsidian: ["#2c2230", "#33242c", "#241a24", "#3a2a26"],
  ice: ["#bcd0e0", "#a8c0d4", "#cdd8e6", "#9fb6cc"],
  dome: ["#b8c2d0", "#9aa6c0", "#c0c8d6", "#a6b0c8"],
};
const circleGeo = new THREE.CircleGeometry(1, 56);
const edibleRingGeo = new THREE.RingGeometry(0.92, 1.06, 32);
const holeRingGeo = new THREE.RingGeometry(0.96, 1.22, 56);
const powerupGeo = new THREE.IcosahedronGeometry(1, 0);
const particleGeo = new THREE.SphereGeometry(1, 6, 6);

const materialCache = new Map();
function lambert(hex) {
  if (!materialCache.has(hex)) {
    materialCache.set(hex, new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex),
      roughness: 0.85,
      metalness: 0.05,
    }));
  }
  return materialCache.get(hex);
}

const buildingMatCache = new Map();
function buildingMat(hex) {
  if (!buildingMatCache.has(hex)) {
    buildingMatCache.set(hex, new THREE.MeshStandardMaterial({
      map: makeWindowTexture(hex),
      roughness: 0.7,
      metalness: 0.15,
    }));
  }
  return buildingMatCache.get(hex);
}

const leafMatCache = new Map();
function leafMat(hex) {
  if (!leafMatCache.has(hex)) {
    leafMatCache.set(hex, new THREE.MeshStandardMaterial({
      map: makeLeafTexture(hex),
      roughness: 1.0,
      metalness: 0.0,
    }));
  }
  return leafMatCache.get(hex);
}

const carMatCache = new Map();
function carMat(hex) {
  if (!carMatCache.has(hex)) {
    carMatCache.set(hex, new THREE.MeshStandardMaterial({
      map: makeCarTexture(hex),
      roughness: 0.4,
      metalness: 0.5,
    }));
  }
  return carMatCache.get(hex);
}

const barkMat = new THREE.MeshStandardMaterial({
  map: makeBarkTexture(),
  roughness: 1.0,
  metalness: 0,
});

const trunkMat = barkMat;
const headMat = lambert("#f4d6ac");
const edibleMat = new THREE.MeshBasicMaterial({
  color: new THREE.Color("#6be0c2"),
  transparent: true,
  opacity: 0.85,
  side: THREE.DoubleSide,
  depthWrite: false,
});

// Ground / world materials (recoloured + re-textured per level theme).
const groundTextures = {};
function groundTextureFor(kind) {
  if (!groundTextures[kind]) {
    groundTextures[kind] =
      kind === "snow" ? makeNoiseGroundTexture("#ffffff", 0.25, 1600)
      : kind === "water" ? makeWaterTexture()
      : kind === "lava" ? makeLavaTexture()
      : kind === "space" ? makeSpaceTexture()
      : makeGroundTexture();
  }
  return groundTextures[kind];
}

const grassMat = new THREE.MeshStandardMaterial({
  color: new THREE.Color(palettes.grass),
  roughness: 1,
  metalness: 0,
  map: groundTextureFor("tint"),
});
const roadMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(palettes.road), roughness: 0.95, metalness: 0 });
const stripeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(palettes.roadStripe) });
const backdropMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#0a0f0d") });

const worldGroup = new THREE.Group();
scene.add(worldGroup);
buildWorld();

// Everything rebuilt on each run lives here.
const dynamicGroup = new THREE.Group();
scene.add(dynamicGroup);

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ndc = new THREE.Vector2();
const hitPoint = new THREE.Vector3();

function buildWorld() {
  clearGroup(worldGroup);
  const level = getLevel();
  const theme = level.theme || {};
  const env = ENVIRONMENTS[theme.env] || ENVIRONMENTS.grass;

  backdropMat.color.set(env.fog || "#0a0f0d");

  // Infinite-ish backdrop
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000), backdropMat);
  backdrop.rotation.x = -Math.PI / 2;
  backdrop.position.y = -5;
  worldGroup.add(backdrop);

  // The main ground plane
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.width, WORLD.height), grassMat);
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(WORLD.width / 2, 0, WORLD.height / 2);
  grass.receiveShadow = true;
  worldGroup.add(grass);

  if (theme.roads === false) return;

  // Grid-based Road system as per your plan
  const tileSize = 160;
  const roadWidth = 52;

  for (let x = 0; x <= WORLD.width; x += tileSize) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(roadWidth, WORLD.height), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(x, 0.1, WORLD.height / 2);
    road.receiveShadow = true;
    worldGroup.add(road);

    // Road stripes
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(3, WORLD.height), stripeMat);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(x, 0.15, WORLD.height / 2);
    worldGroup.add(stripe);
  }

  for (let z = 0; z <= WORLD.height; z += tileSize) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.width, roadWidth), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(WORLD.width / 2, 0.12, z);
    road.receiveShadow = true;
    worldGroup.add(road);

    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.width, 3), stripeMat);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(WORLD.width / 2, 0.16, z);
    worldGroup.add(stripe);
  }
}

// Build one of several distinct building silhouettes. `add(geo,mat,sx,sy,sz,px,py,pz)`
// is the per-object mesh helper from createObjectMesh; `r` is the object radius.
function buildStructure(object, add, r) {
  const c = object.color;
  const style = object.style || "tower";

  if (style === "house") {
    const h = r * random(1.0, 1.6);
    add(boxGeo, lambert(c), r * 1.5, h, r * 1.5, 0, h / 2, 0);                      // walls
    add(boxGeo, lambert("#2a1d12"), r * 0.34, h * 0.55, 0.1, 0, h * 0.27, r * 0.76); // door
    for (const sx of [-0.5, 0.5]) {
      add(boxGeo, lambert("#ffe7a8"), r * 0.3, r * 0.3, 0.1, sx * r, h * 0.62, r * 0.76); // windows
    }
    const roof = add(roofGeo, lambert(shadeHex(c, -34)), r * 1.25, r * 0.95, r * 1.25, 0, h + r * 0.45, 0);
    roof.rotation.y = Math.PI / 4;
    add(boxGeo, lambert(shadeHex(c, -44)), r * 0.22, r * 0.55, r * 0.22, r * 0.45, h + r * 0.45, -r * 0.3); // chimney
  } else if (style === "industrial") {
    const h = r * random(1.1, 1.9);
    add(boxGeo, buildingMat(c), r * 1.75, h, r * 1.3, 0, h / 2, 0);                  // wide block
    add(boxGeo, lambert(shadeHex(c, -18)), r * 1.8, h * 0.08, r * 1.35, 0, h, 0);   // roof rim
    add(boxGeo, lambert(shadeHex(c, 12)), r * 0.55, r * 0.5, r * 0.6, -r * 0.6, h + r * 0.2, 0); // rooftop unit
    add(cylGeo, lambert(shadeHex(c, -30)), r * 0.22, r * 1.5, r * 0.22, r * 0.65, h + r * 0.7, r * 0.35); // smokestack
    add(cylGeo, lambert("#1c1c1c"), r * 0.17, r * 0.22, r * 0.17, r * 0.65, h + r * 1.45, r * 0.35);
  } else if (style === "desert") {
    // Stacked adobe cubes with flat roofs.
    const h = r * random(1.0, 1.5);
    add(boxGeo, lambert(c), r * 1.5, h, r * 1.5, 0, h / 2, 0);
    add(boxGeo, lambert(shadeHex(c, -12)), r * 0.95, h * 0.7, r * 0.95, r * 0.3, h + h * 0.35, -r * 0.2);
    add(boxGeo, lambert(shadeHex(c, -22)), r * 1.55, h * 0.08, r * 1.55, 0, h, 0); // parapet
    for (const px of [-0.5, 0.2]) add(boxGeo, lambert("#3a2a1c"), r * 0.26, r * 0.4, 0.1, px * r, h * 0.4, r * 0.76); // windows
  } else if (style === "ice") {
    const h = r * random(1.0, 1.5);
    add(boxGeo, lambert(c), r * 1.4, h, r * 1.4, 0, h / 2, 0);
    const roof = add(roofGeo, lambert("#eef4fb"), r * 1.35, r * 1.05, r * 1.35, 0, h + r * 0.5, 0);
    roof.rotation.y = Math.PI / 4;
    add(boxGeo, lambert("#ffffff"), r * 1.45, r * 0.12, r * 1.45, 0, h, 0); // snow ledge
    for (const sx of [-0.5, 0.5]) add(boxGeo, lambert("#ffe7a8"), r * 0.28, r * 0.34, 0.1, sx * r, h * 0.5, r * 0.71);
  } else if (style === "obsidian") {
    // Jagged dark crystal spires with a glowing seam.
    const h = r * random(2.0, 3.3);
    const b1 = add(boxGeo, lambert(c), r * 1.4, h, r * 1.4, 0, h / 2, 0);
    b1.rotation.y = random(0, 0.5);
    const b2 = add(boxGeo, lambert(shadeHex(c, 14)), r * 0.95, h * 0.55, r * 0.95, 0, h * 1.05, 0);
    b2.rotation.y = random(0, 0.6);
    add(boxGeo, emberMat, r * 0.12, h * 0.8, r * 1.43, 0, h * 0.45, 0);  // lava seam
    add(boxGeo, emberMat, r * 1.43, h * 0.7, r * 0.12, 0, h * 0.4, 0);
  } else if (style === "dome") {
    // Sci-fi habitat: cylinder base, glass dome, glowing band + antenna.
    const h = r * random(0.8, 1.4);
    add(cylGeo, lambert(c), r * 1.2, h, r * 1.2, 0, h / 2, 0);
    add(sphereGeo, lambert(shadeHex(c, 18)), r * 1.2, r * 1.0, r * 1.2, 0, h, 0);
    add(cylGeo, neonMat, r * 1.23, r * 0.12, r * 1.23, 0, h * 0.62, 0);   // window band
    add(cylGeo, lambert("#cfd6e0"), r * 0.05, r * 0.9, r * 0.05, r * 0.4, h + r * 1.2, 0); // antenna
    add(sphereGeo, neonMat, r * 0.1, r * 0.1, r * 0.1, r * 0.4, h + r * 1.7, 0);
  } else {
    // tower (default modern skyscraper)
    const h = r * random(2.4, 3.9);
    add(boxGeo, lambert(shadeHex(c, -22)), r * 1.62, h * 0.06, r * 1.62, 0, h * 0.03, 0); // base plinth
    add(boxGeo, buildingMat(c), r * 1.5, h, r * 1.5, 0, h / 2, 0);
    add(boxGeo, buildingMat(shadeHex(c, 14)), r * 1.05, h * 0.34, r * 1.05, 0, h * 1.0, 0); // setback
    add(boxGeo, lambert(shadeHex(c, 30)), r * 1.12, h * 0.06, r * 1.12, 0, h * 1.18, 0);    // roof cap
    if (r > 46) add(cylGeo, lambert("#9aa0a8"), r * 0.05, h * 0.4, r * 0.05, r * 0.3, h * 1.35, 0); // antenna
  }
}

function createObjectMesh(object) {
  const group = new THREE.Group();
  const r = object.radius;
  object.baseRadius = r;

  // Small helper to add a child mesh in one line.
  const add = (geo, mat, sx, sy, sz, px, py, pz) => {
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(px || 0, py || 0, pz || 0);
    group.add(m);
    return m;
  };

  if (object.type === "building") {
    buildStructure(object, add, r);
  } else if (object.type === "car" || object.type === "bus") {
    const long = object.type === "bus" ? 2.9 : 2.0;
    const tall = object.type === "bus" ? 0.95 : 0.55;
    add(boxGeo, carMat(object.color), r * 1.1, r * tall, r * long, 0, r * (tall * 0.5 + 0.18), 0);
    add(boxGeo, carMat(shadeHex(object.color, 26)), r * 0.92, r * (object.type === "bus" ? 0.6 : 0.5), r * (object.type === "bus" ? 2.4 : 1.05), 0, r * (tall + 0.45), object.type === "bus" ? 0 : -r * 0.1);
    // Four wheels.
    const wy = r * 0.22;
    const wz = r * (long * 0.32);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const w = add(wheelGeo, lambert("#1b1b1e"), r * 0.22, r * 0.62, r * 0.22, sx * r * 0.58, wy, sz * wz);
      w.rotation.z = Math.PI / 2;
    }
  } else if (object.type === "tree") {
    add(cylGeo, trunkMat, r * 0.2, r * 0.9, r * 0.2, 0, r * 0.45, 0);
    if (Math.random() < 0.5) {
      // Pine: stacked cones.
      add(coneGeo, leafMat(object.color), r * 0.9, r * 1.0, r * 0.9, 0, r * 1.0, 0);
      add(coneGeo, leafMat(object.color), r * 0.72, r * 0.85, r * 0.72, 0, r * 1.45, 0);
      add(coneGeo, leafMat(object.color), r * 0.5, r * 0.7, r * 0.5, 0, r * 1.85, 0);
    } else {
      // Round: clustered canopy.
      add(sphereGeo, leafMat(object.color), r * 0.95, r * 0.95, r * 0.95, 0, r * 1.15, 0);
      add(sphereGeo, leafMat(shadeHex(object.color, 12)), r * 0.6, r * 0.6, r * 0.6, r * 0.45, r * 1.45, r * 0.2);
    }
  } else if (object.type === "rock") {
    const a = add(rockGeo, lambert(object.color), r * 0.95, r * 0.78, r * 0.95, 0, r * 0.55, 0);
    a.rotation.set(random(0, 1), random(0, 6.28), random(0, 1));
    add(rockGeo, lambert(shadeHex(object.color, -14)), r * 0.45, r * 0.4, r * 0.45, r * 0.45, r * 0.3, r * 0.35);
  } else if (object.type === "cactus") {
    add(cylGeo, lambert(object.color), r * 0.32, r * 1.0, r * 0.32, 0, r * 0.7, 0);
    const arm = (sx) => {
      add(cylGeo, lambert(object.color), r * 0.18, r * 0.45, r * 0.18, sx * r * 0.4, r * 0.85, 0);
      add(cylGeo, lambert(object.color), r * 0.18, r * 0.4, r * 0.18, sx * r * 0.55, r * 1.15, 0);
    };
    arm(1); arm(-1);
  } else if (object.type === "crate") {
    add(boxGeo, lambert(object.color), r * 1.4, r * 1.4, r * 1.4, 0, r * 0.7, 0);
    // Darker corner frame slats.
    const fr = lambert(shadeHex(object.color, -34));
    for (const sy of [0.04, 1.36]) add(boxGeo, fr, r * 1.46, r * 0.12, r * 1.46, 0, r * sy, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(boxGeo, fr, r * 0.16, r * 1.42, r * 0.16, sx * r * 0.66, r * 0.7, sz * r * 0.66);
  } else if (object.type === "hydrant") {
    add(cylGeo, lambert(object.color), r * 0.5, r * 1.1, r * 0.5, 0, r * 0.55, 0);
    add(sphereGeo, lambert(object.color), r * 0.5, r * 0.4, r * 0.5, 0, r * 1.05, 0);
    for (const sx of [-1, 1]) add(cylGeo, lambert(shadeHex(object.color, -20)), r * 0.18, r * 0.3, r * 0.18, sx * r * 0.55, r * 0.7, 0).rotation.z = Math.PI / 2;
  } else if (object.type === "snowman") {
    add(sphereGeo, lambert(object.color), r * 0.85, r * 0.85, r * 0.85, 0, r * 0.7, 0);
    add(sphereGeo, lambert(object.color), r * 0.6, r * 0.6, r * 0.6, 0, r * 1.4, 0);
    add(sphereGeo, lambert(object.color), r * 0.42, r * 0.42, r * 0.42, 0, r * 1.95, 0);
    add(coneGeo, lambert("#e0772c"), r * 0.1, r * 0.35, r * 0.1, 0, r * 1.95, r * 0.4).rotation.x = Math.PI / 2;
    add(cylGeo, lambert("#222"), r * 0.46, r * 0.1, r * 0.46, 0, r * 2.18, 0); // hat brim
    add(cylGeo, lambert("#222"), r * 0.3, r * 0.35, r * 0.3, 0, r * 2.35, 0);
  } else if (object.type === "mushroom") {
    add(cylGeo, lambert("#efe7d2"), r * 0.34, r * 0.9, r * 0.34, 0, r * 0.55, 0);
    const cap = add(sphereGeo, lambert(object.color), r * 0.85, r * 0.6, r * 0.85, 0, r * 1.0, 0);
    cap.scale.y = r * 0.6; // dome
    add(sphereGeo, lambert("#f4ede0"), r * 0.16, r * 0.1, r * 0.16, r * 0.3, r * 1.2, r * 0.2); // spot
    add(sphereGeo, lambert("#f4ede0"), r * 0.14, r * 0.1, r * 0.14, -r * 0.35, r * 1.18, -r * 0.1);
  } else if (object.type === "boat") {
    const hull = add(boxGeo, lambert(object.color), r * 0.7, r * 0.5, r * 1.8, 0, r * 0.35, 0);
    add(boxGeo, lambert(shadeHex(object.color, -18)), r * 0.78, r * 0.18, r * 1.6, 0, r * 0.12, r * 0.1); // waterline
    add(boxGeo, lambert("#f4f0e4"), r * 0.5, r * 0.45, r * 0.7, 0, r * 0.8, -r * 0.2); // cabin
    add(cylGeo, lambert("#cfcabb"), r * 0.05, r * 1.1, r * 0.05, 0, r * 1.2, r * 0.3); // mast
  } else if (object.type === "tank") {
    add(boxGeo, lambert(object.color), r * 1.0, r * 0.4, r * 1.6, 0, r * 0.45, 0); // hull
    for (const sx of [-1, 1]) add(boxGeo, lambert("#2a2c24"), r * 0.28, r * 0.42, r * 1.7, sx * r * 0.58, r * 0.4, 0); // treads
    add(cylGeo, lambert(shadeHex(object.color, 12)), r * 0.55, r * 0.4, r * 0.55, 0, r * 0.85, 0); // turret
    add(cylGeo, lambert("#3a3c30"), r * 0.09, r * 1.1, r * 0.09, 0, r * 0.95, r * 0.7).rotation.x = Math.PI / 2; // barrel
  } else if (object.type === "rocket") {
    add(cylGeo, lambert(object.color), r * 0.5, r * 1.7, r * 0.5, 0, r * 0.95, 0); // body
    add(coneGeo, lambert(shadeHex(object.color, -30)), r * 0.5, r * 0.7, r * 0.5, 0, r * 2.1, 0); // nose
    add(sphereGeo, lambert("#5fd0e0"), r * 0.18, r * 0.18, r * 0.1, 0, r * 1.4, r * 0.5); // window
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * Math.PI * 2;
      const fin = add(boxGeo, lambert(shadeHex(object.color, -20)), r * 0.08, r * 0.5, r * 0.4, Math.cos(a) * r * 0.5, r * 0.4, Math.sin(a) * r * 0.5);
      fin.rotation.y = -a;
    }
  } else {
    // person
    add(cylGeo, lambert(object.color), r * 0.36, r * 0.8, r * 0.36, 0, r * 0.5, 0);
    add(sphereGeo, headMat, r * 0.3, r * 0.3, r * 0.3, 0, r * 1.05, 0);
    for (const sx of [-1, 1]) add(cylGeo, lambert(object.color), r * 0.12, r * 0.5, r * 0.12, sx * r * 0.34, r * 0.6, 0).rotation.z = sx * 0.35;
  }

  group.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = false; // Objects don't need to receive shadows from each other, saves GPU
    }
  });

  const ring = new THREE.Mesh(edibleRingGeo, edibleMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.6;
  ring.scale.setScalar(r * 1.18);
  ring.visible = false;
  group.add(ring);
  object.ring = ring;

  group.position.set(object.x, 0, object.y);
  object.mesh = group;
  dynamicGroup.add(group);
}

function createHoleMesh(accent, isPlayer) {
  const group = new THREE.Group();

  const disc = new THREE.Mesh(circleGeo, new THREE.MeshBasicMaterial({ color: 0x000000 }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.3;
  disc.renderOrder = 2;
  group.add(disc);

  const glow = new THREE.Mesh(
    holeRingGeo,
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(accent),
      transparent: true,
      opacity: isPlayer ? 0.95 : 0.7,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.35;
  glow.renderOrder = 3;
  group.add(glow);

  return group;
}

function clearGroup(group) {
  for (let i = group.children.length - 1; i >= 0; i -= 1) {
    group.remove(group.children[i]);
  }
}

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  renderer.setPixelRatio(Math.max(1, Math.min(2, window.devicePixelRatio || 1)));
  renderer.setSize(width, height, false);
  threeCamera.aspect = width / Math.max(1, height);
  threeCamera.updateProjectionMatrix();
}

function random(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function resetGame() {
  const level = getLevel();
  applyLevelTheme();
  clearGroup(dynamicGroup);
  comboCount = 0;
  comboExpireAt = 0;
  player.x = WORLD.width / 2;
  player.y = WORLD.height / 2;
  player.radius = level.startRadius;
  player.targetRadius = level.startRadius;
  player.vx = 0;
  player.vy = 0;
  player.powers = { speed: 0, magnet: 0, size: 0 };
  camera.x = player.x;
  camera.y = player.y;
  camera.zoom = 1;
  pointer.worldX = player.x;
  pointer.worldY = player.y;
  runTime = level.seconds;
  score = 0;
  shake = 0;
  noFoodTimer = 0;
  powerupSpawnTimer = 0;
  particles = [];
  powerups = [];
  objects = makeObjects();
  bots = makeBots();
  player.holeMesh = createHoleMesh("#6be0c2", true);
  dynamicGroup.add(player.holeMesh);
  updateHud();
}

function makeObjects() {
  const level = getLevel();
  const spawned = [];
  const tileSize = 160;
  const halfTile = tileSize / 2;

  for (let x = halfTile; x < WORLD.width; x += tileSize) {
    for (let y = halfTile; y < WORLD.height; y += tileSize) {

      const roll = Math.random();
      const density = level.buildingDensity || 0.4;

      // Rare Powerup logic: Only after Level 3 and with lower 2% chance
      if (selectedLevelIndex >= 3 && Math.random() < 0.02) {
        spawnPowerup(x + random(-40, 40), y + random(-40, 40));
      }

      if (roll < density) {
        const object = {
          id: crypto.randomUUID(),
          x: x + random(-20, 20),
          y: y + random(-20, 20),
          radius: makeRadius("building", level),
          absorbing: false,
          absorbT: 0,
          spin: random(-3, 3),
          type: "building",
          style: BUILD_STYLE[level.id] || "tower"
        };
        const set = BUILD_COLORS[object.style] || BUILD_COLORS.tower;
        object.color = set[Math.floor(random(0, set.length))];
        object.mass = Math.round(object.radius * object.radius * 0.1);
        createObjectMesh(object);
        spawned.push(object);
      }

      for (let i = 0; i < 4; i++) {
        const pType = weightedType(level.weights);
        if (pType === "building") continue;

        const object = {
          id: crypto.randomUUID(),
          x: x + random(-60, 60),
          y: y + random(-60, 60),
          radius: makeRadius(pType, level),
          absorbing: false,
          absorbT: 0,
          spin: random(-5, 5),
          type: pType,
          color: pickColor(pType)
        };
        object.mass = Math.round(object.radius * object.radius * 0.08);
        createObjectMesh(object);
        spawned.push(object);
      }
    }
  }

  return spawned;
}

const POWERUP_EMOJI = { SPEED: "⚡", MAGNET: "🧲", GROWTH: "⬆️" };

// A camera-facing badge that shows what the powerup does (so a magnet reads as a
// magnet at a glance). Drawn once per type and cached.
const powerupIconCache = {};
function powerupIconTexture(type, color) {
  if (powerupIconCache[type]) return powerupIconCache[type];
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 7, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(8,12,16,0.9)";
  ctx.fill();
  ctx.lineWidth = 9;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.font = "72px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(POWERUP_EMOJI[type] || "?", size / 2, size / 2 + 6);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  powerupIconCache[type] = tex;
  return tex;
}

function spawnPowerup(x, y) {
  const types = ["SPEED", "MAGNET", "GROWTH"];
  const type = types[Math.floor(Math.random() * types.length)];
  const colors = { SPEED: "#ffeb3b", MAGNET: "#00bcd4", GROWTH: "#e91e63" };

  const mesh = new THREE.Group();
  const crystal = new THREE.Mesh(powerupGeo, new THREE.MeshStandardMaterial({
    color: colors[type],
    emissive: colors[type],
    emissiveIntensity: 0.5,
    metalness: 0.8,
    roughness: 0.2
  }));
  crystal.scale.setScalar(12);
  mesh.add(crystal);

  const ring = new THREE.Mesh(new THREE.RingGeometry(14, 16, 32), new THREE.MeshBasicMaterial({
    color: colors[type],
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide
  }));
  ring.rotation.x = Math.PI / 2;
  mesh.add(ring);

  // Floating icon badge (children[2]) — always faces the camera and renders on
  // top so the player can identify the powerup type instantly.
  const icon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: powerupIconTexture(type, colors[type]),
    transparent: true,
    depthTest: false,
  }));
  icon.scale.set(30, 30, 1);
  icon.position.y = 30;
  icon.renderOrder = 999;
  mesh.add(icon);

  mesh.position.set(x, 8, y);
  dynamicGroup.add(mesh);

  powerups.push({ x, y, type, mesh, color: colors[type], life: 15 }); // 15 seconds to collect
}

function makeBots() {
  const level = getLevel();
  const botColors = ["#e85c7a", "#48b8ff"];
  return Array.from({ length: level.bots }, (_, index) => {
    const color = botColors[index % botColors.length];
    const bot = {
      x: random(250, WORLD.width - 250),
      y: random(250, WORLD.height - 250),
      radius: Math.max(24, level.startRadius - 4),
      targetRadius: Math.max(24, level.startRadius - 4),
      color,
      wander: random(0, Math.PI * 2),
      holeMesh: createHoleMesh(color, false),
    };
    dynamicGroup.add(bot.holeMesh);
    return bot;
  });
}

function startGame() {
  if (!isLevelUnlocked(getLevel())) {
    ratingEl.textContent = `Need ${getLevel().unlockScore} total score to unlock ${getLevel().name}.`;
    renderLevelSelect();
    return;
  }
  initAudio();
  playStartSound();
  requestMobileFullscreen();
  resetGame();
  state = "playing";
  startBlackholeAmbient();
  Ads.hideBanner();
  Ads.recordPlay();
  menuEl.classList.add("hidden");
  gameOverEl.classList.add("hidden");
  backButton.classList.remove("hidden");
  document.body.classList.add("in-game");
}

// Leave a run early and return to the level select.
function returnToMenu() {
  stopBlackholeAmbient();
  state = "menu";
  pointer.active = false;
  backButton.classList.add("hidden");
  document.body.classList.remove("in-game");
  gameOverEl.classList.add("hidden");
  menuEl.classList.remove("hidden");
  renderLevelSelect();
  Ads.showBanner();
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}

function finishGame(reason = "time") {
  const level = getLevel();
  const earned = calculateStars(score, level.targets);
  state = "gameover";
  stopBlackholeAmbient();
  playFinishSound(reason, earned);
  finalScoreEl.textContent = `${score} pts`;
  starsEl.textContent = starText(earned);

  // Show reward buttons based on situation
  doubleScoreButton.classList.toggle("hidden", score === 0);
  extraTimeButton.classList.toggle("hidden", reason !== "time" || earned === 3);

  if (earned > 0) {
    totalScore += score;
    bestScores[level.id] = Math.max(bestScores[level.id] || 0, score);
    levelStars[level.id] = Math.max(levelStars[level.id] || 0, earned);
    persistProgress();
  }

  renderLevelSelect();
  nextLevelButton.classList.toggle("hidden", !getNextUnlockedLevelIndex());
  Ads.showBanner();

  ratingEl.textContent = reason === "empty"
    ? "Nothing edible remains. Grow faster next run."
    : earned === 3
    ? "Clean sweep. The city never stood a chance."
    : earned === 2
      ? "Strong run. One more bite for mastery."
      : earned === 1
        ? "Level cleared. Bigger trouble unlocked."
        : "Hungry, but not full. Try this level again.";
  gameOverEl.classList.remove("hidden");
}

function watchAdForDoubleScore() {
  playButtonSound();
  Ads.showRewarded(ADMOB.rewardedDouble, "Double your final score", () => {
    totalScore += score; // Add another run worth of points
    score *= 2;
    finalScoreEl.textContent = `${score} pts (DOUBLED!)`;
    doubleScoreButton.classList.add("hidden");
    persistProgress();
    renderLevelSelect();
  });
}

function watchAdForTime() {
  playButtonSound();
  Ads.showRewarded(ADMOB.rewardedTime, "+30 seconds to keep eating", () => {
    runTime = 30; // Grant 30 seconds
    state = "playing";
    startBlackholeAmbient();
    Ads.hideBanner();
    gameOverEl.classList.add("hidden");
    extraTimeButton.classList.add("hidden");
  });
}

function initAudio() {
  if (!audio) {
    audio = new (window.AudioContext || window.webkitAudioContext)();

    // Create a reverb effect using a simple generated impulse response
    const reverb = audio.createConvolver();
    const rate = audio.sampleRate;
    const length = rate * 1.5;
    const impulse = audio.createBuffer(2, length, rate);
    for (let i = 0; i < 2; i++) {
      const channel = impulse.getChannelData(i);
      for (let j = 0; j < length; j++) {
        channel[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / length, 3);
      }
    }
    reverb.buffer = impulse;

    audioMaster = audio.createGain();
    musicGain = audio.createGain();
    sfxGain = audio.createGain();
    ambientGain = audio.createGain();
    reverbGain = audio.createGain();
    const compressor = audio.createDynamicsCompressor();

    audioMaster.gain.value = audioMuted ? 0 : MASTER_VOLUME;
    musicGain.gain.value = 0.4;
    sfxGain.gain.value = 1.0;
    ambientGain.gain.value = 0.0; // raised while a run is in progress
    reverbGain.gain.value = 0.32; // a subtle wash, not the whole signal

    musicGain.connect(audioMaster);
    // SFX go out DRY (punchy + present) with a parallel reverb send. Previously
    // everything was routed only through the convolver, which smeared the
    // transients and dropped the perceived level to near nothing.
    sfxGain.connect(audioMaster);
    sfxGain.connect(reverb);
    reverb.connect(reverbGain).connect(audioMaster);
    ambientGain.connect(audioMaster); // dry low-end drone, bypasses reverb

    // Gentle bus glue rather than heavy squashing (old ratio 12 / -24 killed it).
    compressor.threshold.setValueAtTime(-14, audio.currentTime);
    compressor.knee.setValueAtTime(24, audio.currentTime);
    compressor.ratio.setValueAtTime(4, audio.currentTime);

    audioMaster.connect(compressor).connect(audio.destination);
  }
  if (audio.state === "suspended") {
    audio.resume();
  }
  unlockAudioOutput();
  updateAudioButton();
}

// Mobile browsers keep the audio output gated until a sound actually plays
// from inside a user gesture. Push a one-sample silent buffer through the
// destination once to satisfy that policy.
function unlockAudioOutput() {
  if (!audio || audioUnlocked) return;
  const buffer = audio.createBuffer(1, 1, audio.sampleRate);
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.connect(audio.destination);
  source.start(0);
  audioUnlocked = true;
}

function tone(frequency, duration, type = "sine", volume = 0.05, destination = sfxGain, when = 0) {
  if (!audio || audioMuted) return;
  const start = audio.currentTime + when;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();

  oscillator.type = type;
  // Dynamic vibrato for more "living" sound
  const freq = frequency * (0.98 + Math.random() * 0.04);
  oscillator.frequency.setValueAtTime(freq, start);

  gain.gain.setValueAtTime(0.001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(volume * 0.5, start + duration * 0.3);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

  oscillator.connect(gain).connect(destination || sfxGain);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.05);
  oscillator.onended = () => { try { gain.disconnect(); } catch (e) {} };
}

function sweepTone(from, to, duration, type = "sine", volume = 0.08, destination = sfxGain, when = 0) {
  if (!audio || audioMuted) return;
  const start = audio.currentTime + when;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const filter = audio.createBiquadFilter();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from * (0.98 + Math.random() * 0.04), start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(2000, start);
  filter.frequency.exponentialRampToValueAtTime(400, start + duration);

  gain.gain.setValueAtTime(0.001, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

  oscillator.connect(filter).connect(gain).connect(destination || sfxGain);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.05);
  oscillator.onended = () => { try { gain.disconnect(); } catch (e) {} };
}

function noiseBurst(duration = 0.12, volume = 0.08, when = 0, destination = sfxGain) {
  if (!audio || audioMuted) return;
  const start = audio.currentTime + when;
  const sampleRate = audio.sampleRate;
  const buffer = audio.createBuffer(1, Math.max(1, sampleRate * duration), sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const source = audio.createBufferSource();
  const gain = audio.createGain();
  const filter = audio.createBiquadFilter();

  filter.type = "bandpass";
  filter.frequency.setValueAtTime(600, start);
  filter.Q.setValueAtTime(1, start);

  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

  source.buffer = buffer;
  source.connect(filter).connect(gain).connect(destination || sfxGain);
  source.start(start);
  source.stop(start + duration);
  source.onended = () => { try { gain.disconnect(); } catch (e) {} };
}

// Flexible filtered-noise hit: the filter cutoff sweeps f0 -> f1, which gives
// debris, scrapes, rustles and impacts depending on the band chosen.
function fnoise(duration, volume, dest, when = 0, type = "lowpass", f0 = 1200, f1 = 300, q = 1) {
  if (!audio || audioMuted) return;
  const start = audio.currentTime + when;
  const sr = audio.sampleRate;
  const buf = audio.createBuffer(1, Math.max(1, Math.floor(sr * duration)), sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = audio.createBufferSource();
  src.buffer = buf;
  const g = audio.createGain();
  const filt = audio.createBiquadFilter();
  filt.type = type;
  filt.Q.value = q;
  filt.frequency.setValueAtTime(f0, start);
  filt.frequency.exponentialRampToValueAtTime(Math.max(1, f1), start + duration);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(volume, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(filt).connect(g).connect(dest || sfxGain);
  src.start(start);
  src.stop(start + duration + 0.02);
  src.onended = () => { try { g.disconnect(); } catch (e) {} };
}

// A short vocal yelp/scream built from detuned saws through vowel formant
// band-passes with vibrato. pitch ~1 = adult, higher = more panicked.
function voiceScream(dest, when = 0, pitch = 1) {
  if (!audio || audioMuted) return;
  const start = audio.currentTime + when;
  const dur = 0.4 + Math.random() * 0.12;
  const base = 300 * pitch;
  const osc = audio.createOscillator();
  const osc2 = audio.createOscillator();
  osc.type = osc2.type = "sawtooth";
  for (const [o, det] of [[osc, 1], [osc2, 1.012]]) {
    o.frequency.setValueAtTime(base * 0.8 * det, start);
    o.frequency.linearRampToValueAtTime(base * 1.55 * det, start + 0.08);
    o.frequency.exponentialRampToValueAtTime(base * 0.7 * det, start + dur);
  }
  const f1 = audio.createBiquadFilter();
  f1.type = "bandpass"; f1.frequency.value = 1300; f1.Q.value = 7;
  const f2 = audio.createBiquadFilter();
  f2.type = "bandpass"; f2.frequency.value = 2700; f2.Q.value = 9;
  const lfo = audio.createOscillator();
  lfo.frequency.value = 15 + Math.random() * 6;
  const lfoGain = audio.createGain();
  lfoGain.gain.value = base * 0.05;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);
  lfoGain.connect(osc2.frequency);
  const merge = audio.createGain();
  osc.connect(merge); osc2.connect(merge);
  const g = audio.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(0.14, start + 0.03);
  g.gain.setValueAtTime(0.13, start + dur * 0.55);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  merge.connect(f1).connect(g);
  merge.connect(f2).connect(g);
  g.connect(dest || sfxGain);
  osc.start(start); osc2.start(start); lfo.start(start);
  const stop = start + dur + 0.05;
  osc.stop(stop); osc2.stop(stop); lfo.stop(stop);
  osc.onended = () => { try { g.disconnect(); lfoGain.disconnect(); } catch (e) {} };
}

function playScream(worldX) {
  if (!audio || audioMuted) return;
  const now = audio.currentTime;
  if (now < nextScreamAt) return;            // keep a crowd from becoming a wall of noise
  nextScreamAt = now + 0.16 + Math.random() * 0.16;
  const pan = clamp((worldX - camera.x) / 500, -0.9, 0.9);
  const panner = audio.createStereoPanner();
  panner.pan.value = pan;
  panner.connect(sfxGain);
  voiceScream(panner, 0, 0.85 + Math.random() * 0.6);
}

// Persistent swirling black-hole drone: a deep detuned saw through a lowpass
// plus band-passed noise modulated by a slow LFO. Intensity tracks hole size.
function startBlackholeAmbient() {
  if (!audio || blackhole) return;
  const now = audio.currentTime;
  const osc = audio.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = 36;
  const sub = audio.createOscillator();
  sub.type = "sine";
  sub.frequency.value = 24;
  const lp = audio.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = 140; lp.Q.value = 4;
  const droneGain = audio.createGain();
  droneGain.gain.value = 0.0;

  // Looping airy whoosh.
  const sr = audio.sampleRate;
  const nbuf = audio.createBuffer(1, sr * 2, sr);
  const nd = nbuf.getChannelData(0);
  for (let i = 0; i < nd.length; i += 1) nd[i] = Math.random() * 2 - 1;
  const noise = audio.createBufferSource();
  noise.buffer = nbuf; noise.loop = true;
  const bp = audio.createBiquadFilter();
  bp.type = "bandpass"; bp.frequency.value = 200; bp.Q.value = 0.8;
  const noiseGain = audio.createGain();
  noiseGain.gain.value = 0.0;

  const lfo = audio.createOscillator();
  lfo.frequency.value = 0.13;
  const lfoGain = audio.createGain();
  lfoGain.gain.value = 80;
  lfo.connect(lfoGain).connect(bp.frequency);

  osc.connect(lp);
  sub.connect(lp);
  lp.connect(droneGain).connect(ambientGain);
  noise.connect(bp).connect(noiseGain).connect(ambientGain);

  osc.start(now); sub.start(now); noise.start(now); lfo.start(now);
  droneGain.gain.setTargetAtTime(0.5, now, 0.6);
  noiseGain.gain.setTargetAtTime(0.18, now, 0.8);
  blackhole = { osc, sub, noise, lfo, droneGain, noiseGain, lp };
}

function updateBlackholeAmbient() {
  if (!audio || !blackhole) return;
  const t = clamp(player.radius / 200, 0, 1);
  blackhole.osc.frequency.setTargetAtTime(34 + t * 18, audio.currentTime, 0.3);
  blackhole.lp.frequency.setTargetAtTime(120 + t * 220, audio.currentTime, 0.3);
}

function stopBlackholeAmbient() {
  if (!audio || !blackhole) return;
  const bh = blackhole;
  blackhole = null;
  const now = audio.currentTime;
  bh.droneGain.gain.setTargetAtTime(0, now, 0.25);
  bh.noiseGain.gain.setTargetAtTime(0, now, 0.25);
  const stop = now + 0.8;
  bh.osc.stop(stop); bh.sub.stop(stop); bh.noise.stop(stop); bh.lfo.stop(stop);
}

function playAbsorbSound(target, absorber) {
  if (absorber !== player || !audio || audioMuted) return;

  const pan = clamp((target.x - camera.x) / 400, -0.9, 0.9);
  const panner = audio.createStereoPanner();
  panner.pan.setValueAtTime(pan, audio.currentTime);
  panner.connect(sfxGain);
  // Free the panner once the longest layer (building collapse ~1.3s) has played
  // so panners don't accumulate and choke the audio engine over a long run.
  setTimeout(() => { try { panner.disconnect(); } catch (e) {} }, 1600);

  const r = target.radius;
  const size = clamp(r / 60, 0, 1);

  // When swallowing lots of objects in the same instant, collapse the heavy
  // layers into a light tick so the mix doesn't turn to mush / overload.
  const now = audio.currentTime;
  const throttled = now - lastAbsorbSoundAt < 0.03;
  lastAbsorbSoundAt = now;
  if (throttled) {
    tone(clamp(140 - player.radius * 0.25, 45, 140), 0.07, "sine", 0.045, panner);
    return;
  }

  if (target.type === "building") {
    // Structural collapse: deep sub, groaning slide, then tumbling debris.
    tone(27, 1.1, "sine", 0.3, panner, 0);
    sweepTone(96, 22, 0.95, "sawtooth", 0.17, panner, 0);
    fnoise(0.95, 0.16, panner, 0.02, "lowpass", 2600, 180, 0.7); // rubble
    fnoise(0.45, 0.1, panner, 0.0, "bandpass", 1700, 500, 1.4);  // cracking
    for (let i = 0; i < 4; i += 1) {
      tone(46 + Math.random() * 46, 0.18, "square", 0.06, panner, 0.06 + i * 0.13); // chunks landing
    }
  } else if (target.type === "car" || target.type === "bus") {
    // Metal crush + a quick falling whistle into an impact thud.
    sweepTone(880, 120, 0.18, "square", 0.08, panner);
    tone(760, 0.12, "square", 0.05, panner, 0.0);
    tone(1140, 0.1, "triangle", 0.04, panner, 0.02);
    fnoise(0.22, 0.08, panner, 0.0, "highpass", 3200, 1400, 1.0); // glass/scrape
    sweepTone(320, 70, 0.28, "sawtooth", 0.1, panner, 0.04);      // crumpling
    tone(40, 0.4, "sine", 0.13, panner, 0.07);                    // ground impact
    if (target.type === "bus") tone(30, 0.6, "sine", 0.12, panner, 0.07);
  } else if (target.type === "tree") {
    fnoise(0.16, 0.09, panner, 0.0, "bandpass", 2500, 700, 2.0);  // bark snap
    sweepTone(520, 110, 0.14, "triangle", 0.1, panner);
    fnoise(0.5, 0.05, panner, 0.05, "highpass", 5200, 2800, 0.7); // leaves rustle
  } else if (target.type === "cactus" || target.type === "mushroom") {
    fnoise(0.18, 0.08, panner, 0.0, "bandpass", 1800, 500, 1.6);
    tone(160, 0.18, "sine", 0.06, panner);
  } else if (target.type === "rock" || target.type === "crate" || target.type === "tank" || target.type === "rocket" || target.type === "snowman" || target.type === "hydrant" || target.type === "boat") {
    // Heavy/blunt objects: a solid thud with a short knock.
    tone(70, 0.26, "sine", 0.12, panner);
    fnoise(0.2, 0.08, panner, 0.0, "lowpass", 1400, 200, 0.7);
    if (target.type === "tank" || target.type === "rocket") tone(34, 0.5, "sine", 0.12, panner, 0.04);
  } else {
    // Generic small "gulp".
    sweepTone(420 + r * 4, 170, 0.14, "sine", 0.08, panner);
    tone(180, 0.18, "sine", 0.05, panner, 0.05);
  }

  // Universal suction: a downward gulp bass plus an airy whoosh into the void.
  const gulpFreq = clamp(90 - player.radius * 0.3, 28, 90);
  sweepTone(gulpFreq + 30, gulpFreq, 0.45, "sine", 0.12 + size * 0.1, panner, 0.0);
  fnoise(0.34, 0.05 + size * 0.06, panner, 0.0, "bandpass", 1500, 180, 0.8);
}

// Rising bell that climbs a pentatonic ladder with the streak count, so eating
// fast turns into an ascending arpeggio. Throttled so a crowd-eat stays musical.
function playComboChime(worldX, combo) {
  if (!audio || audioMuted || combo < 2) return;
  const now = audio.currentTime;
  if (now - lastChimeAt < 0.04) return;
  lastChimeAt = now;
  const pent = [0, 2, 4, 7, 9]; // pentatonic, octave-stacked as the streak grows
  const i = combo - 2;
  const semi = Math.min(36, pent[i % pent.length] + 12 * Math.floor(i / pent.length));
  const freq = 523.25 * Math.pow(2, semi / 12);
  const pan = clamp((worldX - camera.x) / 500, -0.9, 0.9);
  const panner = audio.createStereoPanner();
  panner.pan.setValueAtTime(pan, now);
  panner.connect(sfxGain);
  setTimeout(() => { try { panner.disconnect(); } catch (e) {} }, 600);
  const vol = clamp(0.05 + combo * 0.006, 0.05, 0.12);
  tone(freq, 0.2, "triangle", vol, panner);          // bell body
  tone(freq * 2, 0.13, "sine", vol * 0.4, panner, 0); // shimmer octave
  tone(freq * 3, 0.08, "sine", vol * 0.2, panner, 0.01);
}

// Deep, powerful impact when a large object drops into the hole.
function playBigEatBoom(worldX, r) {
  if (!audio || audioMuted) return;
  const now = audio.currentTime;
  const power = clamp(r / 70, 0.3, 1);
  const pan = clamp((worldX - camera.x) / 500, -0.9, 0.9);
  const panner = audio.createStereoPanner();
  panner.pan.setValueAtTime(pan, now);
  panner.connect(sfxGain);
  setTimeout(() => { try { panner.disconnect(); } catch (e) {} }, 800);
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.frequency.setValueAtTime(95, now);
  o.frequency.exponentialRampToValueAtTime(28, now + 0.35);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.2 * power, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
  o.connect(g).connect(panner);
  o.start(now);
  o.stop(now + 0.55);
  o.onended = () => { try { g.disconnect(); } catch (e) {} };
  fnoise(0.4, 0.08 * power, panner, 0.0, "lowpass", 800, 110, 0.7);  // body rumble
  fnoise(0.12, 0.06 * power, panner, 0.0, "bandpass", 1600, 600, 1.2); // impact crack
}

function playStartSound() {
  sweepTone(180, 260, 0.16, "sine", 0.09);
  tone(98, 0.22, "sine", 0.08, sfxGain, 0.03);
}

function playFinishSound(reason, earned) {
  if (reason === "empty" || earned === 0) {
    sweepTone(170, 90, 0.28, "sine", 0.09);
    tone(55, 0.25, "sine", 0.07, sfxGain, 0.08);
    return;
  }
  tone(174, 0.14, "sine", 0.07);
  tone(220, 0.16, "sine", 0.07, sfxGain, 0.12);
  tone(293 + earned * 22, 0.28, "sine", 0.08, sfxGain, 0.22);
}

function playButtonSound() {
  initAudio();
  tone(260, 0.055, "sine", 0.055);
  tone(390, 0.05, "sine", 0.032, sfxGain, 0.025);
}

// Frequency of a scale degree (can exceed the scale length; it wraps and adds
// octaves) for a given theme, base octave and semitone transpose.
function noteFreq(theme, degree, octave, transpose) {
  const sc = SCALES[theme.scale] || SCALES.minor;
  const idx = ((degree % sc.length) + sc.length) % sc.length;
  const oct = octave + Math.floor(degree / sc.length);
  const semitone = sc[idx] + oct * 12 + (transpose || 0);
  return theme.root * Math.pow(2, semitone / 12);
}

// A single tone/pad voice with a pluck-or-pad envelope, routed to musicGain.
function mVoice(freq, dur, type, vol, when, detune = 0, attack = 0.02) {
  if (!audio || audioMuted) return;
  const t = audio.currentTime + when;
  const osc = audio.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (detune) osc.detune.setValueAtTime(detune, t);
  const g = audio.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(vol * 0.55, t + dur * 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(musicGain);
  osc.start(t);
  osc.stop(t + dur + 0.03);
  osc.onended = () => { try { g.disconnect(); } catch (e) {} };
}

function mKick(when, vol) {
  if (!audio || audioMuted) return;
  const t = audio.currentTime + when;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  o.connect(g).connect(musicGain);
  o.start(t);
  o.stop(t + 0.22);
  o.onended = () => { try { g.disconnect(); } catch (e) {} };
}

function mNoiseHit(when, vol, dur, type, freq, q) {
  if (!audio || audioMuted) return;
  const t = audio.currentTime + when;
  const sr = audio.sampleRate;
  const buf = audio.createBuffer(1, Math.max(1, Math.floor(sr * dur)), sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = audio.createBufferSource();
  src.buffer = buf;
  const filt = audio.createBiquadFilter();
  filt.type = type;
  filt.frequency.value = freq;
  filt.Q.value = q;
  const g = audio.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt).connect(g).connect(musicGain);
  src.start(t);
  src.stop(t + dur + 0.02);
  src.onended = () => { try { g.disconnect(); } catch (e) {} };
}

function updateMusic() {
  if (!audio || audioMuted || audio.state !== "running") return;
  const now = audio.currentTime;
  if (nextMusicAt === 0 || now > nextMusicAt + 1) {
    nextMusicAt = now + 0.05;
  }

  const playing = state === "playing";
  const theme = MUSIC_THEMES[getLevel().theme.env] || MUSIC_THEMES.grass;
  // Vary key within a family so neighbouring levels don't sound identical.
  const transpose = [0, 3, -2, 5, -4][selectedLevelIndex % 5];
  const bpm = playing ? theme.bpm : Math.round(theme.bpm * 0.7);
  const sec16 = 60 / bpm / 4;               // one sixteenth note
  const barLen = sec16 * 16;
  const drumMix = playing ? theme.drums : 0;

  while (nextMusicAt < now + 0.25) {
    const when = nextMusicAt - now;
    const step = musicStep % 16;
    const bar = Math.floor(musicStep / 16);
    const chord = theme.prog[bar % theme.prog.length]; // scale degree of the bar's chord

    // Pad chord + sub bass at the top of each bar.
    if (step === 0) {
      const padVol = playing ? 0.05 : 0.045;
      for (const deg of [chord, chord + 2, chord + 4]) {
        mVoice(noteFreq(theme, deg, 0, transpose), barLen * 0.98, theme.pad, padVol, when, -6);
        mVoice(noteFreq(theme, deg, 0, transpose), barLen * 0.98, theme.pad, padVol, when, +6);
      }
      mVoice(noteFreq(theme, chord, -1, transpose), barLen, "sine", playing ? 0.12 : 0.08, when, 0, 0.01);
    }

    // Walking bass.
    if (step === 8 || step === 6) {
      const deg = step === 6 ? chord + 4 : chord;
      mVoice(noteFreq(theme, deg, 0, transpose), sec16 * 3, "sine", playing ? 0.1 : 0.06, when, 0, 0.01);
    }

    // Drums.
    if (drumMix > 0) {
      if (step % 4 === 0) mKick(when, 0.13 * drumMix + (step === 0 ? 0.04 : 0));
      if (drumMix >= 0.8 && (step === 4 || step === 12)) {
        mNoiseHit(when, 0.07 * drumMix, 0.18, "bandpass", 1800, 1.2); // snare body
        mVoice(190, 0.12, "triangle", 0.04 * drumMix, when);
      }
      if (drumMix >= 0.5 && step % 2 === 1) {
        mNoiseHit(when, 0.022 * drumMix, step === 15 ? 0.12 : 0.04, "highpass", 8000, 0.7); // hats
      }
    }

    // Lead melody / arpeggio (only while a run is in progress, or sparse arps in space).
    const leadStep = playing && (step === 2 || step === 6 || step === 10 || step === 12 || step === 14);
    const arpStep = theme.arp && step % 2 === 0;
    if (leadStep || (!playing && arpStep && Math.random() < 0.5)) {
      const motif = MELODY_PATTERN[(bar * 5 + step) % MELODY_PATTERN.length];
      const octave = step >= 12 ? 2 : 1;
      const vol = playing ? 0.05 : 0.03;
      mVoice(noteFreq(theme, chord + motif, octave, transpose), sec16 * (step >= 12 ? 2.5 : 1.6), theme.lead, vol, when, 0, 0.01);
    }

    musicStep += 1;
    nextMusicAt += sec16;
  }
}

function toggleAudio() {
  initAudio();
  audioMuted = !audioMuted;
  localStorage.setItem("gulp-muted-v2", audioMuted ? "1" : "0");
  if (audioMaster) {
    audioMaster.gain.setTargetAtTime(audioMuted ? 0 : MASTER_VOLUME, audio.currentTime, 0.025);
  }
  updateAudioButton();
  if (!audioMuted) {
    playStartSound();
    nextMusicAt = 0;
  }
}

function updateAudioButton() {
  audioToggleButton.textContent = audioMuted ? "Sound Off" : audio ? "Sound On" : "Tap Sound";
  audioToggleButton.setAttribute("aria-pressed", String(!audioMuted));
}

function absorbObject(target, absorber = player) {
  if (target.absorbing) return;
  target.absorbing = true;
  target.absorber = absorber;
  if (absorber === player) {
    score += target.mass;
    vibrate(target.radius);
  }
  absorber.targetRadius += target.radius * getLevel().growth;
  shake = Math.max(shake, target.radius * 0.08);
  playAbsorbSound(target, absorber);

  if (absorber === player) {
    // Streak: each absorb inside a short window climbs the combo and the chime.
    const t = performance.now() / 1000;
    comboCount = t < comboExpireAt ? comboCount + 1 : 1;
    comboExpireAt = t + 0.7;
    playComboChime(target.x, comboCount);
    // Swallowing something big lands an extra satisfying boom.
    if (target.radius >= 36) {
      shake = Math.max(shake, target.radius * 0.12);
      playBigEatBoom(target.x, target.radius);
    }
  }

  for (let i = 0; i < 12; i += 1) {
    particles.push({
      x: target.x,
      y: target.y,
      vx: random(-90, 90),
      vy: random(-90, 90),
      life: random(0.25, 0.55),
      maxLife: 0.55,
      color: target.color,
      size: random(2, 5),
      mesh: null,
    });
  }
}

function setPointer(event) {
  pointer.active = true;
  pointer.screenX = event.clientX;
  pointer.screenY = event.clientY;
  ndc.x = (event.clientX / width) * 2 - 1;
  ndc.y = -(event.clientY / height) * 2 + 1;
  raycaster.setFromCamera(ndc, threeCamera);
  if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
    pointer.worldX = hitPoint.x;
    pointer.worldY = hitPoint.z;
  }
}

function moveCircle(entity, tx, ty, dt, speedScale = 1) {
  const dx = tx - entity.x;
  const dy = ty - entity.y;
  const len = Math.max(1, Math.hypot(dx, dy));

  let speed = clamp(360 - entity.radius * 2.4, 110, 320) * speedScale * getLevel().speedBonus;

  // Powerup: Speed
  if (entity === player && player.powers.speed > 0) {
    speed *= 1.6;
  }

  const targetVx = (dx / len) * speed;
  const targetVy = (dy / len) * speed;

  // Slippery movement logic for Snow levels
  if (getLevel().theme.slippery) {
    const friction = 1.8; // Lower value = more slide
    entity.vx += (targetVx - entity.vx) * dt * friction;
    entity.vy += (targetVy - entity.vy) * dt * friction;
  } else {
    entity.vx = targetVx;
    entity.vy = targetVy;
  }

  entity.x = clamp(entity.x + entity.vx * dt, entity.radius, WORLD.width - entity.radius);
  entity.y = clamp(entity.y + entity.vy * dt, entity.radius, WORLD.height - entity.radius);
}

function update(dt) {
  if (state !== "playing") return;

  runTime -= dt;
  if (runTime <= 0) {
    runTime = 0;
    finishGame();
    return;
  }

  // Update Powerup Timers
  player.powers.speed = Math.max(0, player.powers.speed - dt);
  player.powers.magnet = Math.max(0, player.powers.magnet - dt);
  player.powers.size = Math.max(0, player.powers.size - dt);

  // Dynamic Powerup spawning: rare and late-game within a level
  if (selectedLevelIndex >= 3 && runTime < getLevel().seconds - 40) {
    powerupSpawnTimer += dt;
    if (powerupSpawnTimer > 25) {
      powerupSpawnTimer = 0;
      spawnPowerup(random(100, WORLD.width - 100), random(100, WORLD.height - 100));
    }
  }

  if (pointer.active) {
    moveCircle(player, pointer.worldX, pointer.worldY, dt);
  }

  player.radius += (player.targetRadius - player.radius) * Math.min(1, dt * 8);

  for (const bot of bots) {
    bot.radius += (bot.targetRadius - bot.radius) * Math.min(1, dt * 6);
    const target = findNearestEdible(bot);
    if (target) {
      moveCircle(bot, target.x, target.y, dt, 0.85); // Faster bots
    } else {
      // Improved wander: search for far-away food or move toward center
      bot.wander += dt * random(-1.2, 1.2);
      const wanderX = bot.x + Math.cos(bot.wander) * 400;
      const wanderY = bot.y + Math.sin(bot.wander) * 400;
      moveCircle(bot, wanderX, wanderY, dt, 0.65);

      // If stuck at edge, bounce back to center
      if (bot.x < 100 || bot.x > WORLD.width - 100 || bot.y < 100 || bot.y > WORLD.height - 100) {
        bot.wander = Math.atan2(WORLD.height/2 - bot.y, WORLD.width/2 - bot.x);
      }
    }
  }

  const fearRadius = 180;
  const edibleRatio = 0.88 - (selectedLevelIndex * 0.005); // Harder to eat in later levels

  for (const object of objects) {
    object.edible = object.radius < player.radius * (edibleRatio - 0.02);

    // People running away logic
    if (object.type === "person" && !object.absorbing) {
      let escapeX = 0;
      let escapeY = 0;
      let feared = false;

      // Fear the player
      const distPlayer = distance(player, object);
      if (distPlayer < fearRadius) {
        escapeX += (object.x - player.x) / distPlayer;
        escapeY += (object.y - player.y) / distPlayer;
        feared = true;
      }

      // Fear the bots
      for (const bot of bots) {
        const distBot = distance(bot, object);
        if (distBot < fearRadius * 0.7) {
          escapeX += (object.x - bot.x) / distBot;
          escapeY += (object.y - bot.y) / distBot;
          feared = true;
        }
      }

      if (feared) {
        object.feared = true;
        const speed = 110 * dt;
        object.x += escapeX * speed;
        object.y += escapeY * speed;
        // Keep in bounds
        object.x = clamp(object.x, 20, WORLD.width - 20);
        object.y = clamp(object.y, 20, WORLD.height - 20);
        // Scared jitter
        object.mesh.rotation.z = Math.sin(performance.now() * 0.02) * 0.2;
      } else {
        object.feared = false;
        object.mesh.rotation.z = 0;
      }
    }

    // Powerup: Magnet
    const absorbDist = player.powers.magnet > 0 ? player.radius * 2.4 : player.radius * 0.92;

    if (!object.absorbing && distance(player, object) < absorbDist && object.radius < player.radius * edibleRatio) {
      absorbObject(object, player);
    }

    for (const bot of bots) {
      if (!object.absorbing && distance(bot, object) < bot.radius * 0.85 && object.radius < bot.radius * 0.82) {
        absorbObject(object, bot);
      }
    }

    // Universal suction: objects get pulled toward center more aggressively
    if (object.absorbing) {
      object.absorbT += dt * 6;
      const pullForce = Math.min(1, dt * 15);
      object.x += (object.absorber.x - object.x) * pullForce;
      object.y += (object.absorber.y - object.y) * pullForce;
      // Shrink faster when close to center
      const shrinkSpeed = 1 - Math.min(0.95, dt * 7.5);
      object.radius *= shrinkSpeed;
    }
  }

  // Collection and Expiry logic for Powerups
  for (const pu of powerups) {
    pu.life -= dt;
    if (pu.life <= 0) {
      pu.expired = true;
      dynamicGroup.remove(pu.mesh);
    } else if (distance(player, pu) < player.radius + 15) {
      collectPowerup(pu);
    }
  }
  powerups = powerups.filter(pu => !pu.collected && !pu.expired);

  objects = objects.filter((object) => {
    if (object.radius > 1.5) return true;
    if (object.mesh) dynamicGroup.remove(object.mesh);
    return false;
  });
  updateNoFoodState(dt);

  for (const particle of particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.9;
    particle.vy *= 0.9;
    particle.life -= dt;
  }
  particles = particles.filter((particle) => {
    if (particle.life > 0) return true;
    if (particle.mesh) {
      dynamicGroup.remove(particle.mesh);
      particle.mesh.material.dispose();
    }
    return false;
  });

  shake = Math.max(0, shake - dt * 8);
  camera.x += (player.x - camera.x) * Math.min(1, dt * 5);
  camera.y += (player.y - camera.y) * Math.min(1, dt * 5);
  camera.zoom += (clamp(1.22 - player.radius / 220, 0.48, 1.05) - camera.zoom) * Math.min(1, dt * 4);
  updateBlackholeAmbient();
  updateHud();
}

function collectPowerup(pu) {
  if (pu.collected) return;
  pu.collected = true;
  dynamicGroup.remove(pu.mesh);

  // Play collect sound
  sweepTone(400, 800, 0.2, "sine", 0.15);
  tone(600, 0.3, "sine", 0.1, sfxGain, 0.05);

  if (pu.type === "SPEED") {
    player.powers.speed = 8; // 8 seconds
  } else if (pu.type === "MAGNET") {
    player.powers.magnet = 10; // 10 seconds
  } else if (pu.type === "GROWTH") {
    player.targetRadius += 25; // Instant boost
    score += 500;
  }

  // Reward particles
  for (let i = 0; i < 20; i++) {
    particles.push({
      x: pu.x, y: pu.y,
      vx: random(-150, 150), vy: random(-150, 150),
      life: 0.6, maxLife: 0.6,
      color: pu.color, size: 4
    });
  }
}

function findNearestEdible(entity) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const object of objects) {
    if (object.absorbing || object.radius >= entity.radius * 0.82) continue;
    const d = distance(entity, object);
    if (d < nearestDistance) {
      nearest = object;
      nearestDistance = d;
    }
  }
  return nearest;
}

function updateNoFoodState(dt) {
  const canEventuallyEat = objects.some((object) => !object.absorbing && object.radius < player.targetRadius * 0.86);
  const hasAbsorbingObjects = objects.some((object) => object.absorbing);
  if (canEventuallyEat || hasAbsorbingObjects) {
    noFoodTimer = 0;
    return;
  }

  noFoodTimer += dt;
  if (noFoodTimer > 1) {
    finishGame("empty");
  }
}

function updateHud() {
  levelNameEl.textContent = getLevel().name;
  scoreEl.textContent = String(score);
  sizeEl.textContent = `${(player.radius / getLevel().startRadius).toFixed(1)}x`;
  sizeFillEl.style.width = `${clamp((player.radius / 170) * 100, 10, 100)}%`;
  const seconds = Math.ceil(runTime);
  timeEl.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Rendering: sync game state onto the 3D scene, then draw            */
/* ------------------------------------------------------------------ */

function syncObjectMesh(object) {
  const mesh = object.mesh;
  if (!mesh) return;
  mesh.position.x = object.x;
  mesh.position.z = object.y;
  if (object.absorbing) {
    const t = clamp(object.radius / object.baseRadius, 0.001, 1);
    mesh.scale.setScalar(t);
    mesh.position.y = -(1 - t) * object.baseRadius * 0.9;
    mesh.rotation.y = object.absorbT * object.spin * 0.5;
    if (object.ring) object.ring.visible = false;
  } else if (object.ring) {
    object.ring.visible = object.edible;
  }
}

function syncHoleMesh(entity, mesh) {
  if (!mesh) return;
  mesh.position.set(entity.x, 0, entity.y);
  mesh.scale.setScalar(entity.radius);

  // Powerup visual feedback for player
  if (entity === player && mesh.children[1]) {
    const glow = mesh.children[1];
    if (player.powers.speed > 0) {
      glow.material.color.set("#ffeb3b");
    } else if (player.powers.magnet > 0) {
      glow.material.color.set("#00bcd4");
    } else {
      glow.material.color.set("#6be0c2"); // Default
    }
  }
}

function syncParticle(particle) {
  if (!particle.mesh) {
    particle.mesh = new THREE.Mesh(
      particleGeo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(particle.color), transparent: true })
    );
    dynamicGroup.add(particle.mesh);
  }
  const fade = clamp(particle.life / particle.maxLife, 0, 1);
  particle.mesh.position.set(particle.x, 14 + (1 - fade) * 20, particle.y);
  particle.mesh.scale.setScalar(particle.size * (0.4 + fade));
  particle.mesh.material.opacity = fade;
}

function positionCamera() {
  // Lower zoom => pull the camera further back and higher.
  const dist = clamp(760 / camera.zoom, 600, 2100);
  const elevation = 1.02; // radians above the horizon
  const shakeX = random(-shake, shake);
  const shakeZ = random(-shake, shake);
  threeCamera.position.set(
    camera.x + shakeX,
    Math.sin(elevation) * dist,
    camera.y + Math.cos(elevation) * dist + shakeZ
  );
  threeCamera.lookAt(camera.x, 0, camera.y);
}

function updateSun() {
  // Keep the sun (and its shadow frustum) centred on the action so the
  // shadow map covers the visible area at full resolution.
  sun.position.set(camera.x + 680, 1650, camera.y + 520);
  sun.target.position.set(camera.x, 0, camera.y);
  sun.target.updateMatrixWorld();
}

function draw() {
  for (const object of objects) syncObjectMesh(object);
  for (const bot of bots) syncHoleMesh(bot, bot.holeMesh);
  syncHoleMesh(player, player.holeMesh);
  for (const particle of particles) syncParticle(particle);

  // Powerup animation and fading
  for (const pu of powerups) {
    if (!pu.collected && !pu.expired) {
      pu.mesh.rotation.y += 0.05;
      pu.mesh.position.y = 8 + Math.sin(performance.now() * 0.005) * 4;
      // Visual fade when near expiry (last 3 seconds)
      if (pu.life < 3) {
        pu.mesh.children[0].material.opacity = pu.life / 3;
        pu.mesh.children[1].material.opacity = (pu.life / 3) * 0.6;
        pu.mesh.children[0].material.transparent = true;
        if (pu.mesh.children[2]) pu.mesh.children[2].material.opacity = pu.life / 3;
      }
    }
  }

  positionCamera();
  updateSun();
  renderer.render(scene, threeCamera);
}

function shadeHex(hex, amount) {
  const value = hex.replace("#", "");
  const number = Number.parseInt(value, 16);
  const r = clamp((number >> 16) + amount, 0, 255);
  const g = clamp(((number >> 8) & 255) + amount, 0, 255);
  const b = clamp((number & 255) + amount, 0, 255);
  return `rgb(${r}, ${g}, ${b})`;
}

/* ------------------------------------------------------------------ */
/* Procedural textures (generated once, no external assets)            */
/* ------------------------------------------------------------------ */

function makeSkyTexture() {
  return makeSkyTextureFrom(["#6ea6dc", "#a8cbe6", "#d7e7f0"]);
}

function makeSkyTextureFrom(colors) {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 256;
  const c = canvas.getContext("2d");
  const grad = c.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, colors[0]);
  grad.addColorStop(0.55, colors[1] || colors[0]);
  grad.addColorStop(1, colors[2] || colors[1] || colors[0]);
  c.fillStyle = grad;
  c.fillRect(0, 0, 8, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

// Generic mottled ground (white so it can be tinted by the material colour).
function makeNoiseGroundTexture(base, alpha, count) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const c = canvas.getContext("2d");
  c.fillStyle = base;
  c.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i += 1) {
    const shade = 200 + Math.floor(Math.random() * 55);
    c.fillStyle = `rgba(${shade},${shade},${shade},${alpha})`;
    const s = 2 + Math.random() * 5;
    c.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(WORLD.width / 240, WORLD.height / 240);
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

function makeWaterTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const c = canvas.getContext("2d");
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, size, size);
  // Ripple bands.
  for (let i = 0; i < 60; i += 1) {
    c.strokeStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.4})`;
    c.lineWidth = 1 + Math.random() * 2;
    c.beginPath();
    const y = Math.random() * size;
    c.moveTo(0, y);
    for (let x = 0; x <= size; x += 16) c.lineTo(x, y + Math.sin(x * 0.15 + i) * 4);
    c.stroke();
  }
  for (let i = 0; i < 40; i += 1) {
    c.fillStyle = "rgba(220,240,255,0.5)";
    c.fillRect(Math.random() * size, Math.random() * size, 6, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(WORLD.width / 320, WORLD.height / 320);
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

function makeLavaTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const c = canvas.getContext("2d");
  c.fillStyle = "#2a0e08";
  c.fillRect(0, 0, size, size);
  // Cracked magma veins.
  for (let i = 0; i < 28; i += 1) {
    c.strokeStyle = Math.random() < 0.5 ? "#ff5a1a" : "#ffae2a";
    c.lineWidth = 1 + Math.random() * 3;
    c.beginPath();
    let x = Math.random() * size;
    let y = Math.random() * size;
    c.moveTo(x, y);
    for (let s = 0; s < 6; s += 1) {
      x += (Math.random() - 0.5) * 60;
      y += (Math.random() - 0.5) * 60;
      c.lineTo(x, y);
    }
    c.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(WORLD.width / 300, WORLD.height / 300);
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

function makeSpaceTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const c = canvas.getContext("2d");
  c.fillStyle = "#101018";
  c.fillRect(0, 0, size, size);
  // Panel grid for a station-floor feel.
  c.strokeStyle = "rgba(120,140,200,0.25)";
  c.lineWidth = 1;
  for (let g = 0; g <= size; g += 32) {
    c.beginPath(); c.moveTo(g, 0); c.lineTo(g, size); c.stroke();
    c.beginPath(); c.moveTo(0, g); c.lineTo(size, g); c.stroke();
  }
  for (let i = 0; i < 120; i += 1) {
    const b = 150 + Math.floor(Math.random() * 105);
    c.fillStyle = `rgba(${b},${b},255,${Math.random()})`;
    c.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random(), 1 + Math.random());
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(WORLD.width / 260, WORLD.height / 260);
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

function makeGroundTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const c = canvas.getContext("2d");
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, size, size);
  // Subtle mottling so the lawn isn't a flat colour under the light.
  for (let i = 0; i < 2600; i += 1) {
    const shade = 200 + Math.floor(Math.random() * 55);
    c.fillStyle = `rgba(${shade},${shade},${shade},0.5)`;
    const s = 2 + Math.random() * 5;
    c.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(WORLD.width / 240, WORLD.height / 240);
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

function makeWindowTexture(hex) {
  const w = 128;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext("2d");
  c.fillStyle = hex;
  c.fillRect(0, 0, w, h);

  // Subtle concrete texture/noise
  for (let i = 0; i < 400; i++) {
    c.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
    c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }

  // Vertical pilasters
  c.fillStyle = shadeHex(hex, -20);
  for (let x = 4; x < w; x += 32) c.fillRect(x, 0, 4, h);

  // Window grid
  const cols = [12, 44, 76, 108];
  for (let y = 16; y < h - 16; y += 24) {
    for (const x of cols) {
      const lit = Math.random() < 0.18;
      if (lit) {
        c.fillStyle = "rgba(255,235,180,0.95)";
        c.shadowBlur = 4;
        c.shadowColor = "rgba(255,200,100,0.5)";
      } else {
        c.fillStyle = shadeHex(hex, -55);
        c.shadowBlur = 0;
      }
      c.fillRect(x, y, 16, 14);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 2);
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

function makeLeafTexture(hex) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const c = canvas.getContext("2d");
  c.fillStyle = hex;
  c.fillRect(0, 0, size, size);

  // Leaf clusters
  for (let i = 0; i < 600; i++) {
    const shade = Math.random() < 0.5 ? -15 : 15;
    c.fillStyle = shadeHex(hex, shade + (Math.random() * 10 - 5));
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 2 + Math.random() * 6;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

function makeBarkTexture() {
  const w = 64;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext("2d");
  const base = "#5d432c";
  c.fillStyle = base;
  c.fillRect(0, 0, w, h);

  // Vertical grain
  for (let i = 0; i < 400; i++) {
    c.fillStyle = shadeHex(base, Math.random() * 20 - 15);
    c.fillRect(Math.random() * w, 0, 1 + Math.random() * 2, h);
  }

  // Knots
  for (let i = 0; i < 5; i++) {
    c.fillStyle = shadeHex(base, -25);
    c.beginPath();
    c.ellipse(Math.random() * w, Math.random() * h, 3, 6, Math.random(), 0, Math.PI * 2);
    c.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

function makeCarTexture(hex) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const c = canvas.getContext("2d");
  c.fillStyle = hex;
  c.fillRect(0, 0, size, size);

  // Side windows
  c.fillStyle = "rgba(20, 30, 40, 0.85)";
  c.fillRect(10, 20, 108, 40);

  // Trim/Lines
  c.strokeStyle = shadeHex(hex, -20);
  c.lineWidth = 2;
  c.strokeRect(5, 5, 118, 118);

  // Lights (assuming mapping covers front/back)
  // Front lights
  c.fillStyle = "#fffbed";
  c.fillRect(15, 100, 25, 15);
  c.fillRect(88, 100, 25, 15);

  // Back lights
  c.fillStyle = "#ff3322";
  c.fillRect(15, 10, 25, 12);
  c.fillRect(88, 10, 25, 12);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

function frame(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  updateMusic();
  draw();
  requestAnimationFrame(frame);
}

window.addEventListener("resize", () => {
  resize();
  drawMapPath();
});
canvas.addEventListener("pointerdown", (event) => {
  initAudio();
  canvas.setPointerCapture(event.pointerId);
  setPointer(event);
});
canvas.addEventListener("pointermove", (event) => {
  if (pointer.active) setPointer(event);
});
canvas.addEventListener("pointerup", () => {
  pointer.active = false;
});
canvas.addEventListener("pointercancel", () => {
  pointer.active = false;
});
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
document.addEventListener("pointerdown", () => initAudio(), { once: true });
startButton.addEventListener("click", () => {
  playButtonSound();
  Ads.showInterstitial(() => startGame());
});
restartButton.addEventListener("click", () => {
  playButtonSound();
  Ads.maybeInterstitial(() => startGame());
});
nextLevelButton.addEventListener("click", () => {
  playButtonSound();
  selectedLevelIndex = getNextUnlockedLevelIndex() ?? selectedLevelIndex;
  persistProgress();
  renderLevelSelect();
  Ads.maybeInterstitial(() => startGame());
});
audioToggleButton.addEventListener("click", toggleAudio);
backButton.addEventListener("click", () => {
  playButtonSound();
  returnToMenu();
});
doubleScoreButton.addEventListener("click", watchAdForDoubleScore);
extraTimeButton.addEventListener("click", watchAdForTime);

// The web assets are bundled inside the app, so a service worker provides no
// benefit and only causes stale code to be served after an update. Proactively
// remove any previously-registered worker and its caches.
if ("serviceWorker" in navigator && navigator.serviceWorker.getRegistrations) {
  navigator.serviceWorker.getRegistrations()
    .then((regs) => regs.forEach((r) => r.unregister()))
    .catch(() => {});
}
if (window.caches && caches.keys) {
  caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
}

resize();
updateAudioButton();
renderLevelSelect();
resetGame();
Ads.showBanner(); // we start on the menu
requestAnimationFrame(frame);

// App-open ad: when the player returns to the app on the menu/game-over screen.
let backgroundedAt = 0;
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    backgroundedAt = Date.now();
  } else if (document.visibilityState === "visible" && Date.now() - backgroundedAt > 30000) {
    Ads.maybeAppOpen();
  }
});

// ---- Loading splash: fill the bar, show a tip, then reveal the menu. ----
(function runSplash() {
  const splash = document.getElementById("splash");
  if (!splash) return;

  const fill = document.getElementById("splashFill");
  const pctEl = document.getElementById("splashPct");
  const tipEl = document.getElementById("splashTip");
  const TIPS = [
    "Use power-ups to grow faster and dominate the city!",
    "Only swallow things smaller than your hole.",
    "Chain quick gulps for big combo bonuses.",
    "The 🧲 magnet pulls nearby objects into the void.",
    "Eat people and cars first, then whole buildings.",
    "Earn 3 stars to truly master a world.",
    "Beat the rival holes to the biggest score.",
  ];
  if (tipEl) {
    const tip = TIPS[Math.floor(Math.random() * TIPS.length)].replace("power-ups", "<span>power-ups</span>");
    tipEl.innerHTML = `<b>TIP:</b> ${tip}`;
  }
  const start = performance.now();
  const DURATION = 800;
  const tick = () => {
    const t = Math.min(1, (performance.now() - start) / DURATION);
    const pct = Math.round((1 - Math.pow(1 - t, 2)) * 100); // ease-out
    if (fill) fill.style.width = `${pct}%`;
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      splash.classList.add("fade-out");
      setTimeout(() => splash.classList.add("hidden"), 550);
    }
  };
  requestAnimationFrame(tick);
})();

function getLevel() {
  return LEVELS[selectedLevelIndex] || LEVELS[0];
}

function weightedType(weights) {
  const roll = Math.random();
  let cursor = 0;
  for (const [type, weight] of Object.entries(weights)) {
    cursor += weight;
    if (roll <= cursor) return type;
  }
  return "person";
}

function pickColor(type) {
  const palette = palettes[type] || palettes.person;
  return palette[Math.floor(random(0, palette.length))];
}

function makeRadius(type, level) {
  switch (type) {
    case "person": return random(7, 13);
    case "hydrant": return random(9, 13);
    case "mushroom": return random(11, 18);
    case "rock": return random(10, 20);
    case "snowman": return random(13, 21);
    case "tree": return random(13, 23);
    case "cactus": return random(15, 26);
    case "crate": return random(13, 22);
    case "car": return random(21, 36);
    case "boat": return random(30, 48);
    case "tank": return random(30, 46);
    case "bus": return random(36, 52);
    case "rocket": return random(34, 60);
    case "building": return random(level.id === "suburbs" ? 30 : 35, level.id === "park" ? 58 : 76);
    default: return random(14, 26);
  }
}

function starGlyphs(count) {
  return `${"★".repeat(count)}${"☆".repeat(3 - count)}`;
}

// Mini themed props that sit on top of each island.
function islandProps(env) {
  const tree = (x, y, r) => `<g transform="translate(${x},${y})"><rect x="-2" y="-3" width="4" height="11" fill="#5a3e22"/><circle cx="0" cy="-7" r="${r}" fill="#4f8e57"/><circle cx="${-r * 0.6}" cy="-3" r="${r * 0.7}" fill="#5aa05f"/><circle cx="${r * 0.6}" cy="-3" r="${r * 0.7}" fill="#5aa05f"/></g>`;
  const bldg = (x, w, h, c) => `<rect x="${x}" y="${52 - h}" width="${w}" height="${h}" fill="${c}"/><rect x="${x + 2}" y="${54 - h}" width="2" height="2" fill="#ffe7a8"/><rect x="${x + w - 4}" y="${57 - h}" width="2" height="2" fill="#ffe7a8"/>`;
  const mush = (x, y) => `<g transform="translate(${x},${y})"><rect x="-2" y="-2" width="4" height="9" fill="#efe7d2"/><ellipse cx="0" cy="-3" rx="9" ry="6" fill="#d2483c"/><circle cx="-3" cy="-4" r="1.6" fill="#fff"/><circle cx="3" cy="-2" r="1.4" fill="#fff"/></g>`;
  switch (env) {
    case "grass": return tree(46, 42, 8) + tree(72, 36, 7) + tree(58, 54, 6);
    case "sand": return `<g transform="translate(58,30)"><rect x="-4" y="0" width="8" height="22" rx="4" fill="#4f8e57"/><rect x="-12" y="7" width="6" height="11" rx="3" fill="#4f8e57"/><rect x="6" y="4" width="6" height="13" rx="3" fill="#4f8e57"/></g><circle cx="40" cy="52" r="5" fill="#b89a5e"/>`;
    case "snow": return `<circle cx="44" cy="50" r="10" fill="#eef5fc"/><circle cx="74" cy="52" r="8" fill="#eef5fc"/><polygon points="60,16 49,46 71,46" fill="#3f7750"/><polygon points="60,16 52,40 68,40" fill="#eef5fc" opacity="0.55"/>`;
    case "water": return `<g transform="translate(60,46)"><path d="M-16,0 L16,0 L11,9 L-11,9 Z" fill="#e9e5d1"/><rect x="-1" y="-15" width="2" height="15" fill="#cfcabb"/><polygon points="1,-14 14,-4 1,-4" fill="#df6d58"/></g><path d="M30,54 q8,-4 16,0" stroke="#bfe6f5" stroke-width="1.5" fill="none" opacity="0.7"/>`;
    case "rock": return bldg(38, 14, 34, "#9aa0aa") + bldg(56, 16, 46, "#8a8f98") + bldg(76, 12, 26, "#aab0b8");
    case "toxic": return `<circle cx="60" cy="44" r="22" fill="#aef03a" opacity="0.16"/>` + mush(50, 50) + mush(70, 44);
    case "lava": return `<circle cx="60" cy="22" r="15" fill="#ff6a1a" opacity="0.28"/><polygon points="60,14 40,52 80,52" fill="#3a2a26"/><ellipse cx="60" cy="16" rx="9" ry="4" fill="#ff8a2a"/><path d="M60,18 L56,42 M62,18 L67,46" stroke="#ff6a1a" stroke-width="2"/>`;
    case "space": return `<circle cx="36" cy="30" r="1.6" fill="#bdf6ff"/><circle cx="84" cy="26" r="1.4" fill="#bdf6ff"/><circle cx="78" cy="50" r="1.4" fill="#bdf6ff"/><g transform="translate(60,30)"><rect x="-5" y="0" width="10" height="20" rx="5" fill="#e9e5d1"/><polygon points="-5,0 5,0 0,-12" fill="#d23a2c"/><polygon points="-5,18 -11,27 -5,22" fill="#d23a2c"/><polygon points="5,18 11,27 5,22" fill="#d23a2c"/><circle cx="0" cy="6" r="2.6" fill="#5fd0e0"/></g>`;
    default: return tree(60, 44, 8);
  }
}

// A floating isometric hex island for a level node (inline SVG, fully themed).
// `uid` keeps gradient ids unique across the ~20 inline SVGs in the document.
function hexIsland(env, uid) {
  const [top, side] = TILE_COLORS[env] || TILE_COLORS.grass;
  const face = "112,50 86,5 34,5 8,50 34,95 86,95";
  const sideShape = "8,50 34,95 86,95 112,50 112,68 86,113 34,113 8,68";
  const g = `g${uid}`;
  return `<svg viewBox="0 0 120 140" class="island-svg" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <radialGradient id="${g}t" cx="50%" cy="36%" r="72%">
        <stop offset="0%" stop-color="${shadeHex(top, 42)}"/>
        <stop offset="62%" stop-color="${top}"/>
        <stop offset="100%" stop-color="${shadeHex(top, -16)}"/>
      </radialGradient>
      <linearGradient id="${g}s" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${side}"/>
        <stop offset="100%" stop-color="${shadeHex(side, -26)}"/>
      </linearGradient>
    </defs>
    <ellipse cx="60" cy="126" rx="54" ry="13" fill="#5fe0ff" opacity="0.16"/>
    <polygon points="${sideShape}" fill="url(#${g}s)"/>
    <polygon points="${face}" fill="url(#${g}t)"/>
    <ellipse cx="58" cy="26" rx="34" ry="13" fill="#ffffff" opacity="0.13"/>
    ${islandProps(env)}
    <polygon points="${face}" fill="none" stroke="#bdf6ff" stroke-width="3" opacity="0.95"/>
    <polygon points="${face}" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.45"/>
  </svg>`;
}

function renderLevelSelect() {
  levelSelectEl.innerHTML = "";
  totalScoreEl.textContent = totalScore.toLocaleString();
  const selectedLocked = !isLevelUnlocked(getLevel());
  startButton.disabled = selectedLocked;
  const startLabel = startButton.querySelector(".start-label");
  if (startLabel) startLabel.textContent = selectedLocked ? "Locked" : "Start Level";

  // Reverse levels to show current/next at the bottom (scrolled to)
  const mapLevels = [...LEVELS];

  mapLevels.forEach((level, index) => {
    const node = document.createElement("button");
    const locked = !isLevelUnlocked(level);
    const theme = level.theme || {};
    const env = ENVIRONMENTS[theme.env] || ENVIRONMENTS.grass;

    node.type = "button";
    node.className = `level-node${locked ? " locked" : ""}`;
    node.setAttribute("aria-pressed", String(index === selectedLevelIndex));
    node.style.setProperty("--accent", (TILE_COLORS[theme.env] || TILE_COLORS.grass)[0]);

    const earned = levelStars[level.id] || 0;
    const stars = `<span class="s-on">${"★".repeat(earned)}</span><span class="s-off">${"☆".repeat(3 - earned)}</span>`;

    node.innerHTML = `
      ${hexIsland(theme.env, index)}
      <span class="node-num">${index + 1}</span>
      <div class="stars-mini">${stars}</div>
      <div class="player-indicator"></div>
      <div class="node-label">
        <strong>${level.name}</strong>
        <span>Goal: ${level.targets[0].toLocaleString()}</span>
      </div>
    `;

    node.addEventListener("click", () => {
      playButtonSound();
      selectedLevelIndex = index;
      persistProgress();
      applyLevelTheme();
      if (!locked) {
        resetGame();
      }
      renderLevelSelect();
    });
    levelSelectEl.appendChild(node);

    // Auto scroll to selected
    if (index === selectedLevelIndex) {
      setTimeout(() => {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        drawMapPath(); // Re-draw after layout shifts
      }, 100);
    }
  });

  // Ensure path is drawn after nodes are added
  setTimeout(drawMapPath, 50);
}

function drawMapPath() {
  const svg = document.getElementById("mapPathSvg");
  if (!svg) return;

  svg.innerHTML = "";
  const nodes = document.querySelectorAll(".level-node");
  if (nodes.length < 2) return;

  // Set SVG height to match scrollable content
  svg.setAttribute("height", levelSelectEl.scrollHeight);
  svg.style.height = `${levelSelectEl.scrollHeight}px`;

  nodes.forEach((node, i) => {
    if (i === 0) return;

    const prevNode = nodes[i - 1];
    const level = LEVELS[i];
    const unlocked = isLevelUnlocked(level);

    // Use offsetTop/Left for stable coordinates inside the scroll container
    const x1 = prevNode.offsetLeft + prevNode.offsetWidth / 2;
    const y1 = prevNode.offsetTop + prevNode.offsetHeight / 2;
    const x2 = node.offsetLeft + node.offsetWidth / 2;
    const y2 = node.offsetTop + node.offsetHeight / 2;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

    // Control point for a nice curve
    const cpY = (y1 + y2) / 2;
    const d = `M ${x1} ${y1} C ${x1} ${cpY}, ${x2} ${cpY}, ${x2} ${y2}`;

    path.setAttribute("d", d);
    path.setAttribute("stroke", unlocked ? "#6be0c2" : "rgba(107, 224, 194, 0.18)");
    path.setAttribute("stroke-width", "7");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-dasharray", unlocked ? "2, 16" : "8, 14");

    svg.appendChild(path);
  });
}

function applyLevelTheme() {
  const level = getLevel();
  const theme = level.theme || {};
  activeTheme = { ...palettes, ...theme };
  const env = ENVIRONMENTS[theme.env] || ENVIRONMENTS.grass;

  // Ground look.
  grassMat.color.set(env.groundColor || activeTheme.grass);
  grassMat.map = groundTextureFor(env.ground);
  grassMat.emissive.set(env.emissive || 0x000000);
  grassMat.emissiveIntensity = env.emissive ? 0.45 : 0;
  grassMat.needsUpdate = true;
  roadMat.color.set(activeTheme.road);
  stripeMat.color.set(activeTheme.roadStripe);

  // Sky, fog and clear colour.
  if (scene.background && scene.background.dispose) scene.background.dispose();
  scene.background = makeSkyTextureFrom(theme.sky || ["#6ea6dc", "#a8cbe6", "#d7e7f0"]);
  scene.fog.color.set(env.fog);
  renderer.setClearColor(new THREE.Color(env.fog), 1);

  // Lighting mood.
  sun.color.set(env.sun);
  sun.intensity = env.sunI;
  hemiLight.color.set(env.hemiSky);
  hemiLight.groundColor.set(env.hemiGround);
  hemiLight.intensity = env.hemiI;

  buildWorld();
}

function calculateStars(value, targets) {
  if (value >= targets[2]) return 3;
  if (value >= targets[1]) return 2;
  if (value >= targets[0]) return 1;
  return 0;
}

function starText(count) {
  return `${"*".repeat(count)}${"-".repeat(3 - count)}`;
}

function persistProgress() {
  localStorage.setItem("gulp-selected-level", String(selectedLevelIndex));
  localStorage.setItem("gulp-level-stars", JSON.stringify(levelStars));
  localStorage.setItem("gulp-best-scores", JSON.stringify(bestScores));
  localStorage.setItem("gulp-total-score", String(totalScore));
}

// TEST MODE: every level is open so all environments can be played freely.
// Restore `return totalScore >= level.unlockScore;` to re-enable score gating.
function isLevelUnlocked(level) {
  const index = LEVELS.indexOf(level);
  if (index <= 0) return true;
  // Unlock if previous level has at least 1 star
  const prevLevel = LEVELS[index - 1];
  return (levelStars[prevLevel.id] || 0) > 0;
}

function getNextUnlockedLevelIndex() {
  for (let index = selectedLevelIndex + 1; index < LEVELS.length; index += 1) {
    if (isLevelUnlocked(LEVELS[index])) return index;
  }
  return null;
}

function requestMobileFullscreen() {
  const root = document.documentElement;
  const canFullscreen = root.requestFullscreen && !document.fullscreenElement;
  if (canFullscreen && matchMedia("(pointer: coarse)").matches) {
    root.requestFullscreen().catch(() => {});
  }
}

function vibrate(radius) {
  if (!navigator.vibrate || !matchMedia("(pointer: coarse)").matches) return;
  navigator.vibrate(radius > 35 ? [12, 18, 18] : 8);
}
