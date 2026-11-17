// Слайди у стилі мапи → PNG 1080×1350: node carousel/render-mac.js
const {chromium}=require('playwright'), path=require('path'), fs=require('fs');
(async()=>{
  fs.mkdirSync(path.join(__dirname,'out','mac'),{recursive:true});
  const b=await chromium.launch(), p=await b.newPage({viewport:{width:1200,height:1500}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+path.join(__dirname,'slides-mac.html'));
  await p.waitForFunction(()=>window.READY,null,{timeout:60000});await p.waitForTimeout(300);
  for(const s of await p.$$('.slide')){const id=await s.getAttribute('id');await s.screenshot({path:path.join(__dirname,'out','mac',`slide-${id.slice(1)}.png`)})}
  console.log(errs);await b.close();
})();
