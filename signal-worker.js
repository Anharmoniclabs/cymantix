importScripts('signal-analysis.js');
let rft=null,rftError=null;
fetch('data/rft_610.bin').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.arrayBuffer();}).then(buffer=>{
  const n=610;if(buffer.byteLength!==4+4*n*n)throw Error('RFT matrix size mismatch');
  const scale=new DataView(buffer).getFloat32(0,true),quantized=new Int16Array(buffer,4);
  rft={n,matrix:Float32Array.from(quantized,x=>x*scale)};
}).catch(error=>{rftError=error.message;});
onmessage=({data})=>{
  try {
    const report=SignalAnalysis.analyse(data.pcm,data.rate,data.frequencies,rft);
    postMessage({revision:data.revision,endSample:data.endSample,...report,rftState:rft?'ready':rftError?'failed':'loading',rftError});
  } catch(error) {postMessage({revision:data.revision,error:error.message});}
};
