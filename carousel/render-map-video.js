// Відео: мапа на весь кадр 1080×1350, Буш, потім по одній картці з кожного треку, у фіналі — космос.
// node carousel/render-map-video.js <тека для кадрів>; далі ffmpeg збирає кадри в out/mac/map.mp4
// Кадри знімаються з керованим годинником (page.clock), тож рух рівний 30 к/с.
const {chromium}=require('playwright'), path=require('path'), fs=require('fs');
const OUT=process.argv[2]||path.join(__dirname,'frames'), FPS=30;
fs.mkdirSync(OUT,{recursive:true});
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2, lerp=(a,b,t)=>a+(b-a)*t;
// Буш, а далі по картці з кожного треку — у хронологічному порядку
const TOUR=['bush','turing50','nls','kay72','luhmann','wikipedia'];
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:900,height:1125},deviceScaleFactor:1.2});
  await p.clock.install();
  await p.goto('file://'+path.join(__dirname,'..','app','ideas.html'));
  await p.evaluate(()=>document.fonts.ready);
  // курсор старого Mac: у безголовому браузері справжнього курсора не видно
  await p.evaluate(()=>{const c=document.createElement('div');
    c.innerHTML='<svg width="20" height="29" viewBox="0 0 12 18" shape-rendering="crispEdges"><path d="M1 1v14l3.5-3.5 2.5 5.5 2-1-2.5-5.5H11z" fill="#fff" stroke="#000" stroke-width="1.2"/></svg>';
    Object.assign(c.style,{position:'fixed',left:0,top:0,zIndex:99999,pointerEvents:'none',transform:'translate(-100px,-100px)'});document.body.appendChild(c);
    addEventListener('mousemove',e=>{c.style.transform=`translate(${e.clientX-2}px,${e.clientY-2}px)`},true)});
  await p.clock.runFor(1500);
  let f=0, mx=760, my=700;
  const shot=async()=>{await p.clock.runFor(1000/FPS);await p.screenshot({path:path.join(OUT,String(f++).padStart(5,'0')+'.png')})};
  const move=async(x,y)=>{mx=x;my=y;await p.mouse.move(x,y)};
  const hold=async n=>{for(let i=0;i<n;i++){await move(mx+Math.sin((f+i)/8)*1.5,my);await shot()}};
  await p.evaluate(()=>{scroll.scrollLeft=X(1936)-GUT();scroll.scrollTop=0});
  await move(mx,my);
  for(const [k,id] of TOUR.entries()){
    // де має опинитися картка: праворуч від вікна нотатки, на третині висоти
    const tgt=await p.evaluate(id=>{const n=byId[id],sr=scroll.getBoundingClientRect(),W=NW();
      const sx=Math.max(0,n.x-(600-sr.left)), sy=Math.max(0,Math.min(canvas.offsetHeight-scroll.clientHeight,n.yy-AX-(330-sr.top-AX)));
      return {sx,sy,cx:sr.left+n.x-sx+W/2,cy:sr.top+n.yy-sy+29,L:scroll.scrollLeft,T:scroll.scrollTop}},id);
    const N=k===0?60:48, x0=mx,y0=my;
    for(let i=0;i<N;i++){const t=ease(i/(N-1));
      await p.evaluate(([l,tp])=>{scroll.scrollLeft=l;scroll.scrollTop=tp},[lerp(tgt.L,tgt.sx,t),lerp(tgt.T,tgt.sy,t)]);
      await move(lerp(x0,tgt.cx,t),lerp(y0,tgt.cy,t)-Math.sin(t*Math.PI)*60);await shot()}
    await hold(k===0?40:24);                       // підсвічена лінія впливів
    await p.mouse.click(tgt.cx,tgt.cy); await hold(6);
    const [ax,ay]=[mx,my];
    for(let i=0;i<20;i++){const t=ease(i/19);await move(lerp(ax,330,t),lerp(ay,560,t));await shot()}
    await hold(k===0?70:52);                       // читаємо нотатку
    const [cx,cy]=await p.evaluate(()=>{const r=document.querySelector('#closeText').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]});
    const [bx,by]=[mx,my];
    for(let i=0;i<16;i++){const t=ease(i/15);await move(lerp(bx,cx,t),lerp(by,cy,t));await shot()}
    await p.mouse.click(cx,cy); await hold(6);
  }
  // фінал: крізь десятиліття в майбутнє
  const [L0,T0,L1]=await p.evaluate(()=>[scroll.scrollLeft,scroll.scrollTop,X(NOW)-GUT()-30]);
  const x0=mx,y0=my;
  for(let i=0;i<110;i++){const t=ease(i/109);
    await p.evaluate(([l,tp])=>{scroll.scrollLeft=l;scroll.scrollTop=tp},[lerp(L0,L1,t),lerp(T0,0,t)]);
    await move(lerp(x0,700,t)+Math.sin(t*8)*40,lerp(y0,640,t));await shot()}
  for(let i=0;i<120;i++){await move(lerp(mx,760,.02),lerp(my,820,.02));await shot()}
  console.log('frames',f);await b.close();
})();
