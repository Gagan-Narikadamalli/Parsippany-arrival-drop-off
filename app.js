const form=document.getElementById("arrivalForm");
const message=document.getElementById("message");
function setCurrentArrivalTime(){const now=new Date();form.arrivalTime.value=`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;}
setCurrentArrivalTime();
function currentTime(){const now=new Date();return `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;}
function updateVisitAction(){
  const departure=form.visitAction.value==="departure";
  form.arrivalTime.disabled=departure;form.arrivalTime.required=!departure;
  form.departureTime.disabled=!departure;form.departureTime.required=departure;
  if(departure){form.arrivalTime.value="";if(!form.departureTime.value)form.departureTime.value=currentTime();}
  else{form.departureTime.value="";if(!form.arrivalTime.value)form.arrivalTime.value=currentTime();}
}
form.querySelectorAll('[name="visitAction"]').forEach(input=>input.addEventListener("change",updateVisitAction));

form.addEventListener("submit",async event=>{
  event.preventDefault();
  const button=form.querySelector("button");
  button.disabled=true;
  button.textContent="Submitting…";
  message.className="message";
  message.textContent="";
  try{
    const response=await fetch("/api/submit",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        parentName:form.parentName.value.trim(),
        clientFirstName:form.clientFirstName.value.trim(),
        clientLastName:form.clientLastName.value.trim(),
        visitAction:form.visitAction.value,
        arrivalTime:form.arrivalTime.value,
        departureTime:form.departureTime.value
      })
    });
    const data=await response.json();
    if(!response.ok||!data.ok)throw new Error(data.error||"The form could not be submitted.");
    form.reset();
    setCurrentArrivalTime();
    updateVisitAction();
    message.textContent=data.action==="departure"?"Pickup recorded successfully. Thank you.":"Drop-off recorded successfully. Thank you.";
    message.className="message success";
    form.parentName.focus();
  }catch(error){
    message.textContent=error.message;
    message.className="message error";
  }finally{
    button.disabled=false;
    button.textContent="Record visit";
  }
});
