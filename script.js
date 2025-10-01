const canvas = document.getElementById("townCanvas");
const ctx = canvas.getContext("2d");
const timeLabel = document.getElementById("timeLabel");
const dayLabel = document.getElementById("dayLabel");
const villagerDetails = document.getElementById("villagerDetails");
const journalList = document.getElementById("journalList");

const GRID_SIZE = 20;
const TILE_SIZE = canvas.width / GRID_SIZE;

const tileColors = {
  grass: "#1e2135",
  water: "#1a3458",
  road: "#2e334d",
  house: "#6f86ff",
  houseRoof: "#9aa8ff",
  work: "#ffce6f",
  community: "#7ee7b7",
  plaza: "#f28dcd",
  tree: "#2f864d",
};

const townLayout = createTownLayout();

const villagers = createVillagers();
let currentDay = 1;
let currentMinutes = 6 * 60; // start at 6:00
let focusVillagerIndex = 0;
const journalEntries = [];

function createTownLayout() {
  const grid = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => ({ type: "grass" }))
  );

  const mark = (x, y, type) => {
    if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
      grid[y][x].type = type;
    }
  };

  // Main roads
  for (let x = 0; x < GRID_SIZE; x++) {
    mark(x, 9, "road");
    mark(x, 10, "road");
  }
  for (let y = 0; y < GRID_SIZE; y++) {
    mark(9, y, "road");
    mark(10, y, "road");
  }

  // River and park
  for (let y = 2; y <= 6; y++) {
    mark(3, y, "water");
  }
  mark(4, 4, "community"); // 公园中心
  mark(4, 5, "tree");
  mark(5, 5, "tree");

  // Houses cluster west
  const housePositions = [
    [2, 12],
    [3, 14],
    [5, 13],
    [6, 15],
    [4, 16],
  ];
  housePositions.forEach(([x, y]) => {
    mark(x, y, "house");
    mark(x, y - 1, "houseRoof");
  });

  // Workspaces east
  const workPositions = [
    [15, 5],
    [16, 7],
    [14, 12],
    [17, 14],
  ];
  workPositions.forEach(([x, y]) => {
    mark(x, y, "work");
  });

  // Community buildings south
  const communityPositions = [
    [12, 16],
    [13, 15],
    [15, 17],
  ];
  communityPositions.forEach(([x, y]) => mark(x, y, "community"));
  mark(12, 15, "plaza");

  return {
    grid,
    houses: housePositions.map(([x, y]) => ({ x, y })),
    workplaces: workPositions.map(([x, y]) => ({ x, y })),
    community: communityPositions.map(([x, y]) => ({ x, y })),
    park: { x: 4, y: 4 },
    cafe: { x: 13, y: 15 },
    plaza: { x: 12, y: 15 },
  };
}

function createVillagers() {
  const { houses, workplaces, park, cafe, plaza } = townLayout;
  const people = [
    {
      name: "朵拉",
      color: "#ff9cdc",
      home: houses[0],
      job: { title: "像素画师", location: workplaces[0] },
      family: ["鲁本"],
      friends: ["溪谷", "漫星"],
      hobbySpot: park,
      personality: "对色彩极度敏感，总能在街角发现新的灵感。",
    },
    {
      name: "鲁本",
      color: "#ffc46f",
      home: houses[0],
      job: { title: "独立面包师", location: workplaces[1] },
      family: ["朵拉"],
      friends: ["漫星"],
      hobbySpot: cafe,
      personality: "清晨烘焙香气弥漫小镇，是镇民赖以起床的动力。",
    },
    {
      name: "溪谷",
      color: "#7ee7b7",
      home: houses[2],
      job: { title: "生态设计师", location: workplaces[2] },
      family: ["夏禾"],
      friends: ["朵拉", "海澜"],
      hobbySpot: park,
      personality: "负责维护河岸绿植，时常组织环保讲座。",
    },
    {
      name: "夏禾",
      color: "#9aa8ff",
      home: houses[2],
      job: { title: "社区老师", location: workplaces[3] },
      family: ["溪谷"],
      friends: ["海澜"],
      hobbySpot: plaza,
      personality: "喜欢在广场上为孩子们排练剧场，笑声不断。",
    },
    {
      name: "漫星",
      color: "#f28dcd",
      home: houses[3],
      job: { title: "天文写作者", location: park },
      family: ["海澜"],
      friends: ["朵拉", "鲁本"],
      hobbySpot: plaza,
      personality: "夜晚写作时会把星辰故事讲给邻居听。",
    },
    {
      name: "海澜",
      color: "#64a1ff",
      home: houses[4],
      job: { title: "港口导航员", location: { x: 3, y: 3 } },
      family: ["漫星"],
      friends: ["溪谷", "夏禾"],
      hobbySpot: cafe,
      personality: "昼夜守护河道灯塔，是镇子的守望者。",
    },
  ];

  return people.map((person) => ({
    ...person,
    position: { x: person.home.x + 0.5, y: person.home.y + 0.5 },
    currentActivity: "home",
    energy: 100,
    mood: "平静",
  }));
}

