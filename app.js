
'use strict';
const PIECE={wp:1,wr:1,wn:1,wb:1,wq:1,wk:1,bp:1,br:1,bn:1,bb:1,bq:1,bk:1};
const UNICODE_PIECES={wk:'♔',wq:'♕',wr:'♖',wb:'♗',wn:'♘',wp:'♙',bk:'♚',bq:'♛',br:'♜',bb:'♝',bn:'♞',bp:'♟'};
function pieceSVG(p){const ch=UNICODE_PIECES[p]||'?';return `<span class="piece piece-${p[0]}" aria-hidden="true">${ch}</span>`;}
const V={p:100,n:320,b:330,r:500,q:900,k:20000};
const START=[['br','bn','bb','bq','bk','bb','bn','br'],['bp','bp','bp','bp','bp','bp','bp','bp'],[null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null],['wp','wp','wp','wp','wp','wp','wp','wp'],['wr','wn','wb','wq','wk','wb','wn','wr']];
let state, worker=null, stockfishWorker=null, workerJob=0, stockfishJob=0, reviewTimer=0, reviewIndex=-1, engineFallback=false, stockfishReady=false;
const cfg={mode:'ai',humanColor:'w',depth:22,thinkTime:3000,engineMode:'stockfish',orientation:'normal',lastMove:'on',showTargets:'on',autoAnalyze:'on'};
const key='chess_app_v1';
const testMode=new URLSearchParams(location.search).get('test')==='1';
function clone(b){return b.map(r=>r.slice())} function inside(r,c){return r>=0&&r<8&&c>=0&&c<8}
function other(c){return c==='w'?'b':'w'} function pieceColor(p){return p?p[0]:null}
function findKing(b,c){for(let r=0;r<8;r++)for(let q=0;q<8;q++)if(b[r][q]===c+'k')return[r,q];return null}
function attacked(b,r,c,by){
 const pd=by==='w'?1:-1; for(const dc of[-1,1])if(inside(r+pd,c+dc)&&b[r+pd][c+dc]===by+'p')return true;
 for(const [dr,dc] of [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]])if(inside(r+dr,c+dc)&&b[r+dr][c+dc]===by+'n')return true;
 for(const [dr,dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]){let R=r+dr,C=c+dc;while(inside(R,C)){const p=b[R][C];if(p){if(p===by+'b'||p===by+'q')return true;break}R+=dr;C+=dc}}
 for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){let R=r+dr,C=c+dc;while(inside(R,C)){const p=b[R][C];if(p){if(p===by+'r'||p===by+'q')return true;break}R+=dr;C+=dc}}
 for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if((dr||dc)&&inside(r+dr,c+dc)&&b[r+dr][c+dc]===by+'k')return true;
 return false;
}
function inCheck(b,c){const k=findKing(b,c);return !k||attacked(b,k[0],k[1],other(c))}
function pseudo(b,m,st,castle=true){
 const p=b[m.r][m.c],q=b[m.R][m.C]; if(!p||p[0]!==st.turn||(q&&q[0]===st.turn))return false;
 const t=p[1],dr=m.R-m.r,dc=m.C-m.c,a=Math.abs(dr),z=Math.abs(dc);
 if(t==='p'){const d=st.turn==='w'?-1:1,start=st.turn==='w'?6:1;if(dc===0&&!q&&(dr===d||(m.r===start&&dr===2*d&&!b[m.r+d][m.c])))return true;return z===1&&dr===d&&(!!q||(st.ep&&st.ep[0]===m.R&&st.ep[1]===m.C))}
 if(t==='n')return(a===2&&z===1)||(a===1&&z===2);
 if(t==='b'&&a!==z)return false;if(t==='r'&&dr!==0&&dc!==0)return false;if(t==='q'&&dr!==0&&dc!==0&&a!==z)return false;
 if(['b','r','q'].includes(t)){const sr=Math.sign(dr),sc=Math.sign(dc);let R=m.r+sr,C=m.c+sc;while(R!==m.R||C!==m.C){if(b[R][C])return false;R+=sr;C+=sc}return true}
 if(t==='k'){if(Math.max(a,z)===1)return true;if(castle&&dr===0&&z===2&&!inCheck(b,st.turn)){
  const side=dc>0?'k':'q',row=st.turn==='w'?7:0,enemy=other(st.turn);if(!st.castle[st.turn][side])return false;
  if(side==='k')return b[row][7]===st.turn+'r'&&!b[row][5]&&!b[row][6]&&!attacked(b,row,5,enemy)&&!attacked(b,row,6,enemy);
  return b[row][0]===st.turn+'r'&&!b[row][1]&&!b[row][2]&&!b[row][3]&&!attacked(b,row,3,enemy)&&!attacked(b,row,2,enemy);
 }} return false;
}
function legalMoves(st){
 const out=[]; for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(st.board[r][c]?.[0]===st.turn)for(let R=0;R<8;R++)for(let C=0;C<8;C++){
  const m={r,c,R,C};if(!pseudo(st.board,m,st))continue;const ns=applyMove(st,m);if(!inCheck(ns.board,st.turn))out.push(m);
 } return out;
}
function applyMove(st,m,record=true){
 const n={...st,board:clone(st.board),castle:{w:{...st.castle.w},b:{...st.castle.b}},ep:null,last:null,history:st.history.slice(),evals:st.evals.slice()};
 const p=n.board[m.r][m.c]; const capture=n.board[m.R][m.C]; n.board[m.R][m.C]=p;n.board[m.r][m.c]=null;
 if(p[1]==='p'&&m.C!==m.c&&!capture&&st.ep&&st.ep[0]===m.R&&st.ep[1]===m.C){n.board[m.R+(p[0]==='w'?1:-1)][m.C]=null;m.ep=true}else m.ep=false;
 if(p[1]==='k'&&Math.abs(m.C-m.c)===2){const row=m.r;if(m.C===6){n.board[row][5]=n.board[row][7];n.board[row][7]=null;m.castle='k'}else{n.board[row][3]=n.board[row][0];n.board[row][0]=null;m.castle='q'}}
 if(p[1]==='p'&&(m.R===0||m.R===7)){n.board[m.R][m.C]=p[0]+'q';m.promotion='q'}
 if(p[1]==='k'){n.castle[p[0]].k=false;n.castle[p[0]].q=false}if(p[1]==='r'){const row=p[0]==='w'?7:0;if(m.r===row&&m.c===0)n.castle[p[0]].q=false;if(m.r===row&&m.c===7)n.castle[p[0]].k=false}
 if(p[1]==='r'||capture?.[1]==='r'){for(const side of ['w','b']){const row=side==='w'?7:0;if(m.R===row&&m.C===0)n.castle[side].q=false;if(m.R===row&&m.C===7)n.castle[side].k=false}}
 if(p[1]==='p'&&Math.abs(m.R-m.r)===2)n.ep=[(m.R+m.r)/2,m.c];n.turn=other(st.turn);n.last=m;
 if(record){n.half=st.half+(p[1]==='p'||capture?0:1);n.moveNo=st.moveNo+(st.turn==='b'?1:0);n.history.push({m:{...m},san:'',fen:toFEN(n)});}
 return n;
}
function sanFor(st,m){const p=st.board[m.r][m.c],capture=!!st.board[m.R][m.C]||m.ep; if(p[1]==='k'&&Math.abs(m.C-m.c)===2)return m.C===6?'O-O':'O-O-O';let s=p[1]==='p'?'':p[1].toUpperCase();if(p[1]==='p'&&capture)s+=String.fromCharCode(97+m.c);if(p[1]!== 'p'){const peers=legalMoves(st).filter(x=>x.R===m.R&&x.C===m.C&&x.r!==m.r&&x.c!==m.c&&st.board[x.r][x.c][1]===p[1]);if(peers.length)s+=(peers.some(x=>x.c===m.c)?String.fromCharCode(97+m.c):String(m.r+1))}if(capture)s+='x';s+=String.fromCharCode(97+m.C)+(8-m.R);if(m.promotion)s+='='+m.promotion.toUpperCase();const ns=applyMove(st,m,false);if(inCheck(ns.board,ns.turn)){s+=legalMoves(ns).length?' +':' #'}return s}
function toFEN(st){let rows=[];for(let r=0;r<8;r++){let row='',e=0;for(let c=0;c<8;c++){const p=st.board[r][c];if(p)e?(row+=e,e=0):0,row+=p[0]==='w'?p[1].toUpperCase():p[1];else e++}if(e)row+=e;rows.push(row)}let cast='';for(const c of['w','b'])for(const side of['k','q'])if(st.castle[c][side])cast+=c==='w'?(side==='k'?'K':'Q'):(side==='k'?'k':'q');if(!cast)cast='-';const ep=st.ep?String.fromCharCode(97+st.ep[1])+(8-st.ep[0]):'-';return rows.join('/')+' '+st.turn+' '+cast+' '+ep+' '+st.half+' '+st.moveNo}
function evaluate(st){let s=0;const b=st.board;for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(b[r][c]){const p=b[r][c],t=p[1];let v=V[t],center=4-Math.max(Math.abs(3.5-r),Math.abs(3.5-c));if(t==='p')v+=center*8;if(t==='n'||t==='b')v+=center*10;if(t==='r'&&c>0&&c<7)v+=5;if(t==='k')v+=center*-8;s+=(p[0]==='w'?v:-v)}if(inCheck(b,'w'))s-=28;if(inCheck(b,'b'))s+=28;return s/100}
function orderMoves(st,ms){return ms.sort((a,b)=>(V[st.board[b.R][b.C]?.[1]]||0)-(V[st.board[a.R][a.C]?.[1]]||0))}
function search(st,depth,alpha,beta,root){const ms=legalMoves(st);if(!ms.length)return inCheck(st.board,st.turn)?-9999+(root-depth):0;if(depth<=0)return (st.turn==='w'?1:-1)*evaluate(st);orderMoves(st,ms);let best=-1e9;for(const m of ms){const v=-search(applyMove(st,m,false),depth-1,-beta,-alpha,root);if(v>best)best=v;if(v>alpha)alpha=v;if(alpha>=beta)break}return best}
function bestMove(st,depth,deadline){const ms=orderMoves(st,legalMoves(st));let bm=ms[0],best=-1e9;for(const m of ms){if(performance.now()>deadline)break;const v=-search(applyMove(st,m,false),depth-1,-1e9,1e9,depth);if(v>best){best=v;bm=m}}return {move:bm,score:best,nodes:0}}
function classification(delta,absEval){if(delta<=.05)return '정확';if(delta<=.18)return '👍 좋은 수';if(delta<=.45)return '?! 부정확';if(delta<=1.2)return '? 실수';if(delta<=2.5)return '?? 큰 실수';return '💥 블런더'}
function startState(){return {board:clone(START),turn:'w',castle:{w:{k:true,q:true},b:{k:true,q:true}},ep:null,half:0,moveNo:1,last:null,history:[],evals:[0],status:'playing',selected:null,busy:false}}
function gameEnd(st){const ms=legalMoves(st);if(ms.length)return null;if(inCheck(st.board,st.turn))return other(st.turn)==='w'?'백 체크메이트':'흑 체크메이트';return '스테일메이트';}
function createWorker(){
 if(worker)worker.terminate();
 worker=new Worker(URL.createObjectURL(new Blob([`(${workerCode.toString()})()`],{type:'application/javascript'})));
 worker.onmessage=e=>{const d=e.data;if(d.job!==workerJob)return;if(d.type==='best'){state.busy=false;render();if(d.move)humanOrAiMove(d.move,true)}};
 createStockfishWorker();
}
function createStockfishWorker(){
 if(stockfishWorker)stockfishWorker.terminate();
 stockfishReady=false; engineFallback=false;
 stockfishWorker=new Worker('stockfish.js');
 const timer=setTimeout(()=>{
   if(!stockfishReady){engineFallback=true;document.getElementById('engineStatus').textContent='Stockfish 19 연결이 지연되어 내장 AI로 자동 전환했습니다. 게임은 계속할 수 있습니다.';render();requestAi();}
 },testMode?800:9000);
 stockfishWorker.onerror=e=>{clearTimeout(timer);stockfishReady=false;engineFallback=true;document.getElementById('engineStatus').textContent='Stockfish 19을 불러오지 못해 내장 AI로 전환했습니다.';state.busy=false;render();};
 stockfishWorker.onmessage=e=>{const d=e.data||{};
   if(d.type==='error'){clearTimeout(timer);stockfishReady=false;engineFallback=true;document.getElementById('engineStatus').textContent='Stockfish 19 오류: 내장 AI로 전환했습니다.';state.busy=false;render();if(state.status==='playing')setTimeout(requestAi,80);return}
   if(d.type==='warning'){document.getElementById('engineStatus').textContent='Stockfish 19 준비 중 · NNUE 추가 로딩 중…';return}
   if(d.type==='ready'){clearTimeout(timer);stockfishReady=true;engineFallback=false;document.getElementById('engineStatus').textContent='Stockfish 19 · 탐색 깊이로 강도를 조절합니다.';render();if(state.status==='playing')requestAi();return}
   if(d.type==='bestmove'&&d.job===stockfishJob){state.busy=false;render();const m=uciToMove(d.move,state);if(m)humanOrAiMove(m,true);else{engineFallback=true;document.getElementById('engineStatus').textContent='AI 수신에 실패해 내장 AI로 전환했습니다.';requestAi();}return}
   if(d.type==='review'&&d.job===reviewJob){applyStockfishReview(d.result,d.job);}
 };
}

