/* Stockfish 19 WebAssembly bridge.
   Primary engine: @lichess-org/stockfish-web 0.5.0 / sf_19.
   The package is GPL/AGPL-compatible according to its upstream distribution; see README.
*/
'use strict';
const SF='https://cdn.jsdelivr.net/npm/@lichess-org/stockfish-web@0.5.0/sf_19.js';
const NN='https://cdn.jsdelivr.net/npm/@lichess-org/stockfish-web@0.5.0/nn-1a298aa575a0.nnue';
let sf=null, ready=false, current=null, queue=[];
const send=x=>postMessage(x);
async function boot(){
  try{
    const mod=await import(SF);
    let x=mod.default;
    sf=typeof x==='function'?x():x;
    if(sf&&typeof sf.then==='function')sf=await sf;
    if(!sf)throw new Error('Stockfish 19 module failed to initialize');
    sf.listen=(line)=>handle(String(line));
    if(sf.onError)sf.onError=(msg)=>send({type:'error',error:String(msg)});
    try{const r=await fetch(NN); if(!r.ok)throw new Error('NNUE HTTP '+r.status); sf.setNnueBuffer(new Uint8Array(await r.arrayBuffer()));}catch(e){send({type:'warning',message:'NNUE preload failed: '+e.message});}
    sf.uci('uci');
  }catch(e){send({type:'error',error:String(e)});}
}
function cmd(s){if(sf)sf.uci(s)}
function setup(x,multi){
  cmd('setoption name Threads value 1');
  cmd('setoption name Hash value 64');
  cmd('setoption name MultiPV value '+(multi?3:1));
  cmd('setoption name Skill Level value 20');
  cmd('position fen '+(x.stage===0?x.before:x.after));
  cmd('go depth '+Math.max(8,x.depth||22)+' movetime '+Math.max(500,x.time||3000));
}
function parseScore(s,t){return t==='mate'?(s>0?100000-s:-100000-s):s}
function handle(line){
  if(line==='uciok'){cmd('isready');return}
  if(line==='readyok'){ready=true;send({type:'ready'});flush();return}
  if(!current)return;
  if(line.startsWith('info ')){
    const sm=line.match(/score (cp|mate) (-?\d+)/), mp=line.match(/multipv (\d+)/), pv=line.match(/\bpv\s+(.+)$/);
    if(sm){current.st=sm[1];current.sc=+sm[2]}
    if(mp)current.mp=+mp[1]
    if(pv){current.pvs[current.mp||1]={scoreType:current.st,score:current.sc,pv:pv[1].trim().split(/\s+/)}}
  }
  if(line.startsWith('bestmove ')){
    const best=line.split(/\s+/)[1]||'0000', out={best,score:parseScore(current.sc||0,current.st),pvs:current.pvs||{}};
    const x=current;current=null;
    if(x.kind==='review'){
      if(x.stage===0){x.result.before=out;x.stage=1;run(x)}
      else{x.result.after=out;send({type:'review',job:x.job,result:x.result});flush()}
    }else{send({type:'bestmove',job:x.job,move:best,score:out.score});flush()}
  }
}
function run(x){current=x;current.pvs={};cmd('ucinewgame');cmd('isready');setup(x,x.kind==='review')}
function flush(){if(!ready||current||!queue.length)return;run(queue.shift())}
self.onmessage=e=>{const x=e.data||{};if(x.type!=='search'&&x.type!=='review')return;queue=[];if(current){cmd('stop');current=null}if(x.kind==='review'){x.stage=0;x.result={}}queue.push(x);flush()};
boot();
