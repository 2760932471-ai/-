if(!globalThis.commerceBridge){
 globalThis.commerceBridge=true;
 document.addEventListener('commerce-cloud-command',async e=>{
  let command;
  try{
   command=JSON.parse(e.detail);
   const workspace=document.querySelector('[data-cloud-workspace]')?.dataset.cloudWorkspace;
   if(!workspace)return;
   const reply=await chrome.runtime.sendMessage({...command,workspace});
   if(!reply)throw Error();
   document.dispatchEvent(new CustomEvent('commerce-cloud-result',{detail:JSON.stringify({id:command.id,...reply})}));
  }catch{
   if(command?.id)document.dispatchEvent(new CustomEvent('commerce-cloud-result',{detail:JSON.stringify({id:command.id,error:'扩展连接已失效。请刷新工作台，在扩展中重新连接此页。'})}));
  }
 });
}
document.dispatchEvent(new Event('commerce-cloud-ready'));
