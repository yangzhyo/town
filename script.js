(() => {
"use strict";

/* ===================================================================
 * 像素小镇 · AI 镇民日常 —— 星露谷风格模拟引擎
 * 分区：常量与工具 / 地图 / 精灵生成 / 模拟 / 渲染 / UI / 主循环
 * =================================================================== */

const TILE = 16;
const MAP_W = 40;
const MAP_H = 28;
const VIEW_W = MAP_W * TILE; // 640
const VIEW_H = MAP_H * TILE; // 448

const canvas = document.getElementById("townCanvas");
canvas.width = VIEW_W;
canvas.height = VIEW_H;
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const lightCanvas = document.createElement("canvas");
lightCanvas.width = VIEW_W;
lightCanvas.height = VIEW_H;
const lctx = lightCanvas.getContext("2d");

/* ---------- 工具 ---------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// 确定性伪随机：同一格子每帧细节一致
function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function px(g, x, y, w, h, color) {
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), w, h);
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  return [c, g];
}

/* ---------- 时间 / 季节 / 天气 ---------- */
const MIN_PER_DAY = 1440;
const DAYS_PER_SEASON = 6;
const GAME_MIN_PER_SEC = 10; // 1 倍速下一天约 2.4 分钟

const SEASONS = [
  {
    name: "春", icon: "🌸",
    grass: ["#63b54b", "#58a843", "#6ec055"],
    grassDark: "#4d9a39",
    soil: "#9b6a3f", soilWet: "#74502d",
    water: "#3f7fc1", waterDeep: "#2c5e9c",
    canopy: ["#2f7d39", "#46a046", "#6dbd58"],
    blossom: "#ffc9e2",
    flowers: ["#ff9ecf", "#fff3a6", "#cfe9ff"],
    crop: { name: "防风草", stem: "#5fae46", fruit: "#f2e9c9", top: "#ffd96b" },
    path: "#cfa15f", pathDark: "#b3854a",
  },
  {
    name: "夏", icon: "☀️",
    grass: ["#4ea73e", "#459a37", "#58b449"],
    grassDark: "#3c8a2f",
    soil: "#96653a", soilWet: "#6f4b29",
    water: "#3787c9", waterDeep: "#2563a4",
    canopy: ["#28702e", "#3a9440", "#57b052"],
    blossom: null,
    flowers: ["#ff7b6b", "#ffd84d", "#ff9ecf"],
    crop: { name: "番茄", stem: "#3f8f3a", fruit: "#e6453a", top: "#ff7457" },
    path: "#c99c5c", pathDark: "#ab8047",
  },
  {
    name: "秋", icon: "🍁",
    grass: ["#b3973f", "#a68a37", "#bfa44d"],
    grassDark: "#947930",
    water: "#3e74ad", waterDeep: "#2b5689",
    soil: "#8d5e36", soilWet: "#684626",
    canopy: ["#a4542a", "#c97a31", "#e09a3f"],
    blossom: null,
    flowers: ["#d96fb0", "#e8c25f", "#e07b46"],
    crop: { name: "南瓜", stem: "#6b8f33", fruit: "#e07b28", top: "#f29a3c" },
    path: "#c1924f", pathDark: "#a2783e",
  },
  {
    name: "冬", icon: "❄️",
    grass: ["#e9f1f6", "#dfe9f1", "#f4f9fc"],
    grassDark: "#cdddea",
    water: "#4a6f9e", waterDeep: "#36567f",
    soil: "#b9c2cd", soilWet: "#a3afbd",
    canopy: null, // 冬季为枯枝
    blossom: null,
    flowers: null,
    crop: null,
    path: "#d8e0e8", pathDark: "#b6bfc9",
  },
];

const WEATHERS = {
  sunny: { name: "晴朗", icon: "☀️" },
  cloudy: { name: "多云", icon: "☁️" },
  rain: { name: "降雨", icon: "🌧️" },
  snow: { name: "落雪", icon: "❄️" },
};

const state = {
  day: 1,
  seasonIdx: 0,
  minutes: 6 * 60,
  speed: 1,
  weather: "sunny",
  focus: 0,
  hover: -1,
  elapsed: 0, // 动画总时长（秒）
};

function seasonNow() { return SEASONS[state.seasonIdx]; }
function isWet() { return state.weather === "rain"; }

/* ===================================================================
 * 地图
 * =================================================================== */
const T_GRASS = "grass", T_WATER = "water", T_PATH = "path",
      T_PLAZA = "plaza", T_BRIDGE = "bridge", T_SOIL = "soil";

const terrain = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(T_GRASS));
const blocked = new Set();
const reserved = new Set(); // 禁止散布树木的格子

function key(x, y) { return x + "," + y; }
function inMap(x, y) { return x >= 0 && x < MAP_W && y >= 0 && y < MAP_H; }
function setT(x, y, t) { if (inMap(x, y)) terrain[y][x] = t; }
function block(x, y) { blocked.add(key(x, y)); }
function reserve(x, y, r = 0) {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) reserved.add(key(x + dx, y + dy));
}

function buildTerrain() {
  // 河流（纵向）与湖泊（西南）
  for (let y = 0; y < MAP_H; y++) for (let x = 7; x <= 9; x++) setT(x, y, T_WATER);
  for (let y = 23; y < MAP_H; y++) for (let x = 0; x <= 11; x++) setT(x, y, T_WATER);

  // 主干道：横向 y14-15，纵向 x20-21
  for (let x = 0; x < MAP_W; x++) { setT(x, 14, T_PATH); setT(x, 15, T_PATH); }
  for (let y = 3; y <= 26; y++) { setT(20, y, T_PATH); setT(21, y, T_PATH); }

  // 中央石板广场
  for (let y = 7; y <= 12; y++) for (let x = 16; x <= 27; x++) setT(x, y, T_PLAZA);

  // 支路
  setT(12, 13, T_PATH); setT(3, 13, T_PATH); setT(30, 13, T_PATH);
  for (let y = 6; y <= 13; y++) setT(35, y, T_PATH);          // 天文台 & 公园
  setT(15, 16, T_PATH);                                        // 农场入口
  for (let x = 22; x <= 31; x++) setT(x, 20, T_PATH);          // 南巷（小筑/咖啡馆）
  for (let x = 2; x <= 6; x++) setT(x, 22, T_PATH);            // 码头西路
  for (let x = 10; x <= 19; x++) setT(x, 22, T_PATH);          // 码头东路

  // 桥与码头（木板）
  for (let x = 7; x <= 9; x++) { setT(x, 14, T_BRIDGE); setT(x, 15, T_BRIDGE); setT(x, 22, T_BRIDGE); }
  for (let x = 2; x <= 4; x++) setT(x, 23, T_BRIDGE);

  // 农田
  for (let y = 18; y <= 20; y++) for (let x = 12; x <= 17; x++) setT(x, y, T_SOIL);
}
buildTerrain();

const WALK_COST = { [T_PATH]: 1, [T_PLAZA]: 1, [T_BRIDGE]: 1, [T_GRASS]: 2.4, [T_SOIL]: 3 };
function walkable(x, y) {
  if (!inMap(x, y)) return false;
  const t = terrain[y][x];
  return WALK_COST[t] !== undefined && !blocked.has(key(x, y));
}

/* ---------- 农田作物 ---------- */
const plots = [];
for (let y = 18; y <= 20; y++) {
  for (let x = 12; x <= 17; x++) {
    if (x === 15) continue;            // 走道
    if (x === 16 && y === 19) continue; // 稻草人
    plots.push({ x, y, stage: Math.floor(hash2(x, y, 7) * 4) });
  }
}

/* ---------- 兴趣点 ---------- */
const SPOTS = {
  house1: { x: 12, y: 12, building: "house1", name: "蓝顶小屋" },
  house2: { x: 3,  y: 12, building: "house2", name: "河畔木屋" },
  house3: { x: 25, y: 19, building: "house3", name: "山楂小筑" },
  bakery: { x: 17, y: 6,  building: "bakery", name: "炉火面包房" },
  atelier:{ x: 24, y: 6,  building: "atelier", name: "拾色画室" },
  school: { x: 30, y: 12, building: "school", name: "栎树学堂" },
  cafe:   { x: 29, y: 19, building: "cafe", name: "星月咖啡馆" },
  obs:    { x: 35, y: 5,  building: "obs", name: "远空天文台" },
  farm:   { x: 15, y: 19, name: "向阳农园" },
  dock:   { x: 3,  y: 23, name: "湖畔码头" },
  river:  { x: 10, y: 16, name: "河岸" },
  plazaA: { x: 21, y: 12, name: "喷泉广场" },
  plazaB: { x: 19, y: 11, name: "喷泉广场" },
  plazaC: { x: 20, y: 12, name: "喷泉广场" },
  plazaE: { x: 22, y: 11, name: "喷泉广场" },
  parkA:  { x: 37, y: 11, name: "栎风公园" },
  parkB:  { x: 36, y: 12, name: "栎风公园" },
};
Object.values(SPOTS).forEach((s) => reserve(s.x, s.y, 1));

/* ===================================================================
 * 建筑与精灵生成（程序化像素美术）
 * =================================================================== */
