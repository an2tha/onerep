from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor
from PIL import Image
import html, base64, json

ROOT=Path('/Users/ananth/Documents/Code/onerep')
OUT=ROOT/'output/pdf'; BUILD=ROOT/'tmp/pdfs/onerep-pitch'
for name,file in [('Arial','Arial.ttf'),('Arial-Bold','Arial Bold.ttf')]:
 pdfmetrics.registerFont(TTFont(name,'/System/Library/Fonts/Supplemental/'+file))
pdfmetrics.registerFontFamily('Arial',normal='Arial',bold='Arial-Bold',italic='Arial',boldItalic='Arial-Bold')
W,H=960,540
INK='#1F2321'; PAPER='#F4F3EF'; MUTED='#626660'; PALE='#C3C7BC'; GREEN='#D8E4B6'; WHITE='#FFFFFF'
slides=[]
def slide(title=None,dark=False):
 d={'bg':INK if dark else PAPER,'dark':dark,'ops':[]};slides.append(d)
 if title: text(title,52,45,850,40,32,True)
 return d
def text(value,x,y,w,h,size=20,bold=False,color=None,leading=None):
 slides[-1]['ops'].append(dict(kind='text',value=value,x=x,y=y,w=w,h=h,size=size,bold=bold,color=color or (PAPER if slides[-1]['dark'] else INK),leading=leading or size*1.24))
def image(name,x,y,h):
 p=BUILD/(name+'.png');im=Image.open(p);w=h*im.width/im.height
 slides[-1]['ops'].append(dict(kind='image',path=str(p),x=x,y=y,w=w,h=h))
def foot(value): text(value,52,492,840,27,10.5,color=PALE if slides[-1]['dark'] else MUTED,leading=13)
def label(value,x,y,w=400):text(value,x,y,w,25,13,True,color=PALE if slides[-1]['dark'] else MUTED)
def para(head,body,x,y,w):
 text(head,x,y,w,31,21,True)
 text(body,x,y+38,w,85,18,color=PALE if slides[-1]['dark'] else MUTED)

# 1
slide(dark=True)
text('OneRep',52,48,560,65,50,True)
text('Training and nutrition<br/>One shared picture',52,157,535,145,42,True)
text('A working fitness app with an optional<br/>AI Coach built around the user’s own log.',52,326,535,80,21,color=PALE)
text('Investor introduction / September 2026',52,447,560,25,14,color=PALE)
image('today',682,42,438)
foot('Product image: demonstration account, captured 3 August 2026. UI has since evolved.')
# 2
slide('The first customer')
label('INITIAL CUSTOMER HYPOTHESIS',52,108)
text('People who already lift<br/>and track what they eat.',52,151,470,110,35,True)
text('They have a routine. The opportunity is to make daily logging and weekly decisions easier to keep up.',52,307,440,120,23)
para('The daily task','Keep workouts and food in one usable record.',570,135,335)
para('The weekly decision','Understand what changed before adjusting training or nutrition.',570,279,335)
foot('Proposed customer focus. Customer interviews, cohort retention and willingness to pay remain to be validated.')
# 3
slide('A working product across the daily routine')
for name,x,title,sub in [('training',88,'Training','Routines and workout logs'),('nutrition',398,'Nutrition','Food logging and macros'),('progress',708,'Progress','Trends and measurements')]:
 text(title,x-36,105,270,28,21,True)
 image(name,x,148,315)
 text(sub,x-36,465,278,24,15,color=MUTED)
foot('Actual OneRep demo-account captures from 3 August 2026. Illustrative account values, not customer outcomes.')
# 4
slide('Coach works inside the log')
para('Context from the account','Coach can use training, food and goals rather than asking users to reconstruct their history.',52,125,505)
para('Suggestions that become entries','Supported actions can create workouts or food records through an approval flow.',52,249,505)
para('User control','AI sharing is opt-in. Core tracking works without Coach, and users can export their data.',52,373,505)
image('coach',683,92,385)
foot('Implemented product capabilities. Demo screenshot: 3 August 2026. No claim of clinical effectiveness or improved outcomes.')
# 5
slide('A large category, a narrow starting point',True)
text('81 million',52,145,520,110,74,True,color=GREEN)
text('US fitness-facility members in 2025',56,267,495,70,24)
text('HFA also reports that free weights led equipment usage growth since 2021.',56,371,450,80,19,color=PALE)
para('OneRep’s starting audience','Self-directed adults who combine strength training with regular food tracking.',591,145,305)
para('What still needs proof','How many of these users will switch, stay active and pay for Coach.',591,298,305)
foot('Source: HFA, 2026 US Health & Fitness Consumer Report. US membership includes ages 6+. Category context, not OneRep’s addressable market.')
# 6
slide('Competition is already converging')
label('PRODUCT',52,114,200);label('EXISTING OFFER',265,114,300);label('IMPLICATION FOR ONEREP',618,114,300)
rows=[('Hevy','Workout logging, routines and a fitness community.','Workout tracking alone must meet a high usability bar.'),('MacroFactor','Nutrition and workout apps, with a combined subscription.','Combining training and food is already a competitive category.'),('OneRep','Free core tracking, a shared account and optional AI actions.','The proposed advantage is less logging friction and more useful context.')]
for i,(a,b,c) in enumerate(rows):
 y=165+i*91
 text(a,52,y,175,40,23,True)
 text(b,265,y,305,77,18)
 text(c,618,y,285,77,18,color=MUTED)
