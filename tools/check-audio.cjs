// Optional browser audio QA. Requires Playwright outside the application's dependencies.
// Serve the repository, then run: node tools/check-audio.cjs
// The default exercises real rendering, normal play, real Web Audio, and an actual Sound toggle.
// SALON_BASE_URL (default http://127.0.0.1:8000), SALON_CHROMIUM, SALON_QA_TIMEOUT,
// SALON_QA_GRAPHICS, SALON_QA_OUTPUT_DIR customize the machine/server.
// Optional SALON_QA_RENDER_WIDTH/HEIGHT lower only the drawing buffer; rendering still runs.
// SALON_QA_SHADOWS=0 disables shadows explicitly for CPU renderers.
// SALON_QA_AUDIO_ONLY=1 is a separate signal/mute/resume check: it suppresses rasterization
// and does NOT validate gameplay or rendering. It never stands in for the default check.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.error('This optional check requires Playwright in the Node module search path; it is not an application dependency.'); process.exit(1); }
const BASE = new URL((process.env.SALON_BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '') + '/');
if (!['http:', 'https:'].includes(BASE.protocol)) throw new Error('SALON_BASE_URL must be an HTTP(S) server URL.');
const TIMEOUT = Number(process.env.SALON_QA_TIMEOUT || 300000);
if (!Number.isFinite(TIMEOUT) || TIMEOUT < 1000) throw new Error('SALON_QA_TIMEOUT must be at least 1000 milliseconds.');
const AUDIO_ONLY = process.env.SALON_QA_AUDIO_ONLY === '1';
const GRAPHICS = process.env.SALON_QA_GRAPHICS;
if (GRAPHICS && !['auto','high','phone','saver'].includes(GRAPHICS)) throw new Error('SALON_QA_GRAPHICS must be auto, high, phone, or saver.');
const BITMAP = process.env.SALON_QA_RENDER_WIDTH || process.env.SALON_QA_RENDER_HEIGHT
  ? {width:Number(process.env.SALON_QA_RENDER_WIDTH),height:Number(process.env.SALON_QA_RENDER_HEIGHT)} : null;
if (BITMAP && ![BITMAP.width,BITMAP.height].every(v => Number.isInteger(v) && v > 0)) throw new Error('Set both SALON_QA_RENDER_WIDTH and SALON_QA_RENDER_HEIGHT to positive integers.');
const SHADOWS_OFF = process.env.SALON_QA_SHADOWS === '0';
const OUTPUT = process.env.SALON_QA_OUTPUT_DIR || fs.mkdtempSync(path.join(os.tmpdir(),'salon-audio-qa-'));
fs.mkdirSync(OUTPUT,{recursive:true});
const output = file => path.join(OUTPUT,file);


