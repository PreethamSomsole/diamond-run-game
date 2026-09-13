const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;

const ui = {
  overlay: document.getElementById("startOverlay"), start: document.getElementById("startButton"),
  armor: document.getElementById("armorValue"), armorBar: document.getElementById("armorBar"), coins: document.getElementById("coinValue"),
  ammo: document.getElementById("weaponAmmo"), ammoBar: document.getElementById("ammoBar"), weaponName: document.getElementById("weaponName"),
  objective: document.getElementById("objectiveText"), progress: document.getElementById("missionProgress"), carrier: document.getElementById("carrierStatus"),
  pickup: document.getElementById("pickupStatus"), timer: document.getElementById("timer"), toast: document.getElementById("toast"),
  armory: document.getElementById("armoryModal"), weapons: document.getElementById("weaponList")
};

const weapons = [
  { id:"pulse", name:"PULSE BLASTER", icon:"⌁", cost:0, ammo:22, damage:14, cooldown:210, desc:"Balanced sidearm / 14 DMG" },
  { id:"scatter", name:"SCATTER CANNON", icon:"✣", cost:35, ammo:10, damage:30, cooldown:450, desc:"Heavy blast / 30 DMG" },
  { id:"arc", name:"ARC RIFLE", icon:"ϟ", cost:70, ammo:30, damage:10, cooldown:100, desc:"Rapid energy / 10 DMG" }
];

const walls = [
  {x:0,y:0,w:900,h:18},{x:0,y:542,w:900,h:18},{x:0,y:0,w:18,h:560},{x:882,y:0,w:18,h:560},
  {x:95,y:72,w:210,h:18},{x:385,y:55,w:18,h:135},{x:485,y:72,w:245,h:18},{x:795,y:72,w:18,h:150},
  {x:70,y:175,w:190,h:18},{x:330,y:235,w:250,h:18},{x:650,y:170,w:18,h:155},{x:735,y:285,w:147,h:18},
  {x:145,y:265,w:18,h:170},{x:225,y:335,w:230,h:18},{x:520,y:330,w:18,h:150},{x:600,y:420,w:210,h:18},
  {x:65,y:475,w:320,h:18},{x:455,y:500,w:18,h:42},{x:735,y:480,w:18,h:62}
];

let state, raf, lastTime=0, keys={}, muted=false;

function resetState(){
  state={running:false,won:false,lost:false,startTime:0,elapsed:0,coins:0,armor:100,maxArmor:100,currentWeapon:"pulse",unlocked:["pulse"],ammo:22,lastShot:0,dashReady:0,powerups:0,
    player:{x:48,y:520,r:12,dir:0,walk:0,hit:0},
    monster:{id:"monster",kind:"monster",x:842,y:42,r:21,hp:180,maxHp:180,dir:Math.PI,hit:0,shot:0},
    guards:[
      {id:"g1",kind:"guard",x:215,y:130,r:13,hp:55,maxHp:55,dir:0,hit:0,shot:0,shirt:"#ff6b8e"},
      {id:"g2",kind:"guard",x:600,y:115,r:13,hp:55,maxHp:55,dir:0,hit:0,shot:0,shirt:"#ff9f43"},
      {id:"g3",kind:"guard",x:270,y:400,r:13,hp:55,maxHp:55,dir:0,hit:0,shot:0,shirt:"#a77cff"},
      {id:"g4",kind:"guard",x:690,y:385,r:13,hp:55,maxHp:55,dir:0,hit:0,shot:0,shirt:"#ff6b8e"}
    ], bullets:[],enemyBullets:[],particles:[],
    saveZones:[{x:55,y:225,r:35},{x:845,y:505,r:35}],
    pickups:[{x:340,y:125,type:"coin",taken:false},{x:445,y:290,type:"shield",taken:false},{x:600,y:490,type:"ammo",taken:false},{x:830,y:250,type:"shield",taken:false},{x:105,y:440,type:"coin",taken:false}]
  };
  ui.overlay.innerHTML='<div class="overlay-kicker">OPERATION NIGHTFALL</div><h2>Enter the maze.<br><em>Recover the diamond.</em></h2><p>A horned monster and its guards control Sector 07. Find a path through the maze, collect shields and coins, then defeat the monster.</p><button class="primary-button" id="startButton">START MISSION <span>→</span></button>';
  ui.overlay.classList.remove("hidden"); ui.start=document.getElementById("startButton"); ui.start.onclick=startGame;
  ui.objective.textContent="MONSTER ALIVE"; ui.carrier.textContent="MONSTER UNKNOWN"; ui.progress.style.width="10%"; updateUI();
}

