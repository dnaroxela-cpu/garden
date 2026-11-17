// Рендер статичних слайдів каруселі в PNG 1080×1350: node carousel/render-slides.js
const {chromium}=require('playwright'), path=require('path');
(async()=>{
  const b=await chromium.launch(), p=await b.newPage({viewport:{width:1200,height:1500}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+path.join(__dirname,'slides.html'));
  await p.waitForFunction(()=>window.READY,null,{timeout:60000});
  for(const n of [1,2,3,4,5]) await p.locator('#s'+n).screenshot({path:path.join(__dirname,'out',`slide-${n}${n===5?'-bg':''}.png`)});
  const box=await p.evaluate(()=>{const s=document.querySelector('#s5').getBoundingClientRect(),v=document.querySelector('#vid').getBoundingClientRect();return {x:v.left-s.left,y:v.top-s.top,w:v.width,h:v.height}});
  require('fs').writeFileSync(path.join(__dirname,'out','video-box.json'),JSON.stringify(box));
  console.log(box,errs);await b.close();
})();
