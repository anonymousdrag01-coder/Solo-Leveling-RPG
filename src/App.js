import { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════
// STORAGE HELPERS
// ═══════════════════════════════════════
const DB = {
  get: (key, def) => { try { const v = localStorage.getItem("slrpg_" + key); return v ? JSON.parse(v) : def; } catch { return def; } },
  set: (key, val) => { try { localStorage.setItem("slrpg_" + key, JSON.stringify(val)); } catch {} },
  del: (key) => { try { localStorage.removeItem("slrpg_" + key); } catch {} }
};

// ═══════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════
const RANKS = ["E","D","C","B","A","S","SS","SSS","National","Monarch"];
const RANK_COLORS = { E:"#94a3b8",D:"#34d399",C:"#60a5fa",B:"#a78bfa",A:"#fbbf24",S:"#f87171",SS:"#fb923c",SSS:"#e879f9",National:"#22d3ee",Monarch:"#fde68a" };
const RANK_XP = [0,500,1500,3500,7000,13000,23000,40000,70000,120000];

const WEAPONS_DB = [
  {id:"w1",name:"Iron Dagger",icon:"🗡️",type:"weapon",rank:"E",stat:"STR",bonus:3,desc:"A basic hunter blade"},
  {id:"w2",name:"Shadow Sword",icon:"⚔️",type:"weapon",rank:"D",stat:"STR",bonus:7,desc:"Forged in darkness"},
  {id:"w3",name:"Storm Blade",icon:"🌩️",type:"weapon",rank:"C",stat:"STR",bonus:12,desc:"Crackles with power"},
  {id:"w4",name:"Void Katana",icon:"🔱",type:"weapon",rank:"B",stat:"AGI",bonus:15,desc:"Cuts dimensions"},
  {id:"w5",name:"Monarch Edge",icon:"👑",type:"weapon",rank:"S",stat:"STR",bonus:25,desc:"Weapon of kings"},
  {id:"a1",name:"Leather Vest",icon:"🥋",type:"armor",rank:"E",stat:"VIT",bonus:3,desc:"Basic protection"},
  {id:"a2",name:"Shadow Cloak",icon:"🧥",type:"armor",rank:"D",stat:"VIT",bonus:7,desc:"Absorbs shadows"},
  {id:"a3",name:"Steel Plate",icon:"🛡️",type:"armor",rank:"C",stat:"VIT",bonus:12,desc:"Heavy dungeon armor"},
  {id:"a4",name:"Void Mail",icon:"✨",type:"armor",rank:"B",stat:"AGI",bonus:15,desc:"Armor of void"},
  {id:"a5",name:"Monarch Robe",icon:"👘",type:"armor",rank:"S",stat:"VIT",bonus:25,desc:"Robe of the Monarch"},
  {id:"r1",name:"Focus Ring",icon:"💍",type:"ring",rank:"E",stat:"INT",bonus:3,desc:"Sharpens the mind"},
  {id:"r2",name:"Scholar Band",icon:"📿",type:"ring",rank:"D",stat:"INT",bonus:7,desc:"Ancient knowledge"},
  {id:"r3",name:"Arcane Loop",icon:"🔮",type:"ring",rank:"C",stat:"INT",bonus:12,desc:"Stores arcane power"},
  {id:"b1",name:"Energy Boost",icon:"⚡",type:"consumable",rank:"E",stat:"ALL",bonus:5,desc:"Temporary power surge"},
  {id:"b2",name:"Shadow Elixir",icon:"🧪",type:"consumable",rank:"D",stat:"ALL",bonus:10,desc:"Dark energy potion"},
];

const DAILY_TEMPLATES = [
  {id:"d_water",label:"Drink 8 Glasses of Water",icon:"💧",xp:10,stat:"VIT",gain:1,durations:null},
  {id:"d_walk",label:"Go for a Walk",icon:"🚶",xp:15,stat:"AGI",gain:1,durations:[10,15,20,30]},
  {id:"d_journal",label:"Write in Journal",icon:"📓",xp:10,stat:"INT",gain:1,durations:[10,15,20,30]},
  {id:"d_read",label:"Read a Book",icon:"📚",xp:15,stat:"INT",gain:2,durations:[10,15,20,30]},
  {id:"d_meditate",label:"Meditate",icon:"🧘",xp:10,stat:"INT",gain:1,durations:[10,15,20,30]},
  {id:"d_knowledge",label:"Learn Something New",icon:"🧠",xp:20,stat:"INT",gain:2,durations:[10,15,20,30]},
  {id:"d_sleep",label:"Sleep 7+ Hours",icon:"😴",xp:15,stat:"VIT",gain:2,durations:null},
  {id:"d_nophone",label:"1hr Screen-Free Block",icon:"📵",xp:20,stat:"INT",gain:2,durations:null},
];

const defaultPlayer = {
  name:"", gender:"male", goals:[], level:1, xp:0, totalXP:0,
  rank:"E", rankIndex:0, coins:0,
  stats:{STR:5,AGI:5,INT:5,VIT:5},
  streak:0, lastLogin:null, completedToday:[],
  inventory:[], equipped:{weapon:null,armor:null,ring:null},
  bossDefeated:[], totalQuests:0, dungeons:{},
  roadmap:null, onboarded:false,
};

function xpNeeded(l){ return l*120+l*l*15; }
function getRankFromXP(totalXP){ let r=0; for(let i=RANK_XP.length-1;i>=0;i--){ if(totalXP>=RANK_XP[i]){r=i;break;} } return r; }

// ═══════════════════════════════════════
// CLAUDE API
// ═══════════════════════════════════════
async function callClaude(messages, system="You are a helpful AI."){
  try{
    const res = await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1000, system, messages })
    });
    const data = await res.json();
    return data.content?.map(c=>c.text||"").join("")||"";
  } catch(e){ return ""; }
}