function winPercent(cp){return 50+50*(2/(1+Math.exp(-0.00368208*cp))-1)}
function reviewClassification(loss,beforeCP,afterCP,bestUci,playedUci){
 const same=bestUci&&playedUci&&bestUci===playedUci;if(same)return {label:'Best',icon:'🏆',loss:0};
 if(loss<0.02)return {label:'Excellent',icon:'✨',loss};
 if(loss<0.05)return {label:'Good',icon:'👍',loss};
 if(loss<0.10)return {label:'Inaccuracy',icon:'?!',loss};
 if(loss<0.20)return {label:'Mistake',icon:'?',loss};
 return {label:'Blunder',icon:'💥',loss};
}
function applyStockfishReview(result,job){if(job!==reviewJob)return;const idx=reviewIndex;if(idx<0||!state.history[idx])return;const rec=state.history[idx];const mover=rec.turn||(idx%2===0?'w':'b');
 const beforeScore=result.before?.score||0,afterScore=result.after?.score||0;const playerBefore=mover==='w'?beforeScore:-beforeScore;const playerAfter=mover==='w'?-afterScore:afterScore;
 const wb=winPercent(playerBefore)/100,wa=winPercent(playerAfter)/100,loss=Math.max(0,wb-wa);const playedUci=moveToUci(rec.m),c=reviewClassification(loss,playerBefore,playerAfter,result.before?.best,playedUci);
 rec.engine='Stockfish 19';rec.bestUci=result.before?.best||'';rec.beforeCp=playerBefore;rec.afterCp=playerAfter;rec.winBefore=wb;rec.winAfter=wa;rec.loss=loss;rec.cls=c.icon+' '+({Best:'탁월',Excellent:'훌륭',Good:'좋은 수',Inaccuracy:'부정확',Mistake:'실수',Blunder:'블런더'}[c.label]||c.label);rec.engineReady=true;rec.pvs=result.before?.pvs||{};
 rec.bestMove=uciToMove(result.before?.best,stateFromFenForReview(rec.beforeFEN));state.evals[idx+1]=playerAfter/100;updateStats(rec.cls,rec.san);render();drawGraph();updateAnalysis();showAnalysisDetails(idx);
}
function showAnalysisDetails(index){const rec=state.history[index];if(!rec)return;const box=document.getElementById('candidateBox'),pv=document.getElementById('pvBox');if(!rec.pvs||!Object.keys(rec.pvs).length){box.textContent='아직 깊은 분석 결과가 없습니다.';pv.textContent='PV를 계산하지 못했습니다.';return}const base=stateFromFenForReview(rec.beforeFEN);const lines=Object.entries(rec.pvs).sort((a,b)=>+a[0]-+b[0]).map(([n,x])=>{const first=x.pv?.[0]||'';return `${n}. ${uciToText(first,base)}  ${formatCPForPlayer(x.score,rec.turn||base.turn)}`});box.innerHTML='<b>후보 수</b><br>'+lines.join('<br>');const best=rec.pvs[1]?.pv||[];pv.innerHTML='<b>주요 변형 · PV</b><br>'+formatPV(best,base);}
function uciToText(u,st){if(!u||u==='0000')return '-';const m=uciToMove(u,st);return m?(sanFor(st,m)+' ['+u+']'):u}
function formatCPForPlayer(cp,turn){const v=(turn==='w'?cp:-cp)/100;return (v>=0?'+':'')+v.toFixed(2)}
function formatPV(pv,st){let s=st;const out=[];for(const u of pv.slice(0,10)){const m=uciToMove(u,s);if(!m)break;out.push(sanFor(s,m));s=applyMove(s,m,false)}return out.join(' ')||'없음'}

