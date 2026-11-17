// «Show, not tell»: слайд 1 → PNG, слайд 5 → PNG (останній кадр) і MP4 з анімацією.
// node carousel/render-show.js <тека кадрів>
const {chromium}=require('playwright'), path=require('path'), fs=require('fs'), {execFileSync}=require('child_process');
const FR=process.argv[2]||path.join(__dirname,'frames-show'), OUT=path.join(__dirname,'out','show'), FPS=30, DUR=9;
fs.mkdirSync(FR,{recursive:true});fs.mkdirSync(OUT,{recursive:true});
(async()=>{
  const b=await chromium.launch(), p=await b.newPage({viewport:{width:1200,height:1500}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+path.join(__dirname,'slides-show.html'));
  await p.waitForFunction(()=>window.READY,null,{timeout:60000});
  await p.locator('#s1').screenshot({path:path.join(OUT,'slide-1.png')});
  await p.locator('#s5').screenshot({path:path.join(OUT,'slide-5.png')});
  const s5=p.locator('#s5');
  for(let i=0;i<FPS*DUR;i++){await p.evaluate(t=>setT(t),i/FPS);await s5.screenshot({path:path.join(FR,String(i).padStart(5,'0')+'.png')})}
  await b.close();
  execFileSync('ffmpeg',['-loglevel','error','-y','-framerate',String(FPS),'-i',path.join(FR,'%05d.png'),'-vf','format=yuv420p','-c:v','libx264','-crf','17','-preset','slow','-movflags','+faststart',path.join(OUT,'slide-5.mp4')]);
  console.log('ok',errs);
})();
