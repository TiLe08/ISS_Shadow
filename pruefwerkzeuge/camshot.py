# camshot.py: nimmt die Zwillingsansicht einer Außenkamera auf. Aufruf: python camshot.py <Projektordner> out.png <Kamera> <Schwenk> <Neigung> <Sichtfeld> [sd|hd]  (Umgebung: TM='{"PUI":Wert}', T0=<UTC-Zeit>)
import asyncio, os, re, sys, json, threading, http.server, functools
from playwright.async_api import async_playwright
APP=os.path.abspath(sys.argv[1]); OUT=sys.argv[2]; CAM=sys.argv[3]; PAN,TILT,FOV=map(float,sys.argv[4:7]); OPT=sys.argv[7] if len(sys.argv)>7 else 'sd'
sys.path.insert(0,os.path.join(APP,'Dokumentation','skripte')); from browser import launch  # Chromium oder installiertes Chrome
NM=APP+'/node_modules/three'; PORT=8219
TM=json.loads(os.environ.get('TM','{}'))
class Q(http.server.SimpleHTTPRequestHandler):
  def log_message(self,*a): pass
threading.Thread(target=lambda: http.server.ThreadingHTTPServer(('127.0.0.1',PORT),functools.partial(Q,directory=APP)).serve_forever(),daemon=True).start()
async def route(r):
  u=r.request.url; m=re.match(r'https://cdn\.jsdelivr\.net/npm/three@[\d.]+/(.*)',u)
  if m:
    p=os.path.join(NM,m.group(1)); return await (r.fulfill(path=p,content_type='application/javascript') if os.path.exists(p) else r.fulfill(status=404,body=''))
  if 'lightstreamer' in u or 'mqtt' in u: return await r.fulfill(body='/*stub*/',content_type='application/javascript')
  if u.endswith('/__vehicles'): return await r.fulfill(path=APP+'/Dokumentation/skripte/fahrzeuge_testdaten.json',content_type='application/json')
  if u.startswith(f'http://127.0.0.1:{PORT}'): return await r.continue_()
  return await r.abort()
async def main():
  pw=await async_playwright().start(); b=await launch(pw,['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  ctx=await b.new_context(viewport={'width':2400,'height':1500}); pg=await ctx.new_page(); await pg.route('**/*',route)
  if os.environ.get('T0'):
    await ctx.add_init_script("(()=>{const R=Date,off=R.parse('%s')-R.now();class F extends R{constructor(...a){if(a.length===0)super(R.now()+off);else super(...a);}static now(){return R.now()+off;}};window.Date=F;})()" % os.environ['T0'])
  await ctx.add_init_script("try{localStorage.setItem('iss.cams',JSON.stringify({view:{%s:{optic:'%s',pan:%g,tilt:%g,fov:%g}},stream:''}))}catch(e){}"%(CAM,OPT,PAN,TILT,FOV))
  await pg.goto(f'http://127.0.0.1:{PORT}/iss_twin.html#sim'); await pg.wait_for_function('window.ISS&&ISS.MODEL&&ISS.TM.size>50',timeout=120000); await pg.wait_for_timeout(2500)
  await pg.click('#dispMenu summary'); await pg.click('#rendSeg button[data-v="solid"]'); await pg.click('#dispMenu summary')
  await pg.evaluate("tm=>{const I=ISS;if(Object.keys(tm).length){I.switchSource('mqtt');for(const [p,v] of Object.entries(tm))I.ingest(p,v);}document.querySelector('#camWin')||0;I.EXTCAM.open('%s');const w=document.querySelector('#camWin');w.style.width='2300px';w.style.height='1300px';}"%CAM, TM)
  await pg.wait_for_timeout(3500)
  await (await pg.query_selector('#camWin .twin canvas')).screenshot(path=OUT); print('ok',OUT); await b.close(); await pw.stop()
asyncio.run(main())
