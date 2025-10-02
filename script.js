const canvas = document.getElementById("townCanvas");
const ctx = canvas.getContext("2d");
const timeLabel = document.getElementById("timeLabel");
const dayLabel = document.getElementById("dayLabel");
const villagerDetails = document.getElementById("villagerDetails");
const journalList = document.getElementById("journalList");

const GRID_SIZE = 20;
const TILE_SIZE = canvas.width / GRID_SIZE;

const tileColors = {
  grass: "#1f2a3e",
  water: "#183052",
  road: "#3a3f58",
  house: "#6f86ff",
  houseRoof: "#9aa8ff",
  work: "#ffce6f",
  community: "#7ee7b7",
  plaza: "#f28dcd",
  tree: "#2f864d",
  farmland: "#5b3a23",
  farmlandWet: "#4a2f1b",
  farmlandCrop: "#5b3a23",
  fence: "#cfae7a",
  bridge: "#8c6242",
  flowerbed: "#2a354d",
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

  const mark = (x, y, type, extra = {}) => {
    if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
      grid[y][x] = { type, ...extra };
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
    mark(3, y, "water", { edge: y === 2 ? "top" : y === 6 ? "bottom" : null });
    mark(4, y, "water", { edge: "bank" });
  }
  mark(4, 4, "community", { variant: "gazebo" });
  mark(4, 5, "tree");
  mark(6, 4, "tree", { variant: "pine" });

  // Houses cluster west
  const housePositions = [
    [2, 12],
    [3, 14],
    [5, 13],
    [6, 15],
    [4, 16],
  ];
  housePositions.forEach(([x, y], index) => {
    mark(x, y, "house", { variant: index % 2 === 0 ? "blue" : "sand" });
    mark(x, y - 1, "houseRoof", { variant: index % 2 === 0 ? "blue" : "sand" });
    mark(x - 1, y, "flowerbed", { variant: "lilac" });
  });

  // Workspaces east
  const workPositions = [
    [15, 5],
    [16, 7],
    [14, 12],
    [17, 14],
  ];
  workPositions.forEach(([x, y], index) => {
    mark(x, y, "work", { variant: index % 2 === 0 ? "atelier" : "bakery" });
  });

  // Community buildings south
  const communityPositions = [
    [12, 16],
    [13, 15],
    [15, 17],
  ];
  communityPositions.forEach(([x, y], index) =>
    mark(x, y, "community", { variant: index === 0 ? "museum" : "cafe" })
  );
  mark(12, 15, "plaza");

  // Farmland south-west
  for (let y = 6; y <= 8; y++) {
    for (let x = 6; x <= 8; x++) {
      const pattern = (x + y) % 3;
      const type = pattern === 0 ? "farmland" : pattern === 1 ? "farmlandCrop" : "farmlandWet";
      mark(x, y, type, { season: pattern });
    }
  }
  const grassFlowerPositions = [
    [1, 13],
    [6, 16],
    [11, 14],
    [13, 11],
  ];
  grassFlowerPositions.forEach(([x, y]) => {
    if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
      const cell = grid[y][x];
      if (cell.type === "grass") {
        cell.variant = "lilac";
      }
    }
  });
  const fences = [
    { x: 6, y: 5, orientation: "horizontal" },
    { x: 7, y: 5, orientation: "horizontal" },
    { x: 8, y: 5, orientation: "horizontal" },
    { x: 5, y: 6, orientation: "vertical" },
    { x: 5, y: 7, orientation: "vertical" },
    { x: 5, y: 8, orientation: "vertical" },
  ];
  const scarecrows = [{ x: 6.5, y: 7.2 }];
  mark(7, 6, "bridge");

  return {
    grid,
    houses: housePositions.map(([x, y]) => ({ x, y })),
    workplaces: workPositions.map(([x, y]) => ({ x, y })),
    community: communityPositions.map(([x, y]) => ({ x, y })),
    park: { x: 4, y: 4 },
    cafe: { x: 13, y: 15 },
    plaza: { x: 12, y: 15 },
    decorations: {
      lamps: [
        { x: 8.5, y: 8.8 },
        { x: 10.5, y: 9.2 },
        { x: 12.5, y: 15.5 },
      ],
      crates: [
        { x: 16.5, y: 7.6 },
        { x: 14.5, y: 12.4 },
      ],
      looseFlowers: [
        { x: 11.5, y: 14.3 },
        { x: 3.5, y: 15.5 },
      ],
      fences,
      scarecrows,
    },
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
      drawTile(x, y, tile);
    }
  }
  drawDecorations();
  drawAmbientGrid();
}

