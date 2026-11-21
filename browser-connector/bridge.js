if(!globalThis.commerceBridge){
 globalThis.commerceBridge=true;
 document.addEventListener('commerce-cloud-command',async e=>{
  let command;
  try{
   command=JSON.parse(e.detail);
   const workspace=document.querySelector('[data-cloud-workspace]')?.dataset.cloudWorkspace;
   if(!workspace||location.hash!=='#ai-config/market')return;
   const reply=await chrome.runtime.sendMessage({...command,workspace});
   document.dispatchEvent(new CustomEvent('commerce-cloud-result',{detail:JSON.stringify({id:command.id,...reply})}));
  }catch{ /* A navigated or disconnected workbench must pair again. */ }
 });
}
document.dispatchEvent(new Event('commerce-cloud-ready'));
