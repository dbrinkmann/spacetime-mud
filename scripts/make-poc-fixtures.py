import json, math
from pathlib import Path
out=Path('public/poc/examples');out.mkdir(parents=True,exist_ok=True)
def box(p,s,c,r=None,glow=False):
 d=dict(position=p,size=s,color=c)
 if r:d['rotation']=r
 if glow:d['emissive']=True
 return d
wood='#654631';dark='#362b27';gold='#c99d50';stone='#615952'
models={}
models['chair']={'boxes':[box([0,.5,0],[.95,.2,.9],'#63704b'),box([0,1,-.36],[.95,.85,.22],'#63704b'),box([-.47,.8,0],[.16,.35,.95],'#566240'),box([.47,.8,0],[.16,.35,.95],'#566240')]+[box([x,.2,z],[.12,.4,.12],wood)for x in [-.34,.34]for z in[-.3,.3]]}
models['table']={'boxes':[box([0,.55,0],[1.6,.12,.85],wood)]+[box([x,.25,z],[.12,.5,.12],dark)for x in[-.65,.65]for z in[-.3,.3]]+[box([-.3,.67,0],[.36,.09,.26],'#754e47'),box([.3,.73,.1],[.12,.24,.12],'#e9d3a1'),box([.3,.88,.1],[.06,.08,.06],'#ffb84d',glow=True)]}
books=[box([-.55+i*.19,y,-.03],[.13,.35+(i%3)*.06,.28],['#635079','#8b6740','#48666a','#7d4540','#919260','#c0a776'][i%6])for y in[.45,1.05,1.65]for i in range(6)]
models['bookshelf']={'boxes':[box([x,1.1,0],[.12,2.2,.5],wood)for x in[-.75,.75]]+[box([0,y,0],[1.5,.1,.5],wood)for y in[.1,.7,1.3,1.9,2.2]]+[box([0,1.1,-.22],[1.5,2.2,.05],dark)]+books}
models['fireplace']={'boxes':[box([x,.8,0],[.4,1.6,.7],stone)for x in[-.9,.9]]+[box([0,1.65,0],[2.4,.2,.9],wood),box([0,.12,0],[2.4,.24,1.1],stone),box([0,2.45,-.2],[1.5,1.5,.4],stone),box([0,.7,-.2],[1.4,1.2,.1],'#231e21')]+[box([x,.36,0],[.24,.24,.6],dark,r=[0,20,0])for x in[-.4,0,.4]]+[box([x,.62+h/2,.05],[.2,h,.2],c,glow=True)for x,h,c in[(-.35,.35,'#e76a27'),(-.12,.65,'#ffb337'),(.12,.45,'#ffe4a0'),(.35,.3,'#f5882d')]]}
models['rug']={'boxes':[box([0,.015,0],[5,.03,3.4],'#743f41'),box([0,.035,0],[4.65,.015,3.05],'#975954'),box([0,.05,0],[4.45,.015,2.85],'#704347')]}
models['window']={'boxes':[box([0,1.9,0],[1.6,1.9,.08],'#294967',glow=True)]+[box([x,1.9,.08],[.1,2.1,.15],dark)for x in[-.85,0,.85]]+[box([0,y,.08],[1.8,.1,.15],dark)for y in[.9,1.9,2.9]]}
models['lantern']={'boxes':[box([0,0,0],[.28,.4,.28],'#ffcb78',glow=True),box([0,.25,0],[.4,.1,.4],dark),box([0,-.25,0],[.4,.1,.4],dark)]+[box([x,0,z],[.04,.5,.04],gold)for x in[-.16,.16]for z in[-.16,.16]]}
models['plant']={'boxes':[box([0,.18,0],[.45,.36,.45],'#a36b49')]+[box([x,y,z],[s,s,s],c)for x,y,z,s,c in[(0,.6,0,.55,'#667b45'),(-.2,.85,0,.4,'#869a54'),(.2,.8,.1,.4,'#4d6941'),(0,1.1,0,.3,'#879857')]]}
models['bar']={'boxes':[box([0,.6,0],[1.2,1.2,3],wood),box([0,1.23,0],[1.5,.14,3.3],'#866044')]+[box([0,1.45,z],[.18,.35,.18],c)for z,c in[(-1,'#70895c'),(-.6,'#b89050'),(.4,'#6f8e85')]]}
models['wall-back']={'boxes':[box([0,1.8,0],[12,3.6,.2],'#55504d')]+[box([-5.5+i+(j%2)*.45,.3+j*.55,.13],[.94,.5,.12],['#615a53','#595651','#696057'][(i+j)%3])for j in range(6)for i in range(12)]+[box([x,1.8,.2],[.25,3.6,.35],dark)for x in[-5.7,-2.8,2.8,5.7]]+[box([0,3.55,.2],[12,.3,.35],wood)]}
models['wall-left']={'boxes':[box([0,1.8,0],[.2,3.6,10],'#55504d')]+[box([.15,1.8,z],[.3,3.6,.25],dark)for z in[-4.7,0,4.7]]+[box([.15,3.55,0],[.3,.3,10],wood)]}
objects=[]
def place(id,name,model,p,yaw=0,collision=None,seat=None,wall=False):
 d=dict(id=id,name=name,model=model,position=p,yaw=yaw)
 if collision:d['collision']=collision
 if seat:d['seat']=seat
 if wall:d['wall']=True
 objects.append(d)
