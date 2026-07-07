// Posts the current day's R5 tasks, kingdom buffs, minister appointments,
// and scoring tasks to a Discord channel via webhook.
//
// Reads data straight from the same Firebase Realtime Database the
// KvK War Room dashboard uses, so it always reflects whatever is live
// on the site — no manual copy/paste needed.
//
// Requires DISCORD_WEBHOOK_URL as an environment variable (set as a
// GitHub Actions secret — never commit the webhook URL itself).

const https = require('https');

const FIREBASE_URL = "https://kvk-planner-1884-default-rtdb.firebaseio.com/kvk-jul2026.json";
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// Mirrors the dashboard's day list. Update this if the KvK dates ever change.
const DAY_META = {
  "2026-07-11": { dow: "Saturday",  phase: "Pre-prep" },
  "2026-07-12": { dow: "Sunday",    phase: "Pre-prep" },
  "2026-07-13": { dow: "Monday",    phase: "Construction" },
  "2026-07-14": { dow: "Tuesday",   phase: "Research" },
  "2026-07-15": { dow: "Wednesday", phase: "Pet training" },
  "2026-07-16": { dow: "Thursday",  phase: "Troop training" },
  "2026-07-17": { dow: "Friday",    phase: "Power boost" },
  "2026-07-18": { dow: "Saturday",  phase: "Battle phase" }
};

const RATING_ICON = { best: "\uD83D\uDFE2", okay: "\uD83D\uDFE1", bad: "\uD83D\uDD34" };

function todayUTC(){
  const d = new Date();
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth()+1).padStart(2,"0") + "-" + String(d.getUTCDate()).padStart(2,"0");
}

function fetchJSON(url){
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch(e){ reject(e); }
      });
    }).on("error", reject);
  });
}

function postToDiscord(content){
  return new Promise((resolve, reject) => {
    const url = new URL(WEBHOOK_URL);
    const body = JSON.stringify({ content: content });
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    }, res => {
      let data = "";
      res.on("data", c => { data += c; });
      res.on("end", () => resolve({ status: res.statusCode, data: data }));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// Discord messages cap at 2000 chars — split into multiple posts if needed.
function chunkLines(lines, max){
  const chunks = [];
  let cur = "";
  for(const line of lines){
    const candidate = cur ? cur + "\n" + line : line;
    if(candidate.length > max){
      if(cur) chunks.push(cur);
      cur = line;
    } else {
      cur = candidate;
    }
  }
  if(cur) chunks.push(cur);
  return chunks;
}

async function main(){
  if(!WEBHOOK_URL){
    console.error("Missing DISCORD_WEBHOOK_URL environment variable/secret.");
    process.exit(1);
  }

  const today = todayUTC();
  const meta = DAY_META[today];
  if(!meta){
    console.log("Today (" + today + " UTC) is outside the KvK prep window — nothing to post.");
    return;
  }

  const state = await fetchJSON(FIREBASE_URL);
  const dayData = state && state.days && state.days[today];
  if(!dayData){
    console.log("No data found for " + today + " in Firebase — nothing to post.");
    return;
  }

  const lines = [];
  lines.push("**\u2694\uFE0F KvK War Room \u2014 " + meta.dow + ", " + today + " (" + meta.phase + ")**");
  lines.push("");

  lines.push("__**R5 Tasks**__");
  if(dayData.tasks && dayData.tasks.length){
    dayData.tasks.forEach(t => {
      const box = t.done ? "\u2611\uFE0F" : "\u2b1c";
      const subj = (t.subject && t.subject.trim()) ? ("**" + t.subject.trim() + "** \u2014 ") : "";
      lines.push(box + " " + subj + t.text);
    });
  } else {
    lines.push("_No tasks._");
  }
  lines.push("");

  lines.push("__**Kingdom Buffs (King)**__");
  if(dayData.buffs && dayData.buffs.length){
    dayData.buffs.forEach(b => lines.push("\u2022 " + b.text));
  } else {
    lines.push("_None scheduled._");
  }
  lines.push("");

  lines.push("__**Minister Appointments**__");
  if(dayData.ministers && dayData.ministers.length){
    dayData.ministers.forEach(m => lines.push("\u2022 " + m.text));
  } else {
    lines.push("_Not yet open._");
  }
  lines.push("");

  lines.push("__**Scoring Tasks & Point Values**__");
  if(dayData.scoring && dayData.scoring.length){
    dayData.scoring.forEach(s => {
      const icon = s.rating ? (RATING_ICON[s.rating] || "\u26aa") : "\u26aa";
      const pts = Number(s.points || 0).toLocaleString();
      lines.push(icon + " " + s.text + " \u2014 **" + pts + "**");
    });
  } else {
    lines.push("_No scoring tasks._");
  }

  const chunks = chunkLines(lines, 1900);
  for(const c of chunks){
    const result = await postToDiscord(c);
    if(result.status >= 300){
      console.error("Discord post failed:", result.status, result.data);
      process.exit(1);
    }
  }
  console.log("Posted " + chunks.length + " message(s) for " + today + ".");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