const BUILDINGS = {
  house1: { x: 11, y: 9,  w: 4, h: 4, doorDx: 1, wall: "#f0e0bb", trim: "#8a5a2b", roof: "#5d7fd1", roofDark: "#46639f", name: "蓝顶小屋", chimney: true },
  house2: { x: 2,  y: 9,  w: 4, h: 4, doorDx: 1, wall: "#e7d3a8", trim: "#7c5126", roof: "#5d9e54", roofDark: "#447a3e", name: "河畔木屋", chimney: true },
  house3: { x: 24, y: 16, w: 4, h: 4, doorDx: 1, wall: "#ead9c0", trim: "#7c5126", roof: "#9a6dbb", roofDark: "#76518f", name: "山楂小筑", chimney: true },
  bakery: { x: 16, y: 3,  w: 4, h: 4, doorDx: 1, wall: "#f3e3c0", trim: "#8a5a2b", roof: "#c0533f", roofDark: "#94402f", name: "炉火面包房", chimney: true, sign: "bread" },
  atelier:{ x: 23, y: 3,  w: 4, h: 4, doorDx: 1, wall: "#e3ddcf", trim: "#6c5a8a", roof: "#4f9aa3", roofDark: "#3b757d", name: "拾色画室", sign: "brush" },
  school: { x: 28, y: 8,  w: 5, h: 5, doorDx: 2, wall: "#e8d6ad", trim: "#7c5126", roof: "#a3683a", roofDark: "#7e4e2a", name: "栎树学堂", chimney: true, bell: true },
  cafe:   { x: 28, y: 16, w: 4, h: 4, doorDx: 1, wall: "#e9d6b4", trim: "#8a5a2b", roof: "#d98e3c", roofDark: "#ad6c2c", name: "星月咖啡馆", chimney: true, sign: "cup" },
  obs:    { x: 34, y: 2,  w: 4, h: 4, doorDx: 1, wall: "#d8d4cf", trim: "#566080", roof: "#7d89b8", roofDark: "#5c688f", name: "远空天文台", dome: true, sign: "star" },
};

function drawSignIcon(g, cx, cy, type) {
  if (type === "bread") {
    px(g, cx - 3, cy - 1, 6, 3, "#d9a35a"); px(g, cx - 2, cy - 2, 4, 1, "#e8bd79");
  } else if (type === "brush") {
    px(g, cx - 1, cy - 3, 2, 4, "#a06636"); px(g, cx - 1, cy + 1, 2, 2, "#5d7fd1");
  } else if (type === "cup") {
    px(g, cx - 2, cy - 2, 4, 4, "#f6f1e3"); px(g, cx + 2, cy - 1, 1, 2, "#f6f1e3");
  } else if (type === "star") {
    px(g, cx - 1, cy - 2, 2, 1, "#ffd96b"); px(g, cx - 2, cy - 1, 4, 2, "#ffd96b"); px(g, cx - 1, cy + 1, 2, 1, "#ffd96b");
  } else if (type === "book") {
    px(g, cx - 2, cy - 2, 4, 4, "#c75b4a"); px(g, cx, cy - 2, 1, 4, "#f1e6d0");
  }
}

function buildBuildingSprite(spec) {
  const w = spec.w * TILE, h = spec.h * TILE;
  const [c, g] = makeCanvas(w, h);
  const roofH = (spec.h - 2) * TILE;       // 上层为屋顶，下两格为墙体
  const wallY = roofH;

  // 墙体
  px(g, 2, wallY, w - 4, h - wallY, spec.wall);
  g.fillStyle = "rgba(0,0,0,0.08)";
  for (let yy = wallY + 4; yy < h - 3; yy += 5) g.fillRect(3, yy, w - 6, 1);
  px(g, 2, wallY, 2, h - wallY, spec.trim);
  px(g, w - 4, wallY, 2, h - wallY, spec.trim);
  px(g, 2, h - 2, w - 4, 2, "rgba(0,0,0,0.35)");

  if (spec.dome) {
    // 天文台穹顶
    g.fillStyle = spec.roof;
    g.beginPath();
    g.arc(w / 2, roofH, w / 2 - 2, Math.PI, 0);
    g.fill();
    g.fillStyle = spec.roofDark;
    g.beginPath();
    g.arc(w / 2, roofH, w / 2 - 2, Math.PI * 1.5, 0);
    g.lineTo(w / 2, roofH);
    g.fill();
    px(g, w / 2 - 2, 4, 4, roofH - 4, "#2c3357"); // 观测缝
    px(g, w / 2 - 1, 6, 2, 4, "#ffd96b");
    px(g, 0, roofH - 3, w, 3, spec.roofDark);
  } else {
    // 坡屋顶（横向瓦带 + 屋脊高光 + 屋檐）
    const ry0 = 6;
    px(g, 0, ry0, w, roofH - ry0, spec.roof);
    g.fillStyle = spec.roofDark;
    for (let yy = ry0 + 4; yy < roofH; yy += 6) g.fillRect(0, yy, w, 2);
    px(g, 4, ry0 - 2, w - 8, 3, spec.roof);
    px(g, 6, ry0 - 3, w - 12, 2, "#f6e7c5");
    px(g, 0, roofH - 3, w, 3, spec.roofDark);
    px(g, 2, roofH, w - 4, 3, "rgba(0,0,0,0.22)"); // 檐影
    if (spec.chimney) {
      px(g, w - 14, 0, 8, 12, "#9c5b46");
      px(g, w - 15, 0, 10, 3, "#7c4636");
    }
    if (spec.bell) {
      px(g, w / 2 - 4, ry0 - 6, 8, 5, spec.trim);
      px(g, w / 2 - 1, ry0 - 4, 2, 3, "#ffd96b");
    }
  }

  // 门（拱形木门）
  const doorPx = spec.doorDx * TILE + 2;
  const dh = 15;
  px(g, doorPx, h - dh, 12, dh, "#5b3a1e");
  px(g, doorPx + 1, h - dh + 1, 10, dh - 1, "#84592e");
  g.fillStyle = "rgba(0,0,0,0.18)";
  g.fillRect(doorPx + 4, h - dh + 1, 1, dh - 1);
  g.fillRect(doorPx + 7, h - dh + 1, 1, dh - 1);
  px(g, doorPx + 8, h - 8, 2, 2, "#ffd96b"); // 门把手
  px(g, doorPx - 1, h - 2, 14, 2, "#b3a489"); // 门前石阶

  // 窗（记录世界坐标，夜晚发光）
  const windows = [];
  const winY = wallY + 5;
  const winXs = spec.w === 5 ? [6, w - 16] : [4, w - 14];
  winXs.forEach((wx) => {
    px(g, wx, winY, 10, 10, spec.trim);
    px(g, wx + 1, winY + 1, 8, 8, "#a7c4dc");
    px(g, wx + 4, winY + 1, 1, 8, spec.trim);
    px(g, wx + 1, winY + 4, 8, 1, spec.trim);
    px(g, wx - 1, winY + 10, 12, 2, spec.trim); // 窗台
    windows.push({ x: spec.x * TILE + wx + 1, y: spec.y * TILE + winY + 1, w: 8, h: 8 });
  });

  // 挂牌
  if (spec.sign) {
    const sx = doorPx + 16, sy = h - 26;
    px(g, sx, sy - 3, 1, 3, "#5b3a1e");
    px(g, sx + 9, sy - 3, 1, 3, "#5b3a1e");
    px(g, sx - 2, sy, 14, 11, "#8a5a2b");
    px(g, sx - 1, sy + 1, 12, 9, "#c89858");
    drawSignIcon(g, sx + 4, sy + 5, spec.sign);
  }
  return { canvas: c, windows };
}

// 初始化建筑：精灵、占用集合、阻挡
Object.entries(BUILDINGS).forEach(([id, spec]) => {
  spec.id = id;
  const { canvas: spr, windows } = buildBuildingSprite(spec);
  spec.sprite = spr;
  spec.windowsWorld = windows;
  spec.doorTile = { x: spec.x + spec.doorDx, y: spec.y + spec.h - 1 };
  spec.chimneyWorld = spec.chimney ? { x: spec.x * TILE + spec.w * TILE - 10, y: spec.y * TILE } : null;
  spec.occupants = new Set();
  for (let dy = 0; dy < spec.h; dy++)
    for (let dx = 0; dx < spec.w; dx++) {
      const tx = spec.x + dx, ty = spec.y + dy;
      reserve(tx, ty, 1);
      if (!(tx === spec.doorTile.x && ty === spec.doorTile.y)) block(tx, ty);
    }
});

/* ---------- 树木 ---------- */
const treeCache = new Map();
function treeSprite(kind, seasonIdx) {
  const ck = kind + ":" + seasonIdx;
  if (treeCache.has(ck)) return treeCache.get(ck);
  const [c, g] = makeCanvas(32, 48);
  const season = SEASONS[seasonIdx];
  const winter = seasonIdx === 3;
  // 树干
  px(g, 13, 30, 6, 16, "#6e4a2a");
  px(g, 13, 30, 2, 16, "#5a3a20");
  px(g, 12, 44, 8, 2, "#4d3119");
  if (winter) {
    // 枯枝 + 积雪
    px(g, 14, 14, 4, 18, "#6e4a2a");
    px(g, 6, 18, 10, 3, "#6e4a2a"); px(g, 16, 12, 11, 3, "#6e4a2a");
    px(g, 4, 22, 8, 2, "#5a3a20"); px(g, 20, 18, 8, 2, "#5a3a20");
    px(g, 6, 16, 10, 2, "#eef4f8"); px(g, 16, 10, 11, 2, "#eef4f8");
    px(g, 13, 28, 6, 2, "#eef4f8");
  } else if (kind === "pine") {
    const [d, m, l] = season.canopy;
    px(g, 6, 26, 20, 8, d); px(g, 8, 18, 16, 9, m); px(g, 11, 10, 10, 9, l);
    px(g, 14, 6, 4, 5, m);
    px(g, 9, 19, 5, 2, "#ffffff22"); px(g, 12, 11, 4, 2, "#ffffff22");
  } else {
    const [d, m, l] = season.canopy;
    px(g, 3, 12, 26, 20, d);
    px(g, 5, 8, 22, 8, d);
    px(g, 5, 10, 20, 18, m);
    px(g, 7, 8, 16, 6, m);
    px(g, 7, 9, 10, 7, l);
    px(g, 19, 13, 6, 5, l);
    for (let i = 0; i < 9; i++) {
      const fx = 5 + Math.floor(hash2(i, kind === "oak" ? 1 : 2, seasonIdx) * 22);
      const fy = 9 + Math.floor(hash2(i, 5, seasonIdx) * 18);
      px(g, fx, fy, 2, 2, i % 2 ? d : "#ffffff1e");
    }
    if (season.blossom) {
      for (let i = 0; i < 7; i++) {
        const fx = 6 + Math.floor(hash2(i, 9, 3) * 20);
        const fy = 9 + Math.floor(hash2(i, 11, 3) * 16);
        px(g, fx, fy, 2, 2, season.blossom);
      }
    }
  }
  treeCache.set(ck, c);
  return c;
}

