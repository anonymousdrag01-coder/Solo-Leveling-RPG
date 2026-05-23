import { useState, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════
const RANKS = ["E","D","C","B","A","S","SS","SSS","National","Monarch"];
const RANK_COLORS = {
  E:"#9ca3af", D:"#34d399", C:"#60a5fa",
  B:"#a78bfa", A:"#fbbf24", S:"#f87171",
  SS:"#fb923c", SSS:"#e879f9", National:"#22d3ee", Monarch:"#fde68a"
};
const RANK_GLOW = {
  E:"#9ca3af44", D:"#34d39944", C:"#60a5fa44",
  B:"#a78bfa44", A:"#fbbf2444", S:"#f8717144",
  SS:"#fb923c44", SSS:"#e879f944", National:"#22d3ee44", Monarch:"#fde68a44"
};
const RANK_XP_THRESHOLDS = [0,500,1500,3500,7000,13000,23000,40000,70000,120000];

const EXAMS = {
  NIMHANS: {
    label: "NIMHANS",
    icon: "🧠",
    color: "#22d3ee",
    glow: "#22d3ee55",
    subjects: ["Neuroscience","Psychiatry","Psychology","General Medicine","Anatomy","Physiology","Biochemistry","Pharmacology"],
    desc: "National Institute of Mental Health & Neurosciences"
  },
  SSC_CGL: {
    label: "SSC CGL",
    icon: "⚖️",
    color: "#fbbf24",
    glow: "#fbbf2455",
    subjects: ["Quantitative Aptitude","English Language","General Intelligence & Reasoning","General Awareness","Current Affairs","Vocabulary & Grammar"],
    desc: "Staff Selection Commission Combined Graduate Level"
  }
};

const WORKOUT_QUESTS = [
  { id:"pushups", label:"20 Push-ups", xp:15, stat:"STR", gain:2, icon:"💪" },
  { id:"run",     label:"2km Run / Jog", xp:25, stat:"AGI", gain:3, icon:"🏃" },
  { id:"squats",  label:"30 Squats", xp:15, stat:"STR", gain:2, icon:"🦵" },
  { id:"plank",   label:"2 min Plank", xp:20, stat:"AGI", gain:2, icon:"🧘" },
  { id:"pullups", label:"10 Pull-ups", xp:20, stat:"STR", gain:3, icon:"🏋️" },
  { id:"yoga",    label:"15 min Yoga / Stretch", xp:15, stat:"AGI", gain:2, icon:"🌿" },
];

const DAILY_QUESTS = [
  { id:"water",    label:"Drink 8 Glasses of Water", xp:10, stat:"VIT", gain:1, icon:"💧" },
  { id:"sleep",    label:"Sleep 7+ Hours", xp:15, stat:"VIT", gain:2, icon:"😴" },
  { id:"meditate", label:"10 min Meditation", xp:10, stat:"INT", gain:1, icon:"🧠" },
  { id:"nophone",  label:"1hr Screen-Free Focus Block", xp:20, stat:"INT", gain:2, icon:"📵" },
  { id:"journal",  label:"Write Daily Journal", xp:10, stat:"INT", gain:1, icon:"📖" },
];

const BOSS_BATTLES = [
  { id:"b1", name:"The Iron Will Titan",   desc:"Complete workout quests 5 days this week", req:5,  type:"workout_days",  reward:300, statReward:{STR:10,AGI:5} },
  { id:"b2", name:"The Knowledge Demon",   desc:"Study 10+ hours this week",               req:10, type:"study_hours",   reward:350, statReward:{INT:15} },
  { id:"b3", name:"The Shadow Monarch",    desc:"Maintain a 7-day streak",                 req:7,  type:"streak",        reward:500, statReward:{STR:8,AGI:8,INT:8,VIT:8} },
  { id:"b4", name:"The Abyss Gate Keeper", desc:"Complete all daily quests for 3 days",    req:3,  type:"daily_perfect", reward:250, statReward:{VIT:12,INT:6} },
];

const defaultPlayer = {
  name:"", goal:"", activeExams:[],
  level:1, xp:0, totalXP:0,
  rank:"E", rankIndex:0,
  stats:{ STR:5, AGI:5, INT:5, VIT:5 },
  streak:0, lastLogin:null,
  completedToday:[], studyHoursThisWeek:0,
  workoutDaysThisWeek:0, dailyPerfectDays:0,
  bossDefeated:[], totalQuestsCompleted:0,
};

function load() {
  try { const s=localStorage.getItem("slrpg2"); return s?{...defaultPlayer,...JSON.parse(s)}:{...defaultPlayer}; }
  catch { return {...defaultPlayer}; }
}
function save(p){ localStorage.setItem("slrpg2",JSON.stringify(p)); }
function xpForLevel(l){ return l*120+Math.floor(l*l*15); }

// ═══════════════════════════════════════════════════════
//  ROOT
// ═══════════════════════════════════════════════════════
export default function App(){
  const [player,setPlayer]=useState(load);
  const [screen,setScreen]=useState("home");
  const [notif,setNotif]=useState(null);
  const [levelUpAnim,setLevelUpAnim]=useState(false);
  const [rankUpAnim,setRankUpAnim]=useState(null);
  const [aiQuests,setAiQuests]=useState({});
  const [aiLoading,setAiLoading]=useState({});
  const [setup,setSetup]=useState(()=>!load().goal);
  const notifRef=useRef();

  // Login streak
  useEffect(()=>{
    const p={...player};
    const today=new Date().toDateString();
    if(p.lastLogin!==today){
      const yesterday=new Date(Date.now()-86400000).toDateString();
      p.streak = p.lastLogin===yesterday ? p.streak+1 : 1;
      p.lastLogin=today;
      p.completedToday=[];
      update(p);
    }
  },[]);

  function update(p){ save(p); setPlayer({...p}); }

  function showNotif(msg,type="xp"){
    setNotif({msg,type});
    if(notifRef.current) clearTimeout(notifRef.current);
    notifRef.current=setTimeout(()=>setNotif(null),3500);
  }

  function completeQuest(quest,e){
    if(player.completedToday.includes(quest.id)) return;
    const p={...player};
    p.completedToday=[...p.completedToday,quest.id];
    p.xp+=quest.xp; p.totalXP+=quest.xp;
    p.totalQuestsCompleted=(p.totalQuestsCompleted||0)+1;
    p.stats={...p.stats,[quest.stat]:(p.stats[quest.stat]||0)+quest.gain};

    // track types
    if(quest.examId) p.studyHoursThisWeek=(p.studyHoursThisWeek||0)+0.5;
    if(quest.stat==="STR"||quest.stat==="AGI") p.workoutDaysThisWeek=Math.min((p.workoutDaysThisWeek||0)+0.2,7);

    // level up
    let leveled=false;
    while(p.xp>=xpForLevel(p.level)){ p.xp-=xpForLevel(p.level); p.level+=1; leveled=true; }

    // rank up
    let ranked=false;
    for(let i=RANK_XP_THRESHOLDS.length-1;i>=0;i--){
      if(p.totalXP>=RANK_XP_THRESHOLDS[i] && i>p.rankIndex){
        p.rankIndex=i; p.rank=RANKS[i]; ranked=true; break;
      }
    }

    update(p);
    if(ranked){ setRankUpAnim(p.rank); setTimeout(()=>setRankUpAnim(null),3000); }
    else if(leveled){ setLevelUpAnim(true); setTimeout(()=>setLevelUpAnim(false),2500); showNotif(`⚡ LEVEL UP! Now Level ${p.level}`,"level"); }
    else showNotif(`+${quest.xp} XP  •  +${quest.gain} ${quest.stat}`,"xp");
  }

  async function generateAIQuests(examId){
    if(aiQuests[examId]||aiLoading[examId]) return;
    setAiLoading(prev=>({...prev,[examId]:true}));
    const exam=EXAMS[examId];
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:1000,
          messages:[{role:"user",content:`You are a study quest generator for a Solo Leveling RPG app.
Generate 6 daily study quests for someone preparing for ${exam.label} (${exam.desc}).
Subjects: ${exam.subjects.join(", ")}.

Return ONLY a JSON array, no markdown, no explanation:
[
  {"id":"q1","label":"Quest title (action-oriented, specific)","xp":15,"stat":"INT","gain":2,"icon":"📚","subject":"Subject Name","tip":"1 short study tip"},
  ...
]

Rules:
- XP between 10-30 based on difficulty
- stat always "INT", gain between 1-3
- Icons: use relevant emojis per subject
- Labels must be specific tasks (e.g. "Solve 10 Reasoning Puzzles", "Read Psychiatric Disorders Chapter")
- Mix easy (10xp) and hard (25-30xp) tasks
- Tip must be actionable and exam-specific`}]
        })
      });
      const data=await res.json();
      const text=data.content.map(c=>c.text||"").join("");
      const clean=text.replace(/```json|```/g,"").trim();
      const quests=JSON.parse(clean);
      setAiQuests(prev=>({...prev,[examId]:quests.map(q=>({...q,examId}))}));
    } catch(err){
      // fallback quests
      const fallback=exam.subjects.slice(0,6).map((sub,i)=>({
        id:`${examId}_${i}`,label:`Study ${sub} - 30 min`,xp:15+i*2,
        stat:"INT",gain:2,icon:"📚",subject:sub,tip:`Focus on core concepts`,examId
      }));
      setAiQuests(prev=>({...prev,[examId]:fallback}));
    }
    setAiLoading(prev=>({...prev,[examId]:false}));
  }

  const rc=RANK_COLORS[player.rank]||"#fde68a";
  const rg=RANK_GLOW[player.rank]||"#fde68a33";
  const xpPct=Math.min((player.xp/xpForLevel(player.level))*100,100);

  // ── SETUP ──
  if(setup) return <Setup onComplete={(name,goal,exams)=>{
    const p={...player,name,goal,activeExams:exams};
    update(p); setSetup(false);
    showNotif("⚔️ Your Hunter Journey Begins!","level");
  }}/>;

  return(
    <div style={S.root}>
      <Bg/>
      {notif&&<Notif data={notif}/>}
      {levelUpAnim&&<LevelUpOverlay level={player.level}/>}
      {rankUpAnim&&<RankUpOverlay rank={rankUpAnim} color={RANK_COLORS[rankUpAnim]}/>}

      {/* HEADER */}
      <header style={S.header}>
        <div style={{...S.rankBadge,color:rc,borderColor:rc,boxShadow:`0 0 20px ${rg}`}}>
          {player.rank}
        </div>
        <div style={S.headerMid}>
          <div style={S.hName}>{player.name}</div>
          <div style={S.hLevel}>LEVEL {player.level}</div>
        </div>
        <div style={S.streakBox}>
          <span style={S.streakFire}>🔥</span>
          <span style={S.streakNum}>{player.streak}</span>
        </div>
      </header>

      {/* XP BAR */}
      <div style={S.xpWrap}>
        <div style={S.xpTrack}>
          <div style={{...S.xpFill,width:`${xpPct}%`,background:`linear-gradient(90deg,${rc},#fff8,${rc})`}}/>
        </div>
        <div style={S.xpLabel}>{player.xp} / {xpForLevel(player.level)} XP</div>
      </div>

      {/* STAT STRIP */}
      <div style={S.statStrip}>
        {Object.entries(player.stats).map(([k,v])=>(
          <StatPill key={k} stat={k} val={v}/>
        ))}
      </div>

      {/* NAV */}
      <nav style={S.nav}>
        {[
          {id:"home",icon:"⚔️",label:"Status"},
          {id:"nimhans",icon:"🧠",label:"NIMHANS"},
          {id:"ssc",icon:"⚖️",label:"SSC CGL"},
          {id:"workout",icon:"💪",label:"Train"},
          {id:"daily",icon:"✅",label:"Daily"},
          {id:"boss",icon:"👹",label:"Boss"},
        ].map(n=>(
          <button key={n.id} style={{...S.navBtn,...( screen===n.id?S.navOn:{})}}
            onClick={()=>{
              setScreen(n.id);
              if(n.id==="nimhans") generateAIQuests("NIMHANS");
              if(n.id==="ssc") generateAIQuests("SSC_CGL");
            }}>
            <span style={S.navIcon}>{n.icon}</span>
            <span style={S.navLabel}>{n.label}</span>
          </button>
        ))}
      </nav>

      {/* CONTENT */}
      <main style={S.main}>
        {screen==="home"    && <HomeScreen player={player} rc={rc} xpPct={xpPct}/>}
        {screen==="nimhans" && <ExamScreen examId="NIMHANS" player={player} completeQuest={completeQuest} aiQuests={aiQuests} aiLoading={aiLoading} generateAIQuests={generateAIQuests}/>}
        {screen==="ssc"     && <ExamScreen examId="SSC_CGL" player={player} completeQuest={completeQuest} aiQuests={aiQuests} aiLoading={aiLoading} generateAIQuests={generateAIQuests}/>}
        {screen==="workout" && <QuestList title="⚔️ Physical Training" quests={WORKOUT_QUESTS} player={player} completeQuest={completeQuest} accentColor="#f87171"/>}
        {screen==="daily"   && <QuestList title="🌟 Daily Disciplines" quests={DAILY_QUESTS}   player={player} completeQuest={completeQuest} accentColor="#34d399"/>}
        {screen==="boss"    && <BossScreen player={player} update={update} showNotif={showNotif}/>}
      </main>

      <style>{CSS}</style>
    </div>
  );
}

