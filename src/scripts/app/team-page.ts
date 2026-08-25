interface OrgDto { id:string; name:string; isPersonal:boolean; balance:number; memberCount:number; }
interface ProjectDto { id:string; name:string; brief:string|null; status:string; assetCount:number; updatedAt:number; }
interface MemberDto { id:string; name:string; email:string; image:string|null; role:string; spend30d:number; }

async function json<T>(path:string, init?:RequestInit):Promise<T>{
  const response=await fetch(path,{credentials:"include",...init});
  const body=await response.json().catch(()=>null) as {error?:{message?:string}}|T|null;
  if(!response.ok) throw new Error((body as {error?:{message?:string}}|null)?.error?.message || "Couldn't load the workspace.");
  return body as T;
}
function formatDate(value:number):string { return new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric"}).format(value); }
function initTeamPage():void {
  const page=document.getElementById("teamPage"); if(!page)return;
  const invite=document.getElementById("teamInviteButton");
  invite?.addEventListener("click",()=>window.dispatchEvent(new Event("doodleai:open-team-invite")));
  void load();
  async function load():Promise<void>{
    try{
      const me=await json<{org:OrgDto}>("/api/v1/me");
      const org=me.org;
      const name=document.getElementById("teamName"); if(name)name.textContent=org.isPersonal?"Your workspace":org.name;
      const meta=document.getElementById("teamMeta"); if(meta)meta.textContent=`${org.memberCount} member${org.memberCount===1?"":"s"} · ${org.isPersonal?"Personal workspace":"Shared team workspace"}`;
      const balance=document.getElementById("teamBalance"); if(balance)balance.textContent=`${org.balance} credit${org.balance===1?"":"s"}`;
      const memberCount=document.getElementById("teamMemberCount"); if(memberCount)memberCount.textContent=String(org.memberCount);
      const projects=await json<{projects:ProjectDto[]}>("/api/v1/projects?status=active&limit=6");
      const projectCount=document.getElementById("teamProjectCount"); if(projectCount)projectCount.textContent=String(projects.projects.length);
      const grid=document.getElementById("teamProjects"); if(grid){grid.innerHTML=""; if(!projects.projects.length){grid.innerHTML='<a class="project-card" href="/projects"><h3>Start a project</h3><p>Give a concept sprint or campaign a home.</p><div class="project-card-footer"><span>Create project</span><span>→</span></div></a>';} else projects.projects.forEach(project=>{const link=document.createElement("a");link.className="project-card";link.href=`/projects/${encodeURIComponent(project.id)}`;link.innerHTML=`<h3></h3><p></p><div class="project-card-footer"><span class="project-status">${project.status}</span><span>${project.assetCount} asset${project.assetCount===1?"":"s"} · ${formatDate(project.updatedAt)}</span></div>`;const h=link.querySelector("h3");const p=link.querySelector("p");if(h)h.textContent=project.name;if(p)p.textContent=project.brief||"A shared space for references, generations, and review.";grid.appendChild(link);});}
      const members=await json<{members:MemberDto[]}>(`/api/v1/orgs/${encodeURIComponent(org.id)}/members`);
      const people=document.getElementById("teamMembers"); if(people){people.innerHTML="";members.members.slice(0,8).forEach(member=>{const card=document.createElement("div");card.className="member-card";const avatar=document.createElement("span");avatar.className="member-avatar";if(member.image)avatar.style.backgroundImage=`url("${member.image}")`;avatar.textContent=member.name.charAt(0).toUpperCase();const text=document.createElement("div");text.innerHTML='<strong></strong><small></small>';const strong=text.querySelector("strong");const small=text.querySelector("small");if(strong)strong.textContent=member.name;if(small)small.textContent=member.role;card.appendChild(avatar);card.appendChild(text);people.appendChild(card);});}
      const credits=await json<{monthSpend:number;monthlyCreditCap:number|null}>(`/api/v1/orgs/${encodeURIComponent(org.id)}/credits`);
      const spend=document.getElementById("teamSpend");if(spend)spend.textContent=`${credits.monthSpend} used this month${credits.monthlyCreditCap?` · ${credits.monthlyCreditCap} cap`:""}`;
    }catch(error){
      const meta=document.getElementById("teamMeta");if(meta)meta.textContent=error instanceof Error?error.message:"Couldn't load the workspace.";
    }
  }
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initTeamPage);else initTeamPage();
