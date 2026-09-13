const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

const ui = {
  overlay: document.getElementById("startOverlay"), start: document.getElementById("startButton"),
  armor: document.getElementById("armorValue"), armorBar: document.getElementById("armorBar"),
  coins: document.getElementById("coinValue"), ammo: document.getElementById("weaponAmmo"), ammoBar: document.getElementById("ammoBar"),
  weaponName: document.getElementById("weaponName"), objective: document.getElementById("objectiveText"), progress: document.getElementById("missionProgress"),
  carrier: document.getElementById("carrierStatus"), pickup: document.getElementById("pickupStatus"), timer: document.getElementById("timer"), toast: document.getElementById("toast"),
  armory: document.getElementById("armoryModal"), weapons: document.getElementById("weaponList")
};

const weapons = [
  { id: "pulse", name: "PULSE BLASTER", icon: "⌁", cost: 0, ammo: 18, damage: 12, cooldown: 220, desc: "Balanced sidearm / 12 DMG" },
  { id: "scatter", name: "SCATTER CANNON", icon: "✣", cost: 40, ammo: 8, damage: 28, cooldown: 470, desc: "Heavy spread / 28 DMG" },
  { id: "arc", name: "ARC RIFLE", icon: "ϟ", cost: 85, ammo: 24, damage: 9, cooldown: 105, desc: "Rapid pulse / 9 DMG" }
];

let state;
let raf;
let lastTime = 0;
let keys = {};
let muted = false;

function resetState() {
  state = {
    running: false, won: false, lost: false, startTime: 0, elapsed: 0, coins: 0, armor: 100,
    currentWeapon: "pulse", unlocked: ["pulse"], ammo: 18, lastShot: 0, dashUntil: 0,
    player: { x: 120, y: H - 90, r: 14 }, enemy: { x: 735, y: 136, r: 19, hp: 100, flash: 0 },
    bullets: [], enemyBullets: [], particles: [],
    saveZones: [{ x: 120, y: 112, r: 48, active: true }, { x: 760, y: H - 100, r: 48, active: true }],
    pickups: [{ x: 335, y: 420, type: "coin", taken: false }, { x: 500, y: 138, type: "shield", taken: false }, { x: 610, y: 380, type: "ammo", taken: false }],
    obstacles: [{ x: 225, y: 120, w: 100, h: 24 }, { x: 390, y: 275, w: 130, h: 24 }, { x: 600, y: 170, w: 80, h: 24 }, { x: 180, y: 355, w: 110, h: 24 }]
  };
  ui.overlay.classList.remove("hidden");
  ui.objective.textContent = "CARRIER ALIVE";
  ui.carrier.textContent = "CARRIER UNKNOWN";
  ui.pickup.textContent = "NO POWER-UPS";
  ui.progress.style.width = "20%";
  updateUI();
}

function startGame() {
  if (state.won || state.lost) resetState();
  state.running = true; state.startTime = performance.now(); state.elapsed = 0;
  ui.overlay.classList.add("hidden");
  showToast("MISSION LIVE — FIND THE DIAMOND CARRIER");
  lastTime = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
}

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.035); lastTime = now;
  if (state.running) { state.elapsed = (now - state.startTime) / 1000; update(dt, now); draw(); updateUI(); raf = requestAnimationFrame(loop); }
}