/* ---------- 人物精灵（16x20 / 4 方向 x 3 帧） ---------- */
function drawPersonFrame(g, ox, oy, dir, frame, cfg) {
  const skin = cfg.skin, hair = cfg.hair, shirt = cfg.shirt, pants = cfg.pants;
  const shadow = "rgba(0,0,0,0.25)";
  // 腿（frame 1/2 交替迈步）
  const lift = frame === 1 ? 1 : 0, lift2 = frame === 2 ? 1 : 0;
  if (cfg.dress) {
    px(g, ox + 3, oy + 9, 10, 7, shirt);
    px(g, ox + 2, oy + 13, 12, 3, shirt);
    g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(ox + 2, oy + 14, 12, 2);
    px(g, ox + 5, oy + 16, 2, 2 - lift, skin);
    px(g, ox + 9, oy + 16, 2, 2 - lift2, skin);
    px(g, ox + 5, oy + 17 - lift, 2, 1, "#4d3119");
    px(g, ox + 9, oy + 17 - lift2, 2, 1, "#4d3119");
  } else {
    px(g, ox + 4, oy + 9, 8, 6, shirt);
    px(g, ox + 5, oy + 15 - lift, 3, 3 + lift, pants);
    px(g, ox + 8, oy + 15 - lift2, 3, 3 + lift2, pants);
    px(g, ox + 5, oy + 17, 3, 1, "#33231a");
    px(g, ox + 8, oy + 17, 3, 1, "#33231a");
  }
  // 手臂
  if (dir !== 3) px(g, ox + 3, oy + 10, 1, 4, skin);
  if (dir !== 2) px(g, ox + 12, oy + 10, 1, 4, skin);
  g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(ox + 4, oy + 9, 8, 1);
  // 头部
  px(g, ox + 4, oy + 1, 8, 8, hair);
  if (dir === 0) { // 正面
    px(g, ox + 5, oy + 4, 6, 5, skin);
    px(g, ox + 5, oy + 4, 1, 2, hair); px(g, ox + 10, oy + 4, 1, 2, hair);
    px(g, ox + 7, oy + 4, 1, 1, hair);
    px(g, ox + 6, oy + 6, 1, 2, "#33231a"); px(g, ox + 9, oy + 6, 1, 2, "#33231a");
    px(g, ox + 5, oy + 8, 1, 1, "#f0a8a0"); px(g, ox + 10, oy + 8, 1, 1, "#f0a8a0");
  } else if (dir === 1) { // 背面
    px(g, ox + 4, oy + 1, 8, 8, hair);
    g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(ox + 4, oy + 6, 8, 1);
  } else { // 侧面（dir2 右 / dir3 左：左侧由右侧镜像生成）
    px(g, ox + 6, oy + 4, 6, 5, skin);
    px(g, ox + 6, oy + 4, 2, 5, hair);
    px(g, ox + 10, oy + 6, 1, 2, "#33231a");
  }
  // 配饰
  if (cfg.hat === "chef") {
    px(g, ox + 4, oy - 1, 8, 3, "#f6f1e3"); px(g, ox + 5, oy - 2, 6, 1, "#f6f1e3");
  }
  if (cfg.pin) px(g, ox + 10, oy + 1, 2, 2, "#ffd96b");
  void shadow;
}

function buildPersonSheet(cfg) {
  const [c, g] = makeCanvas(16 * 3, 20 * 4);
  for (let dir = 0; dir < 3; dir++)
    for (let f = 0; f < 3; f++) drawPersonFrame(g, f * 16, dir * 20 + 2, dir, f, cfg);
  // 第 4 行：左 = 右镜像
  const [mc, mg] = makeCanvas(16 * 3, 20);
  mg.translate(48, 0); mg.scale(-1, 1);
  mg.drawImage(c, 0, 40, 48, 20, 0, 0, 48, 20);
  // 镜像后帧序颠倒，逐帧回拷
  for (let f = 0; f < 3; f++) g.drawImage(mc, (2 - f) * 16, 0, 16, 20, f * 16, 60, 16, 20);
  return c;
}

function drawPortrait(g, cfg) {
  // 32x32 头像
  px(g, 0, 0, 32, 32, cfg.bg || "#dfe9f1");
  g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(0, 0, 32, 10);
  px(g, 6, 24, 20, 8, cfg.shirt);
  px(g, 6, 4, 20, 20, cfg.hair);
  px(g, 8, 10, 16, 13, cfg.skin);
  px(g, 8, 10, 2, 5, cfg.hair); px(g, 22, 10, 2, 5, cfg.hair);
  px(g, 14, 9, 3, 2, cfg.hair);
  px(g, 11, 15, 2, 4, "#33231a"); px(g, 19, 15, 2, 4, "#33231a");
  px(g, 9, 20, 2, 2, "#f0a8a0"); px(g, 21, 20, 2, 2, "#f0a8a0");
  px(g, 14, 21, 4, 1, "#b06a52");
  if (cfg.hat === "chef") { px(g, 6, 1, 20, 5, "#f6f1e3"); px(g, 8, 0, 16, 2, "#f6f1e3"); }
  if (cfg.pin) px(g, 21, 6, 3, 3, "#ffd96b");
}

/* ===================================================================
 * 场景物件（树木 / 栅栏 / 路灯 / 喷泉 / 凉亭 / 杂物）
 * =================================================================== */
const objects = [];   // { sortY, draw(g) }
const lamps = [];     // 灯光位置（像素）

function addLamp(x, y) {
  block(x, y); reserve(x, y, 1);
  const cx = x * TILE + 8, baseY = y * TILE + 14;
  lamps.push({ x: cx, y: y * TILE - 4 });
  objects.push({
    sortY: baseY,
    draw(g) {
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.beginPath(); g.ellipse(cx, baseY, 5, 2, 0, 0, Math.PI * 2); g.fill();
      px(g, cx - 1, y * TILE - 8, 3, 22, "#3a4252");
      px(g, cx - 3, y * TILE - 8, 7, 2, "#3a4252");
      px(g, cx - 4, y * TILE - 12, 9, 8, "#2c3357");
      px(g, cx - 3, y * TILE - 11, 7, 6, "#ffd27d");
      px(g, cx - 4, y * TILE - 13, 9, 2, "#3a4252");
    },
  });
}
[[5, 13], [13, 16], [26, 13], [32, 16], [16, 7], [27, 7], [16, 12], [27, 12], [10, 21], [27, 21], [5, 21]]
  .forEach(([x, y]) => addLamp(x, y));

function addFence(x, y, orient) {
  block(x, y); reserve(x, y);
  const bx = x * TILE, by = y * TILE;
  objects.push({
    sortY: by + 14,
    draw(g) {
      if (orient === "h") {
        px(g, bx, by + 5, 16, 3, "#a87844");
        px(g, bx, by + 10, 16, 2, "#96693a");
        px(g, bx + 2, by + 1, 3, 12, "#bb8a52");
        px(g, bx + 11, by + 1, 3, 12, "#bb8a52");
        px(g, bx + 2, by + 1, 3, 1, "#d9aa6c");
        px(g, bx + 11, by + 1, 3, 1, "#d9aa6c");
      } else {
        px(g, bx + 6, by, 4, 14, "#bb8a52");
        px(g, bx + 6, by, 4, 1, "#d9aa6c");
        px(g, bx + 3, by + 4, 10, 2, "#a87844");
        px(g, bx + 3, by + 9, 10, 2, "#96693a");
      }
    },
  });
}
for (let x = 11; x <= 18; x++) { if (x !== 15) addFence(x, 17, "h"); addFence(x, 21, "h"); }
for (let y = 18; y <= 20; y++) { addFence(11, y, "v"); addFence(18, y, "v"); }

// 喷泉（2x2，动态水花在渲染层处理）
(function addFountain() {
  const fx = 21, fy = 9;
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { block(fx + dx, fy + dy); reserve(fx + dx, fy + dy, 1); }
  const bx = fx * TILE, by = fy * TILE;
  objects.push({
    sortY: by + 30,
    draw(g) {
      px(g, bx + 1, by + 4, 30, 26, "#8d8a80");
      px(g, bx + 3, by + 6, 26, 22, "#b5b1a4");
      px(g, bx + 5, by + 8, 22, 18, seasonNow().water);
      px(g, bx + 12, by + 2, 8, 12, "#9a968b");
      px(g, bx + 13, by + 1, 6, 3, "#c4c0b2");
      const t = state.elapsed * 4;
      for (let i = 0; i < 5; i++) {
        const a = t + i * 1.3;
        const sx = bx + 16 + Math.cos(a) * (4 + (i % 3) * 3);
        const sy = by + 15 + Math.sin(a * 1.4) * 4;
        px(g, sx, sy, 2, 2, "#dceefc");
      }
      px(g, bx + 6, by + 9, 8, 2, "#dceefc");
    },
  });
})();