function startGame(){ if(state.won||state.lost) resetState(); state.running=true; state.startTime=performance.now(); ui.overlay.classList.add("hidden"); showToast("MAZE OPEN — DEFEAT THE GUARDS"); lastTime=performance.now(); cancelAnimationFrame(raf); raf=requestAnimationFrame(loop); }
function loop(now){const dt=Math.min((now-lastTime)/1000,.035);lastTime=now;if(state.running){state.elapsed=(now-state.startTime)/1000;update(dt,now);draw();updateUI();raf=requestAnimationFrame(loop);}}

function update(dt,now){
  const p=state.player; let dx=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),dy=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0); const l=Math.hypot(dx,dy)||1;
  if(dx||dy){p.dir=Math.atan2(dy,dx);p.walk+=dt*12;} const speed=now<state.dashReady?360:165; moveEntity(p,dx/l*speed*dt,dy/l*speed*dt);
  if(keys.shift&&now>=state.dashReady){state.dashReady=now+130;keys.shift=false;burst(p.x,p.y,"#56f4e6",10);} if(keys[" "])shoot(now);
  enemies().forEach(e=>{if(e.hp<=0)return;const dist=Math.hypot(p.x-e.x,p.y-e.y),a=Math.atan2(p.y-e.y,p.x-e.x);e.dir=a;if(dist<235){moveEntity(e,Math.cos(a)*(e.kind==="monster"?25:38)*dt,Math.sin(a)*(e.kind==="monster"?25:38)*dt);if(now-e.shot>(e.kind==="monster"?1050:1550)){enemyShoot(e);e.shot=now;}}if(e.hit>0)e.hit-=dt;});
  state.bullets.forEach(b=>{b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(hitsWall(b.x,b.y,3))b.life=0;for(const e of enemies()){if(b.life>0&&e.hp>0&&Math.hypot(b.x-e.x,b.y-e.y)<e.r+5){e.hp-=b.damage;e.hit=.12;b.life=0;burst(e.x,e.y,"#ff4f87",6);if(e.hp<=0){state.coins+=e.kind==="monster"?50:12;showToast(e.kind==="monster"?"MONSTER DEFEATED — DIAMOND RECOVERED":"GUARD DOWN +12 COINS");if(e.kind==="monster")win();}}}});
  state.enemyBullets.forEach(b=>{b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(hitsWall(b.x,b.y,4))b.life=0;if(b.life>0&&Math.hypot(b.x-p.x,b.y-p.y)<p.r+5){b.life=0;state.armor-=b.damage;p.hit=.15;burst(p.x,p.y,"#ff4f87",5);if(state.armor<=0)lose();}});
  state.bullets=state.bullets.filter(b=>b.life>0);state.enemyBullets=state.enemyBullets.filter(b=>b.life>0);state.particles.forEach(q=>{q.x+=q.vx*dt;q.y+=q.vy*dt;q.life-=dt;});state.particles=state.particles.filter(q=>q.life>0);if(p.hit>0)p.hit-=dt;
  state.saveZones.forEach(z=>{if(Math.hypot(p.x-z.x,p.y-z.y)<z.r)state.armor=Math.min(state.maxArmor,state.armor+22*dt);});state.pickups.forEach(i=>{if(!i.taken&&Math.hypot(p.x-i.x,p.y-i.y)<23)collect(i);});
}