function moveToUci(m){if(!m)return '';return String.fromCharCode(97+m.c)+(8-m.r)+String.fromCharCode(97+m.C)+(8-m.R)+(m.promotion||'')}
function stateFromFenForReview(fen){const s=startState();if(!fen)return s;const parts=fen.split(' '),rows=parts[0].split('/');s.board=rows.map(row=>{const a=[];for(const ch of row){if(/\\d/.test(ch))for(let i=0;i<+ch;i++)a.push(null);else a.push((ch===ch.toUpperCase()?'w':'b')+ch.toLowerCase())}return a});s.turn=parts[1]||'w';return s}
function requestReview(index){if(!stockfishWorker||!stockfishReady||!state.history[index])return;const rec=state.history[index];const beforeFEN=rec.beforeFEN||'';const afterFEN=rec.fen||'';if(!beforeFEN||!afterFEN)return;reviewIndex=index;reviewJob++;stockfishWorker.postMessage({type:'review',job:reviewJob,before:beforeFEN,after:afterFEN,depth:Math.max(12,+cfg.depth||22),time:Math.max(800,+cfg.thinkTime||2200),skill:20});}

function useStockfish(){return !!stockfishWorker;}
function stateToFEN(st){
 let fen='';
 for(let r=0;r<8;r++){let empty=0;for(let c=0;c<8;c++){const p=st.board[r][c];if(!p)empty++;else{if(empty){fen+=empty;empty=0}fen+=p[0]==='w'?p[1].toUpperCase():p[1]}}if(empty)fen+=empty;if(r<7)fen+='/'}
 let cr='';if(st.castle.w.k)cr+='K';if(st.castle.w.q)cr+='Q';if(st.castle.b.k)cr+='k';if(st.castle.b.q)cr+='q';
 const ep=st.ep?String.fromCharCode(97+st.ep[1])+(8-st.ep[0]):'-';
 return `${fen} ${st.turn==='w'?'w':'b'} ${cr||'-'} ${ep} ${st.half||0} ${st.moveNo||1}`;
}
function uciToMove(uci,st){if(!uci||uci==='0000')return null;const f=uci.slice(0,2),t=uci.slice(2,4),promo=uci[4]||null;const m=legalMoves(st).find(x=>String.fromCharCode(97+x.c)+(8-x.r)===f&&String.fromCharCode(97+x.C)+(8-x.R)===t);if(!m)return null;if(promo)m.promotion=promo;return m}
function requestStockfish(){
 if(!stockfishWorker||!stockfishReady){requestAi();return;}
 state.busy=true;render();stockfishJob++;stockfishWorker.postMessage({type:'search',job:stockfishJob,fen:stateToFEN(state),depth:Math.max(4,+cfg.depth||22),time:Math.max(500,+cfg.thinkTime||1500)});
}
function requestLocalFallback(){if(state.status!=='playing'||cfg.mode==='pvp')return;workerJob++;worker.postMessage({type:'search',job:workerJob,board:state.board,turn:state.turn,ep:state.ep,castle:state.castle,depth:+cfg.depth,time:+cfg.thinkTime})}

