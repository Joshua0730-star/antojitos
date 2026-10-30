from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, A5
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak, KeepTogether
from reportlab.lib.utils import ImageReader

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts' / 'menus'
OUT.mkdir(parents=True, exist_ok=True)
RED = colors.HexColor('#B94758'); DARK = colors.HexColor('#2B1B18'); CREAM = colors.HexColor('#FFF8F3'); MUTED = colors.HexColor('#776862')

def money(n): return f"${n:,.0f}".replace(',', '.')
def photo(name, width):
    p = ROOT / 'images' / 'products' / name
    if not p.exists(): return Spacer(1, 1)
    im = Image(str(p), width=width, height=width*1.18)
    im.hAlign = 'CENTER'; return im

styles = getSampleStyleSheet()
title = ParagraphStyle('title', parent=styles['Title'], fontName='Helvetica-Bold', fontSize=28, leading=31, textColor=RED, alignment=TA_CENTER, spaceAfter=4)
tag = ParagraphStyle('tag', parent=styles['Normal'], fontName='Helvetica', fontSize=10, leading=13, textColor=MUTED, alignment=TA_CENTER)
section = ParagraphStyle('section', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=15, leading=18, textColor=RED, spaceBefore=12, spaceAfter=6)
item = ParagraphStyle('item', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=10.5, leading=14, textColor=DARK)
desc = ParagraphStyle('desc', parent=styles['Normal'], fontName='Helvetica', fontSize=8.5, leading=11, textColor=MUTED)
price = ParagraphStyle('price', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=10.5, leading=14, textColor=RED, alignment=2)
small = ParagraphStyle('small', parent=styles['Normal'], fontName='Helvetica', fontSize=8, leading=10, textColor=MUTED)

def header(story, subtitle='Menú de productos'):
    story += [Spacer(1, 0.08*inch), Paragraph('🍓 ANTOJITOS', title), Paragraph(subtitle, tag), Spacer(1, 0.12*inch)]

def section_title(story, text): story.append(Paragraph(text.upper(), section))
def row(name, description, amount):
    return [Paragraph(name, item), Paragraph(description, desc), Paragraph(money(amount), price)]

def footer(canvas, doc):
    canvas.saveState(); canvas.setFillColor(MUTED); canvas.setFont('Helvetica', 7.5)
    canvas.drawCentredString(doc.pagesize[0]/2, 0.35*inch, 'Pedidos por WhatsApp · Antojitos · Precios en pesos colombianos')
    canvas.restoreState()