// ─── SETUP ───────────────────────────────────────────
function Setup({onComplete}){
  const [step,setStep]=useState(0);
  const [name,setName]=useState("");
  const [goal,setGoal]=useState("");
  const [exams,setExams]=useState([]);

  function toggleExam(id){ setExams(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]); }

  return(
    <div style={S.setupBg}>
      <Bg/>
      <div style={S.setupCard}>
        {step===0&&<>
          <div style={S.setupIcon}>⚔️</div>
          <div style={S.setupTitle}>HUNTER REGISTRATION</div>
          <div style={S.setupSub}>The System has chosen you. State your name.</div>
          <input style={S.inp} placeholder="Enter your hunter name..." value={name} onChange={e=>setName(e.target.value)}/>
          <button style={{...S.setupBtn,opacity:name.trim()?1:0.4}} onClick={()=>name.trim()&&setStep(1)}>CONTINUE →</button>
        </>}
        {step===1&&<>
          <div style={S.setupIcon}>🎯</div>
          <div style={S.setupTitle}>SET YOUR ULTIMATE GOAL</div>
          <div style={S.setupSub}>What will you achieve at max rank?</div>
          <textarea style={{...S.inp,height:100,resize:"none"}} placeholder="e.g. Clear NIMHANS & SSC CGL, build elite physique, become unstoppable..." value={goal} onChange={e=>setGoal(e.target.value)}/>
          <button style={{...S.setupBtn,opacity:goal.trim()?1:0.4}} onClick={()=>goal.trim()&&setStep(2)}>CONTINUE →</button>
        </>}
        {step===2&&<>
          <div style={S.setupIcon}>📋</div>
          <div style={S.setupTitle}>SELECT YOUR DUNGEONS</div>
          <div style={S.setupSub}>Choose your exam arenas</div>
          <div style={{display:"flex",flexDirection:"column",gap:12,width:"100%",margin:"20px 0"}}>
            {Object.entries(EXAMS).map(([id,ex])=>(
              <div key={id} style={{...S.examCard,borderColor:exams.includes(id)?ex.color:"#222",boxShadow:exams.includes(id)?`0 0 20px ${ex.glow}`:"none"}}
                onClick={()=>toggleExam(id)}>
                <span style={{fontSize:28}}>{ex.icon}</span>
                <div>
                  <div style={{color:exams.includes(id)?ex.color:"#ccc",fontWeight:700,fontSize:16}}>{ex.label}</div>
                  <div style={{color:"#666",fontSize:12}}>{ex.desc}</div>
                </div>
                <div style={{marginLeft:"auto",color:exams.includes(id)?"#34d399":"#444",fontSize:20}}>
                  {exams.includes(id)?"✓":"○"}
                </div>
              </div>
            ))}
          </div>
          <button style={{...S.setupBtn,opacity:exams.length?1:0.4}} onClick={()=>exams.length&&onComplete(name,goal,exams)}>
            ⚔️ BEGIN LEVELING
          </button>
        </>}
        <div style={S.setupDots}>
          {[0,1,2].map(i=><div key={i} style={{...S.dot,background:i===step?"#fde68a":"#333"}}/>)}
        </div>
      </div>
    </div>
  );
}