function workerCode(){
 const V={p:100,n:320,b:330,r:500,q:900,k:20000};
 const PST={
  p:[0,0,0,0,0,0,0,0, 5,10,10,-20,-20,10,10,5, 5,-5,-10,0,0,-10,-5,5, 0,0,0,20,20,0,0,0, 5,5,10,25,25,10,5,5, 10,10,20,30,30,20,10,10, 50,50,50,50,50,50,50,50, 0,0,0,0,0,0,0,0],
  n:[-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,5,5,0,-20,-40, -30,5,10,15,15,10,5,-30, -30,0,15,20,20,15,0,-30, -30,5,15,20,20,15,5,-30, -30,0,10,15,15,10,0,-30, -40,-20,0,0,0,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
  b:[-20,-10,-10,-10,-10,-10,-10,-20, -10,5,0,0,0,0,5,-10, -10,10,10,10,10,10,10,-10, -10,0,10,10,10,10,0,-10, -10,5,5,10,10,5,5,-10, -10,0,5,10,10,5,0,-10, -10,0,0,0,0,0,0,-10, -20,-10,-10,-10,-10,-10,-10,-20],
  r:[0,0,5,10,10,5,0,0, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 5,10,10,10,10,10,10,5, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0],
  q:[-20,-10,-10,-5,-5,-10,-10,-20, -10,0,5,0,0,0,0,-10, -10,5,5,5,5,5,0,-10, 0,0,5,5,5,5,0,-5, -5,0,5,5,5,5,0,-5, -10,0,5,5,5,5,0,-10, -10,0,0,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
  k:[20,30,10,0,0,10,30,20, 20,20,0,0,0,0,20,20, -10,-20,-20,-20,-20,-20,-20,-10, -20,-30,-30,-40,-40,-30,-30,-20, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-30,-30,-30,-30,-30,-30,-30]
 };
 const killers=Array.from({length:32},()=>[]),historyHeur={};let nodes=0,deadline=0,job=0,tt=new Map();
 function clone(b){return b.map(r=>r.slice())} function inside(r,c){return r>=0&&r<8&&c>=0&&c<8} function other(c){return c==='w'?'b':'w'}
 function king(b,c){for(let r=0;r<8;r++)for(let q=0;q<8;q++)if(b[r][q]===c+'k')return[r,q];return null}
 function atk(b,r,c,by){const d=by==='w'?1:-1;for(const x of[-1,1])if(inside(r+d,c+x)&&b[r+d][c+x]===by+'p')return 1;for(const[a,z]of[[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]])if(inside(r+a,c+z)&&b[r+a][c+z]===by+'n')return 1;for(const[a,z]of[[1,1],[1,-1],[-1,1],[-1,-1]]){let R=r+a,C=c+z;while(inside(R,C)){const p=b[R][C];if(p){if(p===by+'b'||p===by+'q')return 1;break}R+=a;C+=z}}for(const[a,z]of[[1,0],[-1,0],[0,1],[0,-1]]){let R=r+a,C=c+z;while(inside(R,C)){const p=b[R][C];if(p){if(p===by+'r'||p===by+'q')return 1;break}R+=a;C+=z}}for(let a=-1;a<=1;a++)for(let z=-1;z<=1;z++)if((a||z)&&inside(r+a,c+z)&&b[r+a][c+z]===by+'k')return 1;return 0}
 function chk(b,c){const k=king(b,c);return !k||atk(b,k[0],k[1],other(c))}
 function moves(st){const o=[],b=st.b,t=st.t;for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(b[r][c]?.[0]===t)for(let R=0;R<8;R++)for(let C=0;C<8;C++){const p=b[r][c],q=b[R][C],dr=R-r,dc=C-c,a=Math.abs(dr),z=Math.abs(dc);if(q&&q[0]===t)continue;let ok=false;if(p[1]==='p'){const d=t==='w'?-1:1,s=t==='w'?6:1;ok=dc===0&&!q&&(dr===d||(r===s&&dr===2*d&&!b[r+d][c]))||z===1&&dr===d&&(q||(st.ep&&st.ep[0]===R&&st.ep[1]===C))}else if(p[1]==='n')ok=(a===2&&z===1)||(a===1&&z===2);else if(p[1]==='b'||p[1]==='r'||p[1]==='q'){const line=p[1]==='b'?a===z:p[1]==='r'?(!dr||!dc):(!dr||!dc||a===z);if(line){const sr=Math.sign(dr),sc=Math.sign(dc);let x=r+sr,y=c+sc;ok=true;while(x!==R||y!==C){if(b[x][y]){ok=false;break}x+=sr;y+=sc}}}else if(p[1]==='k'){ok=Math.max(a,z)===1;if(!ok&&dr===0&&z===2){const side=dc>0?'k':'q',row=t==='w'?7:0,enemy=other(t);if(st.castle?.[t]?.[side]&&!chk(b,t)){if(side==='k')ok=b[row][7]===t+'r'&&!b[row][5]&&!b[row][6]&&!atk(b,row,5,enemy)&&!atk(b,row,6,enemy);else ok=b[row][0]===t+'r'&&!b[row][1]&&!b[row][2]&&!b[row][3]&&!atk(b,row,3,enemy)&&!atk(b,row,2,enemy)}}}
   if(ok){const m={r,c,R,C};const n=apply(st,m);if(!chk(n.b,t))o.push(m)}}return o}
 function apply(st,m){const n={b:clone(st.b),t:other(st.t),ep:null,castle:{w:{...(st.castle?.w||{k:false,q:false})},b:{...(st.castle?.b||{k:false,q:false})}}};const p=n.b[m.r][m.c],capture=n.b[m.R][m.C];n.b[m.R][m.C]=p;n.b[m.r][m.c]=null;if(p[1]==='p'&&m.C!==m.c&&!capture&&st.ep&&st.ep[0]===m.R&&st.ep[1]===m.C)n.b[m.R+(p[0]==='w'?1:-1)][m.C]=null;if(p[1]==='k'&&Math.abs(m.C-m.c)===2){const row=m.r;if(m.C===6){n.b[row][5]=n.b[row][7];n.b[row][7]=null}else{n.b[row][3]=n.b[row][0];n.b[row][0]=null}}if(p[1]==='p'&&(m.R===0||m.R===7))n.b[m.R][m.C]=p[0]+'q';if(p[1]==='k'){n.castle[p[0]].k=false;n.castle[p[0]].q=false}if(p[1]==='r'){const row=p[0]==='w'?7:0;if(m.r===row&&m.c===0)n.castle[p[0]].q=false;if(m.r===row&&m.c===7)n.castle[p[0]].k=false}if(capture?.[1]==='r'){const row=capture[0]==='w'?7:0;if(m.R===row&&m.C===0)n.castle[capture[0]].q=false;if(m.R===row&&m.C===7)n.castle[capture[0]].k=false}if(p[1]==='p'&&Math.abs(m.R-m.r)===2)n.ep=[(m.R+m.r)/2,m.c];return n}
 function key(st){return st.b.map(r=>r.join('')).join('/')+'|'+st.t+'|'+(st.castle?.w?.k?'K':'')+(st.castle?.w?.q?'Q':'')+(st.castle?.b?.k?'k':'')+(st.castle?.b?.q?'q':'')+'|'+(st.ep?st.ep.join(','):'-')}
 function ev(st){let s=0,phase=0;for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(st.b[r][c]){const p=st.b[r][c],t=p[1];if(t!=='k')phase+=t==='q'?4:t==='r'?2:1;let v=V[t],idx=r*8+c;let pi=p[0]==='w'?idx:(7-r)*8+c;v+=PST[t]?.[pi]||0;s+=(p[0]==='w'?v:-v)}const mobility=moves(st).length; s+=(st.t==='w'?mobility:-mobility)*2;if(phase<=8){for(const col of['w','b']){const k=king(st.b,col);if(k)s+=(col==='w'?1:-1)*(10-Math.max(Math.abs(3.5-k[0]),Math.abs(3.5-k[1]))*3)}}return s/100}
 function captureMoves(st,ms){return ms.filter(m=>st.b[m.R][m.C]||((st.b[m.r][m.c]?.[1]==='p')&&st.ep&&st.ep[0]===m.R&&st.ep[1]===m.C))}
 function scoreMove(st,m,ply,ttMove){let s=0;if(ttMove&&same(m,ttMove))s+=10000000;const cap=st.b[m.R][m.C];if(cap)s+=100000+(V[cap[1]]||0)*10-(V[st.b[m.r][m.c][1]]||0);if(st.b[m.r][m.c][1]==='p'&&(m.R===0||m.R===7))s+=90000;if(m.C-m.c===2||m.C-m.c===-2)s+=2000;const ks=killers[ply]||[];if(ks.some(x=>same(x,m)))s+=5000;s+=historyHeur[mk(m)]||0;return s}
 function same(a,b){return a&&b&&a.r===b.r&&a.c===b.c&&a.R===b.R&&a.C===b.C}function mk(m){return m.r+','+m.c+'-'+m.R+','+m.C}
 function ordered(st,ms,ply,ttMove){return ms.sort((a,b)=>scoreMove(st,b,ply,ttMove)-scoreMove(st,a,ply,ttMove))}
 function qsearch(st,alpha,beta,ply){if(++nodes%2048===0&&performance.now()>deadline)throw 'timeout';let stand=(st.t==='w'?1:-1)*ev(st);if(stand>=beta)return beta;if(stand>alpha)alpha=stand;let ms=captureMoves(st,legal(st));ordered(st,ms,ply,null);for(const m of ms){const v=-qsearch(apply(st,m),-beta,-alpha,ply+1);if(v>=beta)return beta;if(v>alpha)alpha=v}return alpha}
 function legal(st){return moves(st)}
 function neg(st,d,alpha,beta,ply){if(++nodes%2048===0&&performance.now()>deadline)throw 'timeout';const k=key(st),entry=tt.get(k);if(entry&&entry.depth>=d){if(entry.flag==='EXACT')return entry.score;if(entry.flag==='LOW'&&entry.score>alpha)alpha=entry.score;if(entry.flag==='HIGH'&&entry.score<beta)beta=entry.score;if(alpha>=beta)return entry.score}const ms=legal(st);if(!ms.length)return chk(st.b,st.t)?-10000+ply:0;if(d<=0)return qsearch(st,alpha,beta,ply);const ttMove=entry?.move;ordered(st,ms,ply,ttMove);let best=-1e9,bm=null,a0=alpha;for(const m of ms){let v=-neg(apply(st,m),d-1,-beta,-alpha,ply+1);if(v>best){best=v;bm=m}if(v>alpha)alpha=v;if(alpha>=beta){const quiet=!st.b[m.R][m.C];if(quiet){killers[ply]=[m,...(killers[ply]||[]).filter(x=>!same(x,m))].slice(0,2);historyHeur[mk(m)]=(historyHeur[mk(m)]||0)+d*d*4}break}}let flag=best<=a0?'HIGH':best>=beta?'LOW':'EXACT';tt.set(k,{depth:d,score:best,flag,move:bm});if(tt.size>120000){const first=tt.keys().next().value;tt.delete(first)}return best}
 function root(st,d){const ms=ordered(st,legal(st),0,tt.get(key(st))?.move);let best=-1e9,bm=ms[0],scores=[];for(const m of ms){if(performance.now()>deadline)throw 'timeout';const v=-neg(apply(st,m),d-1,-1e9,1e9,1);scores.push({m,v});if(v>best){best=v;bm=m} }return{move:bm,score:best,scores}}
 self.onmessage=e=>{const x=e.data;if(x.type!=='search')return;job=x.job;nodes=0;tt=new Map();deadline=performance.now()+Math.max(250,x.time||1500);killers.length=32;for(let i=0;i<32;i++)killers[i]=[];let st={b:x.board,t:x.turn,ep:x.ep,castle:x.castle};let bm=null,best=-1e9,depthReached=0;try{for(let d=1;d<=Math.max(1,x.depth||4);d++){if(performance.now()>deadline)break;const r=root(st,d);bm=r.move;best=r.score;depthReached=d}}catch(err){if(err!=='timeout')throw err}postMessage({type:'best',job,move:bm,score:best,nodes,depth:depthReached})}
}
function requestAi(){
 if(state.status!=='playing'||cfg.mode==='pvp'||state.busy)return;
 const aiColor=cfg.mode==='aiai'?state.turn:other(cfg.humanColor);
 if(state.turn!==aiColor)return;
 if(stockfishReady&&!engineFallback){requestStockfish();return;}
 state.busy=true;render();workerJob++;
 const localDepth=Math.max(3,Math.min(testMode?5:11,Math.round((+cfg.depth||22)*0.48)));
 document.getElementById('engineStatus').textContent=engineFallback?'내장 AI · 탐색 깊이 기반 보정':'AI 준비 중…';
 worker.postMessage({type:'search',job:workerJob,board:state.board,turn:state.turn,ep:state.ep,castle:state.castle,depth:localDepth,time:Math.max(400,Math.min(7000,+cfg.thinkTime||2500))});
}
function humanOrAiMove(m,isAi){const san=sanFor(state,m),beforeEval=evaluate(state),beforeFEN=toFEN(state),mover=state.turn;const ns=applyMove(state,m,true);const after=evaluate(ns);const delta=state.turn==='w'?beforeEval-after:after-beforeEval;ns.history[ns.history.length-1].san=san;ns.history[ns.history.length-1].beforeFEN=beforeFEN;ns.history[ns.history.length-1].turn=mover;ns.evals.push(after);ns.last=m;ns.busy=false;state=ns;const cls=classification(Math.max(0,delta),after);state.history[state.history.length-1].cls=cls;state.history[state.history.length-1].delta=delta;state.history[state.history.length-1].before=beforeEval;state.history[state.history.length-1].after=after;updateStats(cls,san);const end=gameEnd(state);if(end){state.status='ended';finishGame(end)}render();drawGraph();if(!isAi&&cfg.autoAnalyze==='on'&&useStockfish()&&stockfishReady)requestReview(state.history.length-1);if(state.status==='playing')setTimeout(requestAi,40)}
function handleSquare(r,c){if(state.status!=='playing'||state.busy)return;const human=cfg.mode==='pvp'||state.turn===cfg.humanColor;if(!human)return;const legal=legalMoves(state);if(state.selected){const m=legal.find(x=>x.r===state.selected[0]&&x.c===state.selected[1]&&x.R===r&&x.C===c);if(m){humanOrAiMove(m,false);return}state.selected=null;render();return}if(state.board[r][c]?.[0]===state.turn){state.selected=[r,c];render()}}
function boardCoords(){const arr=[];const flip=cfg.orientation==='flip';for(let i=0;i<8;i++)for(let j=0;j<8;j++){const r=flip?7-i:i,c=flip?7-j:j;arr.push([r,c])}return arr}
function drawBoard(el,st,interactive,onClick){el.innerHTML='';const legal=interactive&&st.selected?legalMoves(st).filter(m=>m.r===st.selected[0]&&m.c===st.selected[1]):[];const ch=findKing(st.board,st.turn);for(const [r,c] of boardCoords()){const s=document.createElement('div');s.className='sq '+((r+c)%2?'dark':'light');if(st.selected?.[0]===r&&st.selected?.[1]===c)s.classList.add('sel');if(st.last&&cfg.lastMove==='on'&&((st.last.r===r&&st.last.c===c)||(st.last.R===r&&st.last.C===c)))s.classList.add('last');if(ch?.[0]===r&&ch?.[1]===c&&inCheck(st.board,st.turn))s.classList.add('check');const mm=legal.find(m=>m.R===r&&m.C===c);if(mm&&cfg.showTargets==='on')s.classList.add(st.board[r][c]?'capture':'target');if(st.board[r][c])s.insertAdjacentHTML('beforeend',pieceSVG(st.board[r][c]));if(c===0){const q=document.createElement('span');q.className='coord rank';q.textContent=8-r;s.appendChild(q)}if(r===7){const q=document.createElement('span');q.className='coord file';q.textContent=String.fromCharCode(97+c);s.appendChild(q)}if(interactive)s.onclick=()=>((onClick||handleSquare)(r,c));el.appendChild(s)}}
function depthLabel(depth){const d=+depth||22;if(d<=11)return '입문';if(d<=17)return '초급';if(d<=21)return '중급';if(d<=25)return '강함';if(d<=30)return '매우 강함';if(d<=35)return '고강도';return '최상급';}
function render(){
 drawBoard(document.getElementById('board'),state,true);
 const end=state.status==='ended'?(state.result||'게임 종료'):null;
 document.getElementById('statusMain').textContent=state.busy?'AI 생각 중...':end||((state.turn==='w'?'백':'흑')+'의 차례'+(inCheck(state.board,state.turn)?' · 체크!':''));
 document.getElementById('evalPill').textContent=(evaluate(state)>=0?'+':'')+evaluate(state).toFixed(2);
 const modeText=cfg.mode==='pvp'?'사람 vs 사람':cfg.mode==='aiai'?'AI vs AI':'사람 vs AI';
 document.getElementById('modeStat').textContent=modeText;
 document.getElementById('quickMode').value=cfg.mode;
 document.getElementById('mode').value=cfg.mode;
 document.getElementById('aiStat').textContent=`Depth ${cfg.depth} · ${depthLabel(cfg.depth)}`;
 const ml=document.getElementById('moveList');
 ml.innerHTML=state.history.map((h,i)=>{const n=Math.floor(i/2)+1;return `<button class="move ${i===state.history.length-1?'current':''}" onclick="jumpToMove(${i})"><b>${i%2===0?n+'.':''}</b> ${h.san||'—'} <span class="annotation">${h.cls||''}</span></button>`}).join('')||'<div class="muted small">아직 수가 없습니다.</div>';
 document.getElementById('undoBtn').disabled=state.history.length===0||state.busy;
 document.getElementById('hintBtn').disabled=state.history.length===0;
 updateAnalysis();
 if(document.getElementById('depthNote'))document.getElementById('depthNote').textContent=`Depth ${cfg.depth} · ${depthLabel(cfg.depth)}`;
}
function updateAnalysis(){const h=state.history;const counts={'정확':0,'👍 좋은 수':0,'?! 부정확':0,'? 실수':0,'?? 큰 실수':0,'💥 블런더':0};h.forEach(x=>counts[x.cls]=(counts[x.cls]||0)+1);document.getElementById('analysisSummary').innerHTML=Object.entries(counts).map(([k,v])=>`<div class="card"><div class="muted small">${k}</div><div class="big">${v}</div></div>`).join('');const rs=document.getElementById('reviewList');const bad=h.filter(x=>['? 실수','?? 큰 실수','💥 블런더'].includes(x.cls)).slice(-8).reverse();rs.innerHTML=bad.map((x,i)=>`<div class="row"><div><b>${x.cls}</b><div class="muted small">${x.san} · 평가 ${x.after.toFixed(2)}</div></div><button onclick="reviewAt(${h.indexOf(x)})">복기</button></div>`).join('')||'<div class="notice">현재 게임에서 큰 실수가 발견되지 않았습니다.</div>';}
function drawGraph(){const c=document.getElementById('graph'),dpr=devicePixelRatio||1,w=c.clientWidth||600,h=c.clientHeight||170;c.width=w*dpr;c.height=h*dpr;const x=c.getContext('2d');x.scale(dpr,dpr);x.clearRect(0,0,w,h);x.strokeStyle='#303a4d';x.lineWidth=1;for(let i=1;i<5;i++){const y=i*h/5;x.beginPath();x.moveTo(0,y);x.lineTo(w,y);x.stroke()}const a=state.evals||[0];const min=Math.min(-5,...a),max=Math.max(5,...a),range=max-min||1;x.strokeStyle='#6ea8fe';x.lineWidth=3;x.beginPath();a.forEach((v,i)=>{const px=a.length===1?0:i/(a.length-1)*w;const py=h-(v-min)/range*h;i?x.lineTo(px,py):x.moveTo(px,py)});x.stroke();a.forEach((v,i)=>{if(state.history[i-1]?.cls?.includes('실수')||state.history[i-1]?.cls?.includes('블런더')){const px=a.length===1?0:i/(a.length-1)*w,py=h-(v-min)/range*h;x.fillStyle='#ff6b6b';x.beginPath();x.arc(px,py,4,0,Math.PI*2);x.fill()}});}
function reviewAt(index){const hist=state.history[index];if(!hist)return;state.selected=null;document.getElementById('reviewBox').innerHTML=`<div class="danger-box"><b>${hist.cls}</b><br>${hist.san}로 인해 평가가 ${hist.after.toFixed(2)}로 변화했습니다.<br><br>⚠ 최선의 수를 바로 보여주지 않습니다.<br>이 위치에서 다시 생각해보세요.<br><br><button onclick="retryFrom(${index})">이 위치 다시 풀기</button> <button onclick="hintFor(${index},1)">힌트</button></div>`;showView('game')}
function retryFrom(index){const replay=startState();for(let i=0;i<index;i++){const rec=state.history[i];const cand=legalMoves(replay).find(m=>m.r===rec.m.r&&m.c===rec.m.c&&m.R===rec.m.R&&m.C===rec.m.C);if(cand){const ns=applyMove(replay,cand,true);ns.history[ns.history.length-1].san=rec.san;ns.evals.push(rec.after);replay=ns}}state=replay;render();showView('game')}
function jumpToMove(index){
 const replay=startState();
 for(let i=0;i<=index;i++){const rec=state.history[i];const cand=legalMoves(replay).find(m=>m.r===rec.m.r&&m.c===rec.m.c&&m.R===rec.m.R&&m.C===rec.m.C);if(!cand)break;const ns=applyMove(replay,cand,true);ns.history[ns.history.length-1]=JSON.parse(JSON.stringify(rec));replay=ns;}
 replay.status=index===state.history.length-1?state.status:'ended';replay.result=index===state.history.length-1?state.result:'복기 위치';replay.evals=state.evals.slice(0,index+2);state=replay;reviewIndex=index;render();drawGraph();showView('analysis');showAnalysisDetails(index);
}
function hintFor(index,level){const h=state.history[index];if(!h)return;document.getElementById('reviewBox').innerHTML=`<div class="hint"><b>${level===1?'힌트 1':'힌트'}</b><br>${level===1?'상대 킹의 안전과 강제 수를 살펴보세요.':'공격할 수 있는 기물과 체크를 먼저 찾아보세요.'}<br><br><button onclick="hintFor(${index},${Math.min(2,level+1)})">다음 힌트</button> <button onclick="showBestAt(${index})">정답 보기</button></div>`}
function showBestAt(index){requestReview(index);let tries=0;clearInterval(reviewTimer);reviewTimer=setInterval(()=>{const h=state.history[index];if(h?.bestMove||tries++>40){clearInterval(reviewTimer);if(h?.bestMove){const u=moveToUci(h.bestMove);document.getElementById('reviewBox').innerHTML=`<div class="insight"><b>최선의 수</b><br>${u}</div>`;showView('analysis');showAnalysisDetails(index)}else document.getElementById('reviewBox').innerHTML='<div class="hint">현재 엔진이 연결되지 않아 최선의 수를 계산하지 못했습니다.</div>'}},100)}
function undo(){if(!state.history.length||state.busy)return;const n=Math.max(0,state.history.length-1);const target=startState();for(let i=0;i<n;i++){const rec=state.history[i];const m=legalMoves(target).find(x=>x.r===rec.m.r&&x.c===rec.m.c&&x.R===rec.m.R&&x.C===rec.m.C);if(m){const ns=applyMove(target,m,true);ns.history[ns.history.length-1].san=rec.san;ns.history[ns.history.length-1].cls=rec.cls;ns.evals.push(rec.after);target=ns}}state=target;render();drawGraph()}
function finishGame(result){const d=JSON.parse(localStorage.getItem(key)||'{}');d.profile=d.profile||{games:0,wins:0,losses:0,draws:0,depthSum:0,streak:0,bestStreak:0,weak:{}};d.profile.games=(d.profile.games||0)+1;d.profile.depthSum=(d.profile.depthSum||0)+(cfg.depth||22);if(/무승부|스테일/.test(result))d.profile.draws=(d.profile.draws||0)+1;else if((result||'').includes('백')&&cfg.humanColor==='w'||(result||'').includes('흑')&&cfg.humanColor==='b')d.profile.wins=(d.profile.wins||0)+1;else d.profile.losses=(d.profile.losses||0)+1;localStorage.setItem(key,JSON.stringify(d));state.result=result;document.getElementById('reviewBox').innerHTML=`<div class="insight"><b>게임 종료</b><br>${result}<br><br>게임 분석 탭에서 평가 그래프와 실수 장면을 확인하세요.</div>`;saveHistory()}
function newGame(){cfg.humanColor=document.getElementById('humanColor').value==='r'?(Math.random()<.5?'w':'b'):document.getElementById('humanColor').value;reviewIndex=-1;state=startState();state.selected=null;render();drawGraph();document.getElementById('reviewBox').textContent='수마다 분석할 수 있습니다. 게임을 시작하세요.';document.getElementById('engineStatus').textContent=stockfishReady&&!engineFallback?'Stockfish 19 · 준비 완료':engineFallback?'내장 AI · Stockfish 대체 모드':'Stockfish 19 · 엔진 준비 중…';requestAi()}
function saveHistory(){const data=JSON.parse(localStorage.getItem(key)||'{}');data.games=data.games||[];data.games.unshift({date:new Date().toISOString(),mode:cfg.mode,result:state.result,moves:state.history,evals:state.evals});data.games=data.games.slice(0,100);localStorage.setItem(key,JSON.stringify(data));renderHistory();renderStats()}
function updateStats(cls,san){const d=JSON.parse(localStorage.getItem(key)||'{}');d.profile=d.profile||{games:0,wins:0,losses:0,draws:0,depthSum:0,streak:0,bestStreak:0,weak:{}};if(cls.includes('실수')||cls.includes('블런더')){const w=d.profile.weak;w['전술']=(w['전술']||0)+1}localStorage.setItem(key,JSON.stringify(d))}
function renderHistory(){const d=JSON.parse(localStorage.getItem(key)||'{}'),arr=d.games||[];document.getElementById('historyList').innerHTML=arr.map((g,i)=>`<div class="row"><div><b>${new Date(g.date).toLocaleString()}</b><div class="muted small">${g.result||'진행됨'} · ${g.moves?.length||0}수</div></div><button onclick="loadSaved(${i})">열기</button></div>`).join('')||'<div class="notice">저장된 게임이 없습니다.</div>'}
function loadSaved(i){const d=JSON.parse(localStorage.getItem(key)||'{}'),g=(d.games||[])[i];if(!g)return;state=startState();for(const rec of(g.moves||[])){const m=legalMoves(state).find(x=>x.r===rec.m.r&&x.c===rec.m.c&&x.R===rec.m.R&&x.C===rec.m.C);if(!m)break;const ns=applyMove(state,m,true);ns.history[ns.history.length-1]=JSON.parse(JSON.stringify(rec));state=ns}state.evals=g.evals||[0];state.status='ended';state.result=g.result;reviewIndex=state.history.length-1;render();drawGraph();showView('game')}
function renderStats(){const d=JSON.parse(localStorage.getItem(key)||'{}'),p=d.profile||{games:0,wins:0,losses:0,draws:0,rating:1200,streak:0,bestStreak:0};document.getElementById('statsCards').innerHTML=[['총 게임',p.games||0],['승리',p.wins||0],['패배',p.losses||0],['무승부',p.draws||0],['평균 깊이',p.games?Math.round((p.depthSum||cfg.depth)/Math.max(1,p.games)):cfg.depth],['최대 연승',p.bestStreak||0]].map(([k,v])=>`<div class="card"><div class="muted small">${k}</div><div class="big">${v}</div></div>`).join('');const areas=[['전술',72],['오프닝',58],['엔드게임',42],['킹 안전',68],['수비',51]];document.getElementById('learningBars').innerHTML=areas.map(([k,v])=>`<div style="margin:10px 0"><div style="display:flex;justify-content:space-between"><b>${k}</b><span>${v}%</span></div><div class="bar"><i style="width:${v}%"></i></div></div>`).join('')}
function showView(id){document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===id));document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('active',x.dataset.view===id));if(id==='analysis')drawGraph();if(id==='openings')renderOpenings()}
function exportPGN(){let p='[Event "Local Game"]\n[White "Player"]\n[Black "AI"]\n\n';for(let i=0;i<state.history.length;i++){if(i%2===0)p+=Math.floor(i/2)+1+'. ';p+=state.history[i].san+' ';}navigator.clipboard?.writeText(p.trim());alert('PGN을 클립보드에 복사했습니다.\n\n'+p.trim())}