place('back-wall','Stone wall','wall-back',[0,0,-5],wall=True)
place('left-wall','Timber wall','wall-left',[-6,0,0],wall=True)
place('hearth','The hearth','fireplace',[0,0,-4.35],collision=[2.4,1.1])
place('rug','Woven conversation rug','rug',[0,0,.2])
seat=dict(position=[0,.61,0],approach=[0,0,1],yaw=0)
place('reading-chair','Moss armchair','chair',[-1.7,0,-.1],20,[1.1,1],seat)
place('guest-chair','Guest armchair','chair',[1.7,0,-.1],-20,[1.1,1],seat)
place('table','Low oak table','table',[0,0,1.15],collision=[1.6,.85])
place('books-left','Collected stories','bookshelf',[-4.5,0,-4.3],collision=[1.6,.6])
place('books-right','Unfinished spells','bookshelf',[3.6,0,-4.3],collision=[1.6,.6])
place('window-left','Rain on blue glass','window',[-2.45,0,-4.76])
place('window-right','Evening window','window',[2.1,0,-4.76])
place('bar','The quiet bar','bar',[4.8,0,.2],collision=[1.5,3.3])
for i,p in enumerate([[-3.3,0,-3.9],[-4.7,0,2.6],[3.3,0,2.9]]):place('plant-'+str(i),'Potted greenery','plant',p,collision=[.6,.6])
for i,p in enumerate([[-3.6,2.8,-4.3],[3.1,2.8,-4.3],[4.8,1.65,1.2]]):place('lantern-'+str(i),'Amber lantern','lantern',p)
room=dict(version=1,name='The Lantern & Thorn',description='A diagnostic room, assembled entirely from editable box definitions. Click the floor to walk. Select a chair and sit. Change the definitions to build something entirely different.',width=12,depth=10,floorColor='#9c7654',spawn=[0,0,3.2],models=models,objects=objects,lights=[dict(position=[0,1.3,-3.4],color='#ffad50',intensity=14),dict(position=[-3.6,2.8,-3.7],color='#ffcf87',intensity=8),dict(position=[4.4,2.8,.6],color='#ffcf87',intensity=7)])
(out/'room.json').write_text(json.dumps(room,indent=2)+'\n')

def character(name,skin,shirt,pants,hair):
 return dict(version=1,name=name,parts={
 'head':[box([0,.14,0],[.49,.48,.45],skin),box([-.12,.17,.232],[.065,.07,.02],'#24252b'),box([.12,.17,.232],[.065,.07,.02],'#24252b'),box([0,.02,.233],[.1,.025,.02],'#a87560')],
 'torso':[box([0,0,0],[.55,.57,.34],shirt),box([0,-.2,.01],[.57,.08,.36],dark),box([0,-.2,.2],[.1,.09,.04],gold)],
 'leftArm':[box([.02,-.27,0],[.22,.52,.26],shirt),box([.02,-.57,0],[.2,.16,.24],skin)],
 'rightArm':[box([-.02,-.27,0],[.22,.52,.26],shirt),box([-.02,-.57,0],[.2,.16,.24],skin)],
 'leftLeg':[box([0,-.33,0],[.25,.66,.29],pants),box([0,-.68,.07],[.28,.15,.42],dark)],
 'rightLeg':[box([0,-.33,0],[.25,.66,.29],pants),box([0,-.68,.07],[.28,.15,.42],dark)]},cosmetics=[dict(name='Swept hair',parent='head',position=[0,0,0],boxes=[box([0,.41,-.02],[.55,.12,.5],hair),box([-.21,.2,-.08],[.13,.4,.4],hair),box([.18,.34,.2],[.18,.18,.1],hair)])])
a=character('Rowan','#dcb28d','#627b61','#4b5150','#624631')
a['cosmetics'] += [dict(name='Explorer backpack',parent='torso',position=[0,0,-.3],boxes=[box([0,0,0],[.43,.48,.23],'#846548'),box([0,.27,0],[.46,.1,.28],'#a08255'),box([-.19,0,.2],[.05,.55,.06],'#ab8b56'),box([.19,0,.2],[.05,.55,.06],'#ab8b56')])]
b=character('Mira','#c99a78','#77536e','#4e405b','#ad633c')
b['cosmetics'] += [dict(name='Stepped wizard hat',parent='head',position=[0,.43,0],boxes=[box([0,0,0],[.9,.08,.78],'#59446b'),box([0,.16,0],[.48,.28,.44],'#6d527e'),box([-.04,.37,0],[.32,.2,.3],'#6d527e'),box([-.11,.53,0],[.18,.15,.17],'#6d527e'),box([0,.07,.23],[.49,.065,.03],gold)]),dict(name='Amber lantern',parent='rightArm',position=[0,-.82,0],boxes=models['lantern']['boxes'])]
for file,data in [('traveler.json',a),('wizard.json',b)]: (out/file).write_text(json.dumps(data,indent=2)+'\n')
