"""Vergleicht beide Abo-Wege (Seite und Bridge) mit dem festgehaltenen öffentlichen Kanalverzeichnis.
"""
import ast,json,pathlib,re,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
class ChannelAudit(unittest.TestCase):
 """Kanalprüfung."""
 def test_public_inventory(self):
  """Die Seite und bridge.py abonnieren genau die öffentlichen Kanäle aus tests/public_channels.json.
  """
  ref=json.loads((ROOT/'tests/public_channels.json').read_text())
  expected=set(ref['unique_channels'])
  html=(ROOT/'iss_twin.html').read_text()
  raw=json.loads(re.search(r'const DICT_RAW = (\[.*?\]);',html).group(1))
  browser={r[0]for r in raw}|{'CSAMT000002'}
  assignment=next(n for n in ast.parse((ROOT/'bridge.py').read_text()).body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='ITEMS'for t in n.targets))
  bridge=set(eval(compile(ast.Expression(assignment.value),'<ITEMS>','eval'),{'range':range}))
  self.assertIn('subscribe(["TIME_000001"]', (ROOT/'bridge.py').read_text())
  self.assertIn("subscribeChunk(['TIME_000001']", html)
  bridge.add('TIME_000001')
  self.assertEqual(len(expected),336)
  self.assertEqual(expected-browser,set())
  self.assertEqual(expected-bridge,set())
  self.assertEqual(bridge,browser)
  self.assertEqual(bridge-expected,{'CSAMT000002'})
if __name__=='__main__':unittest.main()