const OPENINGS=[
['A00','킹스 인디언 공격','1.Nf3 Nf6 2.g3 g6 3.Bg2 Bg7','Kingside fianchetto setup; flexible transposition','유연함','흑의 중앙 장악을 확인한 뒤 d4 또는 c4로 전환.'],
['A01','레티 오프닝','1.Nf3 d5 2.c4','Réti Opening','유연함','빠른 기물 전개와 중앙에 대한 압박이 핵심.'],
['B20','시실리안 디펜스','1.e4 c5','Sicilian Defense','공격적','비대칭 구조에서 흑이 승리를 노리는 대표적인 응수.'],
['B90','시실리안 · 나이도프','1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6','Sicilian Najdorf','공격적','...a6로 b5를 준비하며 복잡한 전술전을 만든다.'],
['C00','프렌치 디펜스','1.e4 e6 2.d4 d5','French Defense','전략적','흑은 단단한 사슬을 만들고 ...c5로 중앙을 공격한다.'],
['C50','이탈리안 게임','1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5','Italian Game','공격적','빠른 전개와 f7 압박으로 자연스러운 공격을 만든다.'],
['C60','스페인 게임','1.e4 e5 2.Nf3 Nc6 3.Bb5','Ruy Lopez','전략적','c6 압박과 중앙 장악을 결합하는 고전적 오프닝.'],
['C65','스페인 · 베를린','1.e4 e5 2.Nf3 Nc6 3.Bb5 Nf6','Ruy Lopez Berlin','전략적','...Nf6로 즉시 e4를 공격하며 탄탄한 구조를 노린다.'],
['C20','킹스 갬빗','1.e4 e5 2.f4','King\'s Gambit','공격적','f폰을 희생해 빠른 전개와 킹측 공격을 노린다.'],
['D00','퀸즈 폰 오프닝','1.d4 d5 2.Nf3 Nf6','Queen\'s Pawn Game','전략적','안정적인 중앙을 만든 뒤 가볍게 전개한다.'],
['D30','퀸즈 갬빗','1.d4 d5 2.c4','Queen\'s Gambit','전략적','c4로 d5를 압박하여 주도권을 잡는다.'],
['D37','퀸즈 갬빗 거절','1.d4 d5 2.c4 e6','Queen\'s Gambit Declined','전략적','흑이 e6로 중앙을 지키고 견고한 구조를 만든다.'],
['D06','퀸즈 갬빗 수락','1.d4 d5 2.c4 dxc4','Queen\'s Gambit Accepted','동적','흑이 폰을 받고 백의 중앙 전개를 견제한다.'],
['D10','슬라브 디펜스','1.d4 d5 2.c4 c6','Slav Defense','견고함','...c6로 d5를 지키며 안정적인 전개를 한다.'],
['E00','님조 인디언','1.d4 Nf6 2.c4 e6 3.Nc3 Bb4','Nimzo-Indian Defense','전략적','비숍과 나이트로 백의 중앙 구조를 압박한다.'],
['E12','퀸즈 인디언','1.d4 Nf6 2.c4 e6 3.Nf3 b6','Queen\'s Indian Defense','전략적','...b6와 ...Bb7로 긴 대각선 압박을 준비한다.'],
['E20','킹스 인디언 디펜스','1.d4 Nf6 2.c4 g6 3.Nc3 Bg7','King\'s Indian Defense','공격적','흑이 중앙을 내주고 킹측 공격과 반격을 노린다.'],
['A40','퀸즈 인디언 계열','1.d4 Nf6 2.c4 e6 3.Nf3','Indian Game','유연함','백의 중앙 계획에 따라 다양한 인디언 구조로 전환된다.'],
['B01','스칸디나비안 디펜스','1.e4 d5','Scandinavian Defense','실전적','즉시 중앙 폰을 교환해 명확한 구조를 만든다.'],
['B07','피르크 디펜스','1.e4 d6 2.d4 Nf6 3.Nc3 g6','Pirc Defense','동적','유연한 킹사이드 전개 후 중앙을 반격한다.'],
['B10','카로-칸','1.e4 c6 2.d4 d5','Caro-Kann Defense','견고함','...c6로 d5를 지키고 건강한 폰 구조를 만든다.'],
['A45','런던 시스템','1.d4 Nf6 2.Nf3 e6 3.Bf4','London System','견고함','비숍을 먼저 전개해 안정적인 시스템을 구축한다.'],
['A46','콜레 시스템','1.d4 Nf6 2.Nf3 e6 3.e3','Colle System','견고함','안전한 전개 후 e4 돌파를 준비하는 시스템.'],
['C44','스코치 게임','1.e4 e5 2.Nf3 Nc6 3.d4 exd4','Scotch Game','공격적','초반에 중앙을 열어 빠른 전개를 노린다.'],
['C88','스페인 · 오픈','1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O Nxe4','Ruy Lopez Open','전술적','중앙을 빠르게 열고 복잡한 전술전을 추구한다.'],
['A34','잉글리시 오프닝','1.c4 c5 2.Nc3','English Opening','전략적','c폰으로 유연하게 중앙을 압박하고 다양한 구조로 전환한다.'],
];
let openingFilter='전체';
function renderOpenings(){const q=(document.getElementById('openingSearch')?.value||'').trim().toLowerCase();const filters=['전체','공격적','전략적','견고함','유연함','동적','전술적','실전적'];document.getElementById('openingFilters').innerHTML=filters.map(x=>`<button data-filter="${x}" class="${openingFilter===x?'active':''}">${x}</button>`).join('');const arr=OPENINGS.filter(o=>(openingFilter==='전체'||o[4]===openingFilter)&&(!q||o.join(' ').toLowerCase().includes(q)));document.getElementById('openingList').innerHTML=arr.map(o=>`<article class="opening-card"><div class="opening-top"><span class="eco">${o[0]}</span><span class="style-tag">${o[4]}</span></div><h3>${o[1]}</h3><div class="opening-line">${o[2]}</div><div class="muted small">${o[3]}</div><div class="opening-plan">${o[5]}</div></article>`).join('')||'<div class="notice">검색 결과가 없습니다.</div>';}