function moveEntity(e,dx,dy){const ox=e.x,oy=e.y;e.x=clamp(e.x+dx,e.r+18,W-e.r-18);if(collides(e))e.x=ox;e.y=clamp(e.y+dy,e.r+18,H-e.r-18);if(collides(e))e.y=oy;}
function collides(e){return walls.some(w=>circleRect(e.x,e.y,e.r,w));}
function circleRect(x,y,r,w){const cx=clamp(x,w.x,w.x+w.w),cy=clamp(y,w.y,w.y+w.h);return Math.hypot(x-cx,y-cy)<r;}
function hitsWall(x,y,r){return walls.some(w=>circleRect(x,y,r,w));}
function enemies(){return [...state.guards,state.monster];}
function livingEnemies(){return enemies().filter(e=>e.hp>0);}
function nearestEnemy(){let best=null,d=Infinity;for(const e of livingEnemies()){const n=Math.hypot(state.player.x-e.x,state.player.y-e.y);if(n<d){d=n;best=e;}}return best;}
function shoot(now){const w=weapons.find(x=>x.id===state.currentWeapon);if(state.ammo<=0||now-state.lastShot<w.cooldown)return;const target=nearestEnemy();if(!target)return;state.lastShot=now;state.ammo--;const p=state.player,a=Math.atan2(target.y-p.y,target.x-p.x);p.dir=a;state.bullets.push({x:p.x+Math.cos(a)*15,y:p.y+Math.sin(a)*15,vx:Math.cos(a)*520,vy:Math.sin(a)*520,life:1.5,damage:w.damage});burst(p.x,p.y,"#ffe66d",3);}
function enemyShoot(e){const p=state.player,a=Math.atan2(p.y-e.y,p.x-e.x);state.enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(a)*190,vy:Math.sin(a)*190,life:4,damage:e.kind==="monster"?16:9,color:e.kind==="monster"?"#a77cff":"#ff5d7d"});}
function collect(i){i.taken=true;state.powerups++;if(i.type==="coin"){state.coins+=18;showToast("DIAMOND COINS +18");}if(i.type==="shield"){state.armor=Math.min(state.maxArmor,state.armor+40);showToast("SHIELD COLLECTED +40 ARMOR");}if(i.type==="ammo"){state.ammo=weapons.find(w=>w.id===state.currentWeapon).ammo;showToast("ENERGY CELL REFILLED");}burst(i.x,i.y,i.type==="coin"?"#ffe66d":"#56f4e6",14);}
function win(){state.running=false;state.won=true;ui.objective.textContent="DIAMOND SECURED";ui.carrier.textContent="MONSTER DEFEATED";draw();updateUI();endOverlay("DIAMOND SECURED","The monster is defeated. You recovered the diamond from its backpack!");}
function lose(){state.running=false;state.lost=true;ui.objective.textContent="MISSION FAILED";draw();endOverlay("HERO DOWN","Your shield failed inside the maze. Use save zones and try another path.");}
function endOverlay(title,copy){ui.overlay.innerHTML=`<div class="overlay-kicker">MISSION REPORT</div><h2>${title}<br><em>${state.won?"The maze is clear.":"Return stronger."}</em></h2><p>${copy}</p><button class="primary-button" id="restartButton">RUN IT AGAIN <span>↻</span></button>`;ui.overlay.classList.remove("hidden");document.getElementById("restartButton").onclick=startGame;}

