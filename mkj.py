import json
d=json.load(open('raw.json'))
open('data.js','w').write('window.LAO_DATA='+json.dumps(d)+';')
print('data.js updated',len(d),d[0][0],d[-1][0])
