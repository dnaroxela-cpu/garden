// Відео блукання мапою для 5-го слайда: node carousel/render-video.js <тека для кадрів>
// Кадри знімаються з керованим годинником (page.clock), тож рух рівний 30 к/с незалежно від швидкості машини.
const {chromium}=require('playwright'), path=require('path'), fs=require('fs');
const OUT=process.argv[2]||path.join(__dirname,'frames'), FPS=30;
fs.mkdirSync(OUT,{recursive:true});
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2, lerp=(a,b,t)=>a+(b-a)*t;
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:800,height:650},deviceScaleFactor:1.2});
  await p.clock.install();
  await p.goto('file://'+path.join(__dirname,'..','app','ideas.html'));
  await p.evaluate(()=>document.fonts.ready);
  // курсор старого Mac: у безголовому браузері справжнього курсора не видно
  await p.evaluate(()=>{const c=document.createElement('div');c.id='fakecursor';
    c.innerHTML='<svg width="18" height="26" viewBox="0 0 12 18" shape-rendering="crispEdges"><path d="M1 1v14l3.5-3.5 2.5 5.5 2-1-2.5-5.5H11z" fill="#fff" stroke="#000" stroke-width="1.2"/></svg>';
    Object.assign(c.style,{position:'fixed',left:0,top:0,zIndex:99999,pointerEvents:'none',transform:'translate(-100px,-100px)'});document.body.appendChild(c);
    addEventListener('mousemove',e=>{c.style.transform=`translate(${e.clientX-2}px,${e.clientY-2}px)`},true)});
  await p.clock.runFor(1500);
  let f=0, mx=640, my=420;
  const shot=async()=>{await p.clock.runFor(1000/FPS);await p.screenshot({path:path.join(OUT,String(f++).padStart(5,'0')+'.png')})};
  const move=async(x,y)=>{mx=x;my=y;await p.mouse.move(x,y)};
  const center=id=>p.evaluate(id=>{const r=document.querySelector(`[data-id="${id}"]`).getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]},id);
  await p.evaluate(()=>{scroll.scrollLeft=X(1938)-GUT();scroll.scrollTop=0});
  await move(mx,my);
  // A: мишка пливе до «As We May Think»
  let [bx,by]=await center('bush'); const sx=mx,sy=my;
  for(let i=0;i<70;i++){const t=ease(i/69);await move(lerp(sx,bx,t),lerp(sy,by,t)+Math.sin(t*3.14)*-40);await shot()}
  for(let i=0;i<45;i++){await move(bx+Math.sin(i/9)*3,by);await shot()}
  // B: відкрити нотатку
  await p.mouse.click(bx,by); for(let i=0;i<80;i++){if(i>20&&i<60)await move(lerp(bx,300,(i-20)/40),lerp(by,330,(i-20)/40));await shot()}
  const [cx,cy]=await p.evaluate(()=>{const r=document.querySelector('#closeText').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]});
  for(let i=0;i<20;i++){const t=ease(i/19);await move(lerp(mx,cx,t),lerp(my,cy,t));await shot()}
  await p.mouse.click(cx,cy); for(let i=0;i<10;i++)await shot();
  // C: подорож крізь десятиліття аж у майбутнє
  const [L0,L1,T]=await p.evaluate(()=>[scroll.scrollLeft,X(NOW)-GUT()-30,Math.max(0,canvas.offsetHeight-scroll.clientHeight)]);
  const fx=mx,fy=my, N=240;
  for(let i=0;i<N;i++){const t=i/(N-1),e=ease(t);
    await p.evaluate(([l,tp])=>{scroll.scrollLeft=l;scroll.scrollTop=tp},[lerp(L0,L1,e),Math.sin(e*Math.PI)*Math.min(T,700)]);
    await move(lerp(fx,520,Math.min(1,t*3))+Math.sin(t*9)*60,330+Math.sin(t*5.3)*150);await shot()}
  // D: космос — падають зорі й народжуються галактики
  for(let i=0;i<120;i++){await move(lerp(mx,700,.02),lerp(my,560,.02));await shot()}
  console.log('frames',f);await b.close();
})();