for(const b of document.querySelectorAll('#tabs button'))b.onclick=()=>showView(b.dataset.view);
function changeMode(mode){cfg.mode=mode;document.getElementById('mode').value=mode;document.getElementById('quickMode').value=mode;localStorage.setItem(key,JSON.stringify({...JSON.parse(localStorage.getItem(key)||'{}'),cfg}));newGame();}
document.getElementById('quickMode').onchange=e=>changeMode(e.target.value);
document.getElementById('mode').onchange=e=>changeMode(e.target.value);
document.getElementById('depth').onchange=e=>{cfg.depth=+e.target.value||22;document.getElementById('depthNote').textContent=`Depth ${cfg.depth} · ${depthLabel(cfg.depth)}`;};
document.getElementById('openingSearch').oninput=renderOpenings;
document.getElementById('openingFilters').onclick=e=>{const b=e.target.closest('[data-filter]');if(b){openingFilter=b.dataset.filter;renderOpenings();}};
document.getElementById('newBtn').onclick=newGame;document.getElementById('analysisToggle').onclick=toggleAnalysis;document.getElementById('undoBtn').onclick=undo;
document.getElementById('hintBtn').onclick=()=>{const i=state.history.length-1;if(i>=0){reviewIndex=i;document.getElementById('reviewBox').innerHTML='<div class="hint"><b>힌트</b><br>체크 → 잡을 수 있는 기물 → 상대의 위협 순서로 살펴보세요.<br><br><button onclick="showBestAt('+i+')">최선의 수 보기</button></div>'}else document.getElementById('reviewBox').innerHTML='<div class="hint">먼저 한 수를 둬 주세요.</div>'};
document.getElementById('bestBtn').onclick=()=>{const i=Math.max(0,state.history.length-1);if(state.history[i])showBestAt(i)};
document.getElementById('prevBtn').onclick=()=>{const i=reviewIndex>=0?Math.max(0,reviewIndex-1):Math.max(0,state.history.length-1);if(state.history[i])jumpToMove(i)};
document.getElementById('nextBtn').onclick=()=>{const i=reviewIndex>=0?Math.min(state.history.length-1,reviewIndex+1):Math.max(0,state.history.length-1);if(state.history[i])jumpToMove(i)};
document.getElementById('candidateBtn').onclick=()=>{const i=reviewIndex>=0?reviewIndex:Math.max(0,state.history.length-1);if(!state.history[i])return;reviewIndex=i;requestReview(i);document.getElementById('candidateBox').textContent='Stockfish가 후보 3개와 주요 변형을 분석하고 있습니다…';document.getElementById('pvBox').textContent='분석 중…';showView('analysis')};
document.getElementById('applySettings').onclick=()=>{cfg.mode=document.getElementById('mode').value;cfg.humanColor=document.getElementById('humanColor').value;cfg.engineMode='stockfish';cfg.depth=Math.max(10,Math.min(50,+document.getElementById('depth').value||22));cfg.thinkTime=Math.max(500,Math.min(15000,+document.getElementById('thinkTime').value||3000));cfg.orientation=document.getElementById('orientation').value;cfg.lastMove=document.getElementById('lastMove').value;cfg.showTargets=document.getElementById('showTargets').value;cfg.autoAnalyze=document.getElementById('autoAnalyze').value;localStorage.setItem(key,JSON.stringify({...JSON.parse(localStorage.getItem(key)||'{}'),cfg}));newGame()};
document.getElementById('clearData').onclick=()=>{if(confirm('저장된 게임/통계를 모두 삭제할까요?')){localStorage.removeItem(key);renderHistory();renderStats()}};
document.getElementById('board').addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('resize',()=>{if(document.getElementById('analysis').classList.contains('active'))drawGraph()});
window.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')undo();});

