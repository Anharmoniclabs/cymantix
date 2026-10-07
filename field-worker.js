importScripts('modal-core.js','field-core.js');
let bank,W,grid,shape,revision=0;
onmessage=({data})=>{
 try{
  if(data.type==='configure'){
   ({W,grid,shape,revision}=data);bank=new VirtualPlate.ModalBank(data.frequencies,data.gains,data.rate,data.weights);return;
  }
  if(data.revision!==revision||!bank)return;
  const started=performance.now(),C=bank.recover(data.stats),n=bank.count;
  for(let i=0;i<n;i++)C[i*n+i]=data.energy[i];
  const field=PlateField.buildField(W,grid,C,shape);
  postMessage({revision,endSample:data.endSample,...field,computeMs:performance.now()-started},[field.E.buffer,field.EX.buffer,field.EY.buffer]);
 }catch(error){postMessage({revision,error:error.message});}
};