// 公园凉亭（3x3）
(function addGazebo() {
  const gx = 36, gy = 8;
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) { block(gx + dx, gy + dy); reserve(gx + dx, gy + dy, 1); }
  const bx = gx * TILE, by = gy * TILE;
  objects.push({
    sortY: by + 46,
    draw(g) {
      px(g, bx + 2, by + 40, 44, 6, "#b3a489");
      px(g, bx + 4, by + 18, 4, 26, "#8a5a2b");
      px(g, bx + 40, by + 18, 4, 26, "#8a5a2b");
      px(g, bx + 4, by + 30, 40, 3, "#a87844");
      px(g, bx - 2, by + 10, 52, 6, "#c0533f");
      px(g, bx + 2, by + 5, 44, 6, "#d96a52");
      px(g, bx + 14, by + 0, 20, 6, "#c0533f");
      px(g, bx + 20, by - 3, 8, 4, "#94402f");
    },
  });
})();

// 稻草人
(function addScarecrow() {
  const sx = 16, sy = 19;
  block(sx, sy);
  const bx = sx * TILE + 8, by = sy * TILE + 12;
  objects.push({
    sortY: by,
    draw(g) {
      px(g, bx - 1, by - 18, 3, 18, "#8a5a2b");
      px(g, bx - 7, by - 13, 15, 2, "#8a5a2b");
      px(g, bx - 3, by - 24, 7, 6, "#f0d8a0");
      px(g, bx - 4, by - 26, 9, 3, "#7c5126");
      px(g, bx - 6, by - 24, 4, 2, "#7c5126");
      px(g, bx - 2, by - 22, 1, 1, "#33231a"); px(g, bx + 1, by - 22, 1, 1, "#33231a");
      px(g, bx - 3, by - 17, 7, 5, "#c75b4a");
    },
  });
})();

// 杂物：货箱 / 木桶 / 邮箱
function addCrate(x, y, type) {
  block(x, y); reserve(x, y);
  const bx = x * TILE, by = y * TILE;
  objects.push({
    sortY: by + 14,
    draw(g) {
      if (type === "barrel") {
        px(g, bx + 3, by + 2, 10, 12, "#8a5a2b");
        px(g, bx + 3, by + 4, 10, 2, "#5b3a1e");
        px(g, bx + 3, by + 9, 10, 2, "#5b3a1e");
        px(g, bx + 4, by + 2, 2, 12, "#a87844");
      } else {
        px(g, bx + 2, by + 3, 12, 11, "#9c6b39");
        px(g, bx + 3, by + 4, 10, 9, "#b98a4e");
        px(g, bx + 2, by + 3, 12, 2, "#d6a25d");
        px(g, bx + 7, by + 4, 2, 9, "#9c6b39");
      }
    },
  });
}
addCrate(15, 5, "crate"); addCrate(27, 5, "crate");
addCrate(1, 22, "barrel"); addCrate(1, 21, "crate");

function addMailbox(x, y) {
  block(x, y); reserve(x, y);
  const bx = x * TILE + 8, by = y * TILE + 14;
  objects.push({
    sortY: by,
    draw(g) {
      px(g, bx - 1, by - 10, 2, 10, "#5b3a1e");
      px(g, bx - 4, by - 15, 9, 6, "#c75b4a");
      px(g, bx - 4, by - 16, 9, 2, "#94402f");
      px(g, bx + 3, by - 14, 2, 2, "#ffd96b");
    },
  });
}
addMailbox(15, 12); addMailbox(6, 12); addMailbox(23, 19);

// 公园手植树
const manualTrees = [["oak", 33, 9], ["pine", 33, 11], ["oak", 38, 12]];

/* ---------- 树木散布（确定性） ---------- */
const treeTiles = []; // {kind,x,y}
function nearNonGrassPath(x, y) {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const tx = x + dx, ty = y + dy;
      if (!inMap(tx, ty)) continue;
      const t = terrain[ty][tx];
      if (t === T_PATH || t === T_PLAZA || t === T_BRIDGE || t === T_SOIL) return true;
    }
  return false;
}
for (let y = 0; y < MAP_H; y++) {
  for (let x = 0; x < MAP_W; x++) {
    if (terrain[y][x] !== T_GRASS) continue;
    if (reserved.has(key(x, y)) || blocked.has(key(x, y))) continue;
    if (nearNonGrassPath(x, y)) continue;
    let density = 0.06;
    if (y < 3) density = 0.55;
    else if (x >= 37) density = 0.32;
    else if (x < 6 && y < 9) density = 0.3;
    else if (y > 23) density = 0.22;
    const h = hash2(x, y, 42);
    if (h < density) {
      const kind = hash2(x, y, 43) < 0.4 ? "pine" : "oak";
      treeTiles.push({ kind, x, y });
      block(x, y); reserve(x, y);
    } else if (h < density + 0.045) {
      block(x, y); reserve(x, y);
      const bx = x * TILE, by = y * TILE;
      objects.push({
        sortY: by + 13,
        draw(g) {
          const season = seasonNow();
          const cols = season.canopy || ["#cdddea", "#dfe9f1", "#f4f9fc"];
          px(g, bx + 2, by + 5, 12, 8, cols[0]);
          px(g, bx + 3, by + 3, 10, 8, cols[1]);
          px(g, bx + 4, by + 4, 5, 3, cols[2]);
        },
      });
    }
  }
}
manualTrees.forEach(([kind, x, y]) => { treeTiles.push({ kind, x, y }); block(x, y); });
treeTiles.forEach(({ kind, x, y }) => {
  objects.push({
    sortY: y * TILE + 15,
    draw(g) { g.drawImage(treeSprite(kind, state.seasonIdx), x * TILE - 8, (y + 1) * TILE - 48); },
  });
});

// 建筑加入渲染列表
Object.values(BUILDINGS).forEach((spec) => {
  objects.push({
    sortY: (spec.y + spec.h) * TILE - 2,
    draw(g) {
      g.fillStyle = "rgba(0,0,0,0.18)";
      g.fillRect(spec.x * TILE + 2, (spec.y + spec.h) * TILE - 2, spec.w * TILE - 4, 4);
      g.drawImage(spec.sprite, spec.x * TILE, spec.y * TILE);
      if (spec.occupants.size > 0 && darknessLevel() > 0.08) {
        spec.windowsWorld.forEach((w) => {
          px(g, w.x, w.y, w.w, w.h, "#ffd98a");
          px(g, w.x + 3, w.y, 1, w.h, "rgba(90,58,30,0.8)");
          px(g, w.x, w.y + 3, w.w, 1, "rgba(90,58,30,0.8)");
        });
      }
    },
  });
});

/* ===================================================================
 * 镇民
 * =================================================================== */
const VILLAGER_DEFS = [
  {
    name: "朵拉", title: "像素画师", homeId: "house1",
    cfg: { skin: "#f6cfa4", hair: "#ff8fc7", shirt: "#e35d8f", pants: "#7a4060", dress: true, bg: "#ffe3f0" },
    family: ["鲁本"], friends: ["溪谷", "漫星"],
    personality: "对色彩极度敏感，总能在街角发现新的灵感。",
    schedule: [
      { t: 470, spot: "atelier", inside: true, act: "work" },
      { t: 730, spot: "plazaA", act: "lunch" },
      { t: 800, spot: "atelier", inside: true, act: "work" },
      { t: 1030, spot: "parkA", act: "hobby" },
      { t: 1140, spot: "cafe", inside: true, act: "social" },
      { t: 1280, spot: "home", inside: true, act: "sleep" },
    ],
  },
  {
    name: "鲁本", title: "独立面包师", homeId: "house1",
    cfg: { skin: "#eebd92", hair: "#8a5a33", shirt: "#efe8d8", pants: "#6b4a2f", hat: "chef", bg: "#f7ecd7" },
    family: ["朵拉"], friends: ["漫星"],
    personality: "清晨烘焙香气弥漫小镇，是镇民赖以起床的动力。",
    schedule: [
      { t: 370, spot: "bakery", inside: true, act: "work" },
      { t: 840, spot: "plazaB", act: "lunch" },
      { t: 900, spot: "bakery", inside: true, act: "work" },
      { t: 1130, spot: "cafe", inside: true, act: "social" },
      { t: 1300, spot: "home", inside: true, act: "sleep" },
    ],
  },
  {
    name: "溪谷", title: "农园设计师", homeId: "house2",
    cfg: { skin: "#f1c79c", hair: "#3f8f5a", shirt: "#caa05a", pants: "#3e6fae", bg: "#ddf2dd" },
    family: ["夏禾"], friends: ["朵拉", "海澜"],
    personality: "负责照看向阳农园与河岸绿植，时常组织环保讲座。",
    schedule: [
      { t: 430, spot: "farm", act: "work" },
      { t: 750, spot: "home", inside: true, act: "lunch" },
      { t: 820, spot: "farm", act: "work" },
      { t: 1050, spot: "river", act: "hobby" },
      { t: 1150, spot: "cafe", inside: true, act: "social" },
      { t: 1260, spot: "home", inside: true, act: "sleep" },
    ],
  },
  {
    name: "夏禾", title: "社区教师", homeId: "house2",
    cfg: { skin: "#f6cfa4", hair: "#5a7fd6", shirt: "#f3c84f", pants: "#b3893a", dress: true, bg: "#fdf3d4" },
    family: ["溪谷"], friends: ["海澜"],
    personality: "喜欢在广场上为孩子们排练剧场，笑声不断。",
    schedule: [
      { t: 460, spot: "school", inside: true, act: "work" },
      { t: 720, spot: "plazaE", act: "lunch" },
      { t: 790, spot: "school", inside: true, act: "work" },
      { t: 990, spot: "plazaC", act: "hobby" },
      { t: 1120, spot: "home", inside: true, act: "sleep" },
    ],
  },
  {
    name: "漫星", title: "天文写作者", homeId: "house3",
    cfg: { skin: "#efc49e", hair: "#8e6fd8", shirt: "#3c4a86", pants: "#2c3357", pin: true, bg: "#e4def6" },
    family: ["海澜"], friends: ["朵拉", "鲁本"],
    personality: "昼伏夜出，深夜在天文台记录星辰的故事。",
    schedule: [
      { t: 600, spot: "cafe", inside: true, act: "work" },
      { t: 780, spot: "parkB", act: "hobby" },
      { t: 900, spot: "home", inside: true, act: "rest" },
      { t: 1140, spot: "obs", inside: true, act: "work" },
      { t: 1430, spot: "home", inside: true, act: "sleep" },
    ],
  },
  {
    name: "海澜", title: "河港守望员", homeId: "house3",
    cfg: { skin: "#e8b88d", hair: "#3aa3b8", shirt: "#2e6f9e", pants: "#274059", bg: "#d8ecf4" },
    family: ["漫星"], friends: ["溪谷", "夏禾"],
    personality: "守护湖畔码头与河道航灯，是小镇的守望者。",
    schedule: [
      { t: 400, spot: "dock", act: "work" },
      { t: 740, spot: "home", inside: true, act: "lunch" },
      { t: 810, spot: "dock", act: "work" },
      { t: 1080, spot: "cafe", inside: true, act: "social" },
      { t: 1270, spot: "home", inside: true, act: "sleep" },
    ],
  },
];