text('Retention and useful coaching will determine whether users switch.',52,444,850,34,21,True)
foot('Sources: Hevy official site; MacroFactor Workouts and pricing pages; OneRep product and code. Competitive position remains a hypothesis.')
# 7
slide('Free tracking, optional paid Coach')
label('CORE',52,111)
text('€0',52,146,340,83,64,True)
text('Workout, nutrition and progress tracking.<br/>10 AI requests per month.',52,253,365,92,22)
label('COACH / PUBLISHED WEB PRICE',501,111)
text('€4.99',501,146,370,83,64,True)
text('per month',505,228,300,27,19,color=MUTED)
text('500 AI requests per month.<br/>Recurring subscription.',501,279,370,83,22)
text('At 1,000 paying subscribers: €4,990 in monthly gross billings.',52,406,850,35,22,True)
foot('Illustrative arithmetic, not a forecast. Before taxes, fees, AI, hosting and support costs. Published web offer; regional store prices may vary.')
# 8
slide('A working product, an early commercial stage',True)
text('0',52,123,380,182,145,True,color=GREEN)
text('paying subscribers',57,309,470,50,31,True)
text('As of 20 September 2026',59,383,405,58,18,color=PALE)
para('Product available','Web app available. iOS in TestFlight beta, with the App Store release still pending.',569,133,332)
para('Next proof points','Reliable checkout, repeat weekly use and the first paid renewals.',569,290,332)
foot('Current focus: establish repeat use, subscription conversion and paid renewals.')
# 9
slide('A focused distribution plan')
label('PROPOSED TESTS',52,109)
text('Start with small cohorts.<br/>Learn before buying reach.',52,152,800,100,35,True)
para('Direct recruiting','Invite lifters through relevant communities and coach-led introductions. Offer hands-on onboarding.',52,303,400)
para('Search and useful content','Use the existing exercise library and practical training content to reach people with a specific need.',502,303,400)
foot('Planned experiments, not established channels or partnerships. Measure activation, four-week retention and conversion by acquisition source.')
# 10
slide('The milestones that justify the next stage')
label('PROPOSED PRIORITIES FOR INVESTMENT',52,107)
para('Reliable purchase and onboarding','Complete subscription purchase validation and the iOS release. Make the first workout and food log straightforward.',52,159,407)
para('A retained initial cohort','Measure who returns to both training and nutrition after four weeks, and learn why others stop.',507,159,398)
para('Repeat paid usage','Reach first paid renewals and measure AI cost per paying subscriber alongside support and platform fees.',52,315,407)
para('A repeatable acquisition route','Compare cohort quality by channel before committing to a larger acquisition budget.',507,315,398)
foot('Milestones and priorities are proposed. Fundraising amount, runway, valuation and hiring plan require a separate founder discussion.')
# 11
slide(dark=True)
text('OneRep',52,49,840,80,54,True)
text('A working product.<br/>Paid demand is the next proof.',52,171,850,125,40,True)
text('Seeking investor conversations about the path<br/>to retained users and repeat paid subscriptions.',52,331,840,80,22,color=PALE)
text('ananthahalmuttur@gmail.com',52,427,800,37,24,True,color=GREEN)
foot('onerep.life     /     app.onerep.life')
# 12
slide('Sources and basis')
entries=[
 ('Product and pricing','OneRep website, product source and published pricing. Accessed 20 September 2026.','https://onerep.life'),
 ('Commercial status','OneRep reports zero paying subscribers as of 20 September 2026.',None),
 ('Product imagery','Repository demo-account captures dated 3 August 2026. Screens show demonstration data and an earlier UI.',None),
 ('Category context','HFA, “81 Million Americans Were Members of a Fitness Facility in 2025,” 9 April 2026.','https://www.healthandfitness.org/81-million-americans-were-members-of-a-fitness-facility-in-2025-new-hfa-report-finds/'),
 ('Competition','Hevy (hevyapp.com). MacroFactor Workouts and pricing (macrofactor.com/workouts/price). Accessed 20 September 2026.','https://macrofactor.com/workouts/price/'),
 ('License and claims','Public source uses PolyForm Noncommercial 1.0.0. Self-hosting and source availability are distinct from unrestricted commercial use.','https://github.com/an2tha/onerep'),
]
for i,(a,b,url) in enumerate(entries):
 y=111+i*58
 text(a,52,y,200,28,17,True)
 text(b,272,y,630,49,15.5,color=MUTED,leading=19)
 if url: slides[-1]['ops'][-1]['url']=url
