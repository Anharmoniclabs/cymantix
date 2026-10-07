importScripts('modal-core.js?v=lab-20261007-4','field-core.js?v=lab-20261007-4');
let bank,W,grid,shape,fieldPort,revision=0,latest=null,timer=null,lastStart=-Infinity;
function request(data){
 if(data.revision!==revision||!bank)return;
 latest=data;
 if(timer===null)timer=setTimeout(compute,Math.max(0,80-(performance.now()-lastStart)));
}
function compute(){
 timer=null;const data=latest;latest=null;if(!data||data.revision!==revision)return;
 try{
  const started=performance.now();lastStart=started;
  const C=bank.recover(data.stats),n=bank.count;for(let i=0;i<n;i++)C[i*n+i]=data.energy[i];
  const field=PlateField.buildField(W,grid,C,shape);
  postMessage({revision,endSample:data.endSample,...field,computeMs:performance.now()-started},[field.E.buffer,field.EX.buffer,field.EY.buffer]);
 }catch(error){postMessage({revision,error:error.message});}
}
onmessage=({data})=>{
 try{
  if(data.type==='connect'){fieldPort=data.port;fieldPort.onmessage=({data})=>request(data);return;}
  if(data.type==='configure'){
   if(timer!==null)clearTimeout(timer);timer=null;latest=null;lastStart=-Infinity;
   ({W,grid,shape,revision}=data);bank=new VirtualPlate.ModalBank(data.frequencies,data.gains,data.rate,data.weights);
  }
 }catch(error){postMessage({revision,error:error.message});}
};