function draw(){drawMap();drawZones();drawPickups();drawBullets();state.guards.forEach(drawGuard);drawMonster(state.monster);drawHero(state.player);drawParticles();}
function drawMap(){const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,"#24145a");bg.addColorStop(.5,"#102856");bg.addColorStop(1,"#361552");ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);ctx.strokeStyle="rgba(116,218,255,.09)";for(let x=0;x<W;x+=35){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}for(let y=0;y<H;y+=35){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}walls.forEach((w,i)=>{const g=ctx.createLinearGradient(w.x,w.y,w.x+w.w,w.y+w.h);g.addColorStop(0,i%2?"#613a8e":"#215d83");g.addColorStop(1,i%2?"#342858":"#183854");ctx.fillStyle=g;ctx.fillRect(w.x,w.y,w.w,w.h);ctx.strokeStyle=i%2?"#b47cff":"#55d9ff";ctx.lineWidth=1.5;ctx.strokeRect(w.x+.5,w.y+.5,w.w-1,w.h-1);});ctx.fillStyle="#98a9e5";ctx.font="10px DM Mono";ctx.fillText("MAZE ENTRANCE",27,535);ctx.fillText("MONSTER LAIR",785,30);}
function drawZones(){state.saveZones.forEach(z=>{ctx.beginPath();ctx.arc(z.x,z.y,z.r,0,Math.PI*2);ctx.fillStyle="rgba(86,244,230,.15)";ctx.fill();ctx.strokeStyle="#56f4e6";ctx.lineWidth=2;ctx.setLineDash([6,4]);ctx.stroke();ctx.setLineDash([]);drawShield(z.x,z.y,13,"#56f4e6");});}
function drawShield(x,y,s,color){ctx.save();ctx.translate(x,y);ctx.beginPath();ctx.moveTo(0,-s);ctx.lineTo(s*.8,-s*.55);ctx.lineTo(s*.65,s*.45);ctx.quadraticCurveTo(0,s*1.2,0,s*1.2);ctx.quadraticCurveTo(0,s*1.2,-s*.65,s*.45);ctx.lineTo(-s*.8,-s*.55);ctx.closePath();ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=14;ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle="#fff";ctx.lineWidth=1.5;ctx.stroke();ctx.restore();}
function drawDiamond(x,y,s){ctx.save();ctx.translate(x,y);ctx.beginPath();ctx.moveTo(0,-s);ctx.lineTo(s*.8,-s*.25);ctx.lineTo(s*.48,s*.7);ctx.lineTo(0,s);ctx.lineTo(-s*.48,s*.7);ctx.lineTo(-s*.8,-s*.25);ctx.closePath();const g=ctx.createLinearGradient(-s,-s,s,s);g.addColorStop(0,"#fff");g.addColorStop(.25,"#82f7ff");g.addColorStop(.7,"#4da6ff");g.addColorStop(1,"#c077ff");ctx.fillStyle=g;ctx.shadowColor="#7defff";ctx.shadowBlur=18;ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle="#fff";ctx.stroke();ctx.beginPath();ctx.moveTo(-s*.8,-s*.25);ctx.lineTo(s*.8,-s*.25);ctx.moveTo(0,-s);ctx.lineTo(-s*.25,-s*.25);ctx.lineTo(0,s);ctx.lineTo(s*.25,-s*.25);ctx.closePath();ctx.strokeStyle="rgba(255,255,255,.7)";ctx.stroke();ctx.restore();}
function drawPickups(){state.pickups.forEach(i=>{if(i.taken)return;if(i.type==="shield")drawShield(i.x,i.y,12,"#56f4e6");else if(i.type==="coin"){ctx.fillStyle="#ffe66d";ctx.shadowColor="#ffe66d";ctx.shadowBlur=12;ctx.beginPath();ctx.arc(i.x,i.y,9,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle="#a46900";ctx.font="bold 11px sans-serif";ctx.textAlign="center";ctx.fillText("◆",i.x,i.y+4);ctx.textAlign="left";}else{ctx.fillStyle="#ff9f43";ctx.fillRect(i.x-7,i.y-11,14,22);ctx.strokeStyle="#fff";ctx.strokeRect(i.x-7,i.y-11,14,22);}});}
function drawHuman(x,y,dir,shirt,skin,walk,hero=false,hit=false){ctx.save();ctx.translate(x,y);ctx.rotate(dir+Math.PI/2);ctx.globalAlpha=hit?.7:1;const step=Math.sin(walk||0)*4;ctx.strokeStyle=hero?"#b9fff6":"#291326";ctx.lineWidth=5;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(-4,8);ctx.lineTo(-6+step,18);ctx.moveTo(4,8);ctx.lineTo(6-step,18);ctx.stroke();ctx.fillStyle=shirt;ctx.beginPath();ctx.roundRect(-9,-7,18,19,5);ctx.fill();ctx.strokeStyle=skin;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-8,-3);ctx.lineTo(-14,6-step);ctx.moveTo(8,-3);ctx.lineTo(14,6+step);ctx.stroke();ctx.fillStyle=skin;ctx.beginPath();ctx.arc(0,-13,7,0,Math.PI*2);ctx.fill();ctx.fillStyle=hero?"#263d5e":"#3a1c2a";ctx.beginPath();ctx.arc(0,-15,7,Math.PI,Math.PI*2);ctx.fill();if(hero){ctx.fillStyle="#56f4e6";ctx.fillRect(-7,-2,14,4);ctx.fillStyle="#ffe66d";ctx.fillRect(9,-5,9,4);}ctx.restore();}
function drawHero(p){drawHuman(p.x,p.y,p.dir,"#21d6c2","#f1b58a",p.walk,true,p.hit>0);ctx.fillStyle="#d9fffb";ctx.font="bold 9px DM Mono";ctx.textAlign="center";ctx.fillText("HERO",p.x,p.y-27);ctx.textAlign="left";}
function drawGuard(e){if(e.hp<=0)return;drawHuman(e.x,e.y,e.dir,e.shirt,"#d99572",state.elapsed*5,false,e.hit>0);drawHealth(e);}
function drawMonster(e){if(e.hp<=0){drawDiamond(e.x,e.y,14);return;}ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.dir+Math.PI/2);ctx.globalAlpha=e.hit>0?.7:1;ctx.fillStyle="#55265f";ctx.fillRect(-15,-5,30,25);ctx.fillStyle="#7e45a0";ctx.beginPath();ctx.ellipse(0,2,20,24,0,0,Math.PI*2);ctx.fill();ctx.fillStyle="#9b58bd";ctx.beginPath();ctx.arc(0,-19,15,0,Math.PI*2);ctx.fill();ctx.fillStyle="#ffe66d";ctx.beginPath();ctx.moveTo(-12,-28);ctx.lineTo(-20,-42);ctx.lineTo(-5,-31);ctx.moveTo(12,-28);ctx.lineTo(20,-42);ctx.lineTo(5,-31);ctx.fill();ctx.fillStyle="#ff4f87";ctx.beginPath();ctx.arc(-6,-21,3,0,Math.PI*2);ctx.arc(6,-21,3,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#d6a6e9";ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(-14,3);ctx.lineTo(-25,17);ctx.moveTo(14,3);ctx.lineTo(25,17);ctx.stroke();ctx.fillStyle="#2c1b44";ctx.fillRect(-18,6,36,23);ctx.restore();drawDiamond(e.x+12,e.y+8,9);ctx.fillStyle="#ff9bc1";ctx.font="bold 9px DM Mono";ctx.textAlign="center";ctx.fillText("DIAMOND MONSTER",e.x,e.y-31);ctx.textAlign="left";drawHealth(e);}
function drawHealth(e){ctx.fillStyle="#261c40";ctx.fillRect(e.x-20,e.y-25,40,4);ctx.fillStyle=e.kind==="monster"?"#b36cff":"#ff5d7d";ctx.fillRect(e.x-20,e.y-25,40*Math.max(e.hp,0)/e.maxHp,4);}
function drawBullets(){state.bullets.forEach(b=>{ctx.fillStyle="#ffe66d";ctx.shadowColor="#ff9f43";ctx.shadowBlur=10;ctx.beginPath();ctx.arc(b.x,b.y,3,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;});state.enemyBullets.forEach(b=>{ctx.fillStyle=b.color;ctx.beginPath();ctx.arc(b.x,b.y,4,0,Math.PI*2);ctx.fill();});}
function burst(x,y,color,count){for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=20+Math.random()*75;state.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.35+Math.random()*.4,color});}}
function drawParticles(){state.particles.forEach(q=>{ctx.globalAlpha=Math.max(0,q.life/.7);ctx.fillStyle=q.color;ctx.fillRect(q.x,q.y,3,3);});ctx.globalAlpha=1;}

