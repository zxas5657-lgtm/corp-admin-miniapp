/* 行政助手 · 可点击原型
   没有后端。改动保存在 localStorage（corp-admin-prototype-v1）。
   路由是 location.hash，例如 #/meetings/new 。
   界面约定见仓库根目录的 DESIGN.md。
*/

const TODAY = "2026-10-24";
const DEMO_TIME = "09:20";
const STORAGE_KEY = "corp-admin-prototype-v1";
const DRIVER_NAME = "赵磊";
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const ROLES = {
  leader: {
    label: "领导",
    name: "陈启明",
    title: "总经理",
    hint: "可查看全部安排，可以建会，也可以申请用车。",
  },
  admin: {
    label: "行政专员",
    name: "林晓雯",
    title: "总裁办公室",
    hint: "可以建会、申请用车，并跟进当天的日程。",
  },
  driver: {
    label: "司机/车管",
    name: "赵磊",
    title: "车队",
    hint: "看待派的申请，分派车辆，行程结束后标记完成。",
  },
  reception: {
    label: "前台/接待",
    name: "周宁",
    title: "前台",
    hint: "可查看日程和会议，也可以为接待申请用车。来访登记还未开放。",
  },
};

const ROLE_ORDER = ["leader", "admin", "driver", "reception"];
const PEOPLE = ["陈启明", "林晓雯", "赵磊", "周宁", "孙倩", "马凯"];
const ROOMS = ["3楼小会议室", "5楼董事会会议室", "1楼接待室", "线上会议"];
const CARS = [
  { id: "gl8a", plate: "京A·D8821", model: "别克 GL8", kind: "商务", busy: false },
  { id: "a6", plate: "京A·E1902", model: "奥迪 A6L", kind: "轿车", busy: false },
  { id: "gl8b", plate: "京A·F3308", model: "别克 GL8", kind: "商务", busy: true },
];

const MEETING_STATUS = {
  upcoming: { label: "待开始", tone: "warn" },
  ongoing: { label: "进行中", tone: "info" },
  done: { label: "已结束", tone: "mute" },
};

const VEHICLE_STATUS = {
  pending: { label: "待派车", tone: "warn" },
  assigned: { label: "已派车", tone: "info" },
  done: { label: "已完成", tone: "ok" },
  rejected: { label: "已驳回", tone: "danger" },
};

const MEETING_FILTERS = [
  ["all", "全部"],
  ["upcoming", "待开始"],
  ["ongoing", "进行中"],
  ["done", "已结束"],
];

const SKELETONS = {
  visitors: {
    title: "来访接待",
    lead: "v1 只保留入口。登记、核验和放行以后再做。",
    rows: [
      ["预约来访", "登记访客与到访时间"],
      ["到访核验", "前台核对并通知被访人"],
      ["接待记录", "结束后留下接待备注"],
    ],
  },
  daily: {
    title: "行政日常",
    lead: "v1 只保留入口。申领、报修和用印以后再做。",
    rows: [
      ["用品申领", "文具、耗材与员工物资"],
      ["报修", "会议室设备与办公设施"],
      ["用印", "印章外带与盖章登记"],
    ],
  },
};

let state = null;
let flash = "";
let job = 0;
let toastTimer = 0;

function seed() {
  return {
    version: 1,
    role: "admin",
    meetings: [
      {
        id: "m1",
        title: "月度行政复盘",
        date: "2026-10-23",
        start: "16:00",
        end: "17:00",
        room: "3楼小会议室",
        attendees: ["林晓雯", "陈启明"],
        organizer: "林晓雯",
        agenda: "复盘十月会议安排和用车情况。",
        status: "done",
      },
      {
        id: "m2",
        title: "行政值班碰头",
        date: "2026-10-24",
        start: "09:00",
        end: "09:40",
        room: "3楼小会议室",
        attendees: ["林晓雯", "周宁"],
        organizer: "林晓雯",
        agenda: "对齐周末值班，以及周一例会材料是否齐套。",
        status: "ongoing",
      },
      {
        id: "m3",
        title: "下周材料核对",
        date: "2026-10-24",
        start: "16:00",
        end: "16:30",
        room: "线上会议",
        attendees: ["林晓雯", "马凯"],
        organizer: "林晓雯",
        agenda: "核对周一要印发的材料。",
        status: "upcoming",
      },
      {
        id: "m4",
        title: "周经营例会",
        date: "2026-10-26",
        start: "09:00",
        end: "10:30",
        room: "5楼董事会会议室",
        attendees: ["陈启明", "林晓雯", "孙倩", "马凯"],
        organizer: "陈启明",
        agenda: "上周经营数据、本周重点、需要行政协调的事项。",
        status: "upcoming",
      },
      {
        id: "m5",
        title: "访客接待预备会",
        date: "2026-10-26",
        start: "15:00",
        end: "15:45",
        room: "1楼接待室",
        attendees: ["林晓雯", "周宁"],
        organizer: "周宁",
        agenda: "确认接待路线、茶歇和会议室。",
        status: "upcoming",
      },
    ],
    vehicles: [
      {
        id: "v1",
        reason: "临时外出办事",
        destination: "金融街",
        date: "2026-10-22",
        time: "11:00",
        passengers: 1,
        applicant: "林晓雯",
        note: "",
        status: "rejected",
        carId: "",
        driverName: "",
        rejectReason: "当天公务车已排满，请改乘地铁或改期。",
      },
      {
        id: "v2",
        reason: "园区设备巡检",
        destination: "北区园区",
        date: "2026-10-23",
        time: "08:30",
        passengers: 1,
        applicant: "赵磊",
        note: "",
        status: "done",
        carId: "gl8a",
        driverName: "赵磊",
        rejectReason: "",
      },
      {
        id: "v3",
        reason: "送材料至市政务中心",
        destination: "市政务服务中心",
        date: "2026-10-24",
        time: "13:30",
        passengers: 2,
        applicant: "林晓雯",
        note: "需携带公章函件，预计两小时。",
        status: "assigned",
        carId: "a6",
        driverName: "赵磊",
        rejectReason: "",
      },
      {
        id: "v4",
        reason: "机场接客户",
        destination: "首都机场 T3",
        date: "2026-10-27",
        time: "09:20",
        passengers: 3,
        applicant: "周宁",
        note: "客户两人，预留后备箱。",
        status: "pending",
        carId: "",
        driverName: "",
        rejectReason: "",
      },
    ],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || !Array.isArray(data.meetings) || !Array.isArray(data.vehicles)) {
      return seed();
    }
    if (!ROLES[data.role]) data.role = "admin";
    return {
      version: 1,
      role: data.role,
      meetings: data.meetings,
      vehicles: data.vehicles,
    };
  } catch (err) {
    return seed();
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    /* 浏览器禁止存储时，数据只留在当前页面。 */
  }
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function pad(number) {
  return String(number).padStart(2, "0");
}

function parseDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isValidDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const date = parseDate(iso);
  const [year, month, day] = iso.split("-").map(Number);
  return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day;
}

function isValidTime(value) {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function toMinutes(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function addDays(iso, days) {
  const date = parseDate(iso);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDay(iso) {
  const date = parseDate(iso);
  return `${date.getMonth() + 1}月${date.getDate()}日 周${WEEKDAYS[date.getDay()]}`;
}

function currentRole() {
  return ROLES[state.role] || ROLES.admin;
}

function canCreateMeeting() {
  return state.role === "leader" || state.role === "admin";
}

function canRequestVehicle() {
  return state.role === "leader" || state.role === "admin" || state.role === "reception";
}

function canDispatch() {
  return state.role === "driver";
}

function findMeeting(id) {
  return state.meetings.find((item) => item.id === id);
}

function findVehicle(id) {
  return state.vehicles.find((item) => item.id === id);
}

function carById(id) {
  return CARS.find((item) => item.id === id);
}

function carText(id) {
  const car = carById(id);
  return car ? `${car.plate} ${car.model}` : "";
}

function pill(dict, status) {
  const item = dict[status] || { label: "未知", tone: "mute" };
  return `<span class="pill pill-${item.tone}" data-status="${esc(status)}">${esc(item.label)}</span>`;
}

function parseRoute() {
  const raw = (location.hash || "#/schedule").replace(/^#/, "");
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  const queryIndex = path.indexOf("?");
  const pathname = queryIndex === -1 ? path : path.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : path.slice(queryIndex + 1);
  return {
    parts: pathname.split("/").filter(Boolean),
    params: new URLSearchParams(query),
  };
}

function routeMeta(route) {
  const [name, sub] = route.parts;
  if (!name || name === "schedule") return { title: "日程", tab: "schedule", root: true };
  if (name === "meetings" && !sub) return { title: "会议", tab: "meetings", root: true };
  if (name === "meetings" && sub === "new") return { title: "新建会议", tab: "meetings", root: false };
  if (name === "meetings") return { title: "会议详情", tab: "meetings", root: false };
  if (name === "vehicles" && !sub) return { title: "用车", tab: "vehicles", root: true };
  if (name === "vehicles" && sub === "new") return { title: "申请用车", tab: "vehicles", root: false };
  if (name === "vehicles") return { title: "用车详情", tab: "vehicles", root: false };
  if (name === "me" && !sub) return { title: "我的", tab: "me", root: true };
  if (name === "visitors") return { title: "来访接待", tab: "me", root: false };
  if (name === "daily") return { title: "行政日常", tab: "me", root: false };
  return { title: "行政助手", tab: "schedule", root: true };
}

function parentHash() {
  const [name] = parseRoute().parts;
  if (name === "meetings") return "#/meetings";
  if (name === "vehicles") return "#/vehicles";
  if (name === "visitors" || name === "daily") return "#/me";
  return "#/schedule";
}

function selectedDate(route) {
  const value = route.params.get("date") || "";
  return isValidDate(value) ? value : TODAY;
}

function frame(body, bar) {
  return `<div class="page"><div class="page-body">${body}</div>${bar || ""}</div>`;
}

function frameForm(formId, body, bar) {
  return `<div class="page"><form id="${formId}" class="page-body" novalidate autocomplete="off">${body}</form>${bar || ""}</div>`;
}

function actionBar(inner) {
  return `<div class="actionbar">${inner}</div>`;
}

function emptyBlock(title, copy, extra) {
  return `<div class="empty">
    <div class="empty-mark" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
        <rect x="4" y="5" width="16" height="15" rx="2"></rect>
        <path d="M8 3.5v3M16 3.5v3M4 9.5h16"></path>
      </svg>
    </div>
    <h2>${esc(title)}</h2>
    <p>${esc(copy)}</p>
    ${extra || ""}
  </div>`;
}

function hasSchedule(iso) {
  if (state.meetings.some((item) => item.date === iso)) return true;
  return state.vehicles.some((item) => item.date === iso && item.status !== "rejected");
}

function scheduleItems(date) {
  const meetings = state.meetings
    .filter((item) => item.date === date)
    .map((item) => ({
      type: "meeting",
      id: item.id,
      sort: item.start,
      start: item.start,
      end: item.end,
      title: item.title,
      place: item.room,
      status: item.status,
      href: `#/meetings/${item.id}`,
    }));
  const vehicles = state.vehicles
    .filter((item) => item.date === date && item.status !== "rejected")
    .map((item) => ({
      type: "vehicle",
      id: item.id,
      sort: item.time,
      start: item.time,
      end: "",
      title: item.reason,
      place: item.destination,
      status: item.status,
      href: `#/vehicles/${item.id}`,
    }));
  return [...meetings, ...vehicles].sort((a, b) => a.sort.localeCompare(b.sort) || a.type.localeCompare(b.type));
}

function renderSchedule(route, message) {
  const date = selectedDate(route);
  const focusId = route.params.get("focus") || "";
  const days = Array.from({ length: 7 }, (_, index) => addDays(date, index - 3));
  const week = days
    .map((iso) => {
      const day = parseDate(iso);
      const selected = iso === date ? " is-on" : "";
      const today = iso === TODAY ? " is-today" : "";
      const dot = hasSchedule(iso) ? "dot" : "dot dot-off";
      return `<a class="day${selected}${today}" href="#/schedule?date=${iso}">
        <small>周${WEEKDAYS[day.getDay()]}</small>
        <b>${day.getDate()}</b>
        <i class="${dot}"></i>
      </a>`;
    })
    .join("");
  const items = scheduleItems(date);
  const backToday = date === TODAY ? "" : `<a class="textbtn" href="#/schedule">回到今天</a>`;
  const banner = message ? `<div class="banner" role="status">${esc(message)}</div>` : "";
  let list = "";
  if (!items.length) {
    const extra = canCreateMeeting()
      ? `<a class="btn btn-primary" href="#/meetings/new?date=${esc(date)}">新建会议</a>`
      : `<a class="textbtn" href="#/meetings">查看会议</a>`;
    list = emptyBlock("这天没有安排", "新建的会议和已派出的车辆会列在这里。", extra);
  } else {
    list = items
      .map((item) => {
        const statusPill = item.type === "meeting" ? pill(MEETING_STATUS, item.status) : pill(VEHICLE_STATUS, item.status);
        const kind = item.type === "vehicle" ? "用车" : "会议";
        const focused = item.id === focusId;
        return `<div class="slot">
          <div class="slot-time"><b>${esc(item.start)}</b>${item.end ? `<span>${esc(item.end)}</span>` : ""}</div>
          <a class="card ${item.type}${focused ? " is-new" : ""}" href="${esc(item.href)}" id="item-${esc(item.id)}" ${focused ? 'data-focus="1"' : ""}>
            <div class="listcard-top"><h2>${esc(item.title)}</h2>${statusPill}</div>
            <p class="meta">${kind} · ${esc(item.place)}</p>
          </a>
        </div>`;
      })
      .join("");
  }
  return frame(`
    ${banner}
    <div class="week" role="navigation" aria-label="选择日期">${week}</div>
    <div class="day-head">
      <div>
        <h2>${esc(formatDay(date))}</h2>
        <p class="sub">${date === TODAY ? `演示时刻 ${DEMO_TIME}` : "这一天的会议和用车"}</p>
      </div>
      <div class="day-side">${backToday}<span class="count">${items.length} 项</span></div>
    </div>
    ${list}
  `);
}

function renderMeetings(route) {
  const status = route.params.get("status") || "all";
  const active = MEETING_FILTERS.some(([key]) => key === status) ? status : "all";
  const filters = MEETING_FILTERS.map(([key, label]) => {
    const on = key === active ? " is-on" : "";
    const href = key === "all" ? "#/meetings" : `#/meetings?status=${key}`;
    return `<a class="filter${on}" href="${href}" aria-current="${key === active ? "true" : "false"}">${label}</a>`;
  }).join("");
  const rank = { ongoing: 0, upcoming: 1, done: 2 };
  const list = state.meetings
    .filter((item) => active === "all" || item.status === active)
    .slice()
    .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || (a.date + a.start).localeCompare(b.date + b.start));
  let body = `<div class="filters" role="group" aria-label="筛选会议">${filters}</div>`;
  if (!list.length) {
    body += emptyBlock("没有这类会议", "换一个筛选，或新建一场会议。", "");
  } else {
    let lastDate = "";
    list.forEach((item) => {
      if (item.date !== lastDate) {
        body += `<h3 class="section-label">${esc(formatDay(item.date))}</h3>`;
        lastDate = item.date;
      }
      body += `<a class="listcard" href="#/meetings/${esc(item.id)}">
        <div class="listcard-top"><h2>${esc(item.title)}</h2>${pill(MEETING_STATUS, item.status)}</div>
        <p class="meta">${esc(item.start)}–${esc(item.end)} · ${esc(item.room)}</p>
        <p class="meta">${esc(item.organizer)} · ${(item.attendees || []).length} 人</p>
      </a>`;
    });
  }
  const bar = canCreateMeeting()
    ? actionBar(`<a class="btn btn-primary" href="#/meetings/new">新建会议</a>`)
    : actionBar(`<button class="btn btn-primary" type="button" disabled>新建会议</button><p class="fine">仅领导与行政专员可新建。</p>`);
  return frame(body, bar);
}

function renderMeetingDetail(id) {
  const meeting = findMeeting(id);
  if (!meeting) {
    return frame(emptyBlock("没有找到这条记录", "可能已经被恢复演示数据清掉了。", `<a class="btn btn-primary" href="#/meetings">返回会议</a>`));
  }
  const ongoing = meeting.status === "ongoing" ? `<p class="note">演示时刻 ${DEMO_TIME}，这场会显示为进行中。</p>` : "";
  const agenda = meeting.agenda ? esc(meeting.agenda) : "未填写";
  return frame(`
    <div class="hero">
      <div class="hero-top">${pill(MEETING_STATUS, meeting.status)}</div>
      <h2 class="hero-title">${esc(meeting.title)}</h2>
    </div>
    ${ongoing}
    <div class="group">
      <div class="cell"><span class="k">时间</span><span class="v">${esc(formatDay(meeting.date))} ${esc(meeting.start)}–${esc(meeting.end)}</span></div>
      <div class="cell"><span class="k">地点</span><span class="v">${esc(meeting.room)}</span></div>
      <div class="cell"><span class="k">发起人</span><span class="v">${esc(meeting.organizer)}</span></div>
      <div class="cell stack"><span class="k">参会人</span><span class="v">${esc((meeting.attendees || []).join("、"))}</span></div>
      <div class="cell stack"><span class="k">议程</span><span class="v">${agenda}</span></div>
    </div>
  `);
}

function personChips() {
  const selected = currentRole().name;
  return PEOPLE.map((name) => {
    const on = name === selected;
    return `<button type="button" class="chip${on ? " is-on" : ""}" data-action="toggle-person" data-person="${esc(name)}" aria-pressed="${on ? "true" : "false"}">${esc(name)}</button>`;
  }).join("");
}

function renderMeetingForm(route) {
  if (!canCreateMeeting()) {
    return frame(emptyBlock("当前身份不能新建会议", "请切换为领导或行政专员。司机与前台可以查看会议。", `<a class="btn btn-primary" href="#/me">去切换身份</a>`));
  }
  const date = selectedDate(route);
  const rooms = [`<option value="">请选择</option>`]
    .concat(ROOMS.map((room) => `<option value="${esc(room)}">${esc(room)}</option>`))
    .join("");
  const bar = actionBar(`<button class="btn btn-primary" type="submit" form="meeting-form">提交</button>`);
  return frameForm(
    "meeting-form",
    `<div class="group">
      <div class="cell"><label for="title">会议主题</label><input id="title" name="title" type="text" maxlength="40" placeholder="例如：周经营例会" /></div>
      <div class="cell"><label for="date">日期</label><input id="date" name="date" type="date" value="${esc(date)}" /></div>
      <div class="cell"><label for="start">开始</label><input id="start" name="start" type="time" value="10:00" /></div>
      <div class="cell"><label for="end">结束</label><input id="end" name="end" type="time" value="11:00" /></div>
      <div class="cell"><label for="room">会议室</label><select id="room" name="room" class="placeholder">${rooms}</select></div>
    </div>
    <h3 class="section-label">参会人</h3>
    <div class="group"><div class="cell stack"><div class="chips">${personChips()}</div></div></div>
    <h3 class="section-label">议程（选填）</h3>
    <div class="group"><div class="cell stack"><textarea id="agenda" name="agenda" maxlength="200" placeholder="要讨论的事项"></textarea></div></div>`,
    bar
  );
}

function renderVehicles() {
  const pendingCount = state.vehicles.filter((item) => item.status === "pending").length;
  let note = "";
  if (pendingCount && canDispatch()) {
    note = `<p class="note">有 ${pendingCount} 条待派车，打开申请即可分派。</p>`;
  } else if (pendingCount) {
    note = `<p class="note">有 ${pendingCount} 条待派车。需要司机/车管才能分派，可在 <a class="link" href="#/me">我的</a> 切换身份。</p>`;
  }
  const order = ["pending", "assigned", "done", "rejected"];
  const titles = { pending: "待派车", assigned: "已派车", done: "已完成", rejected: "已驳回" };
  let body = note;
  order.forEach((status) => {
    const list = state.vehicles
      .filter((item) => item.status === status)
      .slice()
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    if (!list.length) return;
    body += `<h3 class="section-label">${titles[status]}</h3>`;
    list.forEach((item) => {
      body += `<a class="listcard" href="#/vehicles/${esc(item.id)}">
        <div class="listcard-top"><h2>${esc(item.reason)}</h2>${pill(VEHICLE_STATUS, item.status)}</div>
        <p class="meta">${esc(formatDay(item.date))} ${esc(item.time)} · ${esc(item.destination)}</p>
        <p class="meta">${esc(item.applicant)} · ${Number(item.passengers) || 0} 人</p>
      </a>`;
    });
  });
  if (!state.vehicles.length) {
    body += emptyBlock("还没有用车申请", "提交后会进入待派车，由车管分派车辆。", "");
  }
  const bar = canRequestVehicle()
    ? actionBar(`<a class="btn btn-primary" href="#/vehicles/new">申请用车</a>`)
    : actionBar(`<button class="btn btn-primary" type="button" disabled>申请用车</button><p class="fine">司机/车管请直接处理待派申请。</p>`);
  return frame(body, bar);
}

function vehicleSteps(status) {
  if (status === "rejected") return "";
  const labels = ["提交", "派车", "完成"];
  const nowIndex = { pending: 1, assigned: 2, done: 3 }[status];
  return `<ol class="steps">${labels
    .map((label, index) => {
      let className = "";
      if (nowIndex != null && index < nowIndex) className = "is-done";
      else if (index === nowIndex) className = "is-now";
      return `<li class="${className}">${label}</li>`;
    })
    .join("")}</ol>`;
}

function vehicleNote(vehicle) {
  if (vehicle.status === "pending" && !canDispatch()) {
    return `<p class="note">尚未分派车辆。派车需要司机/车管，可在 <a class="link" href="#/me">我的</a> 切换身份。</p>`;
  }
  if (vehicle.status === "assigned" && !canDispatch()) {
    return `<p class="note">已分派给${esc(vehicle.driverName || DRIVER_NAME)}。行程结束后由车管标记完成。</p>`;
  }
  if (vehicle.status === "done") return `<p class="note">这趟用车已完成。</p>`;
  return "";
}

function vehicleActions(vehicle) {
  if (vehicle.status === "pending" && canDispatch()) {
    return actionBar(`<button type="button" class="btn btn-primary" data-action="open-dispatch" data-id="${esc(vehicle.id)}">去派车</button>`);
  }
  if (vehicle.status === "assigned" && canDispatch()) {
    return actionBar(`<button type="button" class="btn btn-primary" data-action="open-complete" data-id="${esc(vehicle.id)}">标记完成</button>`);
  }
  return "";
}

function renderVehicleDetail(id, message) {
  const vehicle = findVehicle(id);
  if (!vehicle) {
    return frame(emptyBlock("没有找到这条记录", "可能已经被恢复演示数据清掉了。", `<a class="btn btn-primary" href="#/vehicles">返回用车</a>`));
  }
  const banner = message ? `<div class="banner" role="status">${esc(message)}</div>` : "";
  const rejected = vehicle.status === "rejected" ? `<div class="alert">${esc(vehicle.rejectReason || "这条申请未通过。")}</div>` : "";
  const car = carText(vehicle.carId);
  const carValue = car || (vehicle.status === "rejected" ? "未分派" : "待分派");
  const driverValue = vehicle.driverName || (vehicle.status === "rejected" ? "未分派" : "待分派");
  const note = vehicle.note ? esc(vehicle.note) : "未填写";
  return frame(
    `
    ${banner}
    <div class="hero">
      <div class="hero-top">${pill(VEHICLE_STATUS, vehicle.status)}</div>
      <h2 class="hero-title">${esc(vehicle.reason)}</h2>
    </div>
    ${vehicleSteps(vehicle.status)}
    ${rejected}
    ${vehicleNote(vehicle)}
    <div class="group">
      <div class="cell"><span class="k">目的地</span><span class="v">${esc(vehicle.destination)}</span></div>
      <div class="cell"><span class="k">出发</span><span class="v">${esc(formatDay(vehicle.date))} ${esc(vehicle.time)}</span></div>
      <div class="cell"><span class="k">人数</span><span class="v">${Number(vehicle.passengers) || 0} 人</span></div>
      <div class="cell"><span class="k">申请人</span><span class="v">${esc(vehicle.applicant)}</span></div>
      <div class="cell"><span class="k">车辆</span><span class="v">${esc(carValue)}</span></div>
      <div class="cell"><span class="k">司机</span><span class="v">${esc(driverValue)}</span></div>
      <div class="cell stack"><span class="k">备注</span><span class="v">${note}</span></div>
    </div>
  `,
    vehicleActions(vehicle)
  );
}

function renderVehicleForm() {
  if (!canRequestVehicle()) {
    return frame(emptyBlock("当前身份不能申请用车", "司机/车管请在用车列表里处理待派申请。", `<a class="btn btn-primary" href="#/vehicles">返回用车</a>`));
  }
  const bar = actionBar(`<button class="btn btn-primary" type="submit" form="vehicle-form">提交</button>`);
  return frameForm(
    "vehicle-form",
    `<div class="group">
      <div class="cell"><label for="reason">事由</label><input id="reason" name="reason" type="text" maxlength="40" placeholder="例如：机场接客户" /></div>
      <div class="cell"><label for="destination">目的地</label><input id="destination" name="destination" type="text" maxlength="40" placeholder="例如：首都机场 T3" /></div>
      <div class="cell"><label for="vdate">出发日期</label><input id="vdate" name="date" type="date" value="${TODAY}" /></div>
      <div class="cell"><label for="vtime">出发时间</label><input id="vtime" name="time" type="time" value="14:00" /></div>
      <div class="cell"><label for="passengers">人数</label><input id="passengers" name="passengers" type="number" min="1" max="6" step="1" value="1" inputmode="numeric" /></div>
    </div>
    <h3 class="section-label">备注（选填）</h3>
    <div class="group"><div class="cell stack"><textarea id="note" name="note" maxlength="200" placeholder="行李、站点或其他需要司机知道的事"></textarea></div></div>`,
    bar
  );
}

function renderMe() {
  const role = currentRole();
  const roles = ROLE_ORDER.map((id) => {
    const item = ROLES[id];
    const on = id === state.role;
    return `<button type="button" class="role${on ? " is-on" : ""}" data-action="set-role" data-role="${id}" aria-pressed="${on ? "true" : "false"}">
      <span><b>${esc(item.label)}</b><small>${esc(item.name)} · ${esc(item.title)}</small></span>
      <i class="tick" aria-hidden="true"></i>
    </button>`;
  }).join("");
  return frame(`
    <div class="profile">
      <div class="avatar" aria-hidden="true">${esc(role.name.slice(0, 1))}</div>
      <div>
        <h2>${esc(role.name)}</h2>
        <p class="meta">${esc(role.label)} · ${esc(role.title)}</p>
      </div>
    </div>
    <p class="lead">${esc(role.hint)}</p>
    <h3 class="section-label">当前身份</h3>
    <div class="group">${roles}</div>
    <h3 class="section-label">功能</h3>
    <div class="group">
      <a class="menu" href="#/visitors"><span>来访接待</span><span class="menu-side">未开放<i class="chev" aria-hidden="true"></i></span></a>
      <a class="menu" href="#/daily"><span>行政日常</span><span class="menu-side">未开放<i class="chev" aria-hidden="true"></i></span></a>
      <button type="button" class="menu" data-action="open-reset"><span>恢复演示数据</span><i class="chev" aria-hidden="true"></i></button>
    </div>
    <p class="footnote">演示数据保存在这台浏览器里，不会上传。恢复后，你新建的会议和用车会被清掉。</p>
  `);
}

function renderSkeleton(key) {
  const page = SKELETONS[key];
  const rows = page.rows
    .map(
      ([title, copy]) => `<div class="skel-row">
        <div><h2>${esc(title)}</h2><p>${esc(copy)}</p></div>
        <span class="pill pill-mute">未开放</span>
      </div>`
    )
    .join("");
  return frame(`<p class="note">${esc(page.lead)}</p><div class="group">${rows}</div>`);
}

function renderNotFound() {
  return frame(emptyBlock("没有这个页面", "从底部标签继续即可。", `<a class="btn btn-primary" href="#/schedule">回日程</a>`));
}

function renderRoute(route, message) {
  const [name, sub] = route.parts;
  if (!name || name === "schedule") return renderSchedule(route, message);
  if (name === "meetings" && !sub) return renderMeetings(route);
  if (name === "meetings" && sub === "new") return renderMeetingForm(route);
  if (name === "meetings") return renderMeetingDetail(sub);
  if (name === "vehicles" && !sub) return renderVehicles();
  if (name === "vehicles" && sub === "new") return renderVehicleForm();
  if (name === "vehicles") return renderVehicleDetail(sub, message);
  if (name === "me" && !sub) return renderMe();
  if (name === "visitors") return renderSkeleton("visitors");
  if (name === "daily") return renderSkeleton("daily");
  return renderNotFound();
}

function render() {
  const route = parseRoute();
  const message = flash;
  flash = "";
  const meta = routeMeta(route);
  document.getElementById("nav-title").textContent = meta.title;
  document.title = `${meta.title} · 行政助手`;
  document.getElementById("nav-back").hidden = meta.root;
  document.getElementById("tabs").classList.toggle("is-hidden", !meta.root);
  document.querySelectorAll("#tabs a").forEach((link) => {
    const on = link.dataset.tab === meta.tab;
    link.classList.toggle("is-on", on);
    if (on) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  const pending = state.vehicles.filter((item) => item.status === "pending").length;
  const badge = document.getElementById("pending-badge");
  badge.hidden = pending === 0;
  badge.textContent = pending > 9 ? "9+" : String(pending);

  const screen = document.getElementById("screen");
  screen.innerHTML = renderRoute(route, message);
  const focused = screen.querySelector("[data-focus='1']");
  if (focused) focused.scrollIntoView({ block: "center" });
}

function toast(text) {
  const element = document.getElementById("toast");
  element.textContent = text;
  element.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    element.hidden = true;
  }, 2200);
}

function setProgress(on) {
  document.getElementById("nav-progress").hidden = !on;
}

function go(hash, message, replace) {
  flash = message || "";
  if (location.hash === hash) {
    render();
    return;
  }
  // 提交成功后替换当前历史，返回时回到列表或日程，而不是刚填过的表单。
  if (replace) {
    history.replaceState(null, "", hash);
    render();
    return;
  }
  location.hash = hash;
}

function closeSheet() {
  const root = document.getElementById("sheet-root");
  const panel = document.getElementById("sheet");
  if (root) root.hidden = true;
  if (panel) panel.innerHTML = "";
}

function openSheet(html, data) {
  const root = document.getElementById("sheet-root");
  const panel = document.getElementById("sheet");
  panel.innerHTML = html;
  panel.dataset.vehicleId = data && data.vehicleId ? data.vehicleId : "";
  delete panel.dataset.car;
  panel.setAttribute("aria-labelledby", "sheet-title");
  root.hidden = false;
  panel.focus();
}

function sheetError(text) {
  const element = document.getElementById("sheet-error");
  if (!element) return;
  element.hidden = !text;
  element.textContent = text || "";
}

function field(form, name) {
  const value = new FormData(form).get(name);
  return String(value == null ? "" : value).trim();
}

function showFormError(form, messages) {
  let box = form.querySelector(":scope > .alert");
  if (!box) {
    box = document.createElement("div");
    box.className = "alert";
    box.setAttribute("role", "alert");
    form.prepend(box);
  }
  box.textContent = messages.join("；");
  form.scrollTop = 0;
}

function showLoading(form, text) {
  form.setAttribute("aria-busy", "true");
  form.innerHTML = `<div class="loading" role="status">
    <div class="spinner" aria-hidden="true"></div>
    <p>${esc(text)}</p>
    <div class="skel"></div>
    <div class="skel short"></div>
  </div>`;
}

function beginSubmit(form, text, done) {
  form.dataset.busy = "1";
  const token = ++job;
  showLoading(form, text);
  const button = document.querySelector(`[form="${form.id}"]`);
  if (button) {
    button.disabled = true;
    button.textContent = "提交中…";
  }
  setProgress(true);
  window.setTimeout(() => {
    if (token !== job) return;
    setProgress(false);
    done();
  }, 700);
}

function submitMeeting(form) {
  if (!canCreateMeeting()) {
    toast("当前身份不能新建会议");
    return;
  }
  const title = field(form, "title");
  const date = field(form, "date");
  const start = field(form, "start");
  const end = field(form, "end");
  const room = field(form, "room");
  const agenda = field(form, "agenda");
  const attendees = [...form.querySelectorAll(".chip.is-on")].map((item) => item.dataset.person).filter(Boolean);
  const errors = [];
  if (!title) errors.push("请填写会议主题");
  if (!isValidDate(date)) errors.push("请选择日期");
  if (!isValidTime(start) || !isValidTime(end)) errors.push("请填写开始和结束时间");
  else if (toMinutes(end) <= toMinutes(start)) errors.push("结束时间需晚于开始时间");
  if (!room) errors.push("请选择会议室");
  if (!attendees.length) errors.push("请选择至少一位参会人");
  if (errors.length) {
    showFormError(form, errors);
    return;
  }
  const record = {
    id: `m${Date.now().toString(36)}`,
    title,
    date,
    start,
    end,
    room,
    attendees,
    organizer: currentRole().name,
    agenda,
    status: "upcoming",
  };
  beginSubmit(form, "正在创建会议", () => {
    state.meetings.push(record);
    save();
    go(`#/schedule?date=${date}&focus=${record.id}`, "会议已创建，并已写入这一天的日程", true);
  });
}

function submitVehicle(form) {
  if (!canRequestVehicle()) {
    toast("当前身份不能申请用车");
    return;
  }
  const reason = field(form, "reason");
  const destination = field(form, "destination");
  const date = field(form, "date");
  const time = field(form, "time");
  const note = field(form, "note");
  const rawCount = field(form, "passengers");
  const count = Number(rawCount);
  const errors = [];
  if (!reason) errors.push("请填写用车事由");
  if (!destination) errors.push("请填写目的地");
  if (!isValidDate(date)) errors.push("请选择出发日期");
  if (!isValidTime(time)) errors.push("请填写出发时间");
  if (!/^\d+$/.test(rawCount) || count < 1 || count > 6) errors.push("乘车人数请填 1 到 6 人");
  if (errors.length) {
    showFormError(form, errors);
    return;
  }
  const record = {
    id: `v${Date.now().toString(36)}`,
    reason,
    destination,
    date,
    time,
    passengers: count,
    applicant: currentRole().name,
    note,
    status: "pending",
    carId: "",
    driverName: "",
    rejectReason: "",
  };
  beginSubmit(form, "正在提交申请", () => {
    state.vehicles.push(record);
    save();
    go(`#/vehicles/${record.id}`, "申请已提交，当前状态为待派车", true);
  });
}

function dispatchHtml() {
  const cars = CARS.map((car) => {
    const statePill = car.busy ? `<span class="pill pill-mute">使用中</span>` : `<span class="pill pill-ok">空闲</span>`;
    return `<button type="button" class="option${car.busy ? " is-disabled" : ""}" data-action="pick-car" data-car="${esc(car.id)}" ${car.busy ? "disabled" : ""}>
      <span class="option-text"><b>${esc(car.plate)}</b><small>${esc(car.model)} · ${esc(car.kind)}</small></span>
      ${statePill}
    </button>`;
  }).join("");
  return `<div class="sheet-handle"></div>
    <h2 id="sheet-title">选择车辆</h2>
    <p class="sheet-sub">确认后由${esc(DRIVER_NAME)}出车。</p>
    <div class="options">${cars}</div>
    <p class="sheet-error" id="sheet-error" hidden></p>
    <div class="stack">
      <button type="button" class="btn btn-primary" data-action="confirm-dispatch">确认派车</button>
      <button type="button" class="btn btn-ghost" data-action="close-sheet">取消</button>
    </div>`;
}

function completeHtml() {
  return `<div class="sheet-handle"></div>
    <h2 id="sheet-title">标记完成</h2>
    <p class="sheet-copy">确认这趟用车已经结束？状态会变为已完成，记录仍保留。</p>
    <div class="stack">
      <button type="button" class="btn btn-primary" data-action="confirm-complete">确认完成</button>
      <button type="button" class="btn btn-ghost" data-action="close-sheet">取消</button>
    </div>`;
}

function resetHtml() {
  return `<div class="sheet-handle"></div>
    <h2 id="sheet-title">恢复演示数据</h2>
    <p class="sheet-copy">你新建的会议和用车申请会被清掉，身份也会回到行政专员。</p>
    <div class="stack">
      <button type="button" class="btn btn-danger" data-action="confirm-reset">确认恢复</button>
      <button type="button" class="btn btn-ghost" data-action="close-sheet">取消</button>
    </div>`;
}

function openDispatch(id) {
  if (!canDispatch()) {
    toast("请先切换到司机/车管");
    return;
  }
  const vehicle = findVehicle(id);
  if (!vehicle || vehicle.status !== "pending") return;
  openSheet(dispatchHtml(), { vehicleId: id });
}

function openComplete(id) {
  if (!canDispatch()) {
    toast("请先切换到司机/车管");
    return;
  }
  const vehicle = findVehicle(id);
  if (!vehicle || vehicle.status !== "assigned") return;
  openSheet(completeHtml(), { vehicleId: id });
}

function pickCar(button) {
  if (button.disabled) return;
  const panel = document.getElementById("sheet");
  panel.querySelectorAll("[data-action='pick-car']").forEach((item) => {
    item.classList.remove("is-on");
    item.setAttribute("aria-pressed", "false");
  });
  button.classList.add("is-on");
  button.setAttribute("aria-pressed", "true");
  panel.dataset.car = button.dataset.car || "";
  sheetError("");
}

function confirmDispatch() {
  const panel = document.getElementById("sheet");
  const carId = panel.dataset.car || "";
  const vehicle = findVehicle(panel.dataset.vehicleId);
  if (!carId) {
    sheetError("请先选择一辆空闲车辆");
    return;
  }
  if (!canDispatch()) {
    sheetError("当前身份不能派车");
    return;
  }
  if (!vehicle || vehicle.status !== "pending") {
    closeSheet();
    render();
    return;
  }
  vehicle.status = "assigned";
  vehicle.carId = carId;
  vehicle.driverName = DRIVER_NAME;
  save();
  closeSheet();
  toast("已派车");
  render();
}

function confirmComplete() {
  const panel = document.getElementById("sheet");
  const vehicle = findVehicle(panel.dataset.vehicleId);
  if (!canDispatch() || !vehicle || vehicle.status !== "assigned") {
    closeSheet();
    render();
    return;
  }
  vehicle.status = "done";
  save();
  closeSheet();
  toast("已标记完成");
  render();
}

function confirmReset() {
  state = seed();
  save();
  closeSheet();
  toast("已恢复演示数据");
  if (location.hash !== "#/me") location.hash = "#/me";
  else render();
}

function onClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target || !document.getElementById("phone").contains(target)) return;
  const action = target.dataset.action;
  if (action === "close-sheet") closeSheet();
  else if (action === "toggle-person") {
    const on = target.classList.toggle("is-on");
    target.setAttribute("aria-pressed", on ? "true" : "false");
  } else if (action === "set-role") {
    const role = target.dataset.role;
    if (!ROLES[role] || state.role === role) return;
    state.role = role;
    save();
    toast(`已切换为${ROLES[role].label}`);
    render();
  } else if (action === "open-reset") openSheet(resetHtml());
  else if (action === "confirm-reset") confirmReset();
  else if (action === "open-dispatch") openDispatch(target.dataset.id);
  else if (action === "open-complete") openComplete(target.dataset.id);
  else if (action === "pick-car") pickCar(target);
  else if (action === "confirm-dispatch") confirmDispatch();
  else if (action === "confirm-complete") confirmComplete();
}

function onSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.id !== "meeting-form" && form.id !== "vehicle-form") return;
  event.preventDefault();
  if (form.dataset.busy === "1") return;
  if (form.id === "meeting-form") submitMeeting(form);
  else submitVehicle(form);
}

function onChange(event) {
  const element = event.target;
  if (element instanceof HTMLSelectElement) {
    element.classList.toggle("placeholder", element.value === "");
  }
}

function boot() {
  state = load();
  const phone = document.getElementById("phone");
  if (!location.hash) history.replaceState(null, "", "#/schedule");
  phone.addEventListener("click", onClick);
  phone.addEventListener("submit", onSubmit);
  phone.addEventListener("change", onChange);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSheet();
  });
  window.addEventListener("hashchange", () => {
    job += 1;
    setProgress(false);
    closeSheet();
    render();
  });
  document.getElementById("nav-back").addEventListener("click", () => {
    if (!document.getElementById("sheet-root").hidden) {
      closeSheet();
      return;
    }
    const fallback = parentHash();
    if (history.length > 1) history.back();
    else location.hash = fallback;
  });
  render();
}

boot();
