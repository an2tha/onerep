import json,math,textwrap,html
from pathlib import Path
base=Path(__file__).parent;dest=base.parent/'diagrams';dest.mkdir(exist_ok=True)
F='var(--foreground, #171a18)';M='var(--muted-foreground, #625f59)';A='var(--accent-workout, #5b5bd6)';B='var(--divider, #d8d7d2)';S='var(--surface-panel, #fbfaf7)'
def esc(v):return html.escape(str(v))
def text(x,y,value,size=16,color=F,anchor='middle',weight=400):return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" text-anchor="{anchor}" font-weight="{weight}">{esc(value)}</text>'
def multiline(x,y,value,width=16,size=16,color=F):
 lines=textwrap.wrap(value,width=width,break_long_words=False)
 return ''.join(text(x,y+(i-(len(lines)-1)/2)*21,line,size,color) for i,line in enumerate(lines))
def line(x1,y1,x2,y2,color=B,dash=''):return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="1.5" '+(f'stroke-dasharray="{dash}"' if dash else '')+'/>'
def rect(x,y,w,h,fill=S,stroke=B,rx=7):return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}"/>'
def render(item,prefix):
 d=item['diagram'];kind=d['kind'];labels=d['labels'];parts=[];h=250
 if kind=='bars':
  vals=d['values'];maximum=max(vals);top=math.ceil(maximum/4)*4;n=len(vals);bw=min(48,350/n)
  parts.append(text(32,26,d['unit'],14,M,'start'))
  for i in range(3):
   v=top*i/2;y=190-v/top*130;parts.extend([line(45,y,460,y),text(33,y+5,f'{v:g}',13,M,'end')])
  for i,(l,v) in enumerate(zip(labels,vals)):
   x=70+i*(360/(n-1) if n>1 else 0);height=v/top*130
   parts.extend([rect(x-bw/2,190-height,bw,height,A,'none',4),text(x,180-height,v,16),multiline(x,218,l,12,14,M)])
 elif kind=='line':
  vals=d['values'];valid=[v for v in vals if v is not None];lo=math.floor(min(valid)*10)/10-.1;hi=math.ceil(max(valid)*10)/10+.1;span=hi-lo;xs=[55+i*385/(len(vals)-1) for i in range(len(vals))]
  parts.append(text(30,24,d['unit'],14,M,'start'))
  for i in range(3):
   v=lo+span*i/2;y=190-i*65;parts.extend([line(50,y,455,y),text(42,y+5,f'{v:.1f}',13,M,'end')])
  previous=None
  for x,l,v in zip(xs,labels,vals):
   parts.append(text(x,220,l,14,M))
   if v is None:previous=None;parts.append(text(x,110,'No data',12,M));continue
   y=190-(v-lo)/span*130
   if previous:parts.append(line(*previous,x,y,A))
   parts.append(f'<circle cx="{x}" cy="{y}" r="4.5" fill="{S}" stroke="{A}" stroke-width="2.5"/>');previous=(x,y)
 elif kind=='equation':
  n=len(labels);step=420/n;op='+' if item['id'] in ['hydration','caffeine'] else '×'
  for i,l in enumerate(labels):
   x=30+step*(i+.5);parts.append(multiline(x,80,l,18,17))
   if i<n-1:parts.append(text(30+step*(i+1),85,op,20,M))
  parts.extend([line(100,120,380,120),text(240,174,d['result'],32,A,weight=600),text(240,216,'Illustrative calculation',13,M)])
 elif kind=='scale':
  n=len(labels);step=432/n
  for i,(l,v) in enumerate(zip(labels,d['values'])):
   x=24+i*step;parts.extend([rect(x,62,step-6,104,S,B),multiline(x+(step-6)/2,94,l,12,16),multiline(x+(step-6)/2,140,v,12,15,A)])
 elif kind=='range':
  parts.extend([line(55,125,425,125,A),f'<circle cx="55" cy="125" r="7" fill="{A}"/>',f'<circle cx="425" cy="125" r="7" fill="{A}"/>',text(240,85,'Defined movement excursion',18),text(55,172,labels[0],15,M,'start'),text(425,172,labels[1],15,M,'end'),line(55,102,55,146),line(425,102,425,146)])
 elif kind=='schedule':
  for i,(l,v) in enumerate(zip(labels,d['values'])):
   x=18+i*64;parts.extend([text(x+29,75,l,14,M),rect(x,95,58,66,S,A if v!='Rest' else B),text(x+29,135,v,14,A if v!='Rest' else M)])
 elif kind=='cycle':
  coords=[(240,60),(365,174),(115,174)]
  for i,(x,y) in enumerate(coords):
   nx,ny=coords[(i+1)%3];parts.append(line(x,y,nx,ny,B))
  for (x,y),l in zip(coords,labels):parts.extend([rect(x-90,y-28,180,56,S,B,28),multiline(x,y+6,l,20,16,A)])
 else:
  n=len(labels);step=440/n;w=step-12;y=82
  for i,l in enumerate(labels):
   x=20+i*step
   if i<n-1:parts.append(line(x+w,y+38,x+step,y+38,B))
   parts.extend([rect(x,y,w,82,S,B),multiline(x+w/2,y+44,l,14 if n<=3 else 11,17 if n<=3 else 15,A if i==0 else F)])
  if kind=='interval':parts.append(text(240,206,'Order shown; durations not to scale',13,M))
  elif kind=='concept':parts.append(text(240,208,'Concept diagram',13,M))
  else:parts.append(text(240,208,'Example workflow',13,M))
 title=esc(d['title']);desc=esc(d['caption']);id=f'{prefix}-{item["id"]}'
 return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 {h}" role="img" aria-labelledby="{id}-title {id}-desc" style="font-family:var(--font-sans, sans-serif)"><title id="{id}-title">{title}</title><desc id="{id}-desc">{desc}</desc>'+''.join(parts)+'</svg>'
for name,prefix in [('guides','guide'),('terms','term')]:
 for item in json.loads((base/f'{name}.json').read_text()):(dest/f'{prefix}-{item["id"]}.svg').write_text(render(item,prefix))
print(len(list(dest.glob('*.svg'))),'SVG diagrams')
