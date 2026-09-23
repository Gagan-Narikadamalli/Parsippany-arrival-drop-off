const form=document.getElementById("searchForm");
const message=document.getElementById("message");
const results=document.getElementById("results");
const body=document.getElementById("recordsBody");
const newRecordButton=document.getElementById("newRecord");
const today=new Date().toISOString().slice(0,10);
form.fromDate.value=today;form.toDate.value=today;
const esc=value=>String(value??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const filters=()=>({fromDate:form.fromDate.value,toDate:form.toDate.value,clientName:form.clientName.value.trim(),password:form.password.value});

function showMessage(text,type="success"){message.textContent=text;message.className=`message ${type}`;}
function formatBytes(value){const bytes=Math.max(0,Number(value)||0);if(bytes<1024)return `${bytes} B`;const units=["KB","MB","GB"];let size=bytes;let unit=-1;do{size/=1024;unit++}while(size>=1024&&unit<units.length-1);return `${size.toFixed(size>=100?0:size>=10?1:2)} ${units[unit]}`;}
function renderStorage(storage){if(!storage)return;const panel=document.getElementById("storagePanel");const percent=Math.max(0,Number(storage.percentUsed)||0);document.getElementById("storageUsed").textContent=formatBytes(storage.usedBytes);document.getElementById("storageRemaining").textContent=formatBytes(storage.remainingBytes);document.getElementById("storageLimit").textContent=formatBytes(storage.limitBytes);document.getElementById("storagePercent").textContent=`${percent.toFixed(percent>=10?1:2)}% used`;const bar=document.getElementById("storageBar");bar.style.width=`${Math.min(percent,100)}%`;const meter=bar.parentElement;meter.setAttribute("aria-valuenow",String(Math.min(Math.round(percent),100)));panel.hidden=false;}
function render(rows){
  results.hidden=false;document.getElementById("visitCount").textContent=`${rows.length} visit${rows.length===1?"":"s"}`;document.getElementById("empty").hidden=rows.length>0;
  newRecordButton.hidden=false;
  body.innerHTML=rows.map(row=>`<tr data-id="${esc(row.id)}"><td><input class="edit-input first" maxlength="60" value="${esc(row.client_first_name)}"></td><td><input class="edit-input last" maxlength="60" value="${esc(row.client_last_name)}"></td><td><input class="edit-input arrival-guardian" maxlength="120" value="${esc(row.arrival_guardian_name||row.parent_name)}"></td><td><input class="edit-input departure-guardian" maxlength="120" value="${esc(row.departure_guardian_name||"")}"></td><td><input class="edit-input date-input date" type="date" value="${esc(String(row.visit_date).slice(0,10))}"></td><td><input class="edit-input time-input arrival" type="time" step="1" value="${esc(String(row.arrival_time||"").slice(0,8))}"></td><td><input class="edit-input time-input departure" type="time" step="1" value="${esc(String(row.departure_time||"").slice(0,8))}"></td><td><div class="row-actions"><button class="save" type="button">Save</button><button class="delete" type="button">Delete</button></div></td></tr>`).join("");
}
function easternNow(){const parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(new Date()).filter(part=>part.type!=="literal").map(part=>[part.type,part.value]));return{date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}:${parts.second}`};}
function rowPayload(row){return{arrivalGuardianName:row.querySelector(".arrival-guardian").value.trim(),departureGuardianName:row.querySelector(".departure-guardian").value.trim(),clientFirstName:row.querySelector(".first").value.trim(),clientLastName:row.querySelector(".last").value.trim(),visitDate:row.querySelector(".date").value,arrivalTime:row.querySelector(".arrival").value,departureTime:row.querySelector(".departure").value};}
function addNewRow(){const existing=body.querySelector(".new-row");if(existing){existing.querySelector(".first").focus();return;}const now=easternNow();const row=document.createElement("tr");row.className="new-row";row.innerHTML=`<td><input class="edit-input first" maxlength="60" placeholder="First name"></td><td><input class="edit-input last" maxlength="60" placeholder="Last name"></td><td><input class="edit-input arrival-guardian" maxlength="120" placeholder="Drop-off guardian"></td><td><input class="edit-input departure-guardian" maxlength="120" placeholder="Pickup guardian"></td><td><input class="edit-input date-input date" type="date" value="${now.date}"></td><td><input class="edit-input time-input arrival" type="time" step="1" value="${now.time}"></td><td><input class="edit-input time-input departure" type="time" step="1"></td><td><div class="row-actions"><button class="create" type="button">Create</button><button class="cancel" type="button">Cancel</button></div></td>`;body.prepend(row);document.getElementById("empty").hidden=true;row.querySelector(".first").focus();}
async function request(action,payload={}){
  const response=await fetch("/api/admin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...filters(),action,...payload})});const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||"Request could not be completed.");return data;
}
async function loadRecords(){const button=form.querySelector('button[type="submit"]');button.disabled=true;button.textContent="Loading…";try{const data=await request("list");render(data.records);renderStorage(data.storage);showMessage(`${data.records.length} matching visit${data.records.length===1?"":"s"} found.`)}catch(error){showMessage(error.message,"error")}finally{button.disabled=false;button.textContent="View Records"}}
form.addEventListener("submit",event=>{event.preventDefault();loadRecords()});
body.addEventListener("click",async event=>{
  const row=event.target.closest("tr");if(!row)return;
  if(event.target.closest(".cancel")){row.remove();document.getElementById("empty").hidden=body.children.length>0;return;}
  if(event.target.closest(".create")){
    const button=event.target;button.disabled=true;
    try{await request("create",rowPayload(row));showMessage("New visit record created successfully.");await loadRecords()}catch(error){showMessage(error.message,"error");button.disabled=false}
    return;
  }
  if(event.target.closest(".save")){
    const button=event.target;button.disabled=true;
    try{await request("update",{id:row.dataset.id,...rowPayload(row)});showMessage("Visit updated successfully.");await loadRecords()}catch(error){showMessage(error.message,"error");button.disabled=false}
  }
  if(event.target.closest(".delete")){
    if(!confirm("Permanently delete this visit record? This cannot be undone."))return;const button=event.target;button.disabled=true;
    try{await request("delete",{id:row.dataset.id});showMessage("Visit deleted successfully.");await loadRecords()}catch(error){showMessage(error.message,"error");button.disabled=false}
  }
});
newRecordButton.addEventListener("click",addNewRow);
document.getElementById("exportButton").addEventListener("click",async()=>{
  try{const response=await fetch("/api/export",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(filters())});if(!response.ok){const data=await response.json();throw new Error(data.error||"Report could not be created.")}const blob=await response.blob();const count=response.headers.get("X-Visit-Count")||"0";const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=`sos-visits-${form.fromDate.value}-to-${form.toDate.value}.csv`;link.click();URL.revokeObjectURL(link.href);showMessage(`Report downloaded: ${count} matching visit${count==="1"?"":"s"}.`)}catch(error){showMessage(error.message,"error")}
});