function updateUI(){ui.armor.textContent=Math.max(0,Math.round(state.armor));ui.armorBar.style.width=`${Math.max(0,state.armor)}%`;ui.armorBar.style.background=state.armor<30?"#ff4f87":"#56f4e6";ui.coins.textContent=state.coins;const w=weapons.find(x=>x.id===state.currentWeapon);ui.weaponName.textContent=w.name;ui.ammo.textContent=`AMMO ${state.ammo} / ${w.ammo}`;ui.ammoBar.style.width=`${state.ammo/w.ammo*100}%`;const down=enemies().filter(e=>e.hp<=0).length;ui.progress.style.width=`${10+down/enemies().length*90}%`;ui.timer.textContent=`${String(Math.floor(state.elapsed/60)).padStart(2,"0")}:${String(Math.floor(state.elapsed%60)).padStart(2,"0")}`;if(state.running)ui.carrier.textContent=state.guards.some(g=>g.hp>0)?`${state.guards.filter(g=>g.hp>0).length} GUARDS + MONSTER`:"MONSTER EXPOSED";ui.pickup.textContent=state.powerups?`${state.powerups} POWER-UP${state.powerups>1?"S":""} COLLECTED`:"NO POWER-UPS";}
function showToast(m){ui.toast.textContent=m;ui.toast.classList.add("show");clearTimeout(showToast.t);showToast.t=setTimeout(()=>ui.toast.classList.remove("show"),2200);}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function renderArmory(){ui.weapons.innerHTML=weapons.map(w=>{const unlocked=state.unlocked.includes(w.id),equipped=state.currentWeapon===w.id,label=equipped?"EQUIPPED":unlocked?"EQUIP":`◆ ${w.cost}`;return `<div class="weapon-card"><span class="mini-icon">${w.icon}</span><div><h4>${w.name}</h4><p>${w.desc}</p></div><button class="${equipped?"equipped":!unlocked?"locked":""}" data-weapon="${w.id}">${label}</button></div>`;}).join("");ui.weapons.querySelectorAll("button").forEach(btn=>btn.onclick=()=>{const id=btn.dataset.weapon,w=weapons.find(x=>x.id===id);if(state.unlocked.includes(id)){state.currentWeapon=id;state.ammo=w.ammo;showToast(`${w.name} EQUIPPED`);}else if(state.coins>=w.cost){state.coins-=w.cost;state.unlocked.push(id);state.currentWeapon=id;state.ammo=w.ammo;showToast(`${w.name} UNLOCKED`);}else showToast(`NEED ${w.cost-state.coins} MORE COINS`);renderArmory();updateUI();});}

document.addEventListener("keydown",e=>{const k=e.key.toLowerCase();if([" ","arrowup","arrowdown","arrowleft","arrowright"].includes(k))e.preventDefault();keys[k]=true;if(k==="b"){renderArmory();ui.armory.classList.toggle("open");}});document.addEventListener("keyup",e=>keys[e.key.toLowerCase()]=false);
document.getElementById("resetButton").onclick=()=>{resetState();draw();};document.getElementById("armoryButton").onclick=()=>{renderArmory();ui.armory.classList.toggle("open");};document.getElementById("closeArmory").onclick=()=>ui.armory.classList.remove("open");document.getElementById("soundToggle").onclick=e=>{muted=!muted;e.currentTarget.textContent=muted?"◌":"◒";showToast(muted?"SOUND OFF":"SOUND ON");};
resetState();draw();