const MOODS = { work: "专注", lunch: "惬意", hobby: "愉快", social: "兴奋", sleep: "安眠", rest: "放松" };
const ACT_VERBS = { work: "工作", lunch: "用午餐", hobby: "享受闲暇", social: "和朋友聚会", sleep: "休息", rest: "小憩" };
const ACT_LOGS = {
  work: (v, s) => `${v.name}抵达${s}，专心投入一天的工作。`,
  lunch: (v, s) => `${v.name}来到${s}，享受午后的闲聊与美食。`,
  hobby: (v, s) => `${v.name}在${s}度过属于自己的小时光。`,
  social: (v, s) => `${v.name}走进${s}，和朋友们围坐畅谈。`,
  sleep: (v, s) => `${v.name}回到${s}，点亮窗灯准备休息。`,
  rest: (v, s) => `${v.name}回${s}小憩，养精蓄锐。`,
};

const villagers = VILLAGER_DEFS.map((def) => {
  const home = BUILDINGS[def.homeId];
  const door = home.doorTile;
  const v = {
    ...def,
    sheet: buildPersonSheet(def.cfg),
    tile: { x: door.x, y: door.y },
    pos: { x: door.x * TILE + 8, y: door.y * TILE + 14 },
    dir: 0, animT: 0,
    state: "inside",
    buildingId: def.homeId,
    spotKey: "home",
    act: "sleep",
    mood: "安眠",
    energy: 90,
    path: [], pathIdx: 0,
    schedIdx: 0,
    emoteTimer: 4 + Math.random() * 8,
  };
  home.occupants.add(v.name);
  v.schedIdx = v.schedule.findIndex((e) => e.t >= state.minutes);
  if (v.schedIdx === -1) v.schedIdx = v.schedule.length;
  return v;
});

function spotOf(v, keyName) {
  if (keyName === "home") return { ...BUILDINGS[v.homeId].doorTile, building: v.homeId, name: SPOTS[v.homeId].name };
  return SPOTS[keyName];
}

/* ---------- A* 寻路 ---------- */
function findPath(sx, sy, tx, ty) {
  if (sx === tx && sy === ty) return [{ x: tx, y: ty }];
  const open = [{ x: sx, y: sy, g: 0, f: 0, parent: null }];
  const visited = new Map([[key(sx, sy), 0]]);
  const isTarget = (x, y) => x === tx && y === ty;
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (isTarget(cur.x, cur.y)) {
      const path = [];
      let n = cur;
      while (n) { path.unshift({ x: n.x, y: n.y }); n = n.parent; }
      return path;
    }
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx, ny = cur.y + dy;
      const okTarget = isTarget(nx, ny);
      if (!okTarget && !walkable(nx, ny)) continue;
      if (okTarget && !inMap(nx, ny)) continue;
      const cost = WALK_COST[terrain[ny][nx]] || 1;
      const ng = cur.g + cost;
      const k = key(nx, ny);
      if (visited.has(k) && visited.get(k) <= ng) continue;
      visited.set(k, ng);
      open.push({ x: nx, y: ny, g: ng, f: ng + Math.abs(nx - tx) + Math.abs(ny - ty), parent: cur });
    }
  }
  return null;
}

/* ===================================================================
 * 模拟：作息调度 / 移动 / 精力
 * =================================================================== */
function formatTime(minutes) {
  const h = Math.floor(minutes / 60) % 24, m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const journalList = document.getElementById("journalList");
function addJournal(text, cls) {
  const li = document.createElement("li");
  if (cls) li.className = cls;
  li.textContent = cls === "day-line" ? text : `${formatTime(state.minutes)}｜${text}`;
  journalList.prepend(li);
  while (journalList.children.length > 8) journalList.lastChild.remove();
}

function fireSchedule(v, entry) {
  const spot = spotOf(v, entry.spot);
  if (v.state === "inside" && v.buildingId) {
    BUILDINGS[v.buildingId].occupants.delete(v.name);
    const d = BUILDINGS[v.buildingId].doorTile;
    v.tile = { x: d.x, y: d.y };
    v.pos = { x: d.x * TILE + 8, y: d.y * TILE + 14 };
    v.buildingId = null;
  }
  v.pending = entry;
  v.targetSpot = spot;
  const path = findPath(v.tile.x, v.tile.y, spot.x, spot.y);
  if (path && path.length > 1) { v.path = path; v.pathIdx = 1; v.state = "walk"; }
  else arrive(v, entry, spot);
}

function arrive(v, entry, spot) {
  v.tile = { x: spot.x, y: spot.y };
  v.pos = { x: spot.x * TILE + 8, y: spot.y * TILE + 14 };
  v.act = entry.act;
  v.mood = MOODS[entry.act];
  v.spotKey = entry.spot;
  v.path = [];
  if (entry.inside && spot.building) {
    v.state = "inside";
    v.buildingId = spot.building;
    BUILDINGS[spot.building].occupants.add(v.name);
  } else { v.state = "idle"; v.dir = 0; }
  addJournal(ACT_LOGS[entry.act](v, spot.name));
  updateFocusCard();
}

function processSchedules(uptoMin) {
  villagers.forEach((v) => {
    while (v.schedIdx < v.schedule.length && v.schedule[v.schedIdx].t <= uptoMin) {
      fireSchedule(v, v.schedule[v.schedIdx]);
      v.schedIdx++;
    }
  });
}

const ENERGY_RATE = { walk: 0.12, work: 0.06, lunch: -0.1, hobby: -0.08, social: -0.05, sleep: -0.45, rest: -0.18 };

function updateVillager(v, dt, gameMinutes) {
  if (v.state === "walk") {
    const speed = 42 * state.speed;
    let remaining = speed * dt;
    while (remaining > 0 && v.pathIdx < v.path.length) {
      const t = v.path[v.pathIdx];
      const tx = t.x * TILE + 8, ty = t.y * TILE + 14;
      const dx = tx - v.pos.x, dy = ty - v.pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= remaining) {
        v.pos.x = tx; v.pos.y = ty;
        v.tile = { x: t.x, y: t.y };
        v.pathIdx++; remaining -= dist;
      } else {
        v.pos.x += (dx / dist) * remaining;
        v.pos.y += (dy / dist) * remaining;
        v.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 2 : 3) : (dy > 0 ? 0 : 1);
        remaining = 0;
      }
    }
    v.animT += dt * state.speed;
    if (v.pathIdx >= v.path.length && v.pending) arrive(v, v.pending, v.targetSpot);
  } else if (v.state === "idle") {
    v.animT += dt;
    v.emoteTimer -= dt * state.speed;
    if (v.emoteTimer <= 0) { v.emoteTimer = 6 + Math.random() * 10; spawnEmote(v); }
  }
  const rate = v.state === "walk" ? ENERGY_RATE.walk : (ENERGY_RATE[v.act] ?? -0.05);
  v.energy = clamp(v.energy - rate * gameMinutes, 18, 100);
}

function seasonDayOf(day) { return ((day - 1) % DAYS_PER_SEASON) + 1; }

function rollWeather() {
  const r = Math.random();
  if (state.seasonIdx === 3) state.weather = r < 0.45 ? "snow" : r < 0.75 ? "sunny" : "cloudy";
  else {
    const rainChance = state.seasonIdx === 0 ? 0.32 : 0.22;
    state.weather = r < rainChance ? "rain" : r < rainChance + 0.18 ? "cloudy" : "sunny";
  }
}