foot('Plans and scenario arithmetic are explicitly labeled. Founder background, financing terms and audited operating metrics are outside this introduction.')

pdf=OUT/'OneRep-investor-introduction.pdf'
c=canvas.Canvas(str(pdf),pagesize=(W,H),pageCompression=1)
c.setTitle('OneRep | Investor introduction | September 2026');c.setAuthor('OneRep');c.setSubject('Product and investment introduction; zero paying subscribers as reported on 20 September 2026')
htmlslides=[];checks=[]
for i,s in enumerate(slides,1):
 c.setFillColor(HexColor(s['bg']));c.rect(0,0,W,H,fill=1,stroke=0)
 elems=[]
 for op in s['ops']:
  x,y,w,h=op['x'],op['y'],op['w'],op['h']
  if op['kind']=='image':
   c.drawImage(op['path'],x,H-y-h,w,h,mask='auto')
   uri='data:image/png;base64,'+base64.b64encode(Path(op['path']).read_bytes()).decode()
   elems.append(f'<img src="{uri}" style="left:{x}pt;top:{y}pt;width:{w}pt;height:{h}pt" alt="OneRep demonstration screen">')
  else:
   style=ParagraphStyle('text',fontName='Arial-Bold' if op['bold'] else 'Arial',fontSize=op['size'],leading=op['leading'],textColor=HexColor(op['color']),splitLongWords=False)
   p=Paragraph(op['value'],style);aw,ah=p.wrap(w,h)
   assert ah<=h+0.2,(i,op['value'],ah,h)
   assert y+ah<=H-10,(i,op['value'])
   p.drawOn(c,x,H-y-ah)
   if op.get('url'): c.linkURL(op['url'],(x,H-y-ah,x+w,H-y),relative=0,thickness=0)
   if 'ananthahalmuttur@gmail.com' in op['value']:c.linkURL('mailto:ananthahalmuttur@gmail.com',(x,H-y-ah,x+w,H-y),thickness=0)
   elems.append(f'<div contenteditable="true" style="left:{x}pt;top:{y}pt;width:{w}pt;height:{h}pt;font-size:{op["size"]}pt;line-height:{op["leading"]}pt;font-weight:{700 if op["bold"] else 400};color:{op["color"]}">{op["value"]}</div>')
   checks.append({'slide':i,'text':op['value'],'height':ah,'capacity':h})
 c.setFont('Arial',10);c.setFillColor(HexColor(PALE if s['dark'] else MUTED));c.drawRightString(917,25,str(i))
 elems.append(f'<div class="page-number">{i}</div>')
 htmlslides.append(f'<section style="background:{s["bg"]};color:{PAPER if s["dark"] else INK}">'+''.join(elems)+'</section>')
 c.showPage()
c.save()
head='''<!doctype html><html lang="en"><meta charset="utf-8"><title>OneRep investor introduction</title><style>
@page{size:960pt 540pt;margin:0}*{box-sizing:border-box}body{margin:0;background:#d8d8d4;font-family:Arial,sans-serif}section{position:relative;width:960pt;height:540pt;overflow:hidden;page-break-after:always;margin:20px auto}section>div,section>img{position:absolute;margin:0;padding:0}.page-number{right:43pt;bottom:25pt;font-size:10pt;opacity:.6}@media print{section{margin:0}body{background:none}section:last-child{page-break-after:auto}}[contenteditable]:focus{outline:1px dashed #999}
</style><body>'''
(OUT/'OneRep-investor-introduction.html').write_text(head+''.join(htmlslides)+'</body></html>')
(BUILD/'layout-checks.json').write_text(json.dumps(checks,indent=2))
print(f'{len(slides)} slides: {pdf}')