def full_menu():
    doc = SimpleDocTemplate(str(OUT/'menu_antojitos_completo_carta.pdf'), pagesize=letter, rightMargin=.55*inch, leftMargin=.55*inch, topMargin=.45*inch, bottomMargin=.55*inch)
    s=[]; header(s, 'Fresas, frutas y antojos hechos con cariño')
    hero = Table([[photo('fresas_con_crema/1.jpeg', 1.45*inch), [Paragraph('FRESAS CON CREMA', section), Paragraph('Incluye una salsa y un topping.', desc), Spacer(1,5), Paragraph('9 oz  '+money(13000)+'  ·  10 oz  '+money(15000)+'  ·  12 oz  '+money(18000)+'  ·  16 oz  '+money(20000), item)]]], colWidths=[1.7*inch, 5.3*inch])
    hero.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),CREAM),('BOX',(0,0),(-1,-1),.6,colors.HexColor('#F0D7D0')),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12)])); s += [hero]
    section_title(s, 'Favoritos'); data=[['PRODUCTO','DETALLE','PRECIO'], row('Bowl de fresas x 2','1 salsa + 1 topping',25000), row('Bandeja Enamórate','2 frutas, crema especial, queso, obleas y 1 salsa',30000), row('Bowl Enamórate','2 frutas, crema especial, 1 salsa, topping y obleas',26000)]
    t=Table(data,colWidths=[1.8*inch,3.75*inch,1.1*inch]); t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),RED),('TEXTCOLOR',(0,0),(-1,0),colors.white),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),('FONTSIZE',(0,0),(-1,0),8),('GRID',(0,0),(-1,-1),.25,colors.HexColor('#E9DCD7')),('VALIGN',(0,0),(-1,-1),'TOP'),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,CREAM]),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)])); s += [t]
    section_title(s, 'Ensaladas de frutas'); data=[['TAMAÑO','PRECIO'],[Paragraph('Sencilla',item),Paragraph(money(16000),price)],[Paragraph('Mini especial',item),Paragraph(money(20000),price)],[Paragraph('Especial',item),Paragraph(money(26000),price)]]; t=Table(data,colWidths=[5.6*inch,1.05*inch]); t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),RED),('TEXTCOLOR',(0,0),(-1,0),colors.white),('GRID',(0,0),(-1,-1),.25,colors.HexColor('#E9DCD7')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,CREAM]),('LEFTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6)])); s += [t, Paragraph('Todas incluyen crema especial de la casa, queso y leche condensada. No es helado.',small)]
    section_title(s, 'Obleas'); data=[['PRESENTACIÓN','PRECIO'],[Paragraph('Sencilla',item),Paragraph(money(5000),price)],[Paragraph('Mini especial',item),Paragraph(money(8000),price)],[Paragraph('Especial',item),Paragraph(money(12000),price)],[Paragraph('Cuchareable de obleas',item),Paragraph(money(20000),price)]]; t=Table(data,colWidths=[5.6*inch,1.05*inch]); t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),RED),('TEXTCOLOR',(0,0),(-1,0),colors.white),('GRID',(0,0),(-1,-1),.25,colors.HexColor('#E9DCD7')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,CREAM]),('LEFTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6)])); s += [t]
    section_title(s, 'Sándwiches'); s += [Table([['PRODUCTO','PRECIO'],[Paragraph('Sencillo · jamón ahumado y quesillo',item),Paragraph(money(6000),price)],[Paragraph('Especial · verduras frescas, quesillo y jamón ahumado',item),Paragraph(money(8000),price)]],colWidths=[5.6*inch,1.05*inch],style=TableStyle([('BACKGROUND',(0,0),(-1,0),RED),('TEXTCOLOR',(0,0),(-1,0),colors.white),('GRID',(0,0),(-1,-1),.25,colors.HexColor('#E9DCD7')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,CREAM]),('LEFTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6)]))]
    s += [Spacer(1,10), Paragraph('Toppings adicionales de chocolate negro o blanco: '+money(2000)+'.',small), Paragraph('Domicilio se calcula según barrio, horario y condiciones del día.',small)]
    doc.build(s,onFirstPage=footer,onLaterPages=footer)

def compact_menu():
    doc = SimpleDocTemplate(str(OUT/'menu_antojitos_compacto_media_carta.pdf'), pagesize=A5, rightMargin=.35*inch, leftMargin=.35*inch, topMargin=.3*inch, bottomMargin=.45*inch)
    s=[]; header(s,'Menú rápido · precios en COP')
    for title_text, rows in [('Fresas con crema', [('9 oz',13000),('10 oz',15000),('12 oz',18000),('16 oz',20000)]),('Bowls', [('Bowl de fresas x 2',25000),('Bandeja Enamórate',30000),('Bowl Enamórate',26000)]),('Ensaladas', [('Sencilla',16000),('Mini especial',20000),('Especial',26000)]),('Obleas', [('Sencilla',5000),('Mini especial',8000),('Especial',12000),('Cuchareable',20000)]),('Sándwiches',[('Sencillo',6000),('Especial',8000)])]:
        section_title(s,title_text); s.append(Table([[Paragraph(n,item),Paragraph(money(p),price)] for n,p in rows],colWidths=[3.6*inch,1.0*inch],style=TableStyle([('LINEBELOW',(0,0),(-1,-1),.25,colors.HexColor('#E9DCD7')),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4)])))
    s += [Spacer(1,8), Paragraph('Fresas con crema: incluye 1 salsa y 1 topping. Topping adicional: '+money(2000)+'.',small), Paragraph('Pedidos por WhatsApp · Antojitos',small)]
    doc.build(s,onFirstPage=footer,onLaterPages=footer)

full_menu(); compact_menu(); print(f'Created menus in {OUT}')