function startNewDay() {
  state.day++;
  const prevSeason = state.seasonIdx;
  state.seasonIdx = Math.floor((state.day - 1) / DAYS_PER_SEASON) % 4;
  rollWeather();
  const s = seasonNow();
  addJournal(`—— 第 ${state.day} 天 · ${s.name}季第 ${seasonDayOf(state.day)} 天 · ${WEATHERS[state.weather].name} ——`, "day-line");
  if (state.seasonIdx !== prevSeason) {
    addJournal(`${s.name}天来到了小镇，草木与街道悄悄换上了新的颜色。`);
  }
  let harvested = false;
  plots.forEach((p) => {
    if (!s.crop) { p.stage = 0; return; }
    p.stage++;
    if (p.stage > 4) { p.stage = 0; harvested = true; }
  });
  if (harvested && s.crop) addJournal(`向阳农园的${s.crop.name}成熟了，溪谷收获了一批送往集市。`);
}

function advanceTime(dt) {
  const gm = dt * state.speed * GAME_MIN_PER_SEC;
  let newMin = state.minutes + gm;
  if (newMin >= MIN_PER_DAY) {
    processSchedules(MIN_PER_DAY);
    newMin -= MIN_PER_DAY;
    startNewDay();
    villagers.forEach((vv) => { vv.schedIdx = 0; });
  }
  state.minutes = newMin;
  processSchedules(newMin);
  return gm;
}

/* ===================================================================
 * 粒子：炊烟 / 雨雪 / 萤火虫 / 表情
 * =================================================================== */
const smoke = [];
let smokeAcc = 0;
function updateSmoke(dt) {
  smokeAcc += dt * state.speed;
  if (smokeAcc > 0.45) {
    smokeAcc = 0;
    Object.values(BUILDINGS).forEach((b) => {
      if (!b.chimneyWorld || b.occupants.size === 0) return;
      smoke.push({
        x: b.chimneyWorld.x + Math.random() * 4,
        y: b.chimneyWorld.y,
        age: 0, life: 2.6 + Math.random() * 1.4,
        drift: Math.random() * Math.PI * 2,
      });
    });
  }
  for (let i = smoke.length - 1; i >= 0; i--) {
    const p = smoke[i];
    p.age += dt * Math.max(state.speed, 0.001);
    p.y -= 11 * dt * state.speed;
    p.x += Math.sin(p.age * 2 + p.drift) * 6 * dt;
    if (p.age >= p.life) smoke.splice(i, 1);
  }
}
function drawSmoke(g) {
  smoke.forEach((p) => {
    const k = p.age / p.life;
    g.fillStyle = `rgba(225,225,230,${0.5 * (1 - k)})`;
    const s = 2 + k * 4;
    g.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), Math.round(s), Math.round(s));
  });
}

const weatherDrops = Array.from({ length: 130 }, () => ({
  x: Math.random() * VIEW_W, y: Math.random() * VIEW_H,
  sp: 220 + Math.random() * 120, sway: Math.random() * Math.PI * 2,
}));
function updateWeatherFx(dt) {
  if (state.weather === "rain") {
    weatherDrops.forEach((d) => {
      d.y += d.sp * dt; d.x -= d.sp * 0.25 * dt;
      if (d.y > VIEW_H) { d.y = -8; d.x = Math.random() * (VIEW_W + 60); }
    });
  } else if (state.weather === "snow") {
    weatherDrops.forEach((d) => {
      d.y += d.sp * 0.16 * dt;
      d.x += Math.sin(state.elapsed * 1.5 + d.sway) * 12 * dt;
      if (d.y > VIEW_H) { d.y = -4; d.x = Math.random() * VIEW_W; }
    });
  }
}
function drawWeatherFx(g) {
  if (state.weather === "rain") {
    g.strokeStyle = "rgba(178,208,255,0.55)";
    g.lineWidth = 1;
    g.beginPath();
    weatherDrops.forEach((d) => { g.moveTo(d.x, d.y); g.lineTo(d.x - 2, d.y + 7); });
    g.stroke();
  } else if (state.weather === "snow") {
    g.fillStyle = "rgba(245,250,255,0.85)";
    weatherDrops.forEach((d, i) => {
      const s = i % 3 === 0 ? 2 : 1;
      g.fillRect(Math.round(d.x), Math.round(d.y), s, s);
    });
  }
}

const fireflies = Array.from({ length: 16 }, (_, i) => ({
  baseX: i < 10 ? 70 + hash2(i, 1) * 130 : 528 + hash2(i, 2) * 90,
  baseY: i < 10 ? 60 + hash2(i, 3) * 280 : 130 + hash2(i, 4) * 90,
  phase: hash2(i, 5) * Math.PI * 2,
}));
function firefliesActive() {
  return darknessLevel() > 0.3 && state.seasonIdx < 2 && state.weather === "sunny";
}

const emotes = [];
const EMOTE_PIXELS = {
  heart: [[1, 0], [2, 0], [4, 0], [5, 0], [0, 1], [3, 1], [6, 1], [0, 2], [6, 2], [1, 3], [5, 3], [2, 4], [4, 4], [3, 5]],
  note: [[4, 0], [4, 1], [5, 1], [4, 2], [4, 3], [2, 4], [3, 4], [4, 4], [2, 5], [3, 5]],
  dots: [[0, 3], [3, 3], [6, 3]],
  exclaim: [[3, 0], [3, 1], [3, 2], [3, 3], [3, 5]],
};
const EMOTE_COLORS = { heart: "#e05a6e", note: "#5a7fd6", dots: "#8a8a8a", exclaim: "#e08a2e" };
function spawnEmote(v) {
  let type = Math.random() < 0.5 ? "note" : "dots";
  for (const o of villagers) {
    if (o === v || o.state === "inside") continue;
    if (v.friends.includes(o.name) || v.family.includes(o.name)) {
      if (Math.hypot(o.pos.x - v.pos.x, o.pos.y - v.pos.y) < 40) { type = "heart"; break; }
    }
  }
  emotes.push({ v, type, age: 0, life: 1.8 });
}
function updateEmotes(dt) {
  for (let i = emotes.length - 1; i >= 0; i--) {
    emotes[i].age += dt * Math.max(state.speed, 0.001);
    if (emotes[i].age >= emotes[i].life || emotes[i].v.state === "inside") emotes.splice(i, 1);
  }
}
function drawEmotes(g) {
  emotes.forEach((e) => {
    const vx = Math.round(e.v.pos.x), vy = Math.round(e.v.pos.y - 30 - Math.min(4, e.age * 8));
    const alpha = e.age > e.life - 0.4 ? (e.life - e.age) / 0.4 : 1;
    g.globalAlpha = alpha;
    px(g, vx - 6, vy - 5, 12, 11, "#fdf8ec");
    px(g, vx - 7, vy - 4, 1, 9, "#5b3a1e"); px(g, vx + 6, vy - 4, 1, 9, "#5b3a1e");
    px(g, vx - 6, vy - 6, 12, 1, "#5b3a1e"); px(g, vx - 6, vy + 6, 12, 1, "#5b3a1e");
    px(g, vx - 1, vy + 7, 3, 2, "#fdf8ec");
    const color = EMOTE_COLORS[e.type];
    EMOTE_PIXELS[e.type].forEach(([dx, dy]) => px(g, vx - 4 + dx, vy - 3 + dy, 1, 1, color));
    g.globalAlpha = 1;
  });
}

/* ===================================================================
 * 渲染：地表缓存 / 动态水面 / 作物 / 实体 / 光照
 * =================================================================== */
const waterTiles = [];
const bridgeTiles = [];
for (let y = 0; y < MAP_H; y++)
  for (let x = 0; x < MAP_W; x++) {
    if (terrain[y][x] === T_WATER) waterTiles.push({ x, y });
    if (terrain[y][x] === T_BRIDGE) { waterTiles.push({ x, y }); bridgeTiles.push({ x, y }); }
  }

function isLand(x, y) {
  if (!inMap(x, y)) return true;
  const t = terrain[y][x];
  return t !== T_WATER && t !== T_BRIDGE;
}
function isPathLike(x, y) {
  if (!inMap(x, y)) return true;
  const t = terrain[y][x];
  return t === T_PATH || t === T_PLAZA || t === T_BRIDGE;
}

