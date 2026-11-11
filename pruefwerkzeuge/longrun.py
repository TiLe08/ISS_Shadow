# longrun.py: 12 h Befehlsmodus mit voller Lagephysik; gibt je Stunde Lageabweichung, Kreiselauslastung und Alarme aus. Aufruf: python longrun.py <Projektordner>
import asyncio, os, re, sys, json, threading, http.server, functools
from playwright.async_api import async_playwright
APP=os.path.abspath(sys.argv[1] if len(sys.argv)>1 else os.environ.get('ISS_APP','../ISS-Shadow')); NM=APP+'/node_modules/three'; PORT=8213
sys.path.insert(0,os.path.join(APP,'Dokumentation','skripte')); from browser import launch  # Chromium oder installiertes Chrome
class Q(http.server.SimpleHTTPRequestHandler):
  def log_message(self,*a): pass
threading.Thread(target=lambda: http.server.ThreadingHTTPServer(('127.0.0.1',PORT),functools.partial(Q,directory=APP)).serve_forever(),daemon=True).start()
async def route(r):
  u=r.request.url; m=re.match(r'https://cdn\.jsdelivr\.net/npm/three@[\d.]+/(.*)',u)
  if m:
    p=os.path.join(NM,m.group(1))
    return await (r.fulfill(path=p,content_type='application/javascript') if os.path.exists(p) else r.fulfill(status=404,body=''))
  if 'lightstreamer' in u or 'mqtt' in u: return await r.fulfill(body='/*stub*/',content_type='application/javascript')
  if u.endswith('/__vehicles'): return await r.fulfill(path=APP+'/Dokumentation/skripte/fahrzeuge_testdaten.json',content_type='application/json')
  if u.startswith(f'http://127.0.0.1:{PORT}'): return await r.continue_()
  return await r.abort()
async def main():
  pw=await async_playwright().start(); b=await launch(pw,['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  ctx=await b.new_context(viewport={'width':1200,'height':800})
  pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
  await pg.route('**/*',route)
  await pg.goto(f'http://127.0.0.1:{PORT}/iss_twin.html#sim'); await pg.wait_for_function('window.ISS&&ISS.MODEL&&ISS.TM.size>50',timeout=90000)
  await pg.wait_for_timeout(4000)
  r=await pg.evaluate("""async()=>{const I=ISS;I.enterCmd();await new Promise(r=>setTimeout(r,500));I.CMD.paused=true;
    const m=I.CMD.sys,q0=m.q.slice(),ang=(a,b)=>{const d=Math.abs(a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3]);return 2*Math.acos(Math.min(1,d))*180/Math.PI;};
    I.CMD.sliderAssist=false;I.CMD.paused=false;const out=[];
    for(let h=1;h<=12;h++){for(let k=0;k<360;k++)I.stepCmd(10);out.push([h,+ang(m.q,q0).toFixed(3),+ang(m.q,m.target).toFixed(3),+(m.cmg.reduce((s,c)=>s+Math.hypot(...c.h),0)/(4*4760)*100).toFixed(1),m.alarms.slice(0,2).join('/'),m.mode]);}
    return out;}""")
  for x in r: print(x)
  print('errors',errs[:5]); await b.close(); await pw.stop()
asyncio.run(main())