// ═══════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════
export default function App(){
  const [player, setPlayer] = useState(()=>({...defaultPlayer,...DB.get("player",{})}));
  const [screen, setScreen] = useState("home");
  const [notif, setNotif] = useState(null);
  const [popup, setPopup] = useState(null); // {type, data}
  const [levelAnim, setLevelAnim] = useState(false);
  const [rankAnim, setRankAnim] = useState(null);
  const notifT = useRef();

  // Login streak
  useEffect(()=>{
    const p = {...player};
    const today = new Date().toDateString();
    if(p.lastLogin !== today){
      const yesterday = new Date(Date.now()-86400000).toDateString();
      p.streak = p.lastLogin===yesterday ? p.streak+1 : 1;
      p.lastLogin = today;
      p.completedToday = [];
      update(p);
    }
  },[]);

  function update(p){
    const newRankIdx = getRankFromXP(p.totalXP);
    if(newRankIdx > p.rankIndex){
      p.rankIndex = newRankIdx; p.rank = RANKS[newRankIdx];
      setRankAnim(p.rank); setTimeout(()=>setRankAnim(null),3000);
    }
    DB.set("player", p);
    setPlayer({...p});
  }

  function showNotif(msg, type="xp"){
    setNotif({msg,type});
    if(notifT.current) clearTimeout(notifT.current);
    notifT.current = setTimeout(()=>setNotif(null),3500);
  }

  function gainXP(amount, questLabel=""){
    const p = {...player};
    p.xp += amount; p.totalXP += amount; p.coins += Math.floor(amount/5);
    let leveled = false;
    while(p.xp >= xpNeeded(p.level)){ p.xp -= xpNeeded(p.level); p.level++; leveled=true; }
    update(p);
    if(leveled){ setLevelAnim(true); setTimeout(()=>setLevelAnim(false),2500); }
    showNotif(`⚡ +${amount} XP${questLabel?" — "+questLabel:""}`, leveled?"level":"xp");
    // Random item drop
    if(Math.random() > 0.55){
      const available = WEAPONS_DB.filter(w=>!player.inventory.includes(w.id)&&w.type!=="consumable");
      if(available.length){ const item=available[Math.floor(Math.random()*available.length)]; setTimeout(()=>setPopup({type:"item_drop",data:item}),1000); }
    }
    return leveled;
  }

  function completeQuest(quest, dungeonId=null){
    if(player.completedToday.includes(quest.id)) return;
    const p = {...player};
    p.completedToday = [...p.completedToday, quest.id];
    p.totalQuests = (p.totalQuests||0)+1;
    if(quest.stat && quest.stat!=="ALL") p.stats = {...p.stats,[quest.stat]:(p.stats[quest.stat]||0)+(quest.gain||1)};
    if(dungeonId){ p.dungeons = {...p.dungeons,[dungeonId]:{...(p.dungeons[dungeonId]||{}),progress:(p.dungeons[dungeonId]?.progress||0)+1}}; }
    update(p);
    setPopup({type:"quest_complete",data:{quest,xp:quest.xp||20}});
  }

  function resetQuest(questId){
    const p = {...player};
    p.completedToday = p.completedToday.filter(id=>id!==questId);
    update(p);
    showNotif("Quest reset ✓","xp");
  }

  function equipItem(itemId){
    const item = WEAPONS_DB.find(w=>w.id===itemId);
    if(!item||item.type==="consumable") return;
    const p = {...player};
    const prev = p.equipped[item.type];
    if(prev){ const old=WEAPONS_DB.find(w=>w.id===prev); if(old&&old.stat!=="ALL") p.stats[old.stat]=Math.max(5,p.stats[old.stat]-old.bonus); }
    if(p.equipped[item.type]===itemId){ p.equipped={...p.equipped,[item.type]:null}; showNotif(`${item.icon} Unequipped`,"xp"); }
    else{ p.equipped={...p.equipped,[item.type]:itemId}; if(item.stat!=="ALL") p.stats[item.stat]=(p.stats[item.stat]||0)+item.bonus; showNotif(`${item.icon} ${item.name} equipped! +${item.bonus} ${item.stat}`,"level"); }
    update(p);
  }

  function addToInventory(itemId){
    if(player.inventory.includes(itemId)) return;
    const p = {...player};
    p.inventory = [...p.inventory, itemId];
    update(p);
  }

  const rc = RANK_COLORS[player.rank]||"#fde68a";

  if(!player.onboarded) return <Onboarding onComplete={(data)=>{ const p={...defaultPlayer,...data,onboarded:true,lastLogin:new Date().toDateString(),streak:1}; update(p); }}/>;

  return(
    <div style={S.root}>
      <AnimBg/>
      {notif && <Notif data={notif}/>}
      {levelAnim && <LevelUpOverlay level={player.level}/>}
      {rankAnim && <RankUpOverlay rank={rankAnim} color={RANK_COLORS[rankAnim]}/>}
      {popup?.type==="quest_complete" && <QuestCompletePopup data={popup.data} onClose={()=>{ gainXP(popup.data.xp, popup.data.quest.label); setPopup(null); }}/>}
      {popup?.type==="item_drop" && <ItemDropPopup item={popup.data} onClose={()=>setPopup(null)} onEquip={()=>{ addToInventory(popup.data.id); equipItem(popup.data.id); setPopup(null); }} onBag={()=>{ addToInventory(popup.data.id); setPopup(null); showNotif(`${popup.data.icon} ${popup.data.name} added to bag!`,"level"); }}/>}
      {popup?.type==="quest_detail" && <QuestDetailPopup quest={popup.data.quest} player={player} onComplete={()=>{ completeQuest(popup.data.quest, popup.data.dungeonId); setPopup(null); }} onReset={()=>{ resetQuest(popup.data.quest.id); setPopup(null); }} onClose={()=>setPopup(null)}/>}

      {/* TOP HEADER */}
      <div style={S.header}>
        <div style={{...S.rankBadge,color:rc,borderColor:rc,boxShadow:`0 0 15px ${rc}66`}}>{player.rank}</div>
        <div style={S.hMid}>
          <div style={S.hName}>{player.name}</div>
          <div style={S.hSub}>Level {player.level} · 🔥{player.streak}d · 🪙{player.coins}</div>
        </div>
        <button style={S.aiBtn} onClick={()=>setScreen("ai")}>🤖</button>
      </div>

      {/* XP BAR */}
      <div style={S.xpRow}>
        <div style={S.xpTrack}><div style={{...S.xpFill,width:`${Math.min((player.xp/xpNeeded(player.level))*100,100)}%`,background:`linear-gradient(90deg,${rc}99,${rc},#fff8)`}}/></div>
        <span style={S.xpTxt}>{player.xp}/{xpNeeded(player.level)}</span>
      </div>

      {/* NAV */}
      <div style={S.nav}>
        {[["home","🏠","Home"],["dungeons","⚔️","Dungeons"],["quests","📋","Quests"],["daily","☀️","Daily"],["gear","🎒","Gear"],["ai","🤖","AI Guide"]].map(([id,ic,lb])=>(
          <button key={id} style={{...S.navBtn,...(screen===id?S.navOn:{})}} onClick={()=>setScreen(id)}>
            <span style={{fontSize:16}}>{ic}</span>
            <span style={{fontSize:8,letterSpacing:0.5,marginTop:1}}>{lb}</span>
          </button>
        ))}
      </div>

      {/* CONTENT */}
      <div style={S.content}>
        {screen==="home"     && <HomeTab player={player} rc={rc} setPopup={setPopup} update={update}/>}
        {screen==="dungeons" && <DungeonsTab player={player} update={update} setPopup={setPopup} completeQuest={completeQuest} showNotif={showNotif}/>}
        {screen==="quests"   && <QuestsTab player={player} update={update} setPopup={setPopup} completeQuest={completeQuest}/>}
        {screen==="daily"    && <DailyTab player={player} setPopup={setPopup} completeQuest={completeQuest} resetQuest={resetQuest}/>}
        {screen==="gear"     && <GearTab player={player} equipItem={equipItem}/>}
        {screen==="ai"       && <AIGuideTab player={player} update={update} showNotif={showNotif}/>}
      </div>
      <style>{CSS}</style>
    </div>
  );
}

// ═══════════════════════════════════════
// ONBOARDING
// ═══════════════════════════════════════
function Onboarding({onComplete}){
  const [step,setStep]=useState(0);
  const [name,setName]=useState("");
  const [gender,setGender]=useState("male");
  const [goalsText,setGoalsText]=useState("");
  const [analyzing,setAnalyzing]=useState(false);

  async function finish(){
    setAnalyzing(true);
    const goals = goalsText.split(",").map(g=>g.trim()).filter(Boolean);
    onComplete({name,gender,goals,dungeons:Object.fromEntries(goals.map((g,i)=>([`d_${i}`,{name:g,icon:["⚔️","🧠","💪","🏆","🎯","🔥"][i%6],quests:[],progress:0,milestone:0}])))});
  }

  return(
    <div style={S.setupBg}>
      <AnimBg/>
      <div style={S.setupCard}>
        {step===0&&<>
          <div style={{textAlign:"center",fontSize:50,marginBottom:8}}>⚔️</div>
          <div style={S.setupTitle}>HUNTER AWAKENING</div>
          <div style={S.setupSub}>The System has chosen you. What is your name, Hunter?</div>
          <input style={S.inp} placeholder="Enter your name..." value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&name.trim()&&setStep(1)}/>
          <button style={{...S.bigBtn,opacity:name.trim()?1:0.4}} onClick={()=>name.trim()&&setStep(1)}>CONTINUE →</button>
        </>}
        {step===1&&<>
          <div style={{textAlign:"center",fontSize:40,marginBottom:8}}>⚡</div>
          <div style={S.setupTitle}>CHOOSE YOUR FORM</div>
          <div style={S.setupSub}>How do you identify, Hunter?</div>
          <div style={{display:"flex",gap:12,margin:"16px 0",width:"100%"}}>
            {[["male","🧑","Male"],["female","👩","Female"],["other","🧑‍🦰","Other"]].map(([g,em,lb])=>(
              <div key={g} style={{...S.gCard,flex:1,borderColor:gender===g?"#a78bfa":"#e2e8f0",background:gender===g?"#f5f3ff":"#fff"}} onClick={()=>setGender(g)}>
                <HunterAvatar gender={g} rank="E" size={60}/>
                <div style={{fontWeight:700,color:gender===g?"#8b5cf6":"#64748b",fontSize:13,marginTop:6}}>{lb}</div>
              </div>
            ))}
          </div>
          <button style={S.bigBtn} onClick={()=>setStep(2)}>CONTINUE →</button>
        </>}
        {step===2&&<>
          <div style={{textAlign:"center",fontSize:40,marginBottom:8}}>🎯</div>
          <div style={S.setupTitle}>YOUR ULTIMATE GOALS</div>
          <div style={S.setupSub}>What do you want to achieve at max level? Separate by commas.</div>
          <div style={{color:"#94a3b8",fontSize:12,marginBottom:10,textAlign:"center"}}>e.g. Elite Physique, Master NIMHANS, Clear SSC CGL, Build a Business</div>
          <textarea style={{...S.inp,height:90,resize:"none"}} placeholder="Type your goals, separated by commas..." value={goalsText} onChange={e=>setGoalsText(e.target.value)}/>
          <button style={{...S.bigBtn,opacity:goalsText.trim()&&!analyzing?1:0.5}} onClick={()=>!analyzing&&goalsText.trim()&&finish()}>
            {analyzing?"Creating your world...":"⚔️ BEGIN LEVELING"}
          </button>
        </>}
        <div style={{display:"flex",gap:8,justifyContent:"center",marginTop:16}}>
          {[0,1,2].map(i=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:i===step?"#8b5cf6":"#e2e8f0",transition:"all 0.3s"}}/>)}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// AVATAR SVG