function drawTown() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const tile = townLayout.grid[y][x];
      const color = tileColors[tile.type] || tileColors.grass;
      ctx.fillStyle = color;
      ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);

      if (tile.type === "houseRoof") {
        ctx.fillStyle = "#c5d0ff";
        ctx.fillRect(
          x * TILE_SIZE + TILE_SIZE * 0.1,
          y * TILE_SIZE + TILE_SIZE * 0.1,
          TILE_SIZE * 0.8,
          TILE_SIZE * 0.3
        );
      }

      if (tile.type === "tree") {
        ctx.fillStyle = "#175634";
        ctx.fillRect(
          x * TILE_SIZE + TILE_SIZE * 0.25,
          y * TILE_SIZE + TILE_SIZE * 0.15,
          TILE_SIZE * 0.5,
          TILE_SIZE * 0.5
        );
      }
    }
  }

  // Decorative grid lines
  ctx.strokeStyle = "rgba(19, 22, 34, 0.4)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= GRID_SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(i * TILE_SIZE, 0);
    ctx.lineTo(i * TILE_SIZE, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * TILE_SIZE);
    ctx.lineTo(canvas.width, i * TILE_SIZE);
    ctx.stroke();
  }
}

function drawVillagers() {
  ctx.font = `${Math.max(12, TILE_SIZE * 0.45)}px "Noto Sans SC", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  villagers.forEach((villager, index) => {
    const size = TILE_SIZE * 0.6;
    const centerX = villager.position.x * TILE_SIZE;
    const centerY = villager.position.y * TILE_SIZE;

    ctx.fillStyle = villager.color;
    ctx.fillRect(centerX - size / 2, centerY - size / 2, size, size);

    if (index === focusVillagerIndex) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.strokeRect(centerX - size / 2, centerY - size / 2, size, size);
    }

    ctx.fillStyle = "#0c0f18";
    ctx.fillRect(centerX - size / 4, centerY - size / 4, size / 8, size / 4);
    ctx.fillRect(centerX + size / 8, centerY - size / 4, size / 8, size / 4);

    ctx.fillStyle = "#f8fbff";
    ctx.fillText(villager.name, centerX, centerY - size / 2 - TILE_SIZE * 0.1);
  });
}

function getActivityPhase(hour) {
  if (hour >= 6 && hour < 8) return "home";
  if (hour >= 8 && hour < 9) return "commuteMorning";
  if (hour >= 9 && hour < 12) return "work";
  if (hour >= 12 && hour < 13) return "socialLunch";
  if (hour >= 13 && hour < 17) return "work";
  if (hour >= 17 && hour < 18) return "commuteEvening";
  if (hour >= 18 && hour < 21) return "socialEvening";
  return "home"; // 21:00 - 24:00 & 0:00 - 6:00
}

function getTargetForActivity(villager, phase) {
  switch (phase) {
    case "home":
      return villager.home;
    case "work":
      return villager.job.location;
    case "socialLunch":
      return villager.hobbySpot;
    case "socialEvening":
      return villager.friends.includes(villagers[focusVillagerIndex].name)
        ? villagers[focusVillagerIndex].home
        : villager.hobbySpot;
    case "commuteMorning":
      return midpoint(villager.home, villager.job.location);
    case "commuteEvening":
      return midpoint(villager.job.location, villager.hobbySpot);
    default:
      return villager.home;
  }
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function updateVillagers(deltaMinutes) {
  const hour = (currentMinutes / 60) % 24;
  const phase = getActivityPhase(hour);

  villagers.forEach((villager) => {
    const target = getTargetForActivity(villager, phase);
    const speed = 0.008 * deltaMinutes;
    villager.position.x += (target.x + 0.5 - villager.position.x) * speed;
    villager.position.y += (target.y + 0.5 - villager.position.y) * speed;

    if (villager.currentActivity !== phase) {
      villager.currentActivity = phase;
      villager.energy = Math.min(100, villager.energy + 5);
      villager.mood = deriveMood(villager, phase);
      addJournalEntry(villager, phase, hour);
    }
  });
}

function deriveMood(villager, phase) {
  switch (phase) {
    case "work":
      return villager.job.title.includes("老师") ? "充满灵感" : "专注";
    case "socialLunch":
      return "轻松";
    case "socialEvening":
      return "兴奋";
    case "home":
      return "安宁";
    default:
      return "专注";
  }
}

function formatTime(minutes) {
  const hour = Math.floor((minutes / 60) % 24);
  const minute = Math.floor(minutes % 60);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function addJournalEntry(villager, phase, hour) {
  const descriptions = {
    home: `${villager.name}在家里放松，与家人共享安静时光。`,
    commuteMorning: `${villager.name}迈着轻快的步伐穿过主街，准备开始一天的工作。`,
    work: `${villager.name}在${villager.job.title}的岗位上挥洒才华。`,
    socialLunch: `${villager.name}午间在公共空间与朋友交换灵感。`,
    commuteEvening: `${villager.name}结束忙碌的一天，沿着街道回到熟悉的灯光里。`,
    socialEvening: `${villager.name}与亲密伙伴相聚，谈论今天的小确幸。`,
  };

  const entry = document.createElement("li");
  entry.textContent = `${formatTime(currentMinutes)} ｜ ${descriptions[phase] || `${villager.name}享受着宁静的小镇夜色。`}`;
  journalEntries.unshift(entry);
  while (journalEntries.length > 6) {
    journalEntries.pop();
  }
  journalList.replaceChildren(...journalEntries);
}

function updateInfoPanel() {
  timeLabel.textContent = `时间：${formatTime(currentMinutes)}`;
  dayLabel.textContent = `第 ${currentDay} 天`;

  const villager = villagers[focusVillagerIndex];
  const card = document.createElement("article");
  card.className = "villager-card";
  card.innerHTML = `
    <strong>${villager.name}</strong><br />
    ${villager.job.title}<br />
    心情：${villager.mood} ｜ 精力：${villager.energy}%<br />
    家庭：${villager.family.join("、")}<br />
    社交圈：${villager.friends.join("、")}<br />
    特质：${villager.personality}
  `;
  villagerDetails.replaceChildren(card);
}

function tick() {
  currentMinutes += 10; // advance 10 minutes each tick
  if (currentMinutes >= 24 * 60) {
    currentMinutes -= 24 * 60;
    currentDay += 1;
    focusVillagerIndex = (focusVillagerIndex + 1) % villagers.length;
    journalEntries.length = 0;
    journalList.replaceChildren();
    addJournalEntry(villagers[focusVillagerIndex], "home", 6);
  }
  const deltaMinutes = 10;
  updateVillagers(deltaMinutes);
  updateInfoPanel();
  draw();
}

function draw() {
  drawTown();
  drawVillagers();
}

function startSimulation() {
  drawTown();
  addJournalEntry(villagers[focusVillagerIndex], "home", 6);
  updateInfoPanel();
  drawVillagers();
  setInterval(tick, 900);
}

function getVillagerAtPosition(x, y) {
  const canvasRect = canvas.getBoundingClientRect();
  const canvasX = x - canvasRect.left;
  const canvasY = y - canvasRect.top;

  return villagers.findIndex((villager) => {
    const size = TILE_SIZE * 0.6;
    const centerX = villager.position.x * TILE_SIZE;
    const centerY = villager.position.y * TILE_SIZE;

    return (
      canvasX >= centerX - size / 2 &&
      canvasX <= centerX + size / 2 &&
      canvasY >= centerY - size / 2 &&
      canvasY <= centerY + size / 2
    );
  });
}

function handleCanvasClick(event) {
  const villagerIndex = getVillagerAtPosition(event.clientX, event.clientY);
  if (villagerIndex !== -1) {
    focusVillagerIndex = villagerIndex;
    updateInfoPanel();
    draw();
  }
}

canvas.addEventListener("click", handleCanvasClick);

startSimulation();
