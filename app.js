/* GoalChain pilot app. Shared mode requires Supabase + schema.sql. */
(() => {
  const cfg = window.GCT_CONFIG || {};
  const configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes("YOUR-PROJECT") && !cfg.SUPABASE_ANON_KEY.includes("YOUR_SUPABASE"));
  const db = configured && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const $ = (id) => document.getElementById(id);
  const state = { view: "overview", user: null, profile: null, players: [], clubs: [], members: [], invitations: [], requests: [], matches: [], demo: !db, authMode: "signup", selectedPlayer: null, invitePlayer: null, search: "" };
  const demoPlayers = [
    {id:"demo-ace",display_name:"AceMilan",gamer_tag:"ACEMILAN",bio:"Tactical player. Looking for a disciplined squad that plays to win.",preferred_position:"AMF / CF"},
    {id:"demo-nova",display_name:"Nova10",gamer_tag:"NOVA10",bio:"Fast build-up, quick passing, team-first football.",preferred_position:"CMF"},
    {id:"demo-ghost",display_name:"GhostXI",gamer_tag:"GHOSTXI",bio:"Defensive organizer. Calm under pressure.",preferred_position:"CB / DMF"},
    {id:"demo-king",display_name:"KingFinesse",gamer_tag:"KFINESSE",bio:"Skill moves and creative attacking play.",preferred_position:"RWF"},
    {id:"demo-zee",display_name:"ZeeWall",gamer_tag:"ZEEWALL",bio:"Goalkeeper looking for a competitive club.",preferred_position:"GK"},
    {id:"demo-rio",display_name:"RioPlayz",gamer_tag:"RIOPLAYZ",bio:"Available for friendly matches and club trials.",preferred_position:"LB / RB"}
  ];
  const demoClubs = [
    {id:"demo-club-1",name:"Ace United",tag:"ACU",description:"Disciplined players. Quick passing. One team, one target.",owner_id:"demo-ace",created_at:new Date().toISOString()},
    {id:"demo-club-2",name:"Nova Athletic",tag:"NVA",description:"A new generation of creative, competitive players.",owner_id:"demo-nova",created_at:new Date().toISOString()}
  ];
  const demoMembers = [
    {club_id:"demo-club-1",player_id:"demo-ace",role:"owner"},{club_id:"demo-club-1",player_id:"demo-ghost",role:"player"},
    {club_id:"demo-club-1",player_id:"demo-zee",role:"player"},{club_id:"demo-club-2",player_id:"demo-nova",role:"owner"},
    {club_id:"demo-club-2",player_id:"demo-king",role:"player"}
  ];
  const escapeHtml = (v="") => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const initials = (name="GCT") => name.trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase();
  const toast = (msg) => { const t=$("toast"); t.textContent=msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),2800); };
  const modal = id => $(id).showModal();
  const closeModal = id => $(id).close();
  const myClub = () => state.members.find(m=>m.player_id===state.user?.id);
  const memberCount = clubId => state.members.filter(m=>m.club_id===clubId).length;
  const playerById = id => state.players.find(p=>p.id===id) || {id,display_name:"Unknown player",preferred_position:"Flexible",bio:""};
  const clubById = id => state.clubs.find(c=>c.id===id) || {id,name:"Unknown club",tag:"GCT"};
  const managerOf = clubId => state.members.some(m=>m.club_id===clubId&&m.player_id===state.user?.id&&["owner","manager"].includes(m.role));
  const isMember = () => !!myClub();

  function setStatus() {
    const el=$("connectionStatus");
    if(state.demo){el.textContent="Preview mode";el.classList.remove("connected");}
    else if(state.user){el.textContent="Connected · "+state.profile?.display_name;el.classList.add("connected");}
    else {el.textContent="Database connected";el.classList.add("connected");}
    $("authButton").textContent=state.user?"Sign out":"Sign in";
    $("setupNotice").classList.toggle("hidden",!state.demo);
  }
  function loadDemo(){
    state.players=demoPlayers.map(x=>({...x}));
    state.clubs=demoClubs.map(x=>({...x}));
    state.members=demoMembers.map(x=>({...x}));
    state.invitations=[]; state.requests=[]; state.matches=[];
  }
  async function loadData(){
    if(state.demo){loadDemo();render();return;}
    if(!state.user){state.players=[];state.clubs=[];state.members=[];state.invitations=[];state.requests=[];state.matches=[];render();return;}
    const results=await Promise.all([
      db.from("profiles").select("*").order("display_name"),
      db.from("clubs").select("*").order("created_at",{ascending:false}),
      db.from("club_members").select("*"),
      db.from("invitations").select("*").order("created_at",{ascending:false}),
      db.from("join_requests").select("*").order("created_at",{ascending:false}),
      db.from("matches").select("*").order("created_at",{ascending:false})
    ]);
    const [p,c,m,i,r,ma]=results;
    const err=results.find(x=>x.error);
    if(err) console.error("GoalChain data load:",err.error);
    state.players=p.data||[];state.clubs=c.data||[];state.members=m.data||[];
    state.invitations=i.data||[];state.requests=r.data||[];state.matches=ma.data||[];
    state.profile=state.players.find(x=>x.id===state.user.id)||null;
    render();
  }
  async function refreshUser(){
    if(!db){setStatus();return;}
    const {data}=await db.auth.getSession();
    state.user=data.session?.user||null;
    if(state.user){
      const {data:profile}=await db.from("profiles").select("*").eq("id",state.user.id).maybeSingle();
      state.profile=profile||null;
    }else state.profile=null;
    setStatus(); await loadData();
  }
  function sectionHead(title,desc,action=""){
    return `<div class="section-head"><div><h2>${title}</h2><p>${desc}</p></div>${action}</div>`;
  }
  function playerCard(p){
    const membership=state.members.find(m=>m.player_id===p.id);
    const club=membership?clubById(membership.club_id):null;
    return `<article class="player-card"><div class="player-top"><div class="avatar">${escapeHtml(initials(p.display_name))}</div><div><h3>${escapeHtml(p.display_name)}</h3><p>${escapeHtml(p.gamer_tag||"Player")} · ${escapeHtml(p.preferred_position||"Flexible")}</p></div></div><p>${escapeHtml(p.bio||"Building a profile and looking for the right squad.")}</p><div class="club-meta"><span class="tag ${club?"gray":""}">${club?escapeHtml(club.tag+" · "+club.name):"Available"}</span><span class="tag gray">eFootball</span></div><div class="card-actions"><button class="btn btn-outline" data-profile="${escapeHtml(p.id)}">View profile</button>${state.user&&p.id!==state.user.id&&!membership?`<button class="btn btn-primary" data-invite="${escapeHtml(p.id)}">Invite</button>`:""}</div></article>`;
  }
  function clubCard(c){
    const n=memberCount(c.id), mine=state.user&&managerOf(c.id);
    return `<article class="club-card"><div class="club-head"><div class="club-badge">${escapeHtml(c.tag)}</div><div><h3>${escapeHtml(c.name)}</h3><p class="muted" style="margin:5px 0 0">Founded ${new Date(c.created_at||Date.now()).toLocaleDateString(undefined,{month:"short",year:"numeric"})}</p></div></div><p>${escapeHtml(c.description||"A new club looking for committed players.")}</p><div class="club-meta"><span class="tag">${n}/11 PLAYERS</span><span class="tag gray">${mine?"YOUR CLUB":"OPEN DISCOVERY"}</span></div><div class="progress"><span style="width:${Math.min(100,n/11*100)}%"></span></div><p class="muted">${n>=11?"Squad full":`${11-n} roster ${11-n===1?"spot":"spots"} available`}</p><div class="card-actions">${state.user&&!isMember()&&n<11?`<button class="btn btn-primary" data-join="${escapeHtml(c.id)}">Request to join</button>`:`<button class="btn btn-outline" data-club="${escapeHtml(c.id)}">Club details</button>`}${mine?`<button class="btn btn-outline" data-manage="${escapeHtml(c.id)}">Manage</button>`:""}</div></article>`;
  }
  function emptyState(icon,title,desc,button=""){
    return `<div class="empty-state"><div class="empty-icon">${icon}</div><h3>${title}</h3><p>${desc}</p>${button}</div>`;
  }
  function overview(){
    const activeClubs=state.clubs.length, available=state.players.filter(p=>!state.members.some(m=>m.player_id===p.id)).length;
    const invites=state.invitations.filter(i=>i.player_id===state.user?.id&&i.status==="pending").length;
    const action=state.user?`<button class="btn btn-primary" id="createClubBtn">+ Create a club</button>`:`<button class="btn btn-primary" id="signUpBtn">Join the pilot</button>`;
    return `${sectionHead("Your next level starts here","Build a squad, discover talent, and compete with purpose.",action)}
      <div class="grid" style="margin-bottom:22px"><div class="panel"><span class="kicker">Clubs on GoalChain</span><h2 style="font-size:30px;margin:9px 0">${activeClubs}</h2><p>Find a club that matches your style.</p></div><div class="panel"><span class="kicker">Players to discover</span><h2 style="font-size:30px;margin:9px 0">${available}</h2><p>Connect with your next teammate.</p></div><div class="panel"><span class="kicker">Your pending invites</span><h2 style="font-size:30px;margin:9px 0">${invites}</h2><p>Every invitation needs player consent.</p></div></div>
      <div class="two-grid"><div>${sectionHead("Players to know","A few players ready to connect.")}<div class="grid">${state.players.filter(p=>p.id!==state.user?.id).slice(0,2).map(playerCard).join("")||emptyState("◎","No player profiles yet","Create an account to start the community.")}</div><button class="btn btn-outline" style="margin-top:14px" data-goto="players">Discover all players →</button></div><div>${sectionHead("Clubs in the community","Explore teams and their roster spaces.")}<div class="list">${state.clubs.slice(0,3).map(c=>`<div class="list-row"><div class="club-badge">${escapeHtml(c.tag)}</div><div class="row-main"><strong>${escapeHtml(c.name)}</strong><p>${memberCount(c.id)}/11 players · ${escapeHtml(c.description||"Open to new teammates")}</p></div><span class="tag">${11-memberCount(c.id)} spots</span></div>`).join("")||`<p class="muted">No clubs yet. Be the first to create one.</p>`}</div><button class="btn btn-outline" style="margin-top:14px" data-goto="clubs">Explore clubs →</button></div></div>`;
  }
  function playersView(){
    const list=state.players.filter(p=>(p.display_name+" "+(p.gamer_tag||"")+" "+(p.preferred_position||"")).toLowerCase().includes(state.search.toLowerCase()));
    return `${sectionHead("Discover players","Find your next teammate by name, gamer tag, or position.")}<div class="search-bar"><input id="playerSearch" class="search-input" placeholder="Search players..." value="${escapeHtml(state.search)}" /><button class="btn btn-outline" id="clearSearch">Clear</button></div><div id="playersGrid" class="grid">${list.map(playerCard).join("")||emptyState("⌕","No players found","Try a different name or position.")}</div>`;
  }
  function clubsView(){
    return `${sectionHead("Clubs","Explore squads, request to join, or start your own.",state.user&&!isMember()?`<button class="btn btn-primary" id="createClubBtn">+ Create a club</button>`:"")}<div class="grid">${state.clubs.map(clubCard).join("")||emptyState("⚑","No clubs yet","Create the first club and start building your squad.",state.user?`<button class="btn btn-primary" id="createClubBtn">Create a club</button>`:`<button class="btn btn-primary" id="signUpBtn">Sign up to create a club</button>`)}</div>`;
  }
  function invitationsView(){
    if(!state.user) return emptyState("✉","Sign in to manage recruitment","Your invitations and join requests will appear here.",`<button class="btn btn-primary" id="signUpBtn">Sign in / Create account</button>`);
    const received=state.invitations.filter(i=>i.player_id===state.user.id);
    const sent=state.invitations.filter(i=>i.invited_by===state.user.id);
    const requests=state.requests.filter(r=>managerOf(r.club_id));
    const myRequests=state.requests.filter(r=>r.player_id===state.user.id);
    return `${sectionHead("Recruitment center","Invitations always require the invited player's acceptance.")}
      <div class="two-grid"><div class="panel"><h3>Invitations received</h3><p>Choose whether to accept or decline.</p><div class="list">${received.map(i=>`<div class="list-row"><div class="club-badge">${escapeHtml(clubById(i.club_id).tag)}</div><div class="row-main"><strong>${escapeHtml(clubById(i.club_id).name)}</strong><p>${escapeHtml(i.message||"You have been invited to join this club.")} · ${escapeHtml(i.status)}</p></div>${i.status==="pending"?`<button class="btn btn-primary" data-accept="${i.id}">Accept</button><button class="btn btn-outline" data-decline="${i.id}">Decline</button>`:""}</div>`).join("")||`<p class="muted">No invitations received yet.</p>`}</div></div>
      <div class="panel"><h3>Join requests to review</h3><p>Club managers can approve or reject requests. Approval adds the player only if a roster spot remains.</p><div class="list">${requests.map(r=>`<div class="list-row"><div class="avatar">${escapeHtml(initials(playerById(r.player_id).display_name))}</div><div class="row-main"><strong>${escapeHtml(playerById(r.player_id).display_name)}</strong><p>${escapeHtml(clubById(r.club_id).name)} · ${escapeHtml(r.message||"Wants to join your club")} · ${r.status}</p></div>${r.status==="pending"?`<button class="btn btn-primary" data-approve-request="${r.id}">Approve</button><button class="btn btn-outline" data-reject-request="${r.id}">Reject</button>`:""}</div>`).join("")||`<p class="muted">No requests to review.</p>`}</div></div></div>
      <div class="panel" style="margin-top:16px"><h3>Your join requests</h3><div class="list">${myRequests.map(r=>`<div class="list-row"><div class="club-badge">${escapeHtml(clubById(r.club_id).tag)}</div><div class="row-main"><strong>${escapeHtml(clubById(r.club_id).name)}</strong><p>Status: ${escapeHtml(r.status)}</p></div></div>`).join("")||`<p class="muted">You haven't requested to join a club.</p>`}</div></div>`;
  }
  function matchesView(){
    const approved=state.matches.filter(m=>m.status==="approved");
    const scores={};state.clubs.forEach(c=>scores[c.id]={club:c,w:0,d:0,l:0,p:0,gf:0,ga:0,pts:0});
    approved.forEach(m=>{const h=scores[m.home_club_id],a=scores[m.away_club_id];if(!h||!a)return;h.p++;a.p++;h.gf+=m.home_score;h.ga+=m.away_score;a.gf+=m.away_score;a.ga+=m.home_score;if(m.home_score>m.away_score){h.w++;a.l++;h.pts+=3}else if(m.home_score<m.away_score){a.w++;h.l++;a.pts+=3}else{h.d++;a.d++;h.pts++;a.pts++}});
    const ranked=Object.values(scores).sort((a,b)=>b.pts-a.pts||(b.gf-b.ga)-(a.gf-a.ga));
    const canReport=state.user&&isMember();
    return `${sectionHead("Matches & rankings","Only approved results count toward the leaderboard.",canReport?`<button class="btn btn-primary" id="reportMatchBtn">+ Report a match</button>`:"")}
      <div class="two-grid"><div><h3 style="font-size:15px;margin:0 0 12px">Club rankings</h3><div class="table-wrap"><table class="rank-table"><thead><tr><th>#</th><th>Club</th><th>MP</th><th>GD</th><th>PTS</th></tr></thead><tbody>${ranked.map((r,i)=>`<tr><td class="rank-num">${String(i+1).padStart(2,"0")}</td><td><strong>${escapeHtml(r.club.name)}</strong><div class="muted" style="font-size:10px;margin-top:3px">${escapeHtml(r.club.tag)}</div></td><td>${r.p}</td><td>${r.gf-r.ga>0?"+":""}${r.gf-r.ga}</td><td><strong>${r.pts}</strong></td></tr>`).join("")||`<tr><td colspan="5" class="muted">Create clubs to start the leaderboard.</td></tr>`}</tbody></table></div><p class="muted" style="font-size:10px">Points: win 3 · draw 1 · loss 0. Only approved match results are counted.</p></div>
      <div><h3 style="font-size:15px;margin:0 0 12px">Match center</h3><div class="list">${state.matches.map(m=>`<div class="match-card"><div class="kicker">${escapeHtml(m.status.replaceAll("_"," "))} · ${new Date(m.created_at).toLocaleDateString()}</div><div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:12px 0"><div style="flex:1"><strong>${escapeHtml(clubById(m.home_club_id).name)}</strong></div><div class="match-score">${m.home_score} : ${m.away_score}</div><div style="flex:1;text-align:right"><strong>${escapeHtml(clubById(m.away_club_id).name)}</strong></div></div>${m.evidence_url?`<a class="tag gray" href="${escapeHtml(m.evidence_url)}" target="_blank" rel="noopener">View evidence ↗</a>`:""}${state.user&&m.status==="awaiting_confirmation"&&m.reported_by!==state.user.id&&(managerOf(m.home_club_id)||managerOf(m.away_club_id))?`<div class="card-actions"><button class="btn btn-primary" data-confirm-match="${m.id}">Confirm result</button><button class="btn btn-outline" data-dispute-match="${m.id}">Dispute</button></div>`:""}</div>`).join("")||emptyState("⚽","No reported matches yet","After clubs are formed, report friendly matches and confirm results before they affect rankings.")}</div></div></div>
      <div class="notice" style="margin-top:18px"><div class="notice-icon">✓</div><div><strong>Fair-play rule</strong><p>During the pilot, results are not final until confirmed by an opposing club manager. Disputed results should be reviewed by a designated pilot moderator before approval.</p></div></div>`;
  }
  function render(){
    setStatus();
    const content=$("viewContent");
    const views={overview,players:playersView,clubs:clubsView,invitations:invitationsView,matches:matchesView};
    content.innerHTML=(views[state.view]||overview)();
    document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.view===state.view));
    bindContent();
  }
  function bindContent(){
    document.querySelectorAll("[data-goto]").forEach(b=>b.onclick=()=>go(b.dataset.goto));
    document.querySelectorAll("[data-profile]").forEach(b=>b.onclick=()=>showPlayer(b.dataset.profile));
    document.querySelectorAll("[data-invite]").forEach(b=>b.onclick=()=>openInvite(b.dataset.invite));
    document.querySelectorAll("[data-join]").forEach(b=>b.onclick=()=>requestJoin(b.dataset.join));
    document.querySelectorAll("[data-club],[data-manage]").forEach(b=>b.onclick=()=>showClub(b.dataset.club||b.dataset.manage));
    $("createClubBtn")?.addEventListener("click",openCreateClub);
    $("signUpBtn")?.addEventListener("click",()=>{state.authMode="signup";updateAuthMode();modal("authDialog")});
    $("playerSearch")?.addEventListener("input",e=>{state.search=e.target.value;const pos=e.target.selectionStart;render();const inp=$("playerSearch");inp?.focus();inp?.setSelectionRange(pos,pos)});
    $("clearSearch")?.addEventListener("click",()=>{state.search="";render()});
    document.querySelectorAll("[data-accept]").forEach(b=>b.onclick=()=>respondInvite(b.dataset.accept,"accepted"));
    document.querySelectorAll("[data-decline]").forEach(b=>b.onclick=()=>respondInvite(b.dataset.decline,"declined"));
    document.querySelectorAll("[data-approve-request]").forEach(b=>b.onclick=()=>respondRequest(b.dataset.approveRequest,"approved"));
    document.querySelectorAll("[data-reject-request]").forEach(b=>b.onclick=()=>respondRequest(b.dataset.rejectRequest,"rejected"));
    $("reportMatchBtn")?.addEventListener("click",reportMatch);
    document.querySelectorAll("[data-confirm-match]").forEach(b=>b.onclick=()=>confirmMatch(b.dataset.confirmMatch,"approved"));
    document.querySelectorAll("[data-dispute-match]").forEach(b=>b.onclick=()=>confirmMatch(b.dataset.disputeMatch,"disputed"));
  }
  function go(view){state.view=view;render();window.scrollTo({top:document.querySelector(".tabs").offsetTop-10,behavior:"smooth"})}
  function requireUser(){if(state.demo){toast("Connect Supabase to create real shared accounts.");state.authMode="signup";updateAuthMode();modal("authDialog");return false;}if(!state.user){state.authMode="signup";updateAuthMode();modal("authDialog");return false;}return true;}
  function openCreateClub(){if(!requireUser())return;$("clubName").value="";$("clubTag").value="";$("clubDescription").value="";$("clubMessage").textContent="";modal("clubDialog")}
  async function createClub(){
    if(!requireUser())return;
    const name=$("clubName").value.trim(),tag=$("clubTag").value.trim().toUpperCase(),description=$("clubDescription").value.trim();
    if(name.length<2||tag.length<2||tag.length>5){$("clubMessage").textContent="Club name must be 2+ characters and tag must be 2–5 characters.";return;}
    $("submitClub").disabled=true;
    try{
      const {data:club,error}=await db.from("clubs").insert({name,tag,description,owner_id:state.user.id}).select().single();
      if(error)throw error;
      const {error:memberError}=await db.from("club_members").insert({club_id:club.id,player_id:state.user.id,role:"owner"});
      if(memberError)throw memberError;
      closeModal("clubDialog");await loadData();go("clubs");toast("Club created. Start recruiting your squad.");
    }catch(e){$("clubMessage").textContent=e.message||"Could not create club.";}finally{$("submitClub").disabled=false;}
  }
  function showPlayer(id){
    const p=playerById(id);state.selectedPlayer=p;
    $("playerModalName").textContent=p.display_name;
    const m=state.members.find(x=>x.player_id===p.id),c=m?clubById(m.club_id):null;
    $("playerModalBody").innerHTML=`<div class="player-top"><div class="avatar">${escapeHtml(initials(p.display_name))}</div><div><h3>${escapeHtml(p.gamer_tag||p.display_name)}</h3><p>${escapeHtml(p.preferred_position||"Flexible")}</p></div></div><p>${escapeHtml(p.bio||"No bio added yet.")}</p><div class="club-meta"><span class="tag ${c?"gray":""}">${c?escapeHtml(c.name):"Available for recruitment"}</span></div>${state.user&&p.id!==state.user.id&&!m?`<button id="profileInvite" class="btn btn-primary full">Invite to your club</button>`:""}`;
    $("profileInvite")?.addEventListener("click",()=>{closeModal("playerDialog");openInvite(p.id)});modal("playerDialog");
  }
  function showClub(id){
    const c=clubById(id),members=state.members.filter(m=>m.club_id===id);
    toast(`${c.name}: ${members.length}/11 roster spots filled.`);
  }
  function openInvite(playerId){
    if(!requireUser())return;
    if(!state.clubs.some(c=>managerOf(c.id))){toast("You need to create a club or be a club manager first.");return;}
    state.invitePlayer=playerById(playerId);
    $("invitePrompt").textContent=`Send an invitation to ${state.invitePlayer.display_name}. They must accept before joining.`;
    $("inviteClub").innerHTML=state.clubs.filter(c=>managerOf(c.id)).map(c=>`<option value="${c.id}">${escapeHtml(c.name)} (${memberCount(c.id)}/11)</option>`).join("");
    $("inviteMessage").value="";$("inviteFeedback").textContent="";modal("inviteDialog");
  }
  async function sendInvite(){
    const clubId=$("inviteClub").value,p=state.invitePlayer;
    if(!p||!clubId)return;
    if(memberCount(clubId)>=11){$("inviteFeedback").textContent="This club already has 11 players.";return;}
    try{
      const {error}=await db.from("invitations").insert({club_id:clubId,player_id:p.id,invited_by:state.user.id,message:$("inviteMessage").value.trim()});
      if(error)throw error;closeModal("inviteDialog");await loadData();toast("Invitation sent. The player must accept."); 
    }catch(e){$("inviteFeedback").textContent=e.message||"Could not send invitation.";}
  }
  async function respondInvite(id,status){
    if(state.demo){toast("Connect the shared database to test real invitations.");return;}
    try{
      const {data:inv,error}=await db.from("invitations").update({status,responded_at:new Date().toISOString()}).eq("id",id).eq("player_id",state.user.id).select().single();
      if(error)throw error;
      if(status==="accepted"){
        const {error:memberErr}=await db.from("club_members").insert({club_id:inv.club_id,player_id:state.user.id,role:"player"});
        if(memberErr)throw memberErr;
      }
      await loadData();toast(status==="accepted"?"Invitation accepted. You're on the squad.":"Invitation declined.");
    }catch(e){toast(e.message||"Could not update invitation.");}
  }
  async function requestJoin(clubId){
    if(!requireUser())return;
    if(isMember()){toast("Pilot rule: one club per player. Leave your current club before requesting another.");return;}
    if(memberCount(clubId)>=11){toast("This club's roster is full.");return;}
    const msg=prompt("Add a short message for the club manager (optional):")||"";
    try{const {error}=await db.from("join_requests").insert({club_id:clubId,player_id:state.user.id,message:msg});if(error)throw error;await loadData();toast("Join request sent. The club manager must review it.");}
    catch(e){toast(e.message||"Could not send request.");}
  }
  async function respondRequest(id,status){
    const req=state.requests.find(r=>r.id===id);if(!req)return;
    try{
      const {error}=await db.from("join_requests").update({status,responded_at:new Date().toISOString()}).eq("id",id);
      if(error)throw error;
      if(status==="approved"){
        // The schema permits joining via an approved join request; roster limits are enforced by the DB trigger.
        const {error:memberErr}=await db.from("club_members").insert({club_id:req.club_id,player_id:req.player_id,role:"player"});
        if(memberErr)throw memberErr;
      }
      await loadData();toast(status==="approved"?"Request approved; player added if a spot remains.":"Join request rejected.");
    }catch(e){toast(e.message||"Could not review request.");}
  }
  async function reportMatch(){
    if(!requireUser())return;
    const own=state.clubs.filter(c=>managerOf(c.id));
    if(!own.length){toast("A club manager must report matches.");return;}
    const others=state.clubs.filter(c=>!own.some(o=>o.id===c.id));
    if(!others.length){toast("Another club is needed to report a match.");return;}
    const home=prompt("Your club ID/name:\n"+own.map(c=>`${c.id} — ${c.name}`).join("\n"),own[0].id);
    if(!home)return;
    const h=own.find(c=>c.id===home||c.name.toLowerCase()===home.toLowerCase());
    if(!h){toast("Select one of your clubs using its exact ID or name.");return;}
    const awayText=prompt("Opponent club ID/name:\n"+others.map(c=>`${c.id} — ${c.name}`).join("\n"));
    if(!awayText)return;
    const a=others.find(c=>c.id===awayText||c.name.toLowerCase()===awayText.toLowerCase());
    if(!a){toast("Opponent club not found.");return;}
    const hs=Number(prompt("Your club's goals (0–99):")),as=Number(prompt("Opponent's goals (0–99):"));
    if(!Number.isInteger(hs)||!Number.isInteger(as)||hs<0||as<0||hs>99||as>99){toast("Enter valid scores from 0 to 99.");return;}
    const evidence=prompt("Optional screenshot/evidence URL (do not share private account data):")||"";
    try{const {error}=await db.from("matches").insert({home_club_id:h.id,away_club_id:a.id,home_score:hs,away_score:as,reported_by:state.user.id,evidence_url:evidence,status:"awaiting_confirmation"});if(error)throw error;await loadData();toast("Match submitted for opponent confirmation.");}
    catch(e){toast(e.message||"Could not report match.");}
  }
  async function confirmMatch(id,status){
    try{const {error}=await db.from("matches").update({status,confirmed_by:state.user.id,approved_at:status==="approved"?new Date().toISOString():null}).eq("id",id);if(error)throw error;await loadData();toast(status==="approved"?"Result confirmed and included in rankings.":"Result disputed for moderator review.");}
    catch(e){toast(e.message||"Could not update match.");}
  }
  function updateAuthMode(){
    $("signupMode").classList.toggle("selected",state.authMode==="signup");$("loginMode").classList.toggle("selected",state.authMode==="login");
    $("authTitle").textContent=state.authMode==="signup"?"Join GoalChain":"Welcome back";$("authName").classList.toggle("hidden",state.authMode==="login");
    $("submitAuth").textContent=state.authMode==="signup"?"Create account":"Sign in";$("authMessage").textContent="";
  }
  async function submitAuth(){
    if(state.demo){$("authMessage").textContent="Database isn't configured yet. Follow SETUP.md, then reload.";return;}
    const email=$("authEmail").value.trim(),password=$("authPassword").value,name=$("authName").value.trim();
    if(!email||password.length<8){$("authMessage").textContent="Enter a valid email and a password with at least 8 characters.";return;}
    $("submitAuth").disabled=true;$("authMessage").textContent="";
    try{
      if(state.authMode==="signup"){
        if(name.length<2){$("authMessage").textContent="Display name must be at least 2 characters.";return;}
        const {data,error}=await db.auth.signUp({email,password,options:{data:{display_name:name},emailRedirectTo:window.location.href}});
        if(error)throw error;
        if(data.session){state.user=data.user;await refreshUser();closeModal("authDialog");toast("Welcome to GoalChain.");}
        else $("authMessage").textContent="Account created. Check your email to confirm, then sign in.";
      }else{
        const {data,error}=await db.auth.signInWithPassword({email,password});if(error)throw error;
        state.user=data.user;await refreshUser();closeModal("authDialog");toast("Signed in successfully.");
      }
    }catch(e){$("authMessage").textContent=e.message||"Authentication failed.";}
    finally{$("submitAuth").disabled=false;}
  }
  $("authButton").addEventListener("click",async()=>{
    if(state.user&&db){await db.auth.signOut();state.user=null;state.profile=null;await loadData();setStatus();toast("Signed out.");}
    else {state.authMode="login";updateAuthMode();modal("authDialog");}
  });
  $("signupMode").onclick=()=>{state.authMode="signup";updateAuthMode()};
  $("loginMode").onclick=()=>{state.authMode="login";updateAuthMode()};
  $("submitAuth").onclick=submitAuth;
  $("submitClub").onclick=createClub;
  $("submitInvite").onclick=sendInvite;
  $("dismissNotice").onclick=()=>$("setupNotice").classList.add("hidden");
  $("createClubHero").onclick=()=>{go("clubs");openCreateClub()};
  $("exploreHero").onclick=()=>go("players");
  document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>go(t.dataset.view));
  if(db) db.auth.onAuthStateChange((_event,session)=>{state.user=session?.user||null;setTimeout(refreshUser,0)});
  if(state.demo){loadDemo();setStatus();render();}
  else refreshUser();
})();