(async()=>{
  const browser=await chromium.launch({executablePath:process.env.SALON_CHROMIUM || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const report={mode:AUDIO_ONLY?'audio-only signal/mute/resume':'normal gameplay with real rendering',bitmap:BITMAP,shadows:!SHADOWS_OFF,errors:[],httpErrors:[]};let page;
  try {
    page=await browser.newPage({viewport:{width:640,height:480}});page.setDefaultTimeout(TIMEOUT);page.setDefaultNavigationTimeout(TIMEOUT);
    page.on('pageerror',e=>report.errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
    page.on('response',r=>{if(r.status()>=400)report.httpErrors.push(r.status()+' '+r.url());});
    await page.addInitScript(graphics=>{
      for(const[k,v]of Object.entries({room:'roulette',players:0,fast:false,reduced:false,sound:true,...(graphics ? {gfx:graphics} : {})}))localStorage.setItem('spader.'+k,JSON.stringify(v));
      window.__decodeErrors=[];
      const decode=AudioContext.prototype.decodeAudioData;
      AudioContext.prototype.decodeAudioData=function(bytes,success,error){return decode.call(this,bytes,success,e=>{window.__decodeErrors.push(String(e));error?.(e);});};
    },GRAPHICS);
    await page.goto(new URL('?table&test&nosw',BASE).href);
    await page.waitForFunction(()=>window.done&&window.__spader.roulette?.mode==='betting');
    await page.evaluate(async({audioOnly,bitmap,shadowsOff})=>{
      const h=window.__spader,a=h.audio,r=h.roulette;
      await a.ready;
      window.__qaConfigureAudioRenderer=renderer=>{
        if(shadowsOff)renderer.shadowMap.enabled=false;
        if(bitmap){const size=renderer.setSize.bind(renderer),ratio=renderer.setPixelRatio.bind(renderer);renderer.setSize=()=>size(bitmap.width,bitmap.height,false);renderer.setPixelRatio=()=>ratio(1);renderer.setPixelRatio(1);renderer.setSize();}
        if(audioOnly)renderer.render=()=>{};
      };
      window.__qaConfigureAudioRenderer(r.scene.renderer);
      window.__normalAudio={events:[],samples:[],trail:[],poses:[],bufferNames:new Map(),decodedWaveCount:a.buffers.size,initialBalance:document.querySelector('#balance').textContent};
      const q=window.__normalAudio;
      const state=()=>({wall:performance.now(),audio:a.ctx.currentTime,mode:r.mode,stage:r.test.stageAt,history:r.test.history.length,display:document.querySelector('#balance').textContent,ledger:JSON.parse(localStorage.getItem('salonnoir.ledger')??'[]').length,payCount:[...r.test.stacks].filter(([k])=>k.endsWith('|pay')).reduce((n,[,a])=>n+a.length,0),payFlying:[...r.test.stacks].filter(([k])=>k.endsWith('|pay')).flatMap(([,a])=>a).filter(m=>m.userData.fly||m.userData.target).length});
      const event=(type,path,more={})=>q.events.push({...state(),type,path,...more});
      const tween=r.test.motion.tween.bind(r.test.motion);r.test.motion.tween=(duration,update,easing)=>{const pay=r.test.stageAt==='wins'&&duration===480;if(pay)event('payout-flight-start',String(duration));return tween(duration,update,easing).then(v=>{if(pay)event('payout-flight-end',String(duration));return v;});};
      const clip=a.clip.bind(a);a.clip=async path=>{const b=await clip(path);if(b)q.bufferNames.set(b,path);else event('missing-clip',path);return b;};
      const say=a.say.bind(a);a.say=(path,opts={})=>{event('voice-request',path);return say(path,{...opts,onStart(){event('voice-start',path,{ball:r.scene.wheel.ball.position.toArray(),phi:r.scene.wheel.rotor.rotation.y});opts.onStart?.();}}).then(()=>event('voice-end',path));};
      const play=a.play.bind(a);a.play=(path,opts)=>{event('table-event',path);return play(path,opts);};
      const cue=a.cue.bind(a);a.cue=(path,opts)=>{event('cue-request',path);return cue(path,opts);};
      const create=a.ctx.createBufferSource.bind(a.ctx);a.ctx.createBufferSource=()=>{const s=create(),start=s.start.bind(s);s.start=(...args)=>{let path=q.bufferNames.get(s.buffer);if(!path)for(const[n,b]of a.buffers)if(b===s.buffer){path=n;break;}let energy=0;if(s.buffer){const d=s.buffer.getChannelData(0),step=Math.max(1,Math.floor(d.length/4096));let count=0;for(let i=0;i<d.length;i+=step){energy+=d[i]*d[i];count++;}energy=Math.sqrt(energy/count);}event('source-start',path??'procedural',{rms:energy,duration:s.buffer?.duration,loop:s.loop});return start(...args);};return s;};
      const analyser=a.ctx.createAnalyser();analyser.fftSize=2048;a.master.connect(analyser);
      const voice=a.ctx.createAnalyser();voice.fftSize=2048;a.bus.voice.connect(voice);
      const table=a.ctx.createAnalyser();table.fftSize=2048;a.bus.table.connect(table);
      const stream=a.ctx.createMediaStreamDestination();a.master.connect(stream);q.recorder=new MediaRecorder(stream.stream,{mimeType:'audio/webm;codecs=opus'});q.chunks=[];q.recorder.ondataavailable=e=>{if(e.data.size)q.chunks.push(e.data);};q.recorder.start(1000);
      const rms=n=>{const d=new Float32Array(n.fftSize);n.getFloatTimeDomainData(d);let v=0;for(const x of d)v+=x*x;return Math.sqrt(v/d.length);};
      q.timer=setInterval(()=>q.samples.push({...state(),rms:rms(analyser),voiceRms:rms(voice),tableRms:rms(table)}),50);
      const trail=r.scene.wheel.setTrail.bind(r.scene.wheel);r.scene.wheel.setTrail=(theta,rad,y,speed,dir)=>{if(speed>0)q.trail.push({wall:performance.now(),theta,r:rad,y,speed,dir});return trail(theta,rad,y,speed,dir);};
      const ball=r.scene.wheel.setBall.bind(r.scene.wheel);r.scene.wheel.setBall=(theta,rad,y)=>{q.poses.push({wall:performance.now(),theta,r:rad,y,phi:r.scene.wheel.rotor.rotation.y});return ball(theta,rad,y);};
      const originalRandom=Math.random;Math.random=()=>{const v=originalRandom();if(r.mode==='spinning'&&!q.planSeed){const stack=new Error().stack;if(stack.includes('at plan ')){q.planSeed=(v*2**32)>>>0;q.planPhi=r.scene.wheel.rotor.rotation.y;const c=r.scene.shots.wheel.pos,w=r.scene.wheel.group.position;q.planTheta=Math.atan2(-(c.z-w.z),c.x-w.x)+Math.PI+(q.planJitter-.5)*.6;}else if(stack.includes('at spinRound '))q.planJitter=v;}return v;};
      q.state=state;
    },{audioOnly:AUDIO_ONLY,bitmap:BITMAP,shadowsOff:SHADOWS_OFF});
    await page.locator('#rChips [data-value="5"]').click();
    await page.waitForFunction(()=>window.__spader.audio.ctx.state==='running');
    if(!AUDIO_ONLY){
    await page.evaluate(async()=>{await Promise.all(['voice/james-winning-number','voice/james-n7','voice/james-no-more-bets','voice/james-place-bets'].map(p=>window.__spader.audio.clip(p)));window.__spader.roulette.test.place('red');window.__spader.roulette.test.rig(7);});
    await page.waitForFunction(()=>window.__spader.roulette.test.stacks.get('you|red')?.every(m=>!m.userData.fly));
    await page.locator('#rSpin').click();
    console.log('RUNNING true normal roulette: sound on, fast/reduced/turbo off');
    for(let i=0;i<Math.ceil(TIMEOUT/20000);i++){
      try{await page.waitForFunction(()=>window.__normalAudio.events.some(e=>e.type==='voice-start'&&e.path==='voice/james-n7'),null,{timeout:20000});break;}
      catch(e){console.log('PROGRESS',JSON.stringify(await page.evaluate(()=>({mode:__spader.roulette.mode,trail:__normalAudio.trail.length,last:__normalAudio.trail.at(-1),voices:__normalAudio.events.filter(e=>e.type==='voice-start').map(e=>e.path),audio:__spader.audio.ctx.state,hidden:document.hidden}))));if(i===Math.ceil(TIMEOUT/20000)-1)throw e;}
    }
    console.log('OBSERVED dealer number call after normal spin');
    await page.waitForFunction(()=>window.__spader.roulette.test.stageAt==='banner',null,{timeout:TIMEOUT});
    await page.waitForFunction(()=>window.__normalAudio.samples.some(s=>s.ledger===1),null,{timeout:TIMEOUT});
    const roulette=await page.evaluate(()=>{
      const q=window.__normalAudio,h=window.__spader,r=h.roulette;
      const p=r.test.plan(7,{dir:JSON.parse(localStorage.getItem('spader.rouletteDir')),phiNow:q.planPhi,theta0:q.planTheta,seed:q.planSeed,fast:false});
      const sign=p.dir,track=q.trail.filter(s=>sign*(s.theta-p.drop.th)<=0);
      return {settings:{fast:h.settings.fast,reduced:h.settings.reduced,sound:h.settings.sound},audioState:h.audio.ctx.state,planSeed:q.planSeed,plan:{laps:p.laps,dropAt:p.dropAt,settledAt:p.settledAt,phi0:q.planPhi,theta0:q.planTheta},observed:{laps:Math.abs(track.at(-1).theta-track[0].theta)/(Math.PI*2),trackWallSeconds:(track.at(-1).wall-track[0].wall)/1000,frames:track.length},balance:Number(localStorage.getItem('salonnoir.balance')),ledger:JSON.parse(localStorage.getItem('salonnoir.ledger')),events:q.events,samples:q.samples,decodedWaveCount:q.decodedWaveCount,decodeErrors:window.__decodeErrors};
    });
    report.roulette=roulette;fs.writeFileSync(output('report.json'),JSON.stringify(report,null,2));
    assert.deepEqual(roulette.settings,{fast:false,reduced:false,sound:true});assert.equal(roulette.audioState,'running');assert.equal(roulette.balance,1005);
    assert.ok(roulette.plan.laps>=12.5&&roulette.plan.laps<=15.5);assert.ok(roulette.plan.dropAt>=12.5&&roulette.plan.dropAt<=15.5);
    assert.ok(Math.abs(roulette.observed.laps-roulette.plan.laps)<.3);
    const winning=roulette.events.find(e=>e.type==='voice-start'&&e.path==='voice/james-winning-number');
    const number=roulette.events.find(e=>e.type==='voice-start'&&e.path==='voice/james-n7');
    assert.ok(winning&&number&&number.wall>winning.wall);assert.equal(winning.history,0);assert.equal(number.history,0);assert.equal(winning.ledger,0);assert.equal(number.ledger,0);
    const radius=Math.hypot(winning.ball[0],winning.ball[2]);assert.ok(radius>17.9&&radius<22.3);assert.ok(Math.abs(winning.ball[1]+9.4)<.15);
    const hist=roulette.samples.find(s=>s.history===1);assert.ok(hist&&hist.wall>=number.wall-5);
    const paid=roulette.samples.find(s=>s.ledger===1);assert.ok(paid&&paid.wall>number.wall);
    assert.ok(roulette.samples.filter(s=>s.ledger===0).every(s=>!s.display.includes('1,005')), 'winnings stay out of the visible balance until physically paid');
    const flightStart=roulette.events.find(s=>s.type==='payout-flight-start'),flightEnd=roulette.events.filter(s=>s.type==='payout-flight-end').at(-1);
    assert.ok(flightStart&&flightEnd&&flightEnd.wall-flightStart.wall>=450,'normal payout flight executes without reduced motion');
    assert.ok(paid.wall>=flightEnd.wall&&paid.payFlying===0&&paid.payCount>0,'ledger updates only after the physical payout reaches its resting stack');
    assert.ok(roulette.events.some(e=>e.type==='source-start'&&e.path==='procedural'&&e.loop&&e.rms>.001));
    assert.ok(roulette.samples.some(s=>s.mode==='spinning'&&s.tableRms>.001));assert.ok(roulette.samples.some(s=>s.voiceRms>.001));
    assert.ok(roulette.events.some(e=>e.type==='source-start'&&e.path==='voice/james-n7'&&e.rms>.001));assert.equal(roulette.decodeErrors.length,0);
    report.roulette=roulette;
    console.log('PASS normal roulette: actual roller/voice PCM nonzero; physical rest→winning phrase→number/history→payout/ledger');
    await page.waitForFunction(()=>!window.__spader.roulette.busy,null,{timeout:TIMEOUT});
    } else {
      await page.evaluate(async()=>{
        const a=__spader.audio;
        for(const event of ['slide','turn','chip']){a.play(event);await new Promise(r=>setTimeout(r,500));}
        await a.say('voice/james-n7',{prio:4});
        const {createRoller}=await import(new URL('src/roulette/roller.mjs',location.href));
        const roll=createRoller(a.ctx,a.bus.table);roll.update({speed:420,theta:0,phase:0});await new Promise(r=>setTimeout(r,1000));roll.stop(.2);
      });
      const signals=await page.evaluate(()=>({source:__normalAudio.events.filter(e=>e.type==='source-start'),samples:__normalAudio.samples,decodeErrors:__decodeErrors}));
      assert.ok(signals.source.some(e=>e.path==='procedural'&&e.loop&&e.rms>.001));
      assert.ok(signals.samples.some(s=>s.tableRms>.001)&&signals.samples.some(s=>s.voiceRms>.001));
      assert.deepEqual(signals.decodeErrors,[]);report.isolatedSignals=signals;
      console.log('PASS isolated real card/chip/dealer/roller signals (gameplay and rendering deliberately not exercised)');
    }
    const interruption=await page.evaluate(async()=>{
      const a=window.__spader.audio,states=[];const watch=()=>states.push(a.ctx.state);a.ctx.addEventListener('statechange',watch);
      await a.ctx.suspend();const afterSuspend=a.ctx.state;a.revive();await new Promise(r=>setTimeout(r,300));const afterRevive=a.ctx.state;
      a.ctx.removeEventListener('statechange',watch);return{afterSuspend,afterRevive,states};
    });assert.equal(interruption.afterRevive,'running');report.interruption=interruption;
    console.log('PASS Chromium audio context resumes after suspension');
    if(!AUDIO_ONLY){
    await page.locator('#brandBtn').click();await page.locator('.tcard[data-mode="classic"]').click();await page.locator('[data-play]').click();
    await page.waitForFunction(()=>!document.body.classList.contains('flying')&&window.__spader.blackjack);
    await page.evaluate(()=>window.__qaConfigureAudioRenderer(window.__spader.world.renderer));
    await page.locator('#chips [data-value="5"]').click();await page.locator('.spot.main').click();
    await page.evaluate(()=>window.__spader.rig(['10♥','9♣','8♦','8♠']));await page.locator('#deal').click();
    await page.waitForFunction(()=>window.__spader.mode==='player',null,{timeout:TIMEOUT});await page.locator('#act-stand').click();await page.waitForFunction(()=>window.__spader.mode==='result',null,{timeout:TIMEOUT});
    const card=await page.evaluate(()=>window.__normalAudio.events.filter(e=>e.type==='source-start'&&/card-|hael-|chip/.test(e.path)));
    assert.ok(card.some(e=>/card-slide/.test(e.path)&&e.rms>.001));assert.ok(card.some(e=>/card-place|hael-/.test(e.path)&&e.rms>.001));assert.ok(card.some(e=>/chip/.test(e.path)&&e.rms>.001));report.cardAudio=card;
    console.log('PASS normal blackjack: real card/chip buffers decode and produce nonzero PCM');
    }
    await page.evaluate(()=>{const a=__spader.audio,q=__normalAudio;q.probes=['table','voice'].map((bus,i)=>{const s=a.ctx.createOscillator(),g=a.ctx.createGain();s.frequency.value=220+i*110;g.gain.value=.08;s.connect(g).connect(a.bus[bus]);s.start();return s;});});
    await page.waitForTimeout(300);
    const audible=await page.evaluate(()=>__normalAudio.samples.at(-1).rms);assert.ok(audible>.01);
    await page.locator('#sound').click();await page.waitForTimeout(1000);
    const muted=await page.evaluate(()=>({enabled:__spader.audio.enabled,rms:__normalAudio.samples.at(-1).rms,table:__normalAudio.samples.at(-1).tableRms,voice:__normalAudio.samples.at(-1).voiceRms}));
    assert.equal(muted.enabled,false);assert.ok(muted.rms<.0001,`active audio muted: ${muted.rms}`);
    await page.locator('#sound').click();await page.waitForTimeout(500);
    const restored=await page.evaluate(()=>{const rms=__normalAudio.samples.at(-1).rms;for(const s of __normalAudio.probes)s.stop();return rms;});assert.ok(restored>.01);
    report.mute={audible,muted,restored};console.log('PASS actual Sound switch silences already-active table/voice sources and restores audible output');
    const recording=await page.evaluate(async()=>{const q=window.__normalAudio;clearInterval(q.timer);await new Promise(r=>{q.recorder.onstop=r;q.recorder.stop();});const blob=new Blob(q.chunks,{type:'audio/webm'});return await new Promise((r,j)=>{const f=new FileReader();f.onload=()=>r(f.result);f.onerror=j;f.readAsDataURL(blob);});});
    fs.writeFileSync(output('recording.webm'),Buffer.from(recording.split(',')[1],'base64'));
    assert.deepEqual(report.errors,[]);assert.deepEqual(report.httpErrors,[]);
    fs.writeFileSync(output('report.json'),JSON.stringify(report,null,2));
    console.log(`PASS ${AUDIO_ONLY?'isolated audio':'normal gameplay/audio'} checks; artifacts: ${OUTPUT}`);
  } catch(e) {
    if(page)try{const q=await page.evaluate(()=>({mode:window.__spader?.roulette?.mode,stage:window.__spader?.roulette?.test.stageAt,audio:window.__spader?.audio?.ctx?.state,events:window.__normalAudio?.events,trail:window.__normalAudio?.trail,samples:window.__normalAudio?.samples,decodeErrors:window.__decodeErrors}));fs.writeFileSync(output('failure.json'),JSON.stringify(q,null,2));await page.screenshot({path:output('failure.png')});}catch{}
    throw e;
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