// ═══════════════════════════════════════
function HunterAvatar({gender,rank,size=120,equipped={}}){
  const ri = RANKS.indexOf(rank)||0;
  const rc = RANK_COLORS[rank]||"#94a3b8";
  const isFemale = gender==="female";
  const isOther = gender==="other";
  const skin = ["#fde68a","#fcd34d","#f59e0b","#d97706","#fde68a","#e0f2fe","#fde68a","#f0abfc","#a5f3fc","#fde68a"][ri];
  const hair = isFemale
    ? ["#92400e","#7c3aed","#db2777","#6d28d9","#c2410c","#000","#ec4899","#f0abfc","#bfdbfe","#fde68a"][ri]
    : isOther
    ? ["#6d28d9","#7c3aed","#db2777","#4f46e5","#0369a1","#000","#ec4899","#06b6d4","#84cc16","#fbbf24"][ri]
    : ["#1e293b","#1e293b","#0f172a","#4c1d95","#1e293b","#000","#7c3aed","#ec4899","#0369a1","#fbbf24"][ri];
  const armor = equipped.armor ? ({a1:"#94a3b8",a2:"#334155",a3:"#475569",a4:"#312e81",a5:"#1e1b4b"}[equipped.armor]||"#94a3b8") : "#475569";
  const weaponIcon = equipped.weapon?({w1:"🗡️",w2:"⚔️",w3:"🌩️",w4:"🔱",w5:"👑"}[equipped.weapon]||"⚔️"):"";
  const hasAura = ri>=4;
  const hasWings = ri>=7;
  const hasCrown = ri>=9;
  const scale = size/120;

  return(
    <svg width={size} height={size*1.3} viewBox="0 0 120 156" style={{overflow:"visible",display:"block"}}>
      {hasAura&&<ellipse cx="60" cy="120" rx="40" ry="12" fill={rc} opacity="0.2"><animate attributeName="opacity" values="0.1;0.3;0.1" dur="2s" repeatCount="indefinite"/></ellipse>}
      {hasWings&&<>
        <path d="M25 72 Q5 50 15 25 Q30 55 38 72" fill={rc} opacity="0.6"><animate attributeName="d" values="M25 72 Q5 50 15 25 Q30 55 38 72;M22 70 Q0 45 12 20 Q28 52 35 70;M25 72 Q5 50 15 25 Q30 55 38 72" dur="2s" repeatCount="indefinite"/></path>
        <path d="M95 72 Q115 50 105 25 Q90 55 82 72" fill={rc} opacity="0.6"><animate attributeName="d" values="M95 72 Q115 50 105 25 Q90 55 82 72;M98 70 Q120 45 108 20 Q92 52 85 70;M95 72 Q115 50 105 25 Q90 55 82 72" dur="2s" repeatCount="indefinite"/></path>
      </>}
      {/* Legs */}
      <rect x="44" y="108" width="13" height="34" rx="5" fill={armor}/>
      <rect x="63" y="108" width="13" height="34" rx="5" fill={armor}/>
      <rect x="42" y="132" width="16" height="10" rx="3" fill="#1e293b"/>
      <rect x="62" y="132" width="16" height="10" rx="3" fill="#1e293b"/>
      {/* Body */}
      <rect x="38" y="70" width="44" height="42" rx="10" fill={armor}/>
      {ri>=1&&<rect x="38" y="70" width="44" height="10" rx="5" fill={rc} opacity="0.7"/>}
      {ri>=3&&<path d="M60 74 L60 110" stroke={rc} strokeWidth="2" opacity="0.4"/>}
      
      {ri>=3&&<line x1="38" y1="90" x2="82" y2="90" stroke={rc} strokeWidth="1.5" opacity="0.3"/>}
      {ri>=3&&<path d={`M38 72 Q22 88 26 112 L38 105 Z`} fill={rc} opacity="0.45"/>}
      {ri>=3&&<path d={`M82 72 Q98 88 94 112 L82 105 Z`} fill={rc} opacity="0.45"/>}
      {/* Arms */}
      <rect x="22" y="72" width="15" height="32" rx="7" fill={armor}/>
      <rect x="83" y="72" width="15" height="32" rx="7" fill={armor}/>
      <ellipse cx="29" cy="107" rx="6" ry="6" fill={skin}/>
      <ellipse cx="91" cy="107" rx="6" ry="6" fill={skin}/>
      {weaponIcon&&<text x="100" y="115" fontSize="16" textAnchor="middle">{weaponIcon}</text>}
      {/* Neck */}
      <rect x="54" y="62" width="12" height="12" rx="4" fill={skin}/>
      {/* Head */}
      <ellipse cx="60" cy="48" rx={isFemale?17:18} ry="20" fill={skin}/>
      {/* Hair */}
      {isFemale?<>
        <ellipse cx="60" cy="30" rx="17" ry="9" fill={hair}/>
        <path d="M43 34 Q36 55 40 68" stroke={hair} strokeWidth="7" fill="none" strokeLinecap="round"/>
        <path d="M77 34 Q84 55 80 68" stroke={hair} strokeWidth="7" fill="none" strokeLinecap="round"/>
        {ri>=4&&<path d="M60 24 Q52 14 47 8" stroke={hair} strokeWidth="3" fill="none"/>}
        {ri>=4&&<path d="M60 24 Q68 14 73 8" stroke={hair} strokeWidth="3" fill="none"/>}
      </>:isOther?<>
        <ellipse cx="60" cy="30" rx="18" ry="9" fill={hair}/>
        <path d="M42 34 Q38 44 42 54" stroke={hair} strokeWidth="5" fill="none" strokeLinecap="round"/>
        <path d="M78 34 Q82 44 78 54" stroke={hair} strokeWidth="5" fill="none" strokeLinecap="round"/>
        {ri>=3&&<path d="M50 26 L50 16 M60 24 L60 12 M70 26 L70 16" stroke={hair} strokeWidth="3" fill="none"/>}
      </>:<>
        <ellipse cx="60" cy="30" rx="18" ry="9" fill={hair}/>
        <rect x="42" y="30" width="9" height="16" rx="4" fill={hair}/>
        <rect x="69" y="30" width="9" height="16" rx="4" fill={hair}/>
        {ri>=5&&<path d="M60 22 Q48 10 42 4" stroke={hair} strokeWidth="3.5" fill="none"/>}
        {ri>=5&&<path d="M60 22 Q72 10 78 4" stroke={hair} strokeWidth="3.5" fill="none"/>}
      </>}
      {/* Eyes */}
      <ellipse cx="52" cy="48" rx="3.5" ry={ri>=4?4.5:3} fill={ri>=4?rc:"#1e293b"}/>
      <ellipse cx="68" cy="48" rx="3.5" ry={ri>=4?4.5:3} fill={ri>=4?rc:"#1e293b"}/>
      {ri>=4&&<><ellipse cx="52" cy="48" rx="1.5" ry="2" fill="#fff" opacity="0.9"/><ellipse cx="68" cy="48" rx="1.5" ry="2" fill="#fff" opacity="0.9"/></>}
      {/* Mouth */}
      {ri<5?<path d="M55 58 Q60 62 65 58" stroke="#92400e" strokeWidth="1.5" fill="none" strokeLinecap="round"/>:<path d="M55 57 Q60 54 65 57" stroke={rc} strokeWidth="1.5" fill="none" strokeLinecap="round"/>}
      {/* Rank on chest */}
      {ri>=1&&<text x="60" y="96" fontSize="10" textAnchor="middle" fill={rc} fontWeight="bold">{RANKS[ri]}</text>}
      {/* Crown */}
      {hasCrown&&<path d="M44 32 L50 20 L60 28 L70 20 L76 32" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1.5"/>}
      {/* Sparkles */}
      {ri>=6&&[[-18,-22],[18,-26],[-22,2],[22,-2]].map(([dx,dy],i)=>(
        <text key={i} x={60+dx} y={48+dy} fontSize="9" textAnchor="middle" opacity="0.8">
          <animate attributeName="opacity" values="0;1;0" dur={`${1+i*0.4}s`} repeatCount="indefinite"/>
          {["✦","✧","⋆","✦"][i]}
        </text>
      ))}
    </svg>
  );
}

// ═══════════════════════════════════════
// HOME TAB
// ═══════════════════════════════════════
function HomeTab({player,rc,setPopup,update}){
  const ri = player.rankIndex||0;
  const nextRankXP = RANK_XP[Math.min(ri+1,RANK_XP.length-1)];
  const rankPct = Math.min((player.totalXP/Math.max(nextRankXP,1))*100,100);
  const equippedItems = Object.values(player.equipped).filter(Boolean).map(id=>WEAPONS_DB.find(w=>w.id===id)).filter(Boolean);
  const todayDone = (player.completedToday||[]).length;
  const dungeonEntries = Object.entries(player.dungeons||{});

  return(
    <div>
      {/* AVATAR CARD */}
      <div style={S.avatarCard}>
        <div style={S.avatarGlow}/>
        <div style={{position:"relative",zIndex:2,display:"flex",flexDirection:"column",alignItems:"center",padding:"20px 16px 16px"}}>
          <HunterAvatar gender={player.gender||"male"} rank={player.rank} size={130} equipped={player.equipped}/>
          <div style={{color:rc,fontFamily:"'Cinzel Decorative',serif",fontSize:20,marginTop:10,textShadow:`0 0 20px ${rc}99`}}>{player.name}</div>
          <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap",justifyContent:"center"}}>
            <span style={{...S.chip,background:rc+"22",color:rc,border:`1px solid ${rc}66`}}>{player.rank}-Rank</span>
            <span style={{...S.chip,background:"#f1f5f9",color:"#475569"}}>Lv.{player.level}</span>
            <span style={{...S.chip,background:"#fff7ed",color:"#ea580c"}}>🔥 {player.streak}d</span>
            <span style={{...S.chip,background:"#fefce8",color:"#ca8a04"}}>🪙 {player.coins}</span>
          </div>
          {equippedItems.length>0&&(
            <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap",justifyContent:"center"}}>
              {equippedItems.map(item=><span key={item.id} style={{...S.chip,background:"#faf5ff",color:"#7c3aed",border:"1px solid #e9d5ff"}}>{item.icon} {item.name}</span>)}
            </div>
          )}
          {/* Rank bar */}
          <div style={{width:"100%",marginTop:14}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{color:"rgba(255,255,255,0.5)",fontSize:11}}>Rank Progress</span>
              <span style={{color:rc,fontSize:11,fontWeight:700}}>→ {RANKS[Math.min(ri+1,RANKS.length-1)]}</span>
            </div>
            <div style={S.xpTrack}><div style={{...S.xpFill,width:`${rankPct}%`,background:`linear-gradient(90deg,${rc},#fff8)`}}/></div>
          </div>
        </div>
      </div>

      {/* STATS */}
      <Card title="📊 ABILITY SCORES">
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {[["STR","⚔️","#ef4444"],["AGI","💨","#10b981"],["INT","🧠","#60a5fa"],["VIT","❤️","#fbbf24"]].map(([k,ic,cl])=>(
            <div key={k} style={{background:"#f8fafc",borderRadius:10,padding:10,borderLeft:`3px solid ${cl}`}}>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:16}}>{ic}</span><span style={{color:cl,fontWeight:900,fontSize:22}}>{player.stats[k]}</span></div>
              <div style={{color:"#94a3b8",fontSize:9,letterSpacing:1,marginTop:2}}>{k==="STR"?"STRENGTH":k==="AGI"?"AGILITY":k==="INT"?"INTELLIGENCE":"VITALITY"}</div>
              <div style={{height:3,background:"#e2e8f0",borderRadius:2,marginTop:6,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(player.stats[k],100)}%`,background:cl,borderRadius:2,transition:"width 0.5s"}}/></div>
            </div>
          ))}
        </div>
      </Card>

      {/* ACTIVE DUNGEONS */}
      {dungeonEntries.length>0&&<Card title="⚔️ ACTIVE DUNGEONS">
        {dungeonEntries.map(([id,d])=>(
          <div key={id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #f1f5f9"}}>
            <span style={{fontSize:22}}>{d.icon||"⚔️"}</span>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,color:"#1e293b",fontSize:13}}>{d.name}</div>
              <div style={{height:4,background:"#f1f5f9",borderRadius:2,marginTop:4,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${Math.min((d.progress||0)*10,100)}%`,background:"linear-gradient(90deg,#8b5cf6,#a78bfa)",borderRadius:2}}/>
              </div>
            </div>
            <span style={{color:"#94a3b8",fontSize:11}}>{d.progress||0} done</span>
          </div>
        ))}
      </Card>}

      {/* TODAY SUMMARY */}
      <Card title="☀️ TODAY'S PROGRESS">
        <div style={{display:"flex",gap:12,textAlign:"center"}}>
          <div style={{flex:1,background:"#f0fdf4",borderRadius:10,padding:10}}>
            <div style={{color:"#16a34a",fontWeight:900,fontSize:24}}>{todayDone}</div>
            <div style={{color:"#86efac",fontSize:10}}>QUESTS DONE</div>
          </div>
          <div style={{flex:1,background:"#faf5ff",borderRadius:10,padding:10}}>
            <div style={{color:"#8b5cf6",fontWeight:900,fontSize:24}}>{player.totalQuests||0}</div>
            <div style={{color:"#c4b5fd",fontSize:10}}>TOTAL QUESTS</div>
          </div>
          <div style={{flex:1,background:"#fff7ed",borderRadius:10,padding:10}}>
            <div style={{color:"#ea580c",fontWeight:900,fontSize:24}}>{player.totalXP}</div>
            <div style={{color:"#fdba74",fontSize:10}}>TOTAL XP</div>
          </div>
        </div>
      </Card>

      {/* GOALS */}
      <Card title="🎯 YOUR GOALS">
        {(player.goals||[]).map((g,i)=>(
          <div key={i} style={{display:"flex",gap:10,alignItems:"center",padding:"6px 0",borderBottom:"1px solid #f8fafc"}}>
            <span style={{fontSize:18}}>{["⚔️","🧠","💪","🏆","🎯","🔥"][i%6]}</span>
            <span style={{color:"#334155",fontSize:13,fontWeight:600}}>{g}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════
// DUNGEONS TAB
// ═══════════════════════════════════════
function DungeonsTab({player,update,setPopup,completeQuest,showNotif}){
  const [active,setActive]=useState(null);
  const [genLoading,setGenLoading]=useState({});
  const dungeonEntries = Object.entries(player.dungeons||{});

  async function generateDungeonQuests(id, dungeon){
    if(genLoading[id]) return;
    setGenLoading(p=>({...p,[id]:true}));
    const txt = await callClaude(
      [{role:"user",content:`Create 6 RPG-style quests for a personal growth dungeon called "${dungeon.name}". The hunter's goals are: ${(player.goals||[]).join(", ")}. Make quests specific, actionable, motivating. Return ONLY JSON array: [{"id":"dq1","label":"task","desc":"details","xp":20,"stat":"INT","gain":2,"icon":"📚"}]. Stats: STR/AGI/INT/VIT. XP 15-35.`}],
      "You are an RPG quest designer creating personal growth quests. Return only valid JSON."
    );
    try{
      const clean=txt.replace(/```json|```/g,"").trim();
      const quests=JSON.parse(clean);
      const p={...player};
      p.dungeons={...p.dungeons,[id]:{...p.dungeons[id],quests:quests.map(q=>({...q,id:`${id}_${q.id}`}))}};
      update(p);
    } catch {
      const p={...player};
      p.dungeons={...p.dungeons,[id]:{...p.dungeons[id],quests:[{id:`${id}_1`,label:`Begin ${dungeon.name} journey`,desc:"Take the first step",xp:20,stat:"INT",gain:2,icon:"🎯"}]}};
      update(p);
    }
    setGenLoading(p=>({...p,[id]:false}));
  }

  function addCustomQuest(dungeonId){
    const label = prompt("Quest name:");
    if(!label) return;
    const p={...player};
    const dq = {id:`${dungeonId}_custom_${Date.now()}`,label,desc:"Custom quest",xp:20,stat:"INT",gain:2,icon:"⚡"};
    p.dungeons={...p.dungeons,[dungeonId]:{...p.dungeons[dungeonId],quests:[...(p.dungeons[dungeonId]?.quests||[]),dq]}};
    update(p); showNotif("Custom quest added! ⚡","xp");
  }

  if(active){
    const d = player.dungeons[active];
    const quests = d?.quests||[];
    return(
      <div>
        <button style={S.backBtn} onClick={()=>setActive(null)}>← Back</button>
        <div style={{...S.dungeonBanner,borderColor:RANK_COLORS["B"]}}>
          <span style={{fontSize:40}}>{d.icon||"⚔️"}</span>
          <div>
            <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:16,color:"#1e293b"}}>{d.name}</div>
            <div style={{color:"#94a3b8",fontSize:12}}>{d.progress||0} quests completed</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <button style={{...S.smallBtn,flex:1}} onClick={()=>generateDungeonQuests(active,d)}>{genLoading[active]?"Generating...":"🤖 AI Generate Quests"}</button>
          <button style={{...S.smallBtn,flex:1,background:"#f0fdf4",color:"#16a34a",border:"1px solid #bbf7d0"}} onClick={()=>addCustomQuest(active)}>+ Add Quest</button>
        </div>
        {quests.length===0&&!genLoading[active]&&<div style={{textAlign:"center",padding:30,color:"#94a3b8"}}>No quests yet. Generate AI quests or add your own!</div>}
        {genLoading[active]&&<div style={S.loadBox}><div style={S.spinner}/><div style={{color:"#8b5cf6",marginTop:10}}>Generating quests...</div></div>}
        {quests.map(q=>{
          const done=(player.completedToday||[]).includes(q.id);
          return(
            <div key={q.id} style={{...S.questCard,opacity:done?0.5:1,borderLeft:`4px solid ${done?"#e2e8f0":"#8b5cf6"}`}}
              onClick={()=>setPopup({type:"quest_detail",data:{quest:q,dungeonId:active}})}>
              <span style={{fontSize:22}}>{q.icon}</span>
              <div style={{flex:1,marginLeft:10}}>
                <div style={{fontWeight:600,color:"#1e293b",fontSize:13}}>{q.label}</div>
                <div style={{color:"#94a3b8",fontSize:11,marginTop:2}}>+{q.xp}XP · +{q.gain} {q.stat}</div>
              </div>
              <span style={{fontSize:18,color:done?"#10b981":"#cbd5e1"}}>{done?"✓":"›"}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return(
    <div>
      <div style={S.cardTitle}>⚔️ YOUR DUNGEONS</div>
      <div style={{color:"#94a3b8",fontSize:12,marginBottom:12}}>Each goal is a dungeon. Enter any, progress freely.</div>
      {dungeonEntries.map(([id,d])=>(
        <div key={id} style={S.dungeonCard} onClick={()=>setActive(id)}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:52,height:52,borderRadius:14,background:"linear-gradient(135deg,#8b5cf622,#a78bfa22)",border:"2px solid #a78bfa44",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>{d.icon||"⚔️"}</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,color:"#1e293b",fontSize:15}}>{d.name}</div>
              <div style={{color:"#94a3b8",fontSize:11,marginTop:2}}>{(d.quests||[]).length} quests · {d.progress||0} completed</div>
              <div style={{height:4,background:"#f1f5f9",borderRadius:2,marginTop:6,overflow:"hidden",width:"80%"}}>
                <div style={{height:"100%",width:`${Math.min(((d.progress||0)/(Math.max((d.quests||[]).length,1)))*100,100)}%`,background:"linear-gradient(90deg,#8b5cf6,#a78bfa)",borderRadius:2,transition:"width 0.5s"}}/>
              </div>
            </div>
            <span style={{color:"#a78bfa",fontSize:22}}>›</span>
          </div>
        </div>
      ))}
      <button style={{...S.smallBtn,width:"100%",marginTop:8}} onClick={()=>{
        const name=prompt("New dungeon/goal name:");
        if(!name) return;
        const p={...player};
        const id=`d_${Date.now()}`;
        p.dungeons={...p.dungeons,[id]:{name,icon:["⚔️","🧠","💪","🏆","🎯","🔥"][Object.keys(p.dungeons).length%6],quests:[],progress:0}};
        p.goals=[...(p.goals||[]),name];
        update(p);
      }}>+ Add New Dungeon</button>
    </div>
  );
}

// ═══════════════════════════════════════
// QUESTS TAB (global)
// ═══════════════════════════════════════
function QuestsTab({player,update,setPopup,completeQuest}){
  const allDungeonQuests = Object.entries(player.dungeons||{}).flatMap(([did,d])=>(d.quests||[]).map(q=>({...q,dungeonId:did,dungeonName:d.name})));

  function addGlobalQuest(){
    const label=prompt("Quest name:");
    if(!label) return;
    const p={...player};
    if(!p.dungeons["d_global"]) p.dungeons={...p.dungeons,d_global:{name:"Personal",icon:"🌟",quests:[],progress:0}};
    const q={id:`g_${Date.now()}`,label,desc:"",xp:20,stat:"INT",gain:2,icon:"⚡"};
    p.dungeons.d_global.quests=[...(p.dungeons.d_global.quests||[]),q];
    update(p);
  }

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={S.cardTitle}>📋 ALL QUESTS</div>
        <button style={{...S.smallBtn,padding:"6px 12px"}} onClick={addGlobalQuest}>+ Add</button>
      </div>
      {allDungeonQuests.length===0&&<div style={{textAlign:"center",padding:30,color:"#94a3b8"}}>Go to Dungeons tab to generate quests!</div>}
      {allDungeonQuests.map(q=>{
        const done=(player.completedToday||[]).includes(q.id);
        return(
          <div key={q.id} style={{...S.questCard,opacity:done?0.5:1,borderLeft:`4px solid ${done?"#e2e8f0":"#8b5cf6"}`}}
            onClick={()=>setPopup({type:"quest_detail",data:{quest:q,dungeonId:q.dungeonId}})}>
            <span style={{fontSize:22}}>{q.icon}</span>
            <div style={{flex:1,marginLeft:10}}>
              <div style={{fontWeight:600,color:"#1e293b",fontSize:13}}>{q.label}</div>
              <div style={{color:"#94a3b8",fontSize:11,marginTop:2}}>{q.dungeonName} · +{q.xp}XP</div>
            </div>
            <span style={{fontSize:18,color:done?"#10b981":"#cbd5e1"}}>{done?"✓":"›"}</span>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════
// DAILY TAB
// ═══════════════════════════════════════
function DailyTab({player,setPopup,completeQuest,resetQuest}){
  const [durations,setDurations]=useState({});
  return(
    <div>
      <div style={S.cardTitle}>☀️ DAILY DISCIPLINES</div>
      <div style={{color:"#94a3b8",fontSize:12,marginBottom:12}}>Resets every day. Reset if completed by mistake.</div>
      {DAILY_TEMPLATES.map(q=>{
        const done=(player.completedToday||[]).includes(q.id);
        const dur=durations[q.id];
        const finalQ={...q,label:q.durations&&dur?`${q.label} (${dur} min)`:q.label,id:q.durations&&dur?`${q.id}_${dur}`:q.id};
        return(
          <div key={q.id} style={{...S.questCard,opacity:done?0.5:1,borderLeft:`4px solid ${done?"#e2e8f0":"#10b981"}`}}>
            <span style={{fontSize:22}}>{q.icon}</span>
            <div style={{flex:1,marginLeft:10}}>
              <div style={{fontWeight:600,color:"#1e293b",fontSize:13}}>{q.label}</div>
              {q.durations&&!done&&(
                <div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap"}}>
                  {q.durations.map(d=>(
                    <button key={d} style={{...S.durBtn,background:dur===d?"#8b5cf6":"#f1f5f9",color:dur===d?"#fff":"#64748b"}} onClick={e=>{e.stopPropagation();setDurations(prev=>({...prev,[q.id]:d}));}}>
                      {d}m
                    </button>
                  ))}
                </div>
              )}
              <div style={{color:"#94a3b8",fontSize:11,marginTop:2}}>+{q.xp}XP · +{q.gain} {q.stat}</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {!done?<button style={{...S.doneBtn,background:"#10b981",color:"#fff"}} onClick={()=>setPopup({type:"quest_detail",data:{quest:finalQ}})}>→</button>
                :<button style={{...S.doneBtn,background:"#fee2e2",color:"#ef4444",fontSize:11}} onClick={()=>resetQuest(finalQ.id)}>↩</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════
// GEAR TAB
// ═══════════════════════════════════════
function GearTab({player,equipItem}){
  const types=["weapon","armor","ring","consumable"];
  return(
    <div>
      {/* Equipped display */}
      <Card title="⚡ EQUIPPED GEAR">
        <div style={{display:"flex",gap:8}}>
          {["weapon","armor","ring"].map(t=>{
            const item=player.equipped[t]?WEAPONS_DB.find(w=>w.id===player.equipped[t]):null;
            return(
              <div key={t} style={{flex:1,background:item?"#faf5ff":"#f8fafc",border:`2px solid ${item?"#a78bfa":"#e2e8f0"}`,borderRadius:12,padding:10,textAlign:"center",minHeight:76,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                {item?<><div style={{fontSize:22}}>{item.icon}</div><div style={{fontSize:10,color:"#7c3aed",fontWeight:700,marginTop:3}}>{item.name}</div><div style={{fontSize:9,color:"#94a3b8"}}>+{item.bonus} {item.stat}</div></>
                :<><div style={{fontSize:20,color:"#cbd5e1"}}>○</div><div style={{fontSize:9,color:"#94a3b8",textTransform:"capitalize"}}>{t}</div></>}
              </div>
            );
          })}
        </div>
      </Card>
      <div style={S.cardTitle}>📦 INVENTORY ({player.inventory.length} items)</div>
      {player.inventory.length===0&&<div style={{textAlign:"center",padding:30,color:"#94a3b8",fontSize:13}}>Complete quests to find items! 🎒</div>}
      {WEAPONS_DB.filter(w=>player.inventory.includes(w.id)).map(item=>{
        const isEq=Object.values(player.equipped).includes(item.id);
        const rc2=RANK_COLORS[item.rank]||"#94a3b8";
        return(
          <div key={item.id} style={{...S.questCard,borderLeft:`4px solid ${rc2}`,background:isEq?"#faf5ff":"#fff"}}>
            <span style={{fontSize:26}}>{item.icon}</span>
            <div style={{flex:1,marginLeft:10}}>
              <div style={{fontWeight:700,color:"#1e293b",fontSize:13}}>{item.name}</div>
              <div style={{color:"#94a3b8",fontSize:11,marginTop:1}}>{item.desc}</div>
              <div style={{display:"flex",gap:6,marginTop:4}}>
                <span style={{background:rc2+"22",color:rc2,fontSize:9,padding:"1px 6px",borderRadius:10,fontWeight:700}}>{item.rank}</span>
                <span style={{background:"#f1f5f9",color:"#64748b",fontSize:9,padding:"1px 6px",borderRadius:10}}>+{item.bonus} {item.stat}</span>
              </div>
            </div>
            {item.type!=="consumable"&&<button style={{...S.doneBtn,background:isEq?"#8b5cf6":"#1e293b",color:"#fff",width:56,fontSize:11}} onClick={()=>equipItem(item.id)}>{isEq?"Unequip":"Equip"}</button>}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════
// AI GUIDE TAB
// ═══════════════════════════════════════
function AIGuideTab({player,update,showNotif}){
  const [messages,setMessages]=useState(()=>DB.get("ai_chat",[{role:"assistant",content:`⚔️ Welcome, ${player.name||"Hunter"}! I am your System Guide — an AI companion bound to your growth journey.\n\nI know your goals: ${(player.goals||[]).join(", ")||"not set yet"}.\n\nYou are currently ${player.rank}-Rank, Level ${player.level}. Tell me about your current habits, schedule, or ask me anything — I'll create your roadmap and guide you forward! 🌟`}]));
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const endRef=useRef();
  const SYSTEM_PROMPT=`You are an AI System Guide in a gamified life-improvement RPG app. The user's name is ${player.name}. Their goals are: ${(player.goals||[]).join(", ")}. They are ${player.rank}-Rank, Level ${player.level}, Streak: ${player.streak} days. Stats: STR ${player.stats.STR}, AGI ${player.stats.AGI}, INT ${player.stats.INT}, VIT ${player.stats.VIT}.\n\nYour personality: highly positive, supportive, psychologically aware, adaptive, never guilt-trips, encourages consistently. You speak like a wise RPG mentor who genuinely cares about the user's growth. Use RPG metaphors naturally. When creating roadmaps, make them actionable and inspiring. Help with quest ideas, motivation, habit building, difficulty adjustment.`;

  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:"smooth"}); },[messages]);
  useEffect(()=>{ DB.set("ai_chat",messages.slice(-30)); },[messages]);

  async function send(){
    if(!input.trim()||loading) return;
    const userMsg={role:"user",content:input.trim()};
    const newMsgs=[...messages,userMsg];
    setMessages(newMsgs); setInput(""); setLoading(true);
    const reply=await callClaude(newMsgs.slice(-10).map(m=>({role:m.role,content:m.content})),SYSTEM_PROMPT);
    setMessages(prev=>[...prev,{role:"assistant",content:reply||"I'm here with you, Hunter. Keep going! ⚔️"}]);
    setLoading(false);
  }

  return(
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 200px)"}}>
      <div style={S.cardTitle}>🤖 SYSTEM GUIDE</div>
      <div style={{flex:1,overflowY:"auto",paddingBottom:8}}>
        {messages.map((m,i)=>(
          <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",marginBottom:10}}>
            {m.role==="assistant"&&<div style={{width:28,height:28,borderRadius:"50%",background:"linear-gradient(135deg,#8b5cf6,#6d28d9)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,marginRight:6,flexShrink:0,marginTop:2}}>🤖</div>}
            <div style={{...S.bubble,background:m.role==="user"?"linear-gradient(135deg,#8b5cf6,#6d28d9)":"rgba(255,255,255,0.95)",color:m.role==="user"?"#fff":"#1e293b",borderRadius:m.role==="user"?"18px 18px 4px 18px":"18px 18px 18px 4px",maxWidth:"80%"}}>
              <div style={{fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{m.content}</div>
            </div>
          </div>
        ))}
        {loading&&<div style={{display:"flex",gap:6,padding:"8px 12px",background:"rgba(255,255,255,0.9)",borderRadius:18,width:"fit-content",marginBottom:8}}>
          {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:"#8b5cf6",animation:`bounce 1s ${i*0.2}s infinite`}}/>)}
        </div>}
        <div ref={endRef}/>
      </div>
      <div style={{display:"flex",gap:8,paddingTop:8,background:"transparent"}}>
        <input style={{...S.inp,flex:1,marginBottom:0,background:"rgba(255,255,255,0.95)"}} placeholder="Ask your System Guide..." value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()}/>
        <button style={{...S.doneBtn,background:"linear-gradient(135deg,#8b5cf6,#6d28d9)",color:"#fff",width:44,height:44,fontSize:18}} onClick={send} disabled={loading}>→</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// POPUPS
// ═══════════════════════════════════════
function QuestCompletePopup({data,onClose}){
  return(
    <div style={S.overlay}>
      <div style={{...S.popCard,textAlign:"center"}}>
        <div style={{fontSize:60,animation:"bounceIn 0.5s ease"}}>🎉</div>
        <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:20,color:"#8b5cf6",marginTop:8}}>QUEST COMPLETE!</div>
        <div style={{color:"#475569",fontSize:14,margin:"8px 0 16px"}}>{data.quest.label}</div>
        <div style={{background:"linear-gradient(135deg,#faf5ff,#f5f3ff)",borderRadius:16,padding:16,marginBottom:16}}>
          <div style={{color:"#7c3aed",fontWeight:900,fontSize:32}}>+{data.xp} XP</div>
          <div style={{color:"#a78bfa",fontSize:13,marginTop:4}}>Yeeey! You're getting stronger! ⚡</div>
        </div>
        <button style={{...S.bigBtn,background:"linear-gradient(135deg,#8b5cf6,#6d28d9)"}} onClick={onClose}>CLAIM REWARD</button>
      </div>
    </div>
  );
}

function QuestDetailPopup({quest,player,onComplete,onReset,onClose}){
  const done=(player.completedToday||[]).includes(quest.id);
  const [timer,setTimer]=useState(null);
  const [running,setRunning]=useState(false);
  const [timeLeft,setTimeLeft]=useState(0);
  const timerRef=useRef();

  function startTimer(mins){ setTimeLeft(mins*60); setRunning(true); setTimer(mins); }
  useEffect(()=>{
    if(running&&timeLeft>0){ timerRef.current=setTimeout(()=>setTimeLeft(t=>t-1),1000); }
    else if(running&&timeLeft===0){ setRunning(false); }
    return()=>clearTimeout(timerRef.current);
  },[running,timeLeft]);

  const mins=Math.floor(timeLeft/60); const secs=timeLeft%60;

  return(
    <div style={S.overlay}>
      <div style={S.popCard}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
          <span style={{fontSize:28}}>{quest.icon}</span>
          <button style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#94a3b8"}} onClick={onClose}>✕</button>
        </div>
        <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:16,color:"#1e293b",marginBottom:6}}>{quest.label}</div>
        {quest.desc&&<div style={{color:"#64748b",fontSize:13,marginBottom:12,lineHeight:1.6}}>{quest.desc}</div>}
        <div style={{background:"#f8fafc",borderRadius:12,padding:12,marginBottom:16}}>
          <div style={{display:"flex",gap:12}}>
            <div style={{flex:1,textAlign:"center"}}><div style={{color:"#8b5cf6",fontWeight:900,fontSize:20}}>+{quest.xp}</div><div style={{color:"#94a3b8",fontSize:10}}>XP</div></div>
            <div style={{flex:1,textAlign:"center"}}><div style={{color:"#10b981",fontWeight:900,fontSize:20}}>+{quest.gain}</div><div style={{color:"#94a3b8",fontSize:10}}>{quest.stat}</div></div>
          </div>
        </div>
        {/* Timer */}
        {!timer&&<div style={{marginBottom:12}}>
          <div style={{color:"#94a3b8",fontSize:11,marginBottom:6}}>OPTIONAL TIMER</div>
          <div style={{display:"flex",gap:6}}>
            {[10,15,20,30].map(m=><button key={m} style={S.durBtn} onClick={()=>startTimer(m)}>{m}m</button>)}
          </div>
        </div>}
        {timer&&<div style={{textAlign:"center",padding:"12px 0",marginBottom:12}}>
          <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:32,color:running?"#8b5cf6":"#10b981"}}>{mins}:{secs.toString().padStart(2,"0")}</div>
          <div style={{color:"#94a3b8",fontSize:11,marginTop:4}}>{running?"Focus time...":"Time's up!"}</div>
          {running&&<button style={{...S.durBtn,marginTop:8}} onClick={()=>setRunning(false)}>Pause</button>}
          {!running&&timeLeft>0&&<button style={{...S.durBtn,marginTop:8}} onClick={()=>setRunning(true)}>Resume</button>}
        </div>}
        <div style={{display:"flex",gap:8}}>
          {!done?<button style={{...S.bigBtn,flex:2,background:"linear-gradient(135deg,#8b5cf6,#6d28d9)",padding:"12px"}} onClick={onComplete}>✓ Complete</button>
            :<button style={{...S.bigBtn,flex:2,background:"#fee2e2",color:"#ef4444",border:"1px solid #fca5a5",padding:"12px"}} onClick={onReset}>↩ Reset</button>}
        </div>
        {done&&<div style={{textAlign:"center",color:"#10b981",fontSize:12,marginTop:8}}>✓ Completed today</div>}
      </div>
    </div>
  );
}

function ItemDropPopup({item,onClose,onEquip,onBag}){
  return(
    <div style={S.overlay}>
      <div style={{...S.popCard,textAlign:"center"}}>
        <div style={{color:"#f59e0b",fontWeight:700,letterSpacing:2,fontSize:13,marginBottom:8}}>✨ ITEM FOUND!</div>
        <div style={{fontSize:64,margin:"12px 0",animation:"bounceIn 0.6s ease"}}>{item.icon}</div>
        <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:18,color:"#1e293b"}}>{item.name}</div>
        <div style={{color:"#64748b",fontSize:13,margin:"6px 0 12px"}}>{item.desc}</div>
        <div style={{background:"#f8fafc",borderRadius:12,padding:10,marginBottom:16}}>
          <span style={{color:RANK_COLORS[item.rank],fontWeight:700}}>{item.rank}-Rank · +{item.bonus} {item.stat}</span>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button style={{...S.bigBtn,flex:1,background:"#f1f5f9",color:"#64748b",padding:"11px"}} onClick={onBag}>Into Bag</button>
          <button style={{...S.bigBtn,flex:1,background:"linear-gradient(135deg,#8b5cf6,#6d28d9)",padding:"11px"}} onClick={onEquip}>Equip!</button>
        </div>
      </div>
    </div>
  );
}

function LevelUpOverlay({level}){
  return(
    <div style={{position:"fixed",inset:0,zIndex:9998,background:"rgba(255,255,255,0.96)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",animation:"fadeIn 0.3s"}}>
      <div style={{fontSize:80,animation:"bounceIn 0.5s ease"}}>⚡</div>
      <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:44,color:"#8b5cf6",textShadow:"0 0 40px #8b5cf6",marginTop:8,animation:"scaleIn 0.5s ease"}}>LEVEL UP!</div>
      <div style={{fontSize:26,color:"#1e293b",marginTop:8,fontWeight:700}}>Level {level}</div>
      <div style={{color:"#94a3b8",marginTop:6}}>You are getting stronger... ⚔️</div>
    </div>
  );
}

function RankUpOverlay({rank,color}){
  return(
    <div style={{position:"fixed",inset:0,zIndex:9998,background:"rgba(0,0,0,0.92)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#94a3b8",letterSpacing:6,fontSize:13,marginBottom:10}}>RANK ADVANCEMENT</div>
      <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:90,color,textShadow:`0 0 60px ${color}`,animation:"scaleIn 0.6s ease"}}>{rank}</div>
      <div style={{color,fontSize:22,marginTop:8,letterSpacing:4,fontFamily:"'Cinzel Decorative',serif"}}>{rank}-RANK HUNTER</div>
      <div style={{color:"#64748b",fontSize:14,marginTop:10}}>The shadows bow before you...</div>
    </div>
  );
}

function Notif({data}){
  const bg = {xp:"rgba(15,23,42,0.95)",level:"rgba(109,40,217,0.95)",rankup:"rgba(239,68,68,0.95)"}[data.type]||"rgba(15,23,42,0.95)";
  const border = {xp:"#60a5fa",level:"#a78bfa",rankup:"#f87171"}[data.type]||"#60a5fa";
  return(
    <div style={{position:"fixed",top:14,left:"50%",transform:"translateX(-50%)",zIndex:9999,padding:"10px 22px",borderRadius:30,background:bg,border:`1px solid ${border}`,color:"#fff",fontWeight:700,fontSize:13,whiteSpace:"nowrap",animation:"slideDown 0.3s ease",boxShadow:`0 0 20px ${border}55`,fontFamily:"'Rajdhani',sans-serif",letterSpacing:0.5}}>
      {data.msg}
    </div>
  );
}

function AnimBg(){
  return(
    <div style={{position:"fixed",inset:0,zIndex:0,pointerEvents:"none",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,background:"linear-gradient(145deg,#0a001f 0%,#13003a 35%,#0a0015 65%,#000510 100%)"}}/>
      <div style={{position:"absolute",top:"-10%",left:"20%",width:"60%",height:"55%",background:"radial-gradient(ellipse,#4c1d9555 0%,transparent 70%)",filter:"blur(60px)",animation:"pulse 6s ease-in-out infinite"}}/>
      <div style={{position:"absolute",bottom:"5%",right:"5%",width:"45%",height:"40%",background:"radial-gradient(ellipse,#1e3a5f44 0%,transparent 70%)",filter:"blur(40px)"}}/>
      <div style={{position:"absolute",inset:0,backgroundImage:"linear-gradient(rgba(139,92,246,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(139,92,246,0.04) 1px,transparent 1px)",backgroundSize:"44px 44px"}}/>
      {/* floating rune watermark */}
      <svg style={{position:"absolute",bottom:"3%",left:"50%",transform:"translateX(-50%)",opacity:0.04}} width="320" height="320" viewBox="0 0 320 320">
        <circle cx="160" cy="160" r="150" fill="none" stroke="#a78bfa" strokeWidth="1.5"/>
        <circle cx="160" cy="160" r="110" fill="none" stroke="#a78bfa" strokeWidth="0.8"/>
        <circle cx="160" cy="160" r="70" fill="none" stroke="#a78bfa" strokeWidth="0.8"/>
        {[0,30,60,90,120,150,180,210,240,270,300,330].map(a=><line key={a} x1="160" y1="12" x2="160" y2="55" stroke="#a78bfa" strokeWidth="1.5" transform={`rotate(${a},160,160)`}/>)}
        <text x="160" y="168" textAnchor="middle" fontSize="28" fill="#a78bfa" fontFamily="serif">⚔</text>
      </svg>
      {/* floating particles */}
      {[...Array(10)].map((_,i)=>(
        <div key={i} style={{position:"absolute",width:i%3===0?3:2,height:i%3===0?3:2,borderRadius:"50%",background:["#a78bfa","#60a5fa","#f87171","#34d399","#fbbf24"][i%5],left:`${8+i*9}%`,top:`${15+i*7}%`,animation:`float${i%3} ${3+i*0.7}s ease-in-out infinite`,opacity:0.5}}/>
      ))}
    </div>
  );
}

function Card({title,children}){
  return(
    <div style={S.card}>
      {title&&<div style={S.cardTitle}>{title}</div>}
      {children}
    </div>
  );
}

// ═══════════════════════════════════════
// STYLES
// ═══════════════════════════════════════
const S={
  root:{minHeight:"100vh",color:"#1e293b",fontFamily:"'Rajdhani',sans-serif",maxWidth:480,margin:"0 auto",position:"relative",overflowX:"hidden"},
  header:{display:"flex",alignItems:"center",gap:10,padding:"14px 14px 4px",position:"relative",zIndex:10},
  rankBadge:{width:46,height:46,borderRadius:10,border:"2px solid",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:900,fontFamily:"'Cinzel Decorative',serif",background:"rgba(255,255,255,0.95)",backdropFilter:"blur(10px)"},
  hMid:{flex:1},
  hName:{fontFamily:"'Cinzel Decorative',serif",fontSize:14,color:"#fff",textShadow:"0 2px 8px rgba(0,0,0,0.5)"},
  hSub:{fontSize:11,color:"rgba(255,255,255,0.55)",marginTop:1},
  aiBtn:{background:"rgba(139,92,246,0.3)",border:"1px solid rgba(139,92,246,0.5)",borderRadius:10,color:"#c4b5fd",fontSize:18,width:38,height:38,cursor:"pointer",backdropFilter:"blur(10px)"},
  xpRow:{display:"flex",alignItems:"center",gap:8,padding:"2px 14px 6px",position:"relative",zIndex:10},
  xpTrack:{flex:1,height:6,background:"rgba(255,255,255,0.1)",borderRadius:3,overflow:"hidden"},
  xpFill:{height:"100%",borderRadius:3,transition:"width 0.6s ease"},
  xpTxt:{color:"rgba(255,255,255,0.4)",fontSize:9,whiteSpace:"nowrap"},
  nav:{display:"flex",gap:3,padding:"3px 10px 6px",position:"relative",zIndex:10},
  navBtn:{flex:1,padding:"7px 2px",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,color:"rgba(255,255,255,0.45)",fontSize:13,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:1,backdropFilter:"blur(10px)",transition:"all 0.2s"},
  navOn:{background:"rgba(255,255,255,0.95)",border:"1px solid rgba(255,255,255,0.9)",color:"#1e293b",boxShadow:"0 4px 12px rgba(0,0,0,0.2)"},
  content:{padding:"4px 12px 80px",position:"relative",zIndex:10},
  card:{background:"rgba(255,255,255,0.93)",borderRadius:16,padding:16,marginBottom:12,boxShadow:"0 4px 20px rgba(0,0,0,0.12)",backdropFilter:"blur(12px)"},
  cardTitle:{fontFamily:"'Cinzel Decorative',serif",fontSize:11,color:"#8b5cf6",letterSpacing:2,marginBottom:10,padding:"2px 0"},
  avatarCard:{background:"rgba(255,255,255,0.08)",borderRadius:20,marginBottom:12,overflow:"hidden",position:"relative",border:"1px solid rgba(255,255,255,0.15)",backdropFilter:"blur(20px)"},
  avatarGlow:{position:"absolute",inset:0,background:"linear-gradient(135deg,rgba(139,92,246,0.25),rgba(59,130,246,0.15))",zIndex:1},
  chip:{borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700},
  dungeonCard:{background:"rgba(255,255,255,0.93)",borderRadius:14,padding:14,marginBottom:10,cursor:"pointer",boxShadow:"0 2px 12px rgba(0,0,0,0.1)",backdropFilter:"blur(10px)",border:"1px solid rgba(255,255,255,0.5)"},
  dungeonBanner:{display:"flex",alignItems:"center",gap:14,background:"rgba(255,255,255,0.93)",borderRadius:14,padding:"12px 14px",marginBottom:12,border:"2px solid"},
  questCard:{background:"rgba(255,255,255,0.93)",borderRadius:12,padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",cursor:"pointer",boxShadow:"0 2px 8px rgba(0,0,0,0.08)",backdropFilter:"blur(10px)"},
  bubble:{padding:"10px 14px",maxWidth:"80%",lineHeight:1.5},
  doneBtn:{width:38,height:38,borderRadius:10,border:"none",fontSize:16,fontWeight:900,cursor:"pointer",transition:"all 0.2s",flexShrink:0},
  durBtn:{padding:"4px 10px",background:"#f1f5f9",border:"1px solid #e2e8f0",borderRadius:8,fontSize:12,cursor:"pointer",color:"#64748b",fontFamily:"'Rajdhani',sans-serif"},
  smallBtn:{padding:"8px 14px",background:"#faf5ff",border:"1px solid #e9d5ff",borderRadius:10,color:"#8b5cf6",fontSize:13,cursor:"pointer",fontWeight:700,fontFamily:"'Rajdhani',sans-serif"},
  backBtn:{padding:"6px 14px",background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:10,color:"rgba(255,255,255,0.8)",fontSize:13,cursor:"pointer",marginBottom:12,fontFamily:"'Rajdhani',sans-serif"},
  loadBox:{display:"flex",flexDirection:"column",alignItems:"center",padding:40},
  spinner:{width:36,height:36,border:"3px solid #e9d5ff",borderTopColor:"#8b5cf6",borderRadius:"50%",animation:"spin 1s linear infinite"},
  overlay:{position:"fixed",inset:0,zIndex:9995,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(6px)"},
  popCard:{background:"#fff",borderRadius:24,padding:22,width:"100%",maxWidth:360,maxHeight:"88vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.4)"},
  setupBg:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20},
  setupCard:{background:"rgba(255,255,255,0.97)",borderRadius:24,padding:28,maxWidth:400,width:"100%",position:"relative",zIndex:10,boxShadow:"0 20px 60px rgba(0,0,0,0.4)"},
  setupTitle:{fontFamily:"'Cinzel Decorative',serif",fontSize:18,color:"#1e293b",textAlign:"center",marginBottom:6,letterSpacing:1},
  setupSub:{color:"#94a3b8",fontSize:13,textAlign:"center",marginBottom:16,lineHeight:1.6},
  gCard:{borderRadius:14,padding:14,border:"2px solid",cursor:"pointer",textAlign:"center",transition:"all 0.3s"},
  inp:{width:"100%",background:"#f8fafc",border:"2px solid #e2e8f0",borderRadius:12,padding:"11px 14px",color:"#1e293b",fontSize:14,fontFamily:"'Rajdhani',sans-serif",marginBottom:10,outline:"none",boxSizing:"border-box"},
  bigBtn:{width:"100%",padding:"13px",background:"linear-gradient(135deg,#8b5cf6,#6d28d9)",border:"none",borderRadius:12,color:"#fff",fontSize:15,fontWeight:700,fontFamily:"'Cinzel Decorative',serif",cursor:"pointer",letterSpacing:1},
};

const CSS=`
  @import url('https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Rajdhani:wght@400;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:#0a001f;overflow-x:hidden;}
  input,textarea{color-scheme:light;}
  ::-webkit-scrollbar{width:3px;}
  ::-webkit-scrollbar-thumb{background:#8b5cf6;border-radius:2px;}
  @keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
  @keyframes slideDown{from{opacity:0;transform:translateX(-50%) translateY(-12px);}to{opacity:1;transform:translateX(-50%) translateY(0);}}
  @keyframes scaleIn{from{transform:scale(0.3);opacity:0;}to{transform:scale(1);opacity:1;}}
  @keyframes bounceIn{0%{transform:scale(0.3);}60%{transform:scale(1.2);}100%{transform:scale(1);}}
  @keyframes spin{to{transform:rotate(360deg);}}
  @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.6;}}
  @keyframes bounce{0%,100%{transform:translateY(0);}50%{transform:translateY(-6px);}}
  @keyframes float0{0%,100%{transform:translateY(0);}50%{transform:translateY(-18px);}}
  @keyframes float1{0%,100%{transform:translateY(-8px);}50%{transform:translateY(8px);}}
  @keyframes float2{0%,100%{transform:translateY(4px);}50%{transform:translateY(-14px);}}
`;