function update(dt, now) {
  const p = state.player;
  let dx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
  let dy = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
  const len = Math.hypot(dx, dy) || 1;
  const speed = now < state.dashUntil ? 380 : 190;
  p.x = clamp(p.x + dx / len * speed * dt, 25, W - 25); p.y = clamp(p.y + dy / len * speed * dt, 25, H - 25);
  if (keys.shift && now > state.dashUntil) { state.dashUntil = now + 100; keys.shift = false; burst(p.x, p.y, "#70e6d0", 8); }
  keepOutOfObstacles(p);
  if (keys[" "]) shoot(now);
  const e = state.enemy;
  const angle = Math.atan2(p.y - e.y, p.x - e.x);
  if (e.hp > 0) { e.x = clamp(e.x + Math.cos(angle) * 20 * dt, 25, W - 25); e.y = clamp(e.y + Math.sin(angle) * 20 * dt, 25, H - 25); }
  if (e.hp > 0 && Math.hypot(p.x - e.x, p.y - e.y) < 280 && Math.random() < dt * .8) enemyShoot();
  state.bullets.forEach(b => { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; if (b.life <= 0) return; if (e.hp > 0 && Math.hypot(b.x - e.x, b.y - e.y) < e.r + 5) { e.hp -= b.damage; e.flash = 90; b.life = 0; burst(e.x, e.y, "#ff6875", 5); if (e.hp <= 0) win(); } });
  state.enemyBullets.forEach(b => { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; if (b.life > 0 && Math.hypot(b.x - p.x, b.y - p.y) < p.r + 5) { b.life = 0; state.armor -= 10; burst(p.x, p.y, "#ff6875", 4); if (state.armor <= 0) lose(); } });
  state.bullets = state.bullets.filter(b => b.life > 0); state.enemyBullets = state.enemyBullets.filter(b => b.life > 0);
  state.particles.forEach(q => { q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; }); state.particles = state.particles.filter(q => q.life > 0);
  state.saveZones.forEach(z => { if (Math.hypot(p.x - z.x, p.y - z.y) < z.r) state.armor = Math.min(100, state.armor + 19 * dt); });
  state.pickups.forEach(item => { if (!item.taken && Math.hypot(p.x - item.x, p.y - item.y) < 25) collect(item); });
  if (e.flash > 0) e.flash -= 60 * dt;
}