// ─── HOME ────────────────────────────────────────────
function HomeScreen({player,rc}){
  const nextRankXP=RANK_XP_THRESHOLDS[Math.min(player.rankIndex+1,RANK_XP_THRESHOLDS.length-1)];
  const rankPct=Math.min((player.totalXP/Math.max(nextRankXP,1))*100,100);
  return(
    <div>
      <SectionTitle>⚔️ STATUS WINDOW</SectionTitle>
      <div style={S.statusCard}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <StatBox label="Total XP" value={player.totalXP} color="#fde68a"/>
          <StatBox label="Streak" value={`🔥 ${player.streak}d`} color="#fb923c"/>
          <StatBox label="Quests Done" value={player.totalQuestsCompleted||0} color="#34d399"/>
          <StatBox label="Rank" value={`${player.rank}-Rank`} color={rc}/>
        </div>
        <div style={{marginTop:16}}>
          <div style={{...S.smallLabel,marginBottom:6}}>RANK PROGRESSION → {RANKS[Math.min(player.rankIndex+1,RANKS.length-1)]}</div>
          <div style={S.xpTrack}>
            <div style={{...S.xpFill,width:`${rankPct}%`,background:`linear-gradient(90deg,${rc},#fff6)`}}/>
          </div>
          <div style={{...S.smallLabel,textAlign:"right",marginTop:4}}>{player.totalXP} / {nextRankXP} XP</div>
        </div>
      </div>

      <SectionTitle>🎯 YOUR MISSION</SectionTitle>
      <div style={S.missionCard}>
        <div style={S.missionText}>{player.goal}</div>
        <div style={{color:"#444",fontSize:11,marginTop:8,fontStyle:"italic"}}>Every quest brings you closer to this</div>
      </div>

      <SectionTitle>📊 ABILITY SCORES</SectionTitle>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {[
          {k:"STR",label:"STRENGTH",color:"#f87171",icon:"⚔️"},
          {k:"AGI",label:"AGILITY",color:"#34d399",icon:"💨"},
          {k:"INT",label:"INTELLIGENCE",color:"#60a5fa",icon:"🧠"},
          {k:"VIT",label:"VITALITY",color:"#fbbf24",icon:"❤️"},
        ].map(({k,label,color,icon})=>(
          <div key={k} style={{...S.abilityCard,borderColor:color+"44"}}>
            <div style={{fontSize:22}}>{icon}</div>
            <div style={{color,fontSize:28,fontWeight:900,fontFamily:"'Cinzel Decorative',serif"}}>{player.stats[k]}</div>
            <div style={{color:"#555",fontSize:10,letterSpacing:2}}>{label}</div>
            <div style={{...S.xpTrack,marginTop:8,height:4}}>
              <div style={{height:"100%",width:`${Math.min(player.stats[k],100)}%`,background:color,borderRadius:2,transition:"width 0.5s"}}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── EXAM SCREEN ─────────────────────────────────────
function ExamScreen({examId,player,completeQuest,aiQuests,aiLoading,generateAIQuests}){
  const exam=EXAMS[examId];
  const quests=aiQuests[examId]||[];
  const loading=aiLoading[examId];

  useEffect(()=>{ generateAIQuests(examId); },[examId]);

  return(
    <div>
      <div style={{...S.examBanner,borderColor:exam.color,boxShadow:`0 0 30px ${exam.glow}`}}>
        <span style={{fontSize:36}}>{exam.icon}</span>
        <div>
          <div style={{color:exam.color,fontFamily:"'Cinzel Decorative',serif",fontSize:18}}>{exam.label}</div>
          <div style={{color:"#666",fontSize:12}}>{exam.desc}</div>
        </div>
      </div>

      <SectionTitle style={{color:exam.color}}>📋 TODAY'S STUDY QUESTS</SectionTitle>

      {loading&&(
        <div style={S.loadingBox}>
          <div style={{...S.loadSpinner,borderTopColor:exam.color}}/>
          <div style={{color:exam.color,marginTop:12,fontSize:14}}>The System is generating your quests...</div>
        </div>
      )}

      {!loading&&quests.length===0&&(
        <button style={{...S.setupBtn,background:`linear-gradient(135deg,${exam.color}22,${exam.color}11)`,borderColor:exam.color,color:exam.color}}
          onClick={()=>generateAIQuests(examId)}>
          ⚡ Generate AI Quests
        </button>
      )}

      {quests.map(q=>{
        const done=player.completedToday.includes(q.id);
        return(
          <div key={q.id} style={{...S.questCard,opacity:done?0.45:1,borderColor:done?"#222":exam.color+"66",boxShadow:done?"none":`0 0 12px ${exam.glow}`}}>
            <div style={S.questLeft}>
              <span style={{fontSize:22}}>{q.icon||"📚"}</span>
              <div>
                <div style={S.questLabel}>{q.label}</div>
                {q.subject&&<div style={{color:"#555",fontSize:11,marginTop:2}}>{q.subject}</div>}
                {q.tip&&!done&&<div style={{color:"#444",fontSize:11,marginTop:4,fontStyle:"italic"}}>💡 {q.tip}</div>}
              </div>
            </div>
            <div style={S.questRight}>
              <div style={{color:"#fde68a",fontSize:12,fontWeight:700}}>+{q.xp} XP</div>
              <button style={{...S.doneBtn,background:done?"#1a1a1a":exam.color,color:done?"#444":"#000"}}
                onClick={(e)=>!done&&completeQuest(q,e)}>
                {done?"✓":"→"}
              </button>
            </div>
          </div>
        );
      })}

      <button style={{...S.refreshBtn,borderColor:exam.color,color:exam.color}}
        onClick={()=>{
          const prev={...aiQuests};
          delete prev[examId];
          generateAIQuests(examId);
        }}>
        🔄 Refresh Quests
      </button>
    </div>
  );
}

// ─── QUEST LIST ───────────────────────────────────────
function QuestList({title,quests,player,completeQuest,accentColor}){
  return(
    <div>
      <SectionTitle>{title}</SectionTitle>
      {quests.map(q=>{
        const done=player.completedToday.includes(q.id);
        return(
          <div key={q.id} style={{...S.questCard,opacity:done?0.45:1,borderColor:done?"#222":accentColor+"66",boxShadow:done?"none":`0 0 12px ${accentColor}33`}}>
            <div style={S.questLeft}>
              <span style={{fontSize:22}}>{q.icon}</span>
              <div>
                <div style={S.questLabel}>{q.label}</div>
                <div style={{color:"#555",fontSize:11,marginTop:2}}>+{q.gain} {q.stat}</div>
              </div>
            </div>
            <div style={S.questRight}>
              <div style={{color:"#fde68a",fontSize:12,fontWeight:700}}>+{q.xp} XP</div>
              <button style={{...S.doneBtn,background:done?"#1a1a1a":accentColor,color:done?"#444":"#000"}}
                onClick={(e)=>!done&&completeQuest(q,e)}>
                {done?"✓":"→"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── BOSS ─────────────────────────────────────────────
function BossScreen({player,update,showNotif}){
  function getProgress(type){
    if(type==="streak") return player.streak;
    if(type==="workout_days") return player.workoutDaysThisWeek||0;
    if(type==="study_hours") return player.studyHoursThisWeek||0;
    if(type==="daily_perfect") return player.dailyPerfectDays||0;
    return 0;
  }
  function claim(boss){
    const p={...player};
    p.xp+=boss.reward; p.totalXP+=boss.reward;
    p.bossDefeated=[...(p.bossDefeated||[]),boss.id];
    Object.entries(boss.statReward).forEach(([k,v])=>{ p.stats[k]=(p.stats[k]||0)+v; });
    update(p);
    showNotif(`💀 ${boss.name} DEFEATED! +${boss.reward} XP`,"level");
  }
  return(
    <div>
      <SectionTitle>👹 BOSS BATTLES</SectionTitle>
      <div style={{color:"#444",fontSize:12,marginBottom:16}}>Weekly challenges — defeat bosses for massive rewards</div>
      {BOSS_BATTLES.map(boss=>{
        const defeated=(player.bossDefeated||[]).includes(boss.id);
        const prog=getProgress(boss.type);
        const pct=Math.min((prog/boss.req)*100,100);
        const canClaim=pct>=100&&!defeated;
        return(
          <div key={boss.id} style={{...S.bossCard,opacity:defeated?0.35:1}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={S.bossName}>{boss.name}</div>
              <div style={{color:"#fde68a",fontWeight:700}}>+{boss.reward} XP</div>
            </div>
            <div style={{color:"#666",fontSize:13,margin:"8px 0"}}>{boss.desc}</div>
            <div style={S.xpTrack}>
              <div style={{...S.xpFill,width:`${pct}%`,background:canClaim?"linear-gradient(90deg,#f87171,#fde68a)":"#333",transition:"width 0.5s"}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8}}>
              <span style={{color:"#555",fontSize:12}}>{Math.round(prog)}/{boss.req}</span>
              {canClaim&&<button style={S.claimBtn} onClick={()=>claim(boss)}>⚔️ DEFEAT & CLAIM</button>}
              {defeated&&<span style={{color:"#34d399",fontSize:12}}>✓ Defeated</span>}
            </div>
            {boss.statReward&&<div style={{marginTop:8,display:"flex",gap:8,flexWrap:"wrap"}}>
              {Object.entries(boss.statReward).map(([k,v])=>(
                <span key={k} style={{background:"#111",border:"1px solid #222",borderRadius:4,padding:"2px 8px",fontSize:11,color:"#888"}}>+{v} {k}</span>
              ))}
            </div>}
          </div>
        );
      })}
    </div>
  );
}

// ─── UI ATOMS ─────────────────────────────────────────
function Bg(){
  return(
    <div style={{position:"fixed",inset:0,zIndex:0,pointerEvents:"none",overflow:"hidden"}}>
      {/* Deep dungeon background */}
      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse 80% 60% at 50% 0%,#0d0020 0%,#05000f 50%,#000005 100%)"}}/>
      {/* Purple mist */}
      <div style={{position:"absolute",top:0,left:"20%",width:"60%",height:"40%",background:"radial-gradient(ellipse,#3b0764aa 0%,transparent 70%)",filter:"blur(40px)"}}/>
      {/* Blue aura bottom */}
      <div style={{position:"absolute",bottom:0,left:"30%",width:"40%",height:"30%",background:"radial-gradient(ellipse,#1e3a5f66 0%,transparent 70%)",filter:"blur(30px)"}}/>
      {/* Grid */}
      <div style={{position:"absolute",inset:0,backgroundImage:"linear-gradient(rgba(139,92,246,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(139,92,246,0.04) 1px,transparent 1px)",backgroundSize:"50px 50px"}}/>
      {/* Scanlines */}
      <div style={{position:"absolute",inset:0,backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.15) 2px,rgba(0,0,0,0.15) 4px)",pointerEvents:"none"}}/>
      {/* Floating particles */}
      {[...Array(8)].map((_,i)=>(
        <div key={i} style={{
          position:"absolute",
          width:2,height:2,
          borderRadius:"50%",
          background:["#a78bfa","#60a5fa","#f87171","#34d399","#fbbf24"][i%5],
          left:`${10+i*12}%`,
          top:`${20+i*8}%`,
          animation:`float${i%3} ${3+i}s ease-in-out infinite`,
          opacity:0.6,
        }}/>
      ))}
    </div>
  );
}

function Notif({data}){
  const colors={xp:"#1a1a3e",level:"#2d1500",rankup:"#1a0000"};
  const borders={xp:"#60a5fa",level:"#fbbf24",rankup:"#f87171"};
  return(
    <div style={{
      position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",
      zIndex:9999,padding:"12px 28px",borderRadius:30,
      background:colors[data.type]||colors.xp,
      border:`1px solid ${borders[data.type]||borders.xp}`,
      color:"#fff",fontWeight:700,fontSize:14,
      whiteSpace:"nowrap",animation:"fadeDown 0.3s ease",
      boxShadow:`0 0 30px ${borders[data.type]||borders.xp}66`,
      fontFamily:"'Rajdhani',sans-serif",letterSpacing:1,
    }}>{data.msg}</div>
  );
}

function LevelUpOverlay({level}){
  return(
    <div style={{position:"fixed",inset:0,zIndex:9998,background:"rgba(0,0,0,0.9)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",animation:"fadeIn 0.3s ease"}}>
      <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:52,color:"#fde68a",textShadow:"0 0 60px #fde68a,0 0 120px #fde68a",animation:"scaleIn 0.5s ease",letterSpacing:4}}>
        LEVEL UP!
      </div>
      <div style={{color:"#fff",fontSize:28,marginTop:12,fontFamily:"'Rajdhani',sans-serif"}}>Level {level}</div>
      <div style={{color:"#666",fontSize:14,marginTop:8}}>You grow stronger...</div>
    </div>
  );
}

function RankUpOverlay({rank,color}){
  return(
    <div style={{position:"fixed",inset:0,zIndex:9998,background:"rgba(0,0,0,0.92)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
      <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:20,color:"#888",letterSpacing:6,marginBottom:8}}>RANK ADVANCEMENT</div>
      <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:80,color,textShadow:`0 0 40px ${color},0 0 80px ${color}`,animation:"scaleIn 0.6s ease"}}>
        {rank}
      </div>
      <div style={{color,fontSize:22,marginTop:8,fontFamily:"'Rajdhani',sans-serif",letterSpacing:4}}>{rank}-RANK HUNTER</div>
      <div style={{color:"#555",fontSize:14,marginTop:12}}>The shadows bow before you</div>
    </div>
  );
}

function StatPill({stat,val}){
  const colors={STR:"#f87171",AGI:"#34d399",INT:"#60a5fa",VIT:"#fbbf24"};
  const c=colors[stat]||"#888";
  return(
    <div style={{flex:1,background:"#0a0010",border:`1px solid ${c}33`,borderRadius:8,padding:"6px 4px",textAlign:"center"}}>
      <div style={{color:c,fontSize:16,fontWeight:900,fontFamily:"'Rajdhani',sans-serif"}}>{val}</div>
      <div style={{color:"#444",fontSize:9,letterSpacing:1}}>{stat}</div>
    </div>
  );
}

function StatBox({label,value,color}){
  return(
    <div style={{background:"#080012",border:"1px solid #1a0030",borderRadius:10,padding:"12px",textAlign:"center"}}>
      <div style={{color,fontSize:20,fontWeight:900,fontFamily:"'Rajdhani',sans-serif"}}>{value}</div>
      <div style={{color:"#444",fontSize:11,letterSpacing:1,marginTop:2}}>{label}</div>
    </div>
  );
}

function SectionTitle({children,style={}}){
  return <div style={{...S.secTitle,...style}}>{children}</div>;
}

// ─── STYLES ───────────────────────────────────────────
const S={
  root:{minHeight:"100vh",background:"#000005",color:"#e0e0ff",fontFamily:"'Rajdhani',sans-serif",maxWidth:480,margin:"0 auto",position:"relative",overflowX:"hidden"},
  header:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 16px 8px",position:"relative",zIndex:10},
  rankBadge:{width:50,height:50,borderRadius:10,border:"2px solid",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:900,fontFamily:"'Cinzel Decorative',serif"},
  headerMid:{textAlign:"center",flex:1},
  hName:{fontFamily:"'Cinzel Decorative',serif",fontSize:15,color:"#fde68a",textShadow:"0 0 20px #fde68a88"},
  hLevel:{fontSize:10,color:"#555",letterSpacing:4,marginTop:2},
  streakBox:{display:"flex",flexDirection:"column",alignItems:"center"},
  streakFire:{fontSize:18},
  streakNum:{color:"#fb923c",fontWeight:900,fontSize:16,fontFamily:"'Rajdhani',sans-serif"},
  xpWrap:{padding:"2px 16px 8px",position:"relative",zIndex:10},
  xpTrack:{height:6,background:"#0d0020",borderRadius:3,overflow:"hidden",border:"1px solid #1a0030"},
  xpFill:{height:"100%",borderRadius:3,transition:"width 0.6s ease"},
  xpLabel:{fontSize:10,color:"#444",textAlign:"right",marginTop:3},
  statStrip:{display:"flex",gap:6,padding:"0 16px 8px",position:"relative",zIndex:10},
  nav:{display:"flex",gap:3,padding:"4px 12px 8px",position:"relative",zIndex:10},
  navBtn:{flex:1,padding:"8px 2px",background:"#08000f",border:"1px solid #1a0030",borderRadius:8,color:"#444",fontSize:16,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,transition:"all 0.2s"},
  navOn:{background:"#150025",border:"1px solid #7c3aed",color:"#fff",boxShadow:"0 0 15px #7c3aed44"},
  navIcon:{fontSize:16},
  navLabel:{fontSize:9,letterSpacing:1,color:"inherit"},
  main:{padding:"0 14px 60px",position:"relative",zIndex:10},
  secTitle:{fontFamily:"'Cinzel Decorative',serif",fontSize:12,color:"#fde68a",letterSpacing:2,marginBottom:12,marginTop:18,textShadow:"0 0 10px #fde68a55"},
  statusCard:{background:"#06000e",border:"1px solid #1a0030",borderRadius:14,padding:16},
  missionCard:{background:"#06000e",border:"1px solid #1a0030",borderRadius:14,padding:16},
  missionText:{color:"#a78bfa",fontSize:14,lineHeight:1.7},
  abilityCard:{background:"#06000e",border:"1px solid",borderRadius:14,padding:14,textAlign:"center"},
  questCard:{background:"#06000e",border:"1px solid",borderRadius:12,padding:"12px 14px",marginBottom:10,display:"flex",alignItems:"center",justifyContent:"space-between",transition:"all 0.3s"},
  questLeft:{display:"flex",alignItems:"flex-start",gap:12,flex:1},
  questLabel:{fontSize:14,fontWeight:600,color:"#ddd",lineHeight:1.4},
  questRight:{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8,minWidth:60},
  doneBtn:{width:36,height:36,borderRadius:8,border:"none",fontSize:16,fontWeight:900,cursor:"pointer",transition:"all 0.2s"},
  bossCard:{background:"#080010",border:"1px solid #2d1060",borderRadius:14,padding:16,marginBottom:14},
  bossName:{fontFamily:"'Cinzel Decorative',serif",fontSize:13,color:"#f87171",textShadow:"0 0 10px #f8717177"},
  claimBtn:{background:"linear-gradient(135deg,#7c3aed,#db2777)",border:"none",color:"#fff",padding:"8px 16px",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"'Rajdhani',sans-serif"},
  examBanner:{display:"flex",alignItems:"center",gap:14,background:"#06000e",border:"1px solid",borderRadius:14,padding:"14px 16px",marginBottom:4},
  loadingBox:{display:"flex",flexDirection:"column",alignItems:"center",padding:"40px 20px"},
  loadSpinner:{width:40,height:40,border:"3px solid #1a0030",borderRadius:"50%",animation:"spin 1s linear infinite"},
  refreshBtn:{width:"100%",marginTop:16,padding:"10px",background:"transparent",border:"1px solid",borderRadius:10,cursor:"pointer",fontSize:13,fontFamily:"'Rajdhani',sans-serif",letterSpacing:1},
  setupBg:{minHeight:"100vh",background:"#000005",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'Rajdhani',sans-serif"},
  setupCard:{background:"#06000e",border:"1px solid #1a0030",borderRadius:20,padding:32,maxWidth:400,width:"100%",textAlign:"center",position:"relative",zIndex:10,boxShadow:"0 0 60px #3b076444"},
  setupIcon:{fontSize:48,marginBottom:12},
  setupTitle:{fontFamily:"'Cinzel Decorative',serif",fontSize:18,color:"#fde68a",textShadow:"0 0 20px #fde68a",marginBottom:8,letterSpacing:2},
  setupSub:{color:"#555",fontSize:13,marginBottom:24},
  inp:{width:"100%",background:"#0d0020",border:"1px solid #1a0030",borderRadius:10,padding:"12px 14px",color:"#e0e0ff",fontSize:15,fontFamily:"'Rajdhani',sans-serif",marginBottom:12,outline:"none"},
  setupBtn:{width:"100%",padding:"14px",background:"linear-gradient(135deg,#1a0040,#3b0764)",border:"1px solid #7c3aed",borderRadius:10,color:"#fde68a",fontSize:15,fontWeight:700,fontFamily:"'Cinzel Decorative',serif",cursor:"pointer",letterSpacing:2,marginTop:4},
  examCard:{display:"flex",alignItems:"center",gap:14,background:"#08000f",border:"2px solid",borderRadius:12,padding:"14px 16px",cursor:"pointer",transition:"all 0.3s"},
  smallLabel:{color:"#444",fontSize:11,letterSpacing:1},
  setupDots:{display:"flex",gap:8,justifyContent:"center",marginTop:24},
  dot:{width:8,height:8,borderRadius:"50%",transition:"background 0.3s"},
};

const CSS=`
  @import url('https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Rajdhani:wght@400;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:#000005;overflow-x:hidden;}
  input,textarea{color-scheme:dark;}
  ::-webkit-scrollbar{width:3px;}
  ::-webkit-scrollbar-track{background:#05000f;}
  ::-webkit-scrollbar-thumb{background:#2d1060;border-radius:2px;}
  @keyframes fadeDown{from{opacity:0;transform:translateX(-50%) translateY(-12px);}to{opacity:1;transform:translateX(-50%) translateY(0);}}
  @keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
  @keyframes scaleIn{from{transform:scale(0.4);opacity:0;}to{transform:scale(1);opacity:1;}}
  @keyframes spin{to{transform:rotate(360deg);}}
  @keyframes float0{0%,100%{transform:translateY(0);}50%{transform:translateY(-20px);}}
  @keyframes float1{0%,100%{transform:translateY(-10px);}50%{transform:translateY(10px);}}
  @keyframes float2{0%,100%{transform:translateY(5px);}50%{transform:translateY(-15px);}}
`;