function drawTile(x, y, tile) {
  const renderer = tileRenderers[tile.type] || tileRenderers.grass;
  renderer(x, y, tile);
}

const tileRenderers = {
  grass: (x, y, tile) => {
    const baseX = x * TILE_SIZE;
    const baseY = y * TILE_SIZE;
    ctx.fillStyle = tileColors.grass;
    ctx.fillRect(baseX, baseY, TILE_SIZE, TILE_SIZE);

    ctx.fillStyle = "#24324a";
    ctx.fillRect(baseX, baseY + TILE_SIZE * 0.7, TILE_SIZE, TILE_SIZE * 0.3);

    ctx.fillStyle = "#294063";
    const pattern = (x + y) % 2 === 0;
    if (pattern) {
      ctx.fillRect(baseX + TILE_SIZE * 0.2, baseY + TILE_SIZE * 0.25, TILE_SIZE * 0.15, TILE_SIZE * 0.15);
      ctx.fillRect(baseX + TILE_SIZE * 0.55, baseY + TILE_SIZE * 0.1, TILE_SIZE * 0.12, TILE_SIZE * 0.12);
    } else {
      ctx.fillRect(baseX + TILE_SIZE * 0.65, baseY + TILE_SIZE * 0.5, TILE_SIZE * 0.12, TILE_SIZE * 0.12);
    }

    if (tile.variant === "lilac") {
      ctx.fillStyle = "#f7a7f1";
      ctx.fillRect(baseX + TILE_SIZE * 0.15, baseY + TILE_SIZE * 0.65, TILE_SIZE * 0.1, TILE_SIZE * 0.1);
      ctx.fillStyle = "#cddc78";
      ctx.fillRect(baseX + TILE_SIZE * 0.15, baseY + TILE_SIZE * 0.75, TILE_SIZE * 0.1, TILE_SIZE * 0.05);
    }
  },
  water: (x, y, tile) => {
    const baseX = x * TILE_SIZE;
    const baseY = y * TILE_SIZE;
    const gradient = ctx.createLinearGradient(baseX, baseY, baseX, baseY + TILE_SIZE);
    gradient.addColorStop(0, "#1f466d");
    gradient.addColorStop(1, "#12263f");
    ctx.fillStyle = gradient;
    ctx.fillRect(baseX, baseY, TILE_SIZE, TILE_SIZE);

    ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
    ctx.fillRect(baseX + TILE_SIZE * 0.2, baseY + TILE_SIZE * 0.2, TILE_SIZE * 0.6, TILE_SIZE * 0.1);
    if (tile.edge === "bank") {
      ctx.fillStyle = "#1c2a44";
      ctx.fillRect(baseX, baseY, TILE_SIZE * 0.2, TILE_SIZE);
    }
    if (tile.edge === "top") {
      ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
      ctx.fillRect(baseX + TILE_SIZE * 0.15, baseY + TILE_SIZE * 0.05, TILE_SIZE * 0.7, TILE_SIZE * 0.07);
    }
    if (tile.edge === "bottom") {
      ctx.fillStyle = "rgba(12, 20, 36, 0.6)";
      ctx.fillRect(baseX, baseY + TILE_SIZE * 0.75, TILE_SIZE, TILE_SIZE * 0.15);
    }
  },
  road: (x, y) => {
    const baseX = x * TILE_SIZE;
    const baseY = y * TILE_SIZE;
    ctx.fillStyle = tileColors.road;
    ctx.fillRect(baseX, baseY, TILE_SIZE, TILE_SIZE);

    ctx.fillStyle = "#2a2e45";
    ctx.fillRect(baseX, baseY, TILE_SIZE, TILE_SIZE * 0.2);
    ctx.fillRect(baseX, baseY + TILE_SIZE * 0.8, TILE_SIZE, TILE_SIZE * 0.2);

    ctx.fillStyle = "#cfd4ff";
    if ((x + y) % 2 === 0) {
      ctx.fillRect(baseX + TILE_SIZE * 0.4, baseY + TILE_SIZE * 0.45, TILE_SIZE * 0.2, TILE_SIZE * 0.05);
    }
  },
  bridge: (x, y) => {
    const baseX = x * TILE_SIZE;
    const baseY = y * TILE_SIZE;
    ctx.fillStyle = tileColors.bridge;
    ctx.fillRect(baseX, baseY, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = "#a77446";
    ctx.fillRect(baseX, baseY + TILE_SIZE * 0.3, TILE_SIZE, TILE_SIZE * 0.1);
    ctx.fillRect(baseX, baseY + TILE_SIZE * 0.6, TILE_SIZE, TILE_SIZE * 0.1);
  },
  house: (x, y, tile) => {
    const baseX = x * TILE_SIZE;
    const baseY = y * TILE_SIZE;
    const bodyColor = tile.variant === "sand" ? "#c6a16d" : tileColors.house;
    ctx.fillStyle = bodyColor;
    ctx.fillRect(baseX, baseY, TILE_SIZE, TILE_SIZE);

    ctx.fillStyle = "#4d3c30";
    ctx.fillRect(baseX + TILE_SIZE * 0.4, baseY + TILE_SIZE * 0.55, TILE_SIZE * 0.2, TILE_SIZE * 0.35);

    ctx.fillStyle = "#f8f2cd";
    ctx.fillRect(baseX + TILE_SIZE * 0.15, baseY + TILE_SIZE * 0.25, TILE_SIZE * 0.2, TILE_SIZE * 0.2);
    ctx.fillRect(baseX + TILE_SIZE * 0.65, baseY + TILE_SIZE * 0.25, TILE_SIZE * 0.2, TILE_SIZE * 0.2);
  },
  houseRoof: (x, y, tile) => {
    const baseX = x * TILE_SIZE;
    const baseY = y * TILE_SIZE;
    const roofColor = tile.variant === "sand" ? "#b66c4f" : tileColors.houseRoof;
    ctx.fillStyle = roofColor;
    ctx.fillRect(baseX, baseY, TILE_SIZE, TILE_SIZE);

    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.fillRect(baseX, baseY, TILE_SIZE, TILE_SIZE * 0.2);
  },
  work: (x, y, tile) => {
    const baseX = x * TILE_SIZE;
    const baseY = y * TILE_SIZE;
    ctx.fillStyle = tileColors.work;
    ctx.fillRect(baseX, baseY, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = "#9e7632";
    ctx.fillRect(baseX, baseY + TILE_SIZE * 0.75, TILE_SIZE, TILE_SIZE * 0.25);
    ctx.fillStyle = tile.variant === "bakery" ? "#fdf1c7" : "#c7effa";
    ctx.fillRect(baseX + TILE_SIZE * 0.2, baseY + TILE_SIZE * 0.2, TILE_SIZE * 0.6, TILE_SIZE * 0.3);
  },
  community: (x, y, tile) => {
    const baseX = x * TILE_SIZE;
    const baseY = y * TILE_SIZE;
    ctx.fillStyle = tileColors.community;
    ctx.fillRect(baseX, baseY, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(baseX + TILE_SIZE * 0.3, baseY + TILE_SIZE * 0.25, TILE_SIZE * 0.4, TILE_SIZE * 0.25);
    if (tile.variant === "museum") {
      ctx.fillStyle = "#e2c588";
      ctx.fillRect(baseX + TILE_SIZE * 0.4, baseY + TILE_SIZE * 0.55, TILE_SIZE * 0.2, TILE_SIZE * 0.25);
    }
  },
  plaza: (x, y) => {
    const baseX = x * TILE_SIZE;
    const baseY = y * TILE_SIZE;
    ctx.fillStyle = tileColors.plaza;
    ctx.fillRect(baseX, baseY, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = "#ffb3df";
    ctx.fillRect(baseX + TILE_SIZE * 0.1, baseY + TILE_SIZE * 0.1, TILE_SIZE * 0.8, TILE_SIZE * 0.15);
    ctx.fillRect(baseX + TILE_SIZE * 0.1, baseY + TILE_SIZE * 0.45, TILE_SIZE * 0.8, TILE_SIZE * 0.15);
  },
  tree: (x, y, tile) => {
    const baseX = x * TILE_SIZE;
    const baseY = y * TILE_SIZE;
    ctx.fillStyle = "#3a2f25";
    ctx.fillRect(baseX + TILE_SIZE * 0.4, baseY + TILE_SIZE * 0.45, TILE_SIZE * 0.2, TILE_SIZE * 0.5);
    const canopyColor = tile.variant === "pine" ? "#2f7049" : tileColors.tree;
    ctx.fillStyle = canopyColor;
    ctx.fillRect(baseX + TILE_SIZE * 0.15, baseY + TILE_SIZE * 0.1, TILE_SIZE * 0.7, TILE_SIZE * 0.6);
    ctx.fillStyle = "#4bbd7b";
    ctx.fillRect(baseX + TILE_SIZE * 0.2, baseY + TILE_SIZE * 0.2, TILE_SIZE * 0.2, TILE_SIZE * 0.2);
  },
  farmland: (x, y, tile) => drawFarmland(x, y, tileColors.farmland, tile.season),
  farmlandCrop: (x, y, tile) => {
    drawFarmland(x, y, tileColors.farmlandCrop, tile.season);
    const baseX = x * TILE_SIZE;
    const baseY = y * TILE_SIZE;
    ctx.fillStyle = "#6fd185";
    ctx.fillRect(baseX + TILE_SIZE * 0.35, baseY + TILE_SIZE * 0.25, TILE_SIZE * 0.1, TILE_SIZE * 0.35);
    ctx.fillRect(baseX + TILE_SIZE * 0.55, baseY + TILE_SIZE * 0.3, TILE_SIZE * 0.1, TILE_SIZE * 0.3);
    ctx.fillStyle = "#9adf8f";
    ctx.fillRect(baseX + TILE_SIZE * 0.35, baseY + TILE_SIZE * 0.2, TILE_SIZE * 0.3, TILE_SIZE * 0.1);
  },
  farmlandWet: (x, y, tile) => drawFarmland(x, y, tileColors.farmlandWet, tile.season),
  fence: (x, y) => {
    const baseX = x * TILE_SIZE;
    const baseY = y * TILE_SIZE;
    ctx.fillStyle = tileColors.fence;
    ctx.fillRect(baseX + TILE_SIZE * 0.1, baseY + TILE_SIZE * 0.65, TILE_SIZE * 0.8, TILE_SIZE * 0.2);
    ctx.fillRect(baseX + TILE_SIZE * 0.2, baseY + TILE_SIZE * 0.3, TILE_SIZE * 0.15, TILE_SIZE * 0.55);
    ctx.fillRect(baseX + TILE_SIZE * 0.65, baseY + TILE_SIZE * 0.3, TILE_SIZE * 0.15, TILE_SIZE * 0.55);
  },
  flowerbed: (x, y) => {
    const baseX = x * TILE_SIZE;
    const baseY = y * TILE_SIZE;
    ctx.fillStyle = tileColors.flowerbed;
    ctx.fillRect(baseX, baseY, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = "#f3d572";
    ctx.fillRect(baseX + TILE_SIZE * 0.2, baseY + TILE_SIZE * 0.25, TILE_SIZE * 0.6, TILE_SIZE * 0.15);
    ctx.fillStyle = "#ef7fb0";
    ctx.fillRect(baseX + TILE_SIZE * 0.3, baseY + TILE_SIZE * 0.55, TILE_SIZE * 0.15, TILE_SIZE * 0.15);
    ctx.fillRect(baseX + TILE_SIZE * 0.55, baseY + TILE_SIZE * 0.55, TILE_SIZE * 0.15, TILE_SIZE * 0.15);
  },
};

function drawFarmland(x, y, baseColor, season = 0) {
  const baseX = x * TILE_SIZE;
  const baseY = y * TILE_SIZE;
  ctx.fillStyle = baseColor;
  ctx.fillRect(baseX, baseY, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = "#3f2715";
  ctx.fillRect(baseX, baseY + TILE_SIZE * 0.2, TILE_SIZE, TILE_SIZE * 0.08);
  ctx.fillRect(baseX, baseY + TILE_SIZE * 0.5, TILE_SIZE, TILE_SIZE * 0.08);
  if (season === 1) {
    ctx.fillStyle = "#7f4f26";
    ctx.fillRect(baseX, baseY + TILE_SIZE * 0.35, TILE_SIZE, TILE_SIZE * 0.05);
  } else if (season === 2) {
    ctx.fillStyle = "#8f5e2f";
    ctx.fillRect(baseX, baseY + TILE_SIZE * 0.65, TILE_SIZE, TILE_SIZE * 0.05);
  }
}

function drawDecorations() {
  const { decorations } = townLayout;
  if (!decorations) return;

  decorations.lamps?.forEach((lamp) => drawLamp(lamp));
  decorations.crates?.forEach((crate) => drawCrate(crate));
  decorations.looseFlowers?.forEach((bed) => drawLooseFlowers(bed));
  decorations.fences?.forEach((segment) => drawFenceSegment(segment));
  decorations.scarecrows?.forEach((crow) => drawScarecrow(crow));
}

function drawLamp({ x, y }) {
  const centerX = x * TILE_SIZE;
  const centerY = y * TILE_SIZE;
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.beginPath();
  ctx.ellipse(centerX, centerY + TILE_SIZE * 0.3, TILE_SIZE * 0.25, TILE_SIZE * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#202a3f";
  ctx.fillRect(centerX - TILE_SIZE * 0.05, centerY - TILE_SIZE * 0.4, TILE_SIZE * 0.1, TILE_SIZE * 0.5);

  const lanternY = centerY - TILE_SIZE * 0.5;
  ctx.fillStyle = "#ffd27d";
  ctx.fillRect(centerX - TILE_SIZE * 0.12, lanternY, TILE_SIZE * 0.24, TILE_SIZE * 0.18);

  const glow = ctx.createRadialGradient(centerX, lanternY + TILE_SIZE * 0.09, 2, centerX, lanternY + TILE_SIZE * 0.09, TILE_SIZE * 0.8);
  glow.addColorStop(0, "rgba(255, 210, 125, 0.6)");
  glow.addColorStop(1, "rgba(255, 210, 125, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(centerX, lanternY + TILE_SIZE * 0.09, TILE_SIZE * 0.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawCrate({ x, y }) {
  const baseX = x * TILE_SIZE - TILE_SIZE * 0.3;
  const baseY = y * TILE_SIZE - TILE_SIZE * 0.3;
  ctx.fillStyle = "#9c6b39";
  ctx.fillRect(baseX, baseY, TILE_SIZE * 0.6, TILE_SIZE * 0.6);
  ctx.strokeStyle = "#d6a25d";
  ctx.lineWidth = 2;
  ctx.strokeRect(baseX, baseY, TILE_SIZE * 0.6, TILE_SIZE * 0.6);
  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.lineTo(baseX + TILE_SIZE * 0.6, baseY + TILE_SIZE * 0.6);
  ctx.moveTo(baseX + TILE_SIZE * 0.6, baseY);
  ctx.lineTo(baseX, baseY + TILE_SIZE * 0.6);
  ctx.stroke();
}

function drawLooseFlowers({ x, y }) {
  const baseX = x * TILE_SIZE - TILE_SIZE * 0.25;
  const baseY = y * TILE_SIZE - TILE_SIZE * 0.2;
  ctx.fillStyle = "#274066";
  ctx.fillRect(baseX, baseY, TILE_SIZE * 0.5, TILE_SIZE * 0.3);
  ctx.fillStyle = "#f7a7f1";
  ctx.fillRect(baseX + TILE_SIZE * 0.1, baseY + TILE_SIZE * 0.05, TILE_SIZE * 0.1, TILE_SIZE * 0.1);
  ctx.fillStyle = "#cfe77f";
  ctx.fillRect(baseX + TILE_SIZE * 0.3, baseY + TILE_SIZE * 0.1, TILE_SIZE * 0.1, TILE_SIZE * 0.1);
}

function drawFenceSegment({ x, y, orientation }) {
  const baseX = x * TILE_SIZE;
  const baseY = y * TILE_SIZE;
  ctx.fillStyle = tileColors.fence;

  if (orientation === "horizontal") {
    ctx.fillRect(baseX, baseY + TILE_SIZE * 0.15, TILE_SIZE, TILE_SIZE * 0.18);
    ctx.fillRect(baseX + TILE_SIZE * 0.05, baseY - TILE_SIZE * 0.05, TILE_SIZE * 0.16, TILE_SIZE * 0.45);
    ctx.fillRect(baseX + TILE_SIZE * 0.79, baseY - TILE_SIZE * 0.05, TILE_SIZE * 0.16, TILE_SIZE * 0.45);
  } else {
    ctx.fillRect(baseX + TILE_SIZE * 0.38, baseY, TILE_SIZE * 0.18, TILE_SIZE);
    ctx.fillRect(baseX + TILE_SIZE * 0.2, baseY + TILE_SIZE * 0.15, TILE_SIZE * 0.46, TILE_SIZE * 0.1);
    ctx.fillRect(baseX + TILE_SIZE * 0.2, baseY + TILE_SIZE * 0.55, TILE_SIZE * 0.46, TILE_SIZE * 0.1);
  }

  ctx.fillStyle = "#efd7a2";
  if (orientation === "horizontal") {
    ctx.fillRect(baseX + TILE_SIZE * 0.02, baseY + TILE_SIZE * 0.22, TILE_SIZE * 0.25, TILE_SIZE * 0.07);
    ctx.fillRect(baseX + TILE_SIZE * 0.73, baseY + TILE_SIZE * 0.22, TILE_SIZE * 0.25, TILE_SIZE * 0.07);
  } else {
    ctx.fillRect(baseX + TILE_SIZE * 0.42, baseY + TILE_SIZE * 0.05, TILE_SIZE * 0.1, TILE_SIZE * 0.25);
    ctx.fillRect(baseX + TILE_SIZE * 0.42, baseY + TILE_SIZE * 0.45, TILE_SIZE * 0.1, TILE_SIZE * 0.25);
  }
}

function drawScarecrow({ x, y }) {
  const baseX = x * TILE_SIZE;
  const baseY = y * TILE_SIZE;
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.beginPath();
  ctx.ellipse(baseX, baseY + TILE_SIZE * 0.25, TILE_SIZE * 0.35, TILE_SIZE * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#c2762b";
  ctx.fillRect(baseX - TILE_SIZE * 0.05, baseY - TILE_SIZE * 0.3, TILE_SIZE * 0.1, TILE_SIZE * 0.5);
  ctx.fillRect(baseX - TILE_SIZE * 0.35, baseY - TILE_SIZE * 0.2, TILE_SIZE * 0.7, TILE_SIZE * 0.08);

  ctx.fillStyle = "#f6dda5";
  ctx.fillRect(baseX - TILE_SIZE * 0.15, baseY - TILE_SIZE * 0.45, TILE_SIZE * 0.3, TILE_SIZE * 0.2);
  ctx.fillStyle = "#754b24";
  ctx.fillRect(baseX - TILE_SIZE * 0.18, baseY - TILE_SIZE * 0.52, TILE_SIZE * 0.36, TILE_SIZE * 0.08);
  ctx.fillStyle = "#f89e68";
  ctx.fillRect(baseX - TILE_SIZE * 0.12, baseY - TILE_SIZE * 0.32, TILE_SIZE * 0.24, TILE_SIZE * 0.12);
}

function drawAmbientGrid() {
  ctx.strokeStyle = "rgba(19, 22, 34, 0.35)";
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

    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + size * 0.45, size * 0.45, size * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = villager.color;
    ctx.fillRect(centerX - size / 2, centerY - size / 2, size, size);

    if (index === focusVillagerIndex) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.strokeRect(centerX - size / 2, centerY - size / 2, size, size);
    }

    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.fillRect(centerX - size * 0.3, centerY - size * 0.3, size * 0.18, size * 0.18);

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