function keepOutOfObstacles(entity) { state.obstacles.forEach(o => { const cx = clamp(entity.x, o.x, o.x + o.w), cy = clamp(entity.y, o.y, o.y + o.h); const d = Math.hypot(entity.x - cx, entity.y - cy); if (d < entity.r) { if (Math.abs(entity.x - cx) > Math.abs(entity.y - cy)) entity.x += entity.x < cx ? -entity.r : entity.r; else entity.y += entity.y < cy ? -entity.r : entity.r; } }); }
function shoot(now) { const weapon = weapons.find(w => w.id === state.currentWeapon); if (state.ammo <= 0 || now - state.lastShot < weapon.cooldown) return; state.lastShot = now; state.ammo--; const p = state.player, e = state.enemy; const a = Math.atan2(e.y - p.y, e.x - p.x); state.bullets.push({ x: p.x, y: p.y, vx: Math.cos(a) * 560, vy: Math.sin(a) * 560, life: 1.2, damage: weapon.damage }); burst(p.x, p.y, "#ff9b5c", 2); }
function enemyShoot() { const p = state.player, e = state.enemy, a = Math.atan2(p.y - e.y, p.x - e.x); state.enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 210, vy: Math.sin(a) * 210, life: 4 }); }
function collect(item) { item.taken = true; if (item.type === "coin") { state.coins += 15; showToast("COIN CACHE +15"); } if (item.type === "shield") { state.armor = Math.min(100, state.armor + 35); showToast("SHIELD BOOST +35 ARMOR"); } if (item.type === "ammo") { state.ammo = weapons.find(w => w.id === state.currentWeapon).ammo; showToast("AMMO REFILL"); } burst(item.x, item.y, item.type === "coin" ? "#f6d56e" : "#70e6d0", 12); }
function win() { state.running = false; state.won = true; state.coins += 50; ui.objective.textContent = "DIAMOND SECURED"; ui.carrier.textContent = "CARRIER DOWN"; showToast("DIAMOND RECOVERED — EXTRACTION BONUS +50"); draw(); updateUI(); showEndOverlay("DIAMOND SECURED", "You found the carrier and recovered the objective."); }
function lose() { state.running = false; state.lost = true; ui.objective.textContent = "MISSION FAILED"; showEndOverlay("SIGNAL LOST", "Your armor failed before you reached the carrier."); }
function showEndOverlay(title, copy) { ui.overlay.innerHTML = `<div class="overlay-kicker">MISSION REPORT</div><h2>${title}<br /><em>${state.won ? "Extraction is ready." : "Try a different route."}</em></h2><p>${copy}</p><button class="primary-button" id="restartButton">RUN IT AGAIN <span>↻</span></button>`; ui.overlay.classList.remove("hidden"); document.getElementById("restartButton").onclick = startGame; }
function burst(x, y, color, count) { for (let i = 0; i < count; i++) { const a = Math.random() * Math.PI * 2, s = 20 + Math.random() * 80; state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .35 + Math.random() * .4, color }); } }
function draw() { drawMap(); drawZones(); drawPickups(); drawBullets(); drawEnemy(); drawPlayer(); drawParticles(); }
function drawMap() { const bg=ctx.createLinearGradient(0,0,W,H); bg.addColorStop(0,"#17164d"); bg.addColorStop(.52,"#101b47"); bg.addColorStop(1,"#241347"); ctx.fillStyle=bg; ctx.fillRect(0,0,W,H); const glow=ctx.createRadialGradient(680,90,10,680,90,320); glow.addColorStop(0,"rgba(157,120,255,.22)"); glow.addColorStop(1,"rgba(157,120,255,0)"); ctx.fillStyle=glow; ctx.fillRect(0,0,W,H); ctx.strokeStyle = "rgba(125, 211, 252, .12)"; ctx.lineWidth = 1; for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); } for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); } state.obstacles.forEach((o,i) => { const colors=["#304c7d","#493775","#285d68","#5a3e6f"]; ctx.fillStyle=colors[i%colors.length]; ctx.fillRect(o.x,o.y,o.w,o.h); ctx.strokeStyle = i%2?"#a77cff":"#59dbe8"; ctx.strokeRect(o.x+.5,o.y+.5,o.w-1,o.h-1); }); ctx.fillStyle = "#748bc7"; ctx.font = "10px DM Mono"; ctx.fillText("NORTH QUARRY", 28, 30); ctx.fillText("OLD WATERWORKS", 664, 530); }
function drawZones() { state.saveZones.forEach(z => { ctx.beginPath(); ctx.arc(z.x,z.y,z.r,0,Math.PI*2); ctx.fillStyle="rgba(86,244,230,.13)"; ctx.fill(); ctx.strokeStyle="#56f4e6"; ctx.lineWidth=2; ctx.setLineDash([5,5]); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle="#a8fff7"; ctx.font="10px DM Mono"; ctx.fillText("SAVE ZONE", z.x-29, z.y+4); }); }
function drawPickups() { state.pickups.forEach(item => { if (item.taken) return; const color = item.type === "coin" ? "#f6d56e" : "#70e6d0"; ctx.save(); ctx.translate(item.x,item.y); ctx.rotate(Math.PI/4); ctx.fillStyle=color; ctx.shadowColor=color; ctx.shadowBlur=14; ctx.fillRect(-7,-7,14,14); ctx.restore(); ctx.fillStyle="#0b1218"; ctx.font="10px DM Mono"; ctx.textAlign="center"; ctx.fillText(item.type === "coin" ? "+15" : item.type === "shield" ? "ARMOR" : "AMMO", item.x, item.y+24); ctx.textAlign="left"; }); }
function drawBullets() { state.bullets.forEach(b => { ctx.fillStyle="#ffbf84"; ctx.shadowColor="#ff9b5c"; ctx.shadowBlur=12; ctx.beginPath(); ctx.arc(b.x,b.y,3,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0; }); state.enemyBullets.forEach(b => { ctx.fillStyle="#ff6875"; ctx.beginPath(); ctx.arc(b.x,b.y,4,0,Math.PI*2); ctx.fill(); }); }
function drawPlayer() { const p=state.player; ctx.save(); ctx.translate(p.x,p.y); ctx.shadowColor="#70e6d0"; ctx.shadowBlur=18; ctx.fillStyle="#70e6d0"; ctx.beginPath(); ctx.arc(0,0,p.r,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0; ctx.fillStyle="#082027"; ctx.beginPath(); ctx.arc(0,0,5,0,Math.PI*2); ctx.fill(); ctx.restore(); }
function drawEnemy() { const e=state.enemy; if(e.hp<=0){ctx.strokeStyle="#f6d56e";ctx.lineWidth=3;ctx.beginPath();ctx.arc(e.x,e.y,27,0,Math.PI*2);ctx.stroke();return;} ctx.save();ctx.translate(e.x,e.y);ctx.fillStyle=e.flash>0?"#fff":"#ff6875";ctx.shadowColor="#ff6875";ctx.shadowBlur=16;ctx.beginPath();ctx.arc(0,0,e.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle="#421e27";ctx.fillRect(-13,11,26,9);ctx.fillStyle="#f6d56e";ctx.rotate(Math.PI/4);ctx.fillRect(-7,-7,14,14);ctx.restore();ctx.fillStyle="#ff8b94";ctx.font="10px DM Mono";ctx.fillText("CARRIER",e.x-27,e.y-29);ctx.fillStyle="#26343d";ctx.fillRect(e.x-25,e.y-23,50,4);ctx.fillStyle="#ff6875";ctx.fillRect(e.x-25,e.y-23,50*Math.max(e.hp,0)/100,4); }
function drawParticles() { state.particles.forEach(q=>{ctx.globalAlpha=Math.max(0,q.life/.7);ctx.fillStyle=q.color;ctx.fillRect(q.x,q.y,3,3);});ctx.globalAlpha=1; }
function updateUI() { ui.armor.textContent=Math.max(0,Math.round(state.armor)); ui.armorBar.style.width=`${Math.max(0,state.armor)}%`; ui.armorBar.style.background=state.armor<30?"#ff6875":"#70e6d0"; ui.coins.textContent=state.coins; const w=weapons.find(x=>x.id===state.currentWeapon); ui.weaponName.textContent=w.name; ui.ammo.textContent=`AMMO ${state.ammo} / ${w.ammo}`; ui.ammoBar.style.width=`${state.ammo/w.ammo*100}%`; ui.progress.style.width=state.enemy.hp<=0?"100%":"20%"; ui.timer.textContent=`${String(Math.floor(state.elapsed/60)).padStart(2,"0")}:${String(Math.floor(state.elapsed%60)).padStart(2,"0")}`; if(state.enemy.hp<=0) ui.carrier.textContent="CARRIER DOWN"; else if(state.running) ui.carrier.textContent="SIGNAL ACQUIRED"; const count=state.pickups.filter(x=>x.taken).length; ui.pickup.textContent=count?`${count} POWER-UP${count>1?"S":""} COLLECTED`:"NO POWER-UPS"; }
function showToast(message) { ui.toast.textContent=message; ui.toast.classList.add("show"); clearTimeout(showToast.t); showToast.t=setTimeout(()=>ui.toast.classList.remove("show"),2400); }
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}

function renderArmory() { ui.weapons.innerHTML=weapons.map(w=>{const unlocked=state.unlocked.includes(w.id), equipped=state.currentWeapon===w.id; const label=equipped?"EQUIPPED":unlocked?"EQUIP":`◆ ${w.cost}`; return `<div class="weapon-card"><span class="mini-icon">${w.icon}</span><div><h4>${w.name}</h4><p>${w.desc}</p></div><button class="${equipped?"equipped":!unlocked?"locked":""}" data-weapon="${w.id}">${label}</button></div>`;}).join(""); ui.weapons.querySelectorAll("button").forEach(btn=>btn.onclick=()=>{const id=btn.dataset.weapon,w=weapons.find(x=>x.id===id);if(state.unlocked.includes(id)){state.currentWeapon=id;state.ammo=w.ammo;renderArmory();updateUI();showToast(`${w.name} EQUIPPED`);}else if(state.coins>=w.cost){state.coins-=w.cost;state.unlocked.push(id);state.currentWeapon=id;state.ammo=w.ammo;renderArmory();updateUI();showToast(`${w.name} UNLOCKED`);}else showToast(`NEED ${w.cost-state.coins} MORE COINS`);}); }

document.addEventListener("keydown", e=>{ const key=e.key.toLowerCase(); if([" ","arrowup","arrowdown","arrowleft","arrowright"].includes(key))e.preventDefault(); keys[key]=true; if(key==="b") ui.armory.classList.toggle("open"); });
document.addEventListener("keyup", e=>{ keys[e.key.toLowerCase()]=false; });
ui.start.onclick=startGame; document.getElementById("resetButton").onclick=()=>{resetState();draw();}; document.getElementById("armoryButton").onclick=()=>{renderArmory();ui.armory.classList.toggle("open");}; document.getElementById("closeArmory").onclick=()=>ui.armory.classList.remove("open"); document.getElementById("soundToggle").onclick=e=>{muted=!muted;e.currentTarget.textContent=muted?"◌":"◒";showToast(muted?"SOUND OFF":"SOUND ON");};
resetState(); draw();