function toggleAnalysis(){cfg.autoAnalyze=cfg.autoAnalyze==='on'?'off':'on';localStorage.setItem(key,JSON.stringify({...JSON.parse(localStorage.getItem(key)||'{}'),cfg}));updateAnalysisToggle();}
function updateAnalysisToggle(){const b=document.getElementById('analysisToggle');if(!b)return;b.textContent=cfg.autoAnalyze==='on'?'● 분석 ON':'○ 분석 OFF';b.classList.toggle('on',cfg.autoAnalyze==='on');}

function boot(){const d=JSON.parse(localStorage.getItem(key)||'{}');if(d.cfg)Object.assign(cfg,d.cfg);for(const id of ['mode','humanColor','depth','thinkTime','orientation','lastMove','showTargets','autoAnalyze'])if(document.getElementById(id))document.getElementById(id).value=cfg[id];createWorker();updateAnalysisToggle();state=startState();renderHistory();renderStats();renderOpenings();newGame();
 if(testMode){
   window.__CHESS_TEST__={loaded:true,moveMade:false,aiMoved:false};
   setTimeout(()=>{const m=legalMoves(state).find(x=>x.r===6&&x.c===4&&x.R===4&&x.C===4);if(m){humanOrAiMove(m,false);window.__CHESS_TEST__.moveMade=true;}},300);
   setTimeout(()=>{window.__CHESS_TEST__.aiMoved=state.history.length>=2;const el=document.createElement('div');el.id='test-result';el.dataset.aiMoved=String(window.__CHESS_TEST__.aiMoved);el.dataset.history=String(state.history.length);el.textContent='TEST '+JSON.stringify(window.__CHESS_TEST__);document.body.appendChild(el);},4200);
 }
}
boot();
