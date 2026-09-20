(() => {
  'use strict';
  const $ = id => document.getElementById(id), canvas = $('game'), ctx = canvas.getContext('2d');
  const map = [
    '111111111111111',
    '100000100000001',
    '101000101110101',
    '101000000010101',
    '101110111010101',
    '100000100000001',
    '111010101110101',
    '100010000010001',
    '101110111010101',
    '100000001000001',
    '101011101110101',
    '100010000010001',
    '101010111010101',
    '100000000000001',
    '111111111111111'
  ];
  const eggSpawns = [[3.5,3.5],[7.5,1.5],[13.5,5.5],[3.5,11.5],[11.5,13.5]];
  const koopaRoutes=[[[9.5,1.5],[13.5,1.5],[13.5,5.5]],[[1.5,9.5],[3.5,11.5],[1.5,13.5]],[[9.5,9.5],[13.5,9.5],[11.5,13.5]]];
  let koopas=[],scareSource='yoshi';
  let state='menu', player, monster, eggs, collected=0, light=true, battery=100, elapsed=0, scareTime=0, last=0, hintUntil=0, flicker=0, footsteps=0;
  const keys=new Set(), touch=matchMedia('(pointer:coarse)').matches;
  const reducedMotion=matchMedia('(prefers-reduced-motion:reduce)');
  let cap=null, capCooldown=0, threat=0, heartbeat=0;
  let audio, master, hum, sound=true;
  canvas.width=800; canvas.height=480;
  const W=800,H=480, FOV=Math.PI/3, depth=new Float32Array(W);
  const wall=(x,y)=>map[Math.floor(y)]?.[Math.floor(x)]!=='0';
  function initAudio(){
    if(!audio){audio=new (window.AudioContext||window.webkitAudioContext)();master=audio.createGain();master.gain.value=sound?.16:0;master.connect(audio.destination);hum=audio.createOscillator();const g=audio.createGain();hum.type='sine';hum.frequency.value=43;g.gain.value=.25;hum.connect(g);g.connect(master);hum.start();}
    audio.resume();
  }
  function tone(freq,duration,volume=.3,type='sine',end=freq){if(!audio)return;const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(1,end),audio.currentTime+duration);g.gain.setValueAtTime(volume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(master);o.start();o.stop(audio.currentTime+duration);}
  function noise(duration){if(!audio)return;const b=audio.createBuffer(1,audio.sampleRate*duration,audio.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);const s=audio.createBufferSource();s.buffer=b;s.connect(master);s.start();}
  function hint(text,duration=4){$('hint').textContent=text;hintUntil=elapsed+duration;}
  function reset(){resetKoopas();player={x:1.5,y:1.5,a:.25};monster={x:13.5,y:13.5,stun:0,windup:0,lunge:0,recovery:0,attackCooldown:3,attackAngle:0};eggs=eggSpawns.map(([x,y])=>({x,y,taken:false}));collected=0;light=true;battery=100;elapsed=0;scareTime=0;target=[13.5,13.5];footsteps=0;flicker=0;cap=null;capCooldown=0;threat=0;heartbeat=0;$('danger').textContent='';$('cap-status').textContent='CAP READY · SPACE / CLICK';keys.clear();}
  function show(id,on){$(id).classList.toggle('hidden',!on);}
  function resetKoopas(){scareSource='yoshi';koopas=koopaRoutes.map((route,id)=>({id,x:route[0][0],y:route[0][1],route,point:1,target:[...route[0]],stun:0,alert:0,lastSeen:[...route[0]]}));}
  function start(){initAudio();reset();state='playing';['menu','ending','pause'].forEach(id=>show(id,false));show('hud',true);show('mobile',true);hint('Mario: find 5 eggs. SPACE / click stuns Yoshi and corrupted Koopas.',8);capture();}
  function capture(){canvas.focus();if(!touch&&canvas.requestPointerLock){const p=canvas.requestPointerLock();if(p?.catch)p.catch(()=>{});}}
  function pause(){if(state!=='playing')return;state='paused';keys.clear();show('pause',true);show('mobile',false);document.exitPointerLock?.();}
  function resume(){state='playing';show('pause',false);show('mobile',true);capture();}
  function menu(){state='menu';keys.clear();['ending','pause','hud','mobile'].forEach(id=>show(id,false));show('menu',true);document.exitPointerLock?.();}
  function finish(win){state=win?'won':'lost';show('ending',true);show('hud',false);show('mobile',false);$('end-label').textContent=win?'SAVE FILE RECOVERED':'SAVE FILE LOST';$('end-title').textContent=win?'YOU GOT OUT.':'FOUND YOU.';$('end-copy').textContent=win?'Five memories recovered. One friend left behind.':(scareSource==='koopa'?'The corrupted Koopa found you. Your cap disables its shell.':'Mario, throw your cap to stun him. Run while he cannot move.');document.exitPointerLock?.();keys.clear();}
  function scare(source='yoshi'){scareSource=source;state='scare';scareTime=0;keys.clear();show('mobile',false);tone(source==='koopa'?150:95,1.5,1,'sawtooth',23);tone(660,.8,.65,'square',48);noise(.9);document.exitPointerLock?.();}
  function move(obj,dx,dy,r=.19){if(!wall(obj.x+dx+r*Math.sign(dx),obj.y-r)&&!wall(obj.x+dx+r*Math.sign(dx),obj.y+r))obj.x+=dx;if(!wall(obj.x-r,obj.y+dy+r*Math.sign(dy))&&!wall(obj.x+r,obj.y+dy+r*Math.sign(dy)))obj.y+=dy;}
  function nextStep(actor=monster,destination=player){const sx=Math.floor(actor.x),sy=Math.floor(actor.y),tx=Math.floor(destination.x),ty=Math.floor(destination.y);const q=[[sx,sy,null]],seen=new Set([sx+','+sy]);for(let i=0;i<q.length;i++){const [x,y,first]=q[i];if(x===tx&&y===ty)return first||[destination.x,destination.y];for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,k=nx+','+ny;if(!wall(nx,ny)&&!seen.has(k)){seen.add(k);q.push([nx,ny,first||[nx+.5,ny+.5]]);}}}return [actor.x,actor.y];}
  let target=[13.5,13.5];
  function throwCap(){
    if(state!=='playing'||cap||capCooldown>0)return;
    cap={x:player.x,y:player.y,angle:player.a,age:0,returning:false,hit:false,trail:[]};
    tone(380,.28,.22,'triangle',110);
  }
  function updateCap(dt){
    capCooldown=Math.max(0,capCooldown-dt);
    if(!cap)return;
    cap.age+=dt;cap.trail.unshift({x:cap.x,y:cap.y});cap.trail.length=Math.min(6,cap.trail.length);
    if(cap.age>.48)cap.returning=true;
    // Small steps keep the cap from passing through a wall or missing a target.
    const steps=Math.max(1,Math.ceil(dt/.012));
    for(let i=0;i<steps&&cap;i++){
      const dist=Math.hypot(player.x-cap.x,player.y-cap.y),step=dt/steps*8.5;
      if(cap.returning&&dist<step+.22){cap=null;capCooldown=.65;tone(230,.1,.16,'triangle',410);break;}
      const a=cap.returning?Math.atan2(player.y-cap.y,player.x-cap.x):cap.angle;
      const nx=cap.x+Math.cos(a)*step,ny=cap.y+Math.sin(a)*step;
      if(!cap.returning&&wall(nx,ny)){cap.returning=true;tone(80,.12,.2,'triangle');continue;}
      cap.x=nx;cap.y=ny;
      // Returning caps phase back to Mario, but cannot hit through walls.
      if(!cap.hit&&!wall(cap.x,cap.y)&&Math.hypot(monster.x-cap.x,monster.y-cap.y)<.46&&clearPath(cap.x,cap.y,monster.x,monster.y)){
        cap.hit=true;cap.returning=true;monster.stun=1.65;monster.windup=0;monster.lunge=0;monster.recovery=0;monster.attackCooldown=3.5;hint('CAP HIT — he will recover quickly. RUN!',2);tone(110,.3,.5,'sawtooth',35);
      }
      for(const koopa of koopas)if(!cap.hit&&!wall(cap.x,cap.y)&&Math.hypot(koopa.x-cap.x,koopa.y-cap.y)<.45&&clearPath(cap.x,cap.y,koopa.x,koopa.y)){
        cap.hit=true;cap.returning=true;koopa.stun=4;koopa.alert=0;koopa.target=[Math.floor(koopa.x)+.5,Math.floor(koopa.y)+.5];hint('KOOPA SHELL DISABLED — move past it!',2.5);tone(220,.3,.4,'square',50);
      }
    }
  }
  function clearPath(x,y,tx,ty){const n=Math.ceil(Math.hypot(tx-x,ty-y)/.08);for(let i=1;i<=n;i++)if(wall(x+(tx-x)*i/n,y+(ty-y)*i/n))return false;return true;}
  function clearCorridor(x,y,tx,ty){return [[-.18,-.18],[.18,-.18],[-.18,.18],[.18,.18]].every(([ox,oy])=>clearPath(x+ox,y+oy,tx+ox,ty+oy));}
  function updateKoopas(dt){
    for(const koopa of koopas){
      koopa.stun=Math.max(0,koopa.stun-dt);if(koopa.stun>0||elapsed<8)continue;
      const distance=Math.hypot(player.x-koopa.x,player.y-koopa.y);
      const sees=distance<(light?5.5:3.2)&&clearCorridor(koopa.x,koopa.y,player.x,player.y);
      if(sees){if(koopa.alert===0){tone(340,.45,.3,'sawtooth',70);hint('CORRUPTED KOOPA — throw your cap!',2.5);}koopa.alert=5;koopa.lastSeen=[player.x,player.y];}
      else koopa.alert=Math.max(0,koopa.alert-dt);
      const goal=koopa.alert>0?koopa.lastSeen:koopa.route[koopa.point];
      if(Math.hypot(goal[0]-koopa.x,goal[1]-koopa.y)<.15){if(koopa.alert===0)koopa.point=(koopa.point+1)%koopa.route.length;else if(!sees)koopa.alert=0;}
      if(sees)koopa.target=[Math.floor(koopa.x)+.5,Math.floor(koopa.y)+.5];
      else if(Math.hypot(koopa.target[0]-koopa.x,koopa.target[1]-koopa.y)<.045)koopa.target=nextStep(koopa,{x:goal[0],y:goal[1]});
      const aim=sees?[player.x,player.y]:koopa.target,dx=aim[0]-koopa.x,dy=aim[1]-koopa.y,len=Math.hypot(dx,dy);
      if(len>.02){const step=Math.min(len,dt*(koopa.alert>0?1.55+collected*.06:.62));move(koopa,dx/len*step,dy/len*step,.18);}
      if(Math.hypot(player.x-koopa.x,player.y-koopa.y)<.55&&clearPath(koopa.x,koopa.y,player.x,player.y)){scare('koopa');return;}
    }
  }
  function updateDanger(dt){
    const distance=Math.hypot(player.x-monster.x,player.y-monster.y);
    let danger=(elapsed>8||collected>0)&&monster.stun<=0?Math.max(monster.windup>0||monster.lunge>0?.95:0,Math.max(0,Math.min(1,(6-distance)/5.2))):0;
    const nearbyKoopa=koopas.some(k=>k.stun<=0&&k.alert>0&&Math.hypot(k.x-player.x,k.y-player.y)<4);for(const k of koopas)if(k.stun<=0&&k.alert>0)danger=Math.max(danger,Math.max(0,(4.5-Math.hypot(k.x-player.x,k.y-player.y))/4));
    threat+=(danger-threat)*Math.min(1,dt*5);
    $('danger').textContent=nearbyKoopa?'CORRUPTED KOOPA CLOSING IN':monster.stun>0?'ENTITY STUNNED · RUN':monster.windup>0?'HE IS ABOUT TO LUNGE — DODGE!':monster.lunge>0?'MOVE!':threat>.73?'HE IS RIGHT HERE':threat>.32?'SIGNAL CORRUPTING · HE IS CLOSE':'';
    $('cap-status').textContent=cap?(cap.returning?'CAP RETURNING':'CAP IN FLIGHT'):capCooldown>0?'CATCHING CAP…':'CAP READY · SPACE / CLICK';
    heartbeat-=dt;
    if(threat>.15&&heartbeat<=0){heartbeat=1.05-threat*.73;tone(46,.18,.18+threat*.5,'sine',25);if(threat>.55)tone(83,.1,.12,'triangle',32);}
  }
  function updateMonster(dt){
    if((elapsed<=8&&collected===0)||monster.stun>0)return;
    monster.attackCooldown=Math.max(0,monster.attackCooldown-dt);
    const dist=Math.hypot(player.x-monster.x,player.y-monster.y);
    const visible=clearCorridor(monster.x,monster.y,player.x,player.y);
    if(dist<.64&&visible){scare();return;}
    if(monster.recovery>0){monster.recovery=Math.max(0,monster.recovery-dt);return;}
    if(monster.windup>0){
      monster.windup=Math.max(0,monster.windup-dt);
      if(monster.windup===0){monster.lunge=.48;tone(130,.4,.55,'sawtooth',28);}
      return;
    }
    if(monster.lunge>0){
      const duration=Math.min(dt,monster.lunge),steps=Math.ceil(duration/.01);
      for(let i=0;i<steps;i++){
        move(monster,Math.cos(monster.attackAngle)*3.9*duration/steps,Math.sin(monster.attackAngle)*3.9*duration/steps,.18);
        if(Math.hypot(player.x-monster.x,player.y-monster.y)<.64&&clearPath(monster.x,monster.y,player.x,player.y)){scare();return;}
      }
      monster.lunge=Math.max(0,monster.lunge-dt);
      if(monster.lunge===0)monster.recovery=.7;
      return;
    }
    if(visible&&dist>1.15&&dist<3.2&&monster.attackCooldown===0){
      monster.windup=.7;monster.attackCooldown=5.5;monster.attackAngle=Math.atan2(player.y-monster.y,player.x-monster.x);
      hint('He is crouching — STRAFE or throw your cap!',1.4);tone(75,.65,.5,'sawtooth',145);return;
    }
    // Finish each corridor waypoint before selecting the next turn.
    // Replanning as soon as a cell boundary is crossed cuts corners into walls.
    if(visible)target=[Math.floor(monster.x)+.5,Math.floor(monster.y)+.5];
    else if(Math.hypot(target[0]-monster.x,target[1]-monster.y)<.045)target=nextStep();
    const goal=visible?[player.x,player.y]:target;
    const dx=goal[0]-monster.x,dy=goal[1]-monster.y,len=Math.hypot(dx,dy);
    if(len>.04){
      const speed=1.35+collected*.13+(keys.has('Shift')?.2:0),step=Math.min(len,dt*speed);
      const ox=monster.x,oy=monster.y;move(monster,dx/len*step,dy/len*step,.18);
      if(Math.hypot(monster.x-ox,monster.y-oy)<step*.2){
        const cx=Math.floor(monster.x)+.5-monster.x,cy=Math.floor(monster.y)+.5-monster.y,cl=Math.hypot(cx,cy);
        if(cl>.02)move(monster,cx/cl*Math.min(step,cl),cy/cl*Math.min(step,cl),.18);
      }
    }
    if(Math.hypot(player.x-monster.x,player.y-monster.y)<.64&&clearPath(monster.x,monster.y,player.x,player.y))scare();
  }
  function update(dt){
    if(state==='scare'){scareTime+=dt;if(scareTime>1.65)finish(false);return;}
    if(state!=='playing')return;
    elapsed+=dt;monster.stun=Math.max(0,monster.stun-dt);player.a+=((keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0))*dt*1.9;
    let f=(keys.has('w')||keys.has('ArrowUp')?1:0)-(keys.has('s')||keys.has('ArrowDown')?1:0),s=(keys.has('d')?1:0)-(keys.has('a')?1:0);const norm=Math.hypot(f,s)||1,speed=keys.has('Shift')?2.9:1.85;f/=norm;s/=norm;
    move(player,(Math.cos(player.a)*f-Math.sin(player.a)*s)*dt*speed,(Math.sin(player.a)*f+Math.cos(player.a)*s)*dt*speed);
    if(f||s){footsteps+=dt*speed;if(footsteps>.8){tone(65,.12,.11,'triangle',30);footsteps=0;}}
    updateCap(dt);
    battery=Math.max(0,Math.min(100,battery+dt*(light?-1.15:2.6)));if(battery===0&&light){light=false;hint('Flashlight drained. Let it recharge.');}
    for(const egg of eggs)if(!egg.taken&&Math.hypot(player.x-egg.x,player.y-egg.y)<.62){egg.taken=true;collected++;battery=Math.min(100,battery+22);tone(480,.5,.3,'sine',960);hint(collected===5?'All memories recovered. Return to the green door!':`${collected} / 5 memories recovered. He heard that.`);if(collected===1)tone(52,2,.5,'sawtooth',29);}
    updateMonster(dt);if(state!=='playing')return;updateKoopas(dt);if(state!=='playing')return;
    updateDanger(dt);
    if(collected===5&&Math.hypot(player.x-1.5,player.y-1.5)<.7){finish(true);return;}
    if(elapsed>hintUntil)$('hint').textContent='';
    flicker=Math.max(0,flicker-dt);if($('flashes').checked&&Math.random()<dt*.16)flicker=.7;
    $('eggs').textContent=`MEMORY EGGS 0${collected} / 05`;$('battery').textContent=`FLASHLIGHT ${light?'':'OFF · '}${Math.ceil(battery)}%`;$('objective').textContent=collected===5?'RETURN TO THE GREEN DOOR':'FIND THE FIVE MEMORY EGGS';
  }
  function yoshi(c,x,y,size,evil=false){
    c.save();c.translate(x,y);c.scale(size/200,size/200);
    const ellipse=(x,y,rx,ry,color)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();};
    if(evil){
      // A warped silhouette: hanging claws, exposed ribs, and an impossible jaw.
      c.fillStyle='#293721';c.beginPath();c.moveTo(-27,18);c.lineTo(-73,48);c.lineTo(-100,107);c.lineTo(-77,81);c.lineTo(-47,57);c.lineTo(-31,109);c.lineTo(-10,121);c.lineTo(-9,54);c.lineTo(20,112);c.lineTo(45,121);c.lineTo(24,32);c.lineTo(76,68);c.lineTo(105,104);c.lineTo(91,48);c.lineTo(41,4);c.closePath();c.fill();
      c.strokeStyle='#9ca681';c.lineWidth=2;
      for(const side of [-1,1])for(let j=0;j<4;j++){c.beginPath();c.moveTo(side*(80+j*4),78+j*3);c.lineTo(side*(85+j*5),107+j*3);c.stroke();}
      ellipse(-5,39,26,54,'#53603d');ellipse(-4,37,17,42,'#171f17');
      c.strokeStyle='#889173';c.lineWidth=3;for(let j=0;j<6;j++){c.beginPath();c.moveTo(-20,9+j*10);c.lineTo(-3,15+j*10);c.lineTo(16,7+j*10);c.stroke();}
      ellipse(-20,-43,41,58,'#455534');ellipse(-37,-80,22,32,'#7b8564');ellipse(0,-85,24,37,'#94997a');
      ellipse(-35,-78,16,27,'#050707');ellipse(2,-85,18,31,'#030605');
      for(const [ex,ey]of [[-33,-77],[4,-82]]){const glow=c.createRadialGradient(ex,ey,1,ex,ey,24);glow.addColorStop(0,'#ff2115ee');glow.addColorStop(.35,'#d9001c99');glow.addColorStop(1,'#a0001600');c.fillStyle=glow;c.fillRect(ex-24,ey-24,48,48);c.shadowColor='#ff001a';c.shadowBlur=19;ellipse(ex,ey,5,8,'#ff1029');ellipse(ex,ey,1.8,5,'#ffb18e');c.shadowBlur=0;}
      c.fillStyle='#0d1711';for(let j=0;j<5;j++){c.beginPath();c.moveTo(-49+j*13,-60);c.lineTo(-44+j*13,-11+(j%3)*7);c.lineTo(-41+j*13,-60);c.fill();}
      ellipse(22,-26,59,34,'#627044');ellipse(35,5,49,40,'#38482c');
      c.fillStyle='#030605';c.beginPath();c.moveTo(-13,-17);c.bezierCurveTo(15,-4,56,-4,78,-21);c.bezierCurveTo(66,62,3,54,-13,-17);c.fill();
      c.fillStyle='#d3cbb0';for(let j=0;j<11;j++){const x=-8+j*7.5,edge=-9-Math.abs(j-5)*1.1;c.beginPath();c.moveTo(x,edge);c.lineTo(x+3,edge+13+(j%3)*5);c.lineTo(x+6,edge-2);c.fill();if(j>1&&j<10){c.beginPath();c.moveTo(x,28);c.lineTo(x+2,10+(j%2)*6);c.lineTo(x+5,27);c.fill();}}
      ellipse(45,-39,4,3,'#182216');ellipse(64,-33,4,3,'#182216');
      c.strokeStyle='#222e20';c.lineWidth=1.3;for(let j=0;j<7;j++){c.beginPath();c.moveTo(-62+j*18,-27);c.lineTo(-54+j*18,-36);c.lineTo(-57+j*18,-46);c.stroke();}
      // Dried smears and fresh drips on his jaw, chest, and hooked claws.
      for(const [bx,by,rx,ry]of [[-24,-33,9,15],[65,-17,11,7],[17,32,14,8],[-13,57,9,17],[25,79,6,15],[-81,79,8,11],[85,78,8,12]]){
        ellipse(bx,by,rx,ry,'#641b20');ellipse(bx+2,by-2,rx*.5,ry*.55,'#9c292c');
      }
      c.strokeStyle='#9e2e31';c.lineWidth=2.5;
      for(const [bx,by,length]of [[-29,-31,22],[68,-15,26],[14,32,19],[-12,59,25],[-83,84,20],[89,85,24]]){
        c.beginPath();c.moveTo(bx,by);c.lineTo(bx-1,by+length);c.stroke();ellipse(bx-1,by+length,2,3,'#b43c38');
      }
      c.fillStyle='#95262b';for(let j=0;j<6;j++){c.beginPath();c.moveTo(2+j*11,4);c.lineTo(5+j*11,13+(j%3)*4);c.lineTo(7+j*11,4);c.fill();}
      for(let j=0;j<20;j++)ellipse(-22+(j*19)%85,-45+(j*13)%22,1+(j%2),1,'#782025');
      c.strokeStyle='#75212e';c.lineWidth=7;c.beginPath();c.moveTo(32,27);c.bezierCurveTo(68,45,22,57,55,73);c.stroke();c.lineWidth=2;c.strokeStyle='#bf4d51';c.stroke();
      c.fillStyle='#6e7656';for(let j=0;j<5;j++){c.beginPath();c.moveTo(-50,8+j*17);c.lineTo(-74-j*2,-7+j*16);c.lineTo(-49,19+j*17);c.fill();}
      c.strokeStyle='#a6ab89';c.lineWidth=1.5;for(const side of [-1,1])for(let j=0;j<3;j++){c.beginPath();c.moveTo(side*(88+j*5),99+j*3);c.lineTo(side*(104+j*3),113);c.lineTo(side*(109+j*3),101);c.stroke();}
      c.restore();return;
    }
    c.fillStyle=evil?'#394b23':'#415b30';c.beginPath();c.moveTo(-30,50);c.lineTo(-92,76);c.lineTo(-55,17);c.fill();
    ellipse(-10,49,43,62,evil?'#445b29':'#4e6738');ellipse(6,48,26,47,'#a5b18b');
    ellipse(-34,105,30,15,'#6e452d');ellipse(26,102,30,16,'#785033');
    ellipse(-16,-35,51,62,evil?'#526f31':'#66854b');ellipse(-35,-73,20,31,'#aab597');ellipse(0,-78,23,33,'#b9c1a4');
    ellipse(-32,-71,12,23,'#0c100a');ellipse(4,-76,14,24,'#0b100a');
    if(evil){ellipse(-31,-67,4,6,'#ffb399');ellipse(5,-72,4,6,'#ffb399');c.fillStyle='#572e24';c.fillRect(-34,-50,4,29);c.fillRect(3,-54,5,28);}
    ellipse(24,-20,62,39,evil?'#67833d':'#74964d');ellipse(53,-32,4,3,'#28391a');ellipse(31,-37,3,3,'#2b3e1c');
    c.fillStyle='#141a0f';c.beginPath();c.moveTo(-5,0);c.quadraticCurveTo(43,40,77,-2);c.quadraticCurveTo(42,18,-5,0);c.fill();
    if(evil){c.fillStyle='#d1c6a1';for(let i=0;i<7;i++){c.beginPath();c.moveTo(5+i*9,9);c.lineTo(10+i*9,20+(i%2)*4);c.lineTo(14+i*9,8);c.fill();}}
    ellipse(-45,31,14,27,'#536e35');c.restore();
  }
  const enemySprite=document.createElement('canvas');enemySprite.width=270;enemySprite.height=300;yoshi(enemySprite.getContext('2d'),135,148,230,true);
  function drawKoopa(c,x,y,size,shellOnly=false){
    c.save();c.translate(x,y);c.scale(size/200,size/200);
    const oval=(x,y,rx,ry,color)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();};
    oval(0,32,65,65,'#182a31');oval(0,31,56,56,'#4b315f');
    c.strokeStyle='#878a77';c.lineWidth=6;c.beginPath();c.ellipse(0,36,62,57,0,0,Math.PI*2);c.stroke();
    c.strokeStyle='#141a22';c.lineWidth=6;for(let j=0;j<6;j++){const a=j*Math.PI/3;c.beginPath();c.moveTo(Math.cos(a)*24,30+Math.sin(a)*23);c.lineTo(Math.cos(a)*55,30+Math.sin(a)*50);c.stroke();}
    c.strokeStyle='#b25389';c.lineWidth=2;c.beginPath();c.moveTo(-43,5);c.lineTo(-14,17);c.lineTo(-24,39);c.lineTo(15,48);c.lineTo(28,79);c.stroke();
    if(shellOnly){c.restore();return;}
    oval(-39,101,26,14,'#633e36');oval(38,104,26,14,'#633e36');
    oval(-54,28,14,32,'#877448');oval(55,24,14,35,'#877448');
    c.strokeStyle='#c8bca0';c.lineWidth=2;for(const sign of [-1,1])for(let j=0;j<3;j++){c.beginPath();c.moveTo(sign*(47+j*6),46);c.lineTo(sign*(49+j*7),70-j*3);c.stroke();}
    oval(0,-36,40,54,'#a3965d');oval(-13,-66,18,30,'#777d54');oval(17,-68,18,32,'#8a8f62');
    oval(-13,-65,12,24,'#050a0c');oval(18,-66,12,26,'#050a0c');
    c.shadowColor='#e332c5';c.shadowBlur=18;oval(-12,-63,3,5,'#ff93e2');oval(19,-67,3,5,'#ff93e2');c.shadowBlur=0;
    oval(3,-24,40,24,'#a79858');oval(7,-14,29,18,'#111217');
    c.fillStyle='#d1c7a4';for(let j=0;j<7;j++){c.beginPath();c.moveTo(-18+j*7,-25);c.lineTo(-15+j*7,-8+(j%2)*5);c.lineTo(-12+j*7,-24);c.fill();}
    c.strokeStyle='#622b3b';c.lineWidth=3;c.beginPath();c.moveTo(-18,-48);c.lineTo(-24,-14);c.moveTo(21,-45);c.lineTo(28,4);c.stroke();
    c.fillStyle='#3bc1aa55';c.fillRect(-43,-42,83,4);c.fillStyle='#c9309544';c.fillRect(-59,24,113,5);c.fillRect(-32,68,84,3);
    c.restore();
  }
  const koopaSprite=document.createElement('canvas');koopaSprite.width=200;koopaSprite.height=240;drawKoopa(koopaSprite.getContext('2d'),100,114,195);
  const koopaShellSprite=document.createElement('canvas');koopaShellSprite.width=160;koopaShellSprite.height=120;drawKoopa(koopaShellSprite.getContext('2d'),80,25,190,true);
  function drawCap(c,x,y,size,angle=0){
    c.save();c.translate(x,y);c.rotate(angle);c.scale(size/100,size/100);
    c.fillStyle='#691d21';c.beginPath();c.ellipse(0,12,48,14,0,0,Math.PI*2);c.fill();
    c.fillStyle='#c03a35';c.beginPath();c.ellipse(-5,-2,36,25,-.12,0,Math.PI*2);c.fill();
    c.fillStyle='#e85848';c.beginPath();c.ellipse(20,16,31,8,-.12,0,Math.PI*2);c.fill();
    c.fillStyle='#f4dec3';c.beginPath();c.ellipse(-4,-6,13,13,0,0,Math.PI*2);c.fill();
    c.fillStyle='#b8312d';c.font='bold 21px Georgia';c.textAlign='center';c.fillText('M',-4,2);c.restore();
  }
  const capSprite=document.createElement('canvas');capSprite.width=100;capSprite.height=80;
  const frameBuffer=document.createElement('canvas');frameBuffer.width=W;frameBuffer.height=H;const frameCtx=frameBuffer.getContext('2d');
  function marioHands(t){
    const moving=keys.has('w')||keys.has('s')||keys.has('a')||keys.has('d');
    const bob=reducedMotion.matches?0:Math.sin(t*(moving?9:2))*(moving?5:2);
    ctx.save();ctx.translate(0,bob);
    for(const side of [-1,1]){
      const x=side<0?90:710;ctx.save();ctx.translate(x,441);ctx.rotate(side*-.35);
      ctx.fillStyle='#702c28';ctx.fillRect(-32,0,68,110);ctx.fillStyle='#b54437';ctx.fillRect(-30,0,17,105);
      ctx.fillStyle='#a9a796';ctx.beginPath();ctx.ellipse(0,-5,35,25,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#d8d5c1';ctx.beginPath();ctx.ellipse(-5,-14,29,21,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#818675';ctx.lineWidth=2;for(let j=0;j<3;j++){ctx.beginPath();ctx.moveTo(-15+j*11,-28);ctx.lineTo(-12+j*11,-14);ctx.stroke();}ctx.restore();
    }
    if(!cap)drawCap(ctx,690,389,133,-.16);else{ctx.fillStyle='#273d50';ctx.fillRect(310,468,180,25);ctx.fillStyle='#ac9252';ctx.fillRect(332,469,8,8);ctx.fillRect(460,469,8,8);}
    ctx.restore();
  }
  function glitch(t){
    if(threat<.035)return;
    const motion=reducedMotion.matches?0:1, phase=motion?t:0;
    frameCtx.drawImage(canvas,0,0);
    ctx.save();
    // Spatial tearing and doubled colors remain visible without flashing lights.
    for(let i=0;i<4+Math.floor(threat*16);i++){
      const y=((i*71+Math.floor(phase*13)*37)%H),h=3+(i%4)*5;
      const offset=Math.sin(phase*19+i*8)*threat*(12+threat*35);
      ctx.drawImage(frameBuffer,0,y,W,Math.min(h,H-y),offset,y,W,Math.min(h,H-y));
      ctx.fillStyle=`rgba(${i%2?'165,41,44':'40,128,117'},${threat*.13})`;ctx.fillRect(0,y,W,h);
    }
    ctx.globalAlpha=threat*.18;ctx.globalCompositeOperation='screen';ctx.drawImage(frameBuffer,9*threat,0);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
    const edge=ctx.createRadialGradient(W/2,H/2,110,W/2,H/2,430);edge.addColorStop(0,'#29080900');edge.addColorStop(1,`rgba(111,13,24,${threat*.62})`);ctx.fillStyle=edge;ctx.fillRect(0,0,W,H);
    ctx.fillStyle=`rgba(152,179,156,${threat*.22})`;
    for(let i=0;i<100*threat;i++){const x=(i*137+Math.floor(phase*9)*53)%W,y=(i*79+Math.floor(phase*7)*29)%H;ctx.fillRect(x,y,2+(i%5)*3,1);}
    ctx.font='11px monospace';ctx.fillStyle=`rgba(225,140,133,${threat*.85})`;ctx.fillText('M A R I O . . .',48,150);ctx.fillText('SIGNAL LOSS '+Math.floor(threat*99)+'%',W-180,H-100);
    if(threat>.75){ctx.font='bold 17px monospace';ctx.fillText('I  R E M E M B E R  Y O U',W/2-135,90);}
    if($('flashes').checked&&motion&&threat>.5&&Math.sin(t*14)>.94){ctx.fillStyle=`rgba(162,178,145,${threat*.17})`;ctx.fillRect(0,0,W,H);}
    ctx.restore();
  }
  const eggSprite=document.createElement('canvas');eggSprite.width=64;eggSprite.height=84;{const c=eggSprite.getContext('2d');c.fillStyle='#d9e6ba';c.beginPath();c.ellipse(32,44,23,32,0,0,Math.PI*2);c.fill();c.fillStyle='#698d43';for(const [x,y,r]of [[24,25,7],[41,45,9],[20,61,8]]){c.beginPath();c.arc(x,y,r,0,7);c.fill();}}
  function sprite(x,y,img,scale=1){const dx=x-player.x,dy=y-player.y;let a=Math.atan2(dy,dx)-player.a;while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;const dist=Math.hypot(dx,dy),z=dist*Math.cos(a);if(z<=.15||Math.abs(a)>1.2)return;const height=Math.min(1600,H/z*scale),width=height*img.width/img.height,cx=W/2+Math.tan(a)*W/(2*Math.tan(FOV/2)),top=H/2+H/z*.4-height;for(let xx=Math.max(0,Math.floor(cx-width/2));xx<Math.min(W,cx+width/2);xx++){if(z<depth[xx]){ctx.globalAlpha=Math.max(.18,Math.min(1,2.7/dist));ctx.drawImage(img,Math.floor((xx-cx+width/2)/width*img.width),0,1,img.height,xx,top,1,height);}}ctx.globalAlpha=1;}
  function world(t){
    const enemyCtx=enemySprite.getContext('2d');enemyCtx.clearRect(0,0,270,300);enemyCtx.save();
    if(monster.windup>0){enemyCtx.translate(-13,66);enemyCtx.scale(1.1,.78);}
    else if(monster.lunge>0){enemyCtx.translate(135,155);enemyCtx.rotate(-.12);enemyCtx.translate(-135,-155);}
    else if(monster.stun>0){enemyCtx.translate(135,155);enemyCtx.rotate(.16);enemyCtx.translate(-135,-155);}
    yoshi(enemyCtx,135,148,230,true);enemyCtx.restore();
    const lit=light&&!(flicker>0&&Math.sin(t*18)>0);ctx.fillStyle='#080d0b';ctx.fillRect(0,0,W,H/2);const floor=ctx.createLinearGradient(0,H/2,0,H);floor.addColorStop(0,'#080d09');floor.addColorStop(1,lit?'#303629':'#161b14');ctx.fillStyle=floor;ctx.fillRect(0,H/2,W,H/2);
    for(let x=0;x<W;x+=2){const camera=(2*x/W-1)*Math.tan(FOV/2),rx=Math.cos(player.a)-Math.sin(player.a)*camera,ry=Math.sin(player.a)+Math.cos(player.a)*camera;let mx=Math.floor(player.x),my=Math.floor(player.y),sx=rx<0?-1:1,sy=ry<0?-1:1,ddx=Math.abs(1/rx),ddy=Math.abs(1/ry),ax=(rx<0?player.x-mx:mx+1-player.x)*ddx,ay=(ry<0?player.y-my:my+1-player.y)*ddy,side=0;for(let n=0;n<40;n++){if(ax<ay){ax+=ddx;mx+=sx;side=0;}else{ay+=ddy;my+=sy;side=1;}if(wall(mx,my))break;}const dist=Math.max(.05,side?ay-ddy:ax-ddx);depth[x]=depth[x+1]=dist;const h=Math.min(H*8,H/dist),top=(H-h)/2,hit=side?player.x+dist*rx:player.y+dist*ry,u=hit-Math.floor(hit);const beam=Math.max(0,1-Math.abs(camera)*1.3),illum=(lit?.8: .23)/(1+dist*dist*.1)*(side?.78:1)*(lit?.35+.65*beam:1),brick=(Math.floor(u*8)%2)*5;ctx.fillStyle=`rgb(${Math.floor((76+brick)*illum)},${Math.floor((91+brick)*illum)},${Math.floor((58+brick)*illum)})`;ctx.fillRect(x,top,2,h);ctx.fillStyle=`rgba(0,0,0,${.15+illum*.2})`;for(let row=1;row<8;row++)ctx.fillRect(x,top+h*row/8,2,Math.max(1,h/200));if(u<.018||u>.985){ctx.fillStyle='#0005';ctx.fillRect(x,top,2,h);}if(mx===0&&my===1){ctx.fillStyle=collected===5?'#b0ef76':'#446b32';ctx.fillRect(x,top+h*.15,2,h*.75);}}
    const objects=eggs.filter(e=>!e.taken).map(e=>({...e,img:eggSprite,scale:.43}));objects.push({...monster,img:enemySprite,scale:1.35});for(const k of koopas)objects.push({...k,img:k.stun>0?koopaShellSprite:koopaSprite,scale:k.stun>0?.4:.95});if(cap){const c=capSprite.getContext('2d');c.clearRect(0,0,100,80);drawCap(c,50,40,90,reducedMotion.matches?0:elapsed*17);for(const point of cap.trail.filter((_,i)=>i%2===0))objects.push({...point,img:capSprite,scale:.17});objects.push({...cap,img:capSprite,scale:.31});}objects.sort((a,b)=>Math.hypot(b.x-player.x,b.y-player.y)-Math.hypot(a.x-player.x,a.y-player.y));for(const o of objects)sprite(o.x,o.y,o.img,o.scale);
    const g=ctx.createRadialGradient(W/2,H/2,55,W/2,H/2,440);g.addColorStop(0,'#0000');g.addColorStop(1,lit?'#000b':'#000d');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  }
  function title(t){player={x:3.5,y:5.5,a:.15};world(t);ctx.fillStyle='#070d0955';ctx.fillRect(0,0,W,H);ctx.save();ctx.translate(590,265+Math.sin(t*.8)*3);ctx.rotate(-.08);yoshi(ctx,0,0,280,false);ctx.restore();ctx.fillStyle='#0a15094f';ctx.fillRect(0,0,W,H);ctx.fillStyle='#9bb577';ctx.font='9px monospace';ctx.fillText('IT’S BEEN A LONG TIME.',570,430);}
  function render(now){const t=now/1000,dt=Math.min(.05,(now-last)/1000||.016);last=now;update(dt);if(state==='menu')title(t);else if(state==='scare'){ctx.fillStyle=$('flashes').checked&&Math.sin(scareTime*12)> .7?'#adbd8c':'#0b1009';ctx.fillRect(0,0,W,H);const shake=matchMedia('(prefers-reduced-motion:reduce)').matches?0:Math.max(0,1-scareTime)*12;if(scareSource==='koopa')drawKoopa(ctx,W/2+(Math.random()-.5)*shake,H*.53,Math.min(970,590+scareTime*230));else yoshi(ctx,W/2+(Math.random()-.5)*shake,H*.72,Math.min(1000,650+scareTime*260),true);ctx.fillStyle='#e4e8cb';ctx.font='bold 27px monospace';ctx.textAlign='center';ctx.fillText(scareSource==='koopa'?'SHELL.EXE HAS STOPPED YOU.':'YOU LEFT ME.',W/2,H-36);ctx.textAlign='left';}else{world(t);marioHands(state==='playing'?t:elapsed);if(state==='playing')glitch(t);}requestAnimationFrame(render);}
  $('start').onclick=start;$('restart').onclick=start;$('resume').onclick=resume;$('quit').onclick=menu;$('end-menu').onclick=menu;
  $('sound').onclick=()=>{sound=!sound;$('sound').textContent=sound?'SOUND ON':'SOUND OFF';$('sound').setAttribute('aria-pressed',String(sound));if(master)master.gain.value=sound?.16:0;};
  function toggleLight(){if(state==='playing'){light=!light;tone(160,.05,.12,'square');}}
  window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();const k=e.key.length===1?e.key.toLowerCase():e.key;if(k==='Escape'){if(state==='playing')pause();else if(state==='paused')resume();return;}if(state!=='playing')return;if(k==='f'&&!e.repeat)toggleLight();if((k===' '||k==='e')&&!e.repeat)throwCap();keys.add(k);});
  window.addEventListener('keyup',e=>keys.delete(e.key.length===1?e.key.toLowerCase():e.key));
  window.addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&state==='playing'&&!touch)pause();});
  canvas.addEventListener('click',()=>{if(state==='playing'){if(document.pointerLockElement===canvas||touch)throwCap();else capture();}});document.addEventListener('mousemove',e=>{if(state==='playing'&&document.pointerLockElement===canvas)player.a+=e.movementX*.0025;});
  for(const b of document.querySelectorAll('[data-key]')){b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(b.dataset.key);});for(const type of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,()=>keys.delete(b.dataset.key));}
  $('touch-cap').onclick=throwCap;$('touch-light').onclick=toggleLight;$('touch-pause').onclick=pause;
  reset();requestAnimationFrame(render);
})();
