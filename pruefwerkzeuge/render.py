# render.py: rendert Ansichten des Zwillings aus einer Kamera im Körpersystem mit gegebener Telemetrie. Aufruf: python render.py <Projektordner> jobs.json  (Umgebung: T0=<UTC-Zeit> stellt die Uhr, W/H die Bildgröße)
import asyncio, os, re, sys, json, threading, http.server, functools
from playwright.async_api import async_playwright
APP=os.path.abspath(sys.argv[1]); NM=APP+'/node_modules/three'; PORT=int(os.environ.get('PORT','8213'))
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
JOBS=json.load(open(sys.argv[2]))
W=int(os.environ.get('W','1280')); H=int(os.environ.get('H','800'))
async def main():
  pw=await async_playwright().start(); b=await launch(pw,['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  ctx=await b.new_context(viewport={'width':W,'height':H},device_scale_factor=1)
  pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e))); pg.on('console',lambda m: errs.append('console:'+m.text) if m.type=='error' else None)
  await pg.route('**/*',route)
  if os.environ.get('T0'):
    await ctx.add_init_script("(()=>{const R=Date,off=R.parse('%s')-R.now();class F extends R{constructor(...a){if(a.length===0)super(R.now()+off);else super(...a);}static now(){return R.now()+off;}};window.Date=F;})()" % os.environ['T0'])
  await pg.goto(f'http://127.0.0.1:{PORT}/iss_twin.html#sim'); await pg.wait_for_function('window.ISS&&ISS.MODEL&&ISS.TM.size>50',timeout=120000)
  await pg.wait_for_timeout(3000)
  await pg.evaluate("()=>{document.querySelectorAll('.hud,#hudAtt,#hudJoint,.lbl,#planetLabels').forEach(e=>e.style.visibility='hidden');ISS.S.labelR.domElement.style.display='none'}")
  mode=None
  for j in JOBS:
    m=j.get('mode','solid')
    if m!=mode:
      await pg.click('#dispMenu summary'); await pg.click(f'#rendSeg button[data-v="{m}"]'); await pg.click('#dispMenu summary'); mode=m
    await pg.evaluate("""j=>{const I=ISS; if(j.src&&I.LINK.src!==j.src)I.switchSource(j.src);
      for(const [k,v] of Object.entries(j.cal||{}))Object.assign(I.CAL[k],v);
      for(const [p,v] of Object.entries(j.tm||{}))I.ingest(p,v);
      if(j.js)eval(j.js);
      window.__cam=j;}""", j)
    await pg.wait_for_timeout(j.get('wait',1500))
    if j.get('pos') is None:
      await pg.wait_for_timeout(1500)
      if j.get('shot')=='page': await pg.screenshot(path=j['out'])
      else: await (await pg.query_selector(j['shot'])).screenshot(path=j['out'])
      print('ok',j['out']); continue
    await pg.evaluate("""()=>{const j=window.__cam,I=ISS,S=I.S,root=I.MODEL.root;root.updateMatrixWorld(true);
      const V=a=>root.localToWorld(new S.camera.position.constructor(...a));
      const p=V(j.pos),t=V(j.target),u=j.up||[0,0,-1],up=V([j.pos[0]+u[0],j.pos[1]+u[1],j.pos[2]+u[2]]).sub(p).normalize();
      S.camera.up.copy(up);S.camera.position.copy(p);S.controls.target.copy(t);S.camera.fov=j.fov||50;S.camera.near=j.near||0.5;S.camera.updateProjectionMatrix();S.camera.lookAt(t);S.controls.update=()=>{};}""")
    await pg.wait_for_timeout(1200)
    if j.get('shot')=='page': await pg.screenshot(path=j['out'])
    elif j.get('shot'): await (await pg.query_selector(j['shot'])).screenshot(path=j['out'])
    else: await (await pg.query_selector('#view')).screenshot(path=j['out'])
    print('ok',j['out'])
  print('errors',errs[:8]); await b.close(); await pw.stop()
asyncio.run(main())