const groundCache = new Map();
function groundFor(seasonIdx, wet) {
  const ck = seasonIdx + (wet ? "w" : "d");
  if (groundCache.has(ck)) return groundCache.get(ck);
  const [c, g] = makeCanvas(VIEW_W, VIEW_H);
  const s = SEASONS[seasonIdx];
  const winter = seasonIdx === 3;
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = terrain[y][x];
      const bx = x * TILE, by = y * TILE;
      if (t === T_WATER || t === T_BRIDGE) { px(g, bx, by, 16, 16, s.waterDeep); continue; }
      if (t === T_GRASS) {
        px(g, bx, by, 16, 16, s.grass[Math.floor(hash2(x, y, 1) * 3)]);
        if (hash2(x, y, 2) < 0.5) px(g, bx + 3 + Math.floor(hash2(x, y, 3) * 9), by + 3 + Math.floor(hash2(x, y, 4) * 9), 2, 2, s.grassDark);
        if (hash2(x, y, 12) < 0.35) {
          const tx = bx + 2 + Math.floor(hash2(x, y, 13) * 11);
          const ty = by + 2 + Math.floor(hash2(x, y, 14) * 10);
          px(g, tx, ty, 1, 3, s.grassDark); px(g, tx + 2, ty + 1, 1, 2, s.grassDark);
        }
        if (winter && hash2(x, y, 15) < 0.2) px(g, bx + Math.floor(hash2(x, y, 16) * 14), by + Math.floor(hash2(x, y, 17) * 14), 1, 1, "#ffffff");
        if (s.flowers && hash2(x, y, 5) < 0.06 && !reserved.has(key(x, y))) {
          const f = s.flowers[Math.floor(hash2(x, y, 6) * s.flowers.length)];
          const fx = bx + 3 + Math.floor(hash2(x, y, 7) * 9);
          const fy = by + 3 + Math.floor(hash2(x, y, 8) * 8);
          px(g, fx, fy + 2, 1, 2, "#3c8a2f");
          px(g, fx - 1, fy, 3, 2, f); px(g, fx, fy - 1, 1, 1, f);
        }
        if (hash2(x, y, 9) < 0.025) px(g, bx + 5, by + 8, 3, 2, winter ? "#c2cfda" : "#9a948a");
      } else if (t === T_PATH) {
        px(g, bx, by, 16, 16, s.path);
        for (let i = 0; i < 4; i++)
          px(g, bx + Math.floor(hash2(x, y, 20 + i) * 13), by + Math.floor(hash2(x, y, 24 + i) * 13), 2, 1, s.pathDark);
        if (!isPathLike(x, y - 1)) px(g, bx, by, 16, 2, s.pathDark);
        if (!isPathLike(x, y + 1)) px(g, bx, by + 14, 16, 2, s.pathDark);
        if (!isPathLike(x - 1, y)) px(g, bx, by, 2, 16, s.pathDark);
        if (!isPathLike(x + 1, y)) px(g, bx + 14, by, 2, 16, s.pathDark);
      } else if (t === T_PLAZA) {
        px(g, bx, by, 16, 16, winter ? "#cfd6dd" : "#b5b1a4");
        g.fillStyle = winter ? "#bcc4cd" : "#9a948a";
        g.fillRect(bx, by + ((x % 2) ? 7 : 15), 16, 1);
        g.fillRect(bx + ((y % 2) ? 7 : 15), by, 1, 16);
        if (hash2(x, y, 30) < 0.18) px(g, bx + 3, by + 3, 4, 3, winter ? "#dde4ea" : "#c4c0b2");
        if (hash2(x, y, 31) < 0.12) px(g, bx + 9, by + 10, 3, 2, winter ? "#aeb8c2" : "#8d8a80");
      } else if (t === T_SOIL) {
        px(g, bx, by, 16, 16, wet ? s.soilWet : s.soil);
        g.fillStyle = "rgba(0,0,0,0.18)";
        g.fillRect(bx, by + 4, 16, 2); g.fillRect(bx, by + 11, 16, 2);
        if (winter) { px(g, bx, by, 16, 3, "#e9f1f6"); px(g, bx + 6, by + 6, 5, 2, "#e9f1f6"); }
      }
    }
  }
  groundCache.set(ck, c);
  return c;
}

function drawWater(g) {
  const s = seasonNow();
  const t = state.elapsed;
  waterTiles.forEach(({ x, y }) => {
    const bx = x * TILE, by = y * TILE;
    px(g, bx, by, 16, 16, s.water);
    px(g, bx, by + 13, 16, 3, s.waterDeep);
    const off = Math.floor(t * 8 + hash2(x, y, 50) * 16) % 16;
    g.fillStyle = "rgba(255,255,255,0.25)";
    g.fillRect(bx + off, by + 3 + Math.floor(hash2(x, y, 51) * 6), Math.min(4, 16 - off), 1);
    const off2 = Math.floor(t * 5 + hash2(x, y, 52) * 16) % 16;
    g.fillStyle = "rgba(255,255,255,0.14)";
    g.fillRect(bx + off2, by + 9, Math.min(3, 16 - off2), 1);
    const edge = state.seasonIdx === 3 ? "#cfe2ee" : "rgba(220,240,252,0.5)";
    if (isLand(x, y - 1)) px(g, bx, by, 16, 2, edge);
    if (isLand(x, y + 1)) px(g, bx, by + 14, 16, 2, edge);
    if (isLand(x - 1, y)) px(g, bx, by, 2, 16, edge);
    if (isLand(x + 1, y)) px(g, bx + 14, by, 2, 16, edge);
  });
}

function drawBridges(g) {
  bridgeTiles.forEach(({ x, y }) => {
    const bx = x * TILE, by = y * TILE;
    px(g, bx, by + 1, 16, 14, "#9a6b3d");
    g.fillStyle = "#7e5530";
    g.fillRect(bx, by + 4, 16, 1); g.fillRect(bx, by + 8, 16, 1); g.fillRect(bx, by + 12, 16, 1);
    px(g, bx, by + 14, 16, 2, "rgba(0,0,0,0.3)");
    if (terrain[y - 1] && terrain[y - 1][x] !== T_BRIDGE) {
      px(g, bx, by - 2, 16, 3, "#b3854a");
      px(g, bx + 1, by - 4, 2, 5, "#8a5a2b"); px(g, bx + 13, by - 4, 2, 5, "#8a5a2b");
    }
    if (terrain[y + 1] && terrain[y + 1][x] !== T_BRIDGE) px(g, bx, by + 13, 16, 2, "#b3854a");
  });
}

function drawCrops(g) {
  const crop = seasonNow().crop;
  if (!crop) return;
  plots.forEach((p) => {
    const bx = p.x * TILE, by = p.y * TILE;
    if (p.stage === 0) {
      px(g, bx + 5, by + 7, 1, 1, "#3a2a18"); px(g, bx + 9, by + 6, 1, 1, "#3a2a18"); px(g, bx + 7, by + 10, 1, 1, "#3a2a18");
    } else if (p.stage === 1) {
      px(g, bx + 7, by + 7, 2, 3, crop.stem); px(g, bx + 6, by + 6, 1, 1, crop.stem);
    } else if (p.stage === 2) {
      px(g, bx + 7, by + 5, 2, 6, crop.stem);
      px(g, bx + 4, by + 6, 3, 2, crop.stem); px(g, bx + 9, by + 7, 3, 2, crop.stem);
    } else if (p.stage === 3) {
      px(g, bx + 3, by + 5, 10, 6, crop.stem);
      px(g, bx + 5, by + 4, 6, 2, crop.stem);
      px(g, bx + 5, by + 6, 2, 2, "rgba(255,255,255,0.18)");
    } else {
      px(g, bx + 3, by + 6, 10, 5, crop.stem);
      px(g, bx + 5, by + 4, 6, 6, crop.fruit);
      px(g, bx + 6, by + 4, 2, 2, "rgba(255,255,255,0.3)");
      px(g, bx + 7, by + 2, 2, 2, crop.top);
    }
  });
}

/* ---------- 光照 ---------- */
const AMBIENT_STOPS = [
  [0,    [16, 22, 52], 0.62], [290, [16, 22, 52], 0.62],
  [330,  [58, 42, 80], 0.45], [390, [214, 120, 70], 0.22],
  [450,  [255, 190, 120], 0.08], [540, [0, 0, 0], 0],
  [990,  [0, 0, 0], 0], [1080, [255, 150, 70], 0.16],
  [1140, [120, 62, 110], 0.34], [1230, [16, 22, 52], 0.55],
  [1320, [16, 22, 52], 0.62], [1440, [16, 22, 52], 0.62],
];
let curAmbient = { c: [0, 0, 0], a: 0 };
function computeAmbient() {
  const m = state.minutes;
  let a = AMBIENT_STOPS[0], b = AMBIENT_STOPS[AMBIENT_STOPS.length - 1];
  for (let i = 0; i < AMBIENT_STOPS.length - 1; i++) {
    if (m >= AMBIENT_STOPS[i][0] && m <= AMBIENT_STOPS[i + 1][0]) { a = AMBIENT_STOPS[i]; b = AMBIENT_STOPS[i + 1]; break; }
  }
  const t = b[0] === a[0] ? 0 : (m - a[0]) / (b[0] - a[0]);
  let c = [0, 1, 2].map((i) => Math.round(lerp(a[1][i], b[1][i], t)));
  let alpha = lerp(a[2], b[2], t);
  if (state.weather === "rain") { alpha = Math.min(0.7, alpha + 0.14); c = [c[0] * 0.6 + 28, c[1] * 0.6 + 34, c[2] * 0.6 + 46].map(Math.round); }
  else if (state.weather === "snow" || state.weather === "cloudy") alpha = Math.min(0.68, alpha + 0.07);
  curAmbient = { c, a: alpha };
}
function darknessLevel() { return curAmbient.a; }

function collectLights() {
  const lights = [];
  if (curAmbient.a > 0.06) lamps.forEach((l) => lights.push({ x: l.x, y: l.y, r: 42, warm: 1 }));
  if (curAmbient.a > 0.08) {
    Object.values(BUILDINGS).forEach((b) => {
      if (b.occupants.size === 0) return;
      b.windowsWorld.forEach((w) => lights.push({ x: w.x + w.w / 2, y: w.y + w.h / 2, r: 28, warm: 0.8 }));
    });
  }
  return lights;
}

function renderLighting(g) {
  const { c, a } = curAmbient;
  if (a <= 0.02) return;
  const lights = collectLights();
  lctx.globalCompositeOperation = "source-over";
  lctx.clearRect(0, 0, VIEW_W, VIEW_H);
  lctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  lctx.fillRect(0, 0, VIEW_W, VIEW_H);
  lctx.globalCompositeOperation = "destination-out";
  lights.forEach((l) => {
    const grad = lctx.createRadialGradient(l.x, l.y, 2, l.x, l.y, l.r);
    grad.addColorStop(0, "rgba(0,0,0,0.92)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    lctx.fillStyle = grad;
    lctx.beginPath(); lctx.arc(l.x, l.y, l.r, 0, Math.PI * 2); lctx.fill();
  });
  g.drawImage(lightCanvas, 0, 0);
  // 暖色泛光与萤火虫
  g.globalCompositeOperation = "lighter";
  const glowK = clamp(a / 0.62, 0, 1);
  lights.forEach((l) => {
    const grad = g.createRadialGradient(l.x, l.y, 1, l.x, l.y, l.r * 0.8);
    grad.addColorStop(0, `rgba(255,184,92,${0.16 * glowK * l.warm})`);
    grad.addColorStop(1, "rgba(255,184,92,0)");
    g.fillStyle = grad;
    g.beginPath(); g.arc(l.x, l.y, l.r * 0.8, 0, Math.PI * 2); g.fill();
  });
  if (firefliesActive()) {
    fireflies.forEach((f) => {
      const t = state.elapsed * 0.7 + f.phase;
      const fx = f.baseX + Math.sin(t) * 14 + Math.sin(t * 2.3) * 5;
      const fy = f.baseY + Math.cos(t * 1.3) * 10;
      const blink = 0.4 + 0.6 * Math.abs(Math.sin(t * 2));
      g.fillStyle = `rgba(214,255,140,${0.7 * blink * glowK})`;
      g.fillRect(Math.round(fx), Math.round(fy), 2, 2);
      const grad = g.createRadialGradient(fx, fy, 0, fx, fy, 7);
      grad.addColorStop(0, `rgba(190,255,120,${0.25 * blink * glowK})`);
      grad.addColorStop(1, "rgba(190,255,120,0)");
      g.fillStyle = grad;
      g.beginPath(); g.arc(fx, fy, 7, 0, Math.PI * 2); g.fill();
    });
  }
  g.globalCompositeOperation = "source-over";
}

/* ---------- 实体 ---------- */
function drawVillagerSprite(g, v) {
  const frame = v.state === "walk" ? (Math.floor(v.animT * 6) % 2) + 1 : 0;
  const sx = Math.round(v.pos.x), sy = Math.round(v.pos.y);
  g.fillStyle = "rgba(0,0,0,0.25)";
  g.beginPath(); g.ellipse(sx, sy, 6, 2.5, 0, 0, Math.PI * 2); g.fill();
  g.drawImage(v.sheet, frame * 16, v.dir * 20, 16, 20, sx - 8, sy - 19, 16, 20);
}

function renderEntities(g) {
  const list = [];
  objects.forEach((o) => list.push(o));
  villagers.forEach((v) => {
    if (v.state === "inside") return;
    list.push({ sortY: v.pos.y, draw: (gg) => drawVillagerSprite(gg, v) });
  });
  list.sort((a, b) => a.sortY - b.sortY);
  list.forEach((o) => o.draw(g));
}

function drawFocusArrow(g) {
  const v = villagers[state.focus];
  if (!v || v.state === "inside") return;
  const ax = Math.round(v.pos.x), ay = Math.round(v.pos.y - 27 + Math.sin(state.elapsed * 5) * 2);
  px(g, ax - 4, ay - 5, 8, 3, "#ffd23f");
  px(g, ax - 3, ay - 2, 6, 2, "#ffd23f");
  px(g, ax - 2, ay, 4, 2, "#f5a623");
  px(g, ax - 1, ay + 2, 2, 2, "#f5a623");
}

function render() {
  computeAmbient();
  ctx.drawImage(groundFor(state.seasonIdx, isWet()), 0, 0);
  drawWater(ctx);
  drawBridges(ctx);
  drawCrops(ctx);
  renderEntities(ctx);
  drawSmoke(ctx);
  drawEmotes(ctx);
  drawWeatherFx(ctx);
  renderLighting(ctx);
  drawFocusArrow(ctx);
}

/* ===================================================================
 * UI 面板与交互
 * =================================================================== */
const timeLabel = document.getElementById("timeLabel");
const dayLabel = document.getElementById("dayLabel");
const seasonLabel = document.getElementById("seasonLabel");
const weatherLabel = document.getElementById("weatherLabel");
const villagerDetails = document.getElementById("villagerDetails");
const rosterList = document.getElementById("rosterList");
const tooltip = document.getElementById("tooltip");

function spotNameOf(v) {
  if (v.state === "inside" && v.buildingId) return BUILDINGS[v.buildingId].name;
  if (v.state === "walk" && v.targetSpot) return v.targetSpot.name;
  const s = spotOf(v, v.spotKey);
  return s ? s.name : "小镇";
}
function activityLabel(v) {
  if (v.state === "walk") return `正前往${spotNameOf(v)}`;
  if (v.state === "inside") return `正在${spotNameOf(v)}里${ACT_VERBS[v.act]}`;
  return `在${spotNameOf(v)}${ACT_VERBS[v.act]}`;
}

function updateClock() {
  const s = seasonNow(), w = WEATHERS[state.weather];
  timeLabel.textContent = formatTime(state.minutes);
  dayLabel.textContent = `第 ${state.day} 天 · ${s.name}季第 ${seasonDayOf(state.day)} 天`;
  seasonLabel.textContent = `${s.icon} ${s.name}`;
  weatherLabel.textContent = `${w.icon} ${w.name}`;
}

function buildRoster() {
  villagers.forEach((v, i) => {
    const btn = document.createElement("button");
    btn.className = "roster-item";
    btn.type = "button";
    const [pc, pg] = makeCanvas(32, 32);
    drawPortrait(pg, v.cfg);
    pc.className = "portrait";
    const span = document.createElement("span");
    span.textContent = v.name;
    btn.append(pc, span);
    btn.addEventListener("click", () => { state.focus = i; refreshRoster(); updateFocusCard(); });
    rosterList.append(btn);
  });
  refreshRoster();
}
function refreshRoster() {
  [...rosterList.children].forEach((el, i) => el.classList.toggle("active", i === state.focus));
}

function updateFocusCard() {
  const v = villagers[state.focus];
  if (!v) return;
  const card = document.createElement("article");
  card.className = "villager-card";
  const [pc, pg] = makeCanvas(32, 32);
  drawPortrait(pg, v.cfg);
  pc.className = "portrait large";
  const info = document.createElement("div");
  info.className = "card-body";
  info.innerHTML = `
    <strong>${v.name}</strong><em>${v.title}</em>
    <p class="card-now">${activityLabel(v)}</p>
    <p>心情：${v.mood}</p>
    <div class="energy-row"><span>精力</span><div class="energy-bar"><i style="width:${Math.round(v.energy)}%"></i></div></div>
    <p>家庭：${v.family.join("、")}　社交圈：${v.friends.join("、")}</p>
    <p class="card-trait">${v.personality}</p>
  `;
  card.append(pc, info);
  villagerDetails.replaceChildren(card);
}

/* ---------- 画布交互 ---------- */
function canvasPos(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (VIEW_W / rect.width),
    y: (event.clientY - rect.top) * (VIEW_H / rect.height),
    rect,
  };
}
function villagerAt(mx, my) {
  for (let i = villagers.length - 1; i >= 0; i--) {
    const v = villagers[i];
    if (v.state === "inside") continue;
    if (mx >= v.pos.x - 9 && mx <= v.pos.x + 9 && my >= v.pos.y - 22 && my <= v.pos.y + 3) return i;
  }
  return -1;
}
canvas.addEventListener("click", (e) => {
  const { x, y } = canvasPos(e);
  const idx = villagerAt(x, y);
  if (idx !== -1) { state.focus = idx; refreshRoster(); updateFocusCard(); }
});
canvas.addEventListener("mousemove", (e) => {
  const { x, y, rect } = canvasPos(e);
  const idx = villagerAt(x, y);
  state.hover = idx;
  if (idx === -1) { tooltip.classList.add("hidden"); canvas.style.cursor = "default"; return; }
  const v = villagers[idx];
  tooltip.textContent = `${v.name} · ${activityLabel(v)}`;
  tooltip.style.left = `${e.clientX - rect.left + 14}px`;
  tooltip.style.top = `${e.clientY - rect.top - 6}px`;
  tooltip.classList.remove("hidden");
  canvas.style.cursor = "pointer";
});
canvas.addEventListener("mouseleave", () => { tooltip.classList.add("hidden"); state.hover = -1; });

document.querySelectorAll(".speed-controls button").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.speed = Number(btn.dataset.speed);
    document.querySelectorAll(".speed-controls button").forEach((b) => b.classList.toggle("active", b === btn));
  });
});

/* ===================================================================
 * 主循环
 * =================================================================== */
let lastTs = 0;
let uiAcc = 0;
function loop(ts) {
  const dt = Math.min(0.1, (ts - lastTs) / 1000 || 0);
  lastTs = ts;
  state.elapsed += dt;
  if (state.speed > 0) {
    const gm = advanceTime(dt);
    villagers.forEach((v) => updateVillager(v, dt, gm));
    updateSmoke(dt);
    updateWeatherFx(dt);
    updateEmotes(dt);
  }
  render();
  uiAcc += dt;
  if (uiAcc > 0.25) {
    uiAcc = 0;
    updateClock();
    updateFocusCard();
  }
  requestAnimationFrame(loop);
}

rollWeather();
buildRoster();
updateClock();
updateFocusCard();
addJournal(`—— 第 1 天 · ${seasonNow().name}季第 1 天 · ${WEATHERS[state.weather].name} ——`, "day-line");
addJournal("清晨六点，薄雾还停在河面上，小镇在鸟鸣中醒来。");
requestAnimationFrame(loop);
})();